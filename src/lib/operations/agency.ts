import "server-only";
import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/locales";
import { storeLimitText } from "@/i18n/plan-copy";
import { billingPending } from "../billing";
import {
  COLLECTIONS,
  countActiveStoresForAgency,
  getAgency,
  getStoreBySlug,
  getUserByEmail,
  listMembershipsForStores,
  listStoresForAgency,
  listUsers,
  recordAudit,
} from "../data";
import { db } from "../mongo";
import { STORE_ROLES, peopleGrid, type PersonRow } from "../people";
import { storeAllowance } from "../plans";
import { cleanDesign } from "../store-design";
import { treeFromSections } from "../storefront-schema";
import { getTemplate } from "../templates/index";
import { templateTree } from "../templates/tree";
import { STORE_ROLE_LABELS, type Membership, type Store, type StoreRole, type ThemeKey } from "../types";
import { newId, slugify } from "../util";
import type { Actor } from "./context";
import { OperationError } from "./context";
import { EMAIL_PATTERN, emailInvitation } from "./team";
import { addStarterProducts } from "./templates";

/**
 * What an agency administrator does across the agency: its stores and the
 * people on them. The workspace passes the signed-in administrator's agency;
 * the Admin API passes the agency that owns the key's store, once it has
 * checked the key's maker still administers it.
 */
export interface AgencyContext {
  agencyId: string;
  actor: Actor;
  locale: Locale;
}

/** What a server action hands an agency operation: the signed-in administrator's agency and language. */
export async function agencyContext(user: { id: string; name: string; agencyId: string }): Promise<AgencyContext> {
  return { agencyId: user.agencyId, actor: { id: user.id, name: user.name }, locale: await getLocale() };
}

/* ----------------------------------------------------------------- stores */

/** The agency's stores, archived ones included. */
export function agencyStores(actx: Pick<AgencyContext, "agencyId">): Promise<Store[]> {
  return listStoresForAgency(actx.agencyId);
}

export interface CreateStoreInput {
  name: string;
  clientName: string;
  defaultCurrency: string;
  /** Ignored unless the storefront can be rendered in it; falls back to the default language. */
  defaultLanguage: string;
  theme: string;
  /** Start from this store template: its design, storefront draft and copy, written for the new store. */
  templateId?: string | null;
  /** With a template, also add its suggested shared-catalog products as drafts. */
  addStarterProducts?: boolean;
}

/**
 * Opens a new store for the agency, with a starter storefront draft. The plan
 * is checked before anything else: the agency's live-store ceiling is the one
 * the pricing page sells.
 */
export async function createStore(actx: AgencyContext, input: CreateStoreInput): Promise<Store> {
  const { agencyId, actor } = actx;
  const t = await getTranslations({ locale: actx.locale, namespace: "actions.stores" });

  const [agency, activeStores] = await Promise.all([getAgency(agencyId), countActiveStoresForAgency(agencyId)]);
  if (!agency) throw new OperationError("invalid", t("agencyGone"), "agencyId");
  if (billingPending(agency)) throw new OperationError("conflict", t("paymentPending"));
  const allowance = storeAllowance(agency.plan, activeStores);
  if (allowance.atLimit) throw new OperationError("conflict", await storeLimitText(allowance, agency.name, actx.locale));

  const name = input.name.trim();
  const clientName = input.clientName.trim();
  const defaultCurrency = input.defaultCurrency;
  // Only a language the storefront can actually be rendered in is stored.
  const defaultLanguage = isLocale(input.defaultLanguage) ? input.defaultLanguage : DEFAULT_LOCALE;
  const template = input.templateId ? getTemplate(input.templateId) : null;
  if (input.templateId && !template) throw new OperationError("invalid", t("templateMissing"), "templateId");
  const theme = template ? template.theme : (input.theme as ThemeKey);

  if (name.length < 3) throw new OperationError("invalid", t("nameTooShort"), "name");
  if (!clientName) throw new OperationError("invalid", t("clientRequired"), "clientName");

  let slug = slugify(name);
  if (!slug) throw new OperationError("invalid", t("nameNotAddress"), "name");
  if (await getStoreBySlug(slug)) slug = `${slug}-${newId("x").slice(2, 6)}`;

  const now = new Date().toISOString();
  const store: Store = {
    id: newId("str"),
    agencyId,
    name,
    slug,
    channelCode: slug,
    clientName,
    status: "active",
    logoUrl: null,
    theme,
    ...(template ? { design: cleanDesign(template.theme, template.design) } : {}),
    defaultLanguage,
    languages: [defaultLanguage],
    currencies: [defaultCurrency],
    defaultCurrency,
    customDomain: null,
    domainStatus: "unset",
    supportEmail: null,
    supportPhone: null,
    stripe: { connected: false, accountId: null, country: "US", chargesEnabled: false, connectedAt: null },
    carriers: [
      { carrier: "dhl", enabled: false, accountNumber: "", services: ["Express Worldwide", "Economy Select"] },
      { carrier: "fedex", enabled: false, accountNumber: "", services: ["International Priority", "International Economy"] },
      { carrier: "ups", enabled: false, accountNumber: "", services: ["Worldwide Expedited", "Standard"] },
    ],
    defaultTaxBracketId: null,
    pricesIncludeTax: false,
    setup: {
      branding: false,
      localisation: true,
      support: false,
      domain: false,
      payments: false,
      shipping: false,
      tax: false,
    },
    createdAt: now,
    archivedAt: null,
  };

  await Promise.all([
    db.insertOne(COLLECTIONS.stores, store as unknown as Record<string, unknown>),
    db.insertOne(COLLECTIONS.storefronts, {
      id: newId("sfr"),
      storeId: store.id,
      draft: template
        ? templateTree(template, { sourceLocale: defaultLanguage, locales: [defaultLanguage], brandName: name })
        : treeFromSections([
            { type: "HeroSection", props: { eyebrow: clientName, headline: `${clientName} merch, made to order` } },
            { type: "ProductGrid", props: {} },
          ]),
      published: null,
      publishedAt: null,
      publishedBy: null,
      draftUpdatedAt: now,
      history: [],
    }),
  ]);
  recordAudit({
    category: "store_setup",
    action: "store.created",
    summary: `Created store “${name}” for ${clientName}`,
    storeId: store.id,
    agencyId,
    actorId: actor.id,
    actorName: actor.name,
    entity: "store",
    entityId: store.id,
    meta: { currency: defaultCurrency, theme, ...(template ? { templateId: template.id } : {}) },
  });
  if (template && input.addStarterProducts) {
    await addStarterProducts({ store, actor, locale: actx.locale }, template);
  }

  revalidatePath("/app");
  return store;
}

/* ----------------------------------------------------------------- people */

/**
 * Everyone who can reach the agency's stores, one row per person, as the
 * People page shows them: agency administrators first, then each invited
 * person with their role in every store they are on.
 */
export async function agencyPeople(actx: Pick<AgencyContext, "agencyId">): Promise<{ stores: Store[]; people: PersonRow[] }> {
  const [stores, users] = await Promise.all([listStoresForAgency(actx.agencyId), listUsers()]);
  const memberships = await listMembershipsForStores(stores.map((s) => s.id));
  return { stores, people: peopleGrid(actx.agencyId, users, memberships, stores) };
}

export interface InvitePersonInput {
  email: string;
  name: string;
  /** The role chosen per store id. Unknown roles and stores that are not the agency's open stores are dropped. */
  roles: Iterable<[string, string]>;
  language?: string;
}

/**
 * Invites one person to several of the agency's stores at once, with a role
 * chosen per store. Each store gets its own membership, invitation and activity
 * entry, exactly as if it had been sent from that store's Team page. Stores the
 * person is already on are left as they are, and the write is keyed on store and
 * email, so a repeated submission adds nothing twice.
 */
export async function invitePerson(
  actx: AgencyContext,
  input: InvitePersonInput,
): Promise<{ added: Membership[]; accountName: string | null }> {
  const { agencyId, actor } = actx;
  const t = await getTranslations({ locale: actx.locale, namespace: "actions.team" });
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!EMAIL_PATTERN.test(email)) throw new OperationError("invalid", t("emailInvalid"), "email");
  if (name.length < 2) throw new OperationError("invalid", t("nameRequired"), "name");

  const [stores, account] = await Promise.all([listStoresForAgency(agencyId), getUserByEmail(email)]);
  const open = stores.filter((store) => store.status === "active");
  const openIds = new Set(open.map((store) => store.id));
  const chosen = new Map<string, StoreRole>();
  for (const [storeId, role] of input.roles) {
    if (openIds.has(storeId) && STORE_ROLES.includes(role as StoreRole)) chosen.set(storeId, role as StoreRole);
  }
  if (chosen.size === 0) throw new OperationError("invalid", t("storesRequired"), "stores");
  if (account?.platformRole === "agency_admin" && account.agencyId === agencyId) {
    throw new OperationError("conflict", t("isAgencyAdmin", { name: account.name }), "email");
  }

  const existing = await listMembershipsForStores([...chosen.keys()]);
  const already = new Set(existing.filter((m) => m.email.toLowerCase() === email).map((m) => m.storeId));
  const targets = open.filter((store) => chosen.has(store.id) && !already.has(store.id));
  if (targets.length === 0) throw new OperationError("conflict", t("alreadyOnAll"), "stores");

  const now = new Date().toISOString();
  const added = await Promise.all(
    targets.map(async (store) => {
      const role = chosen.get(store.id)!;
      const membership: Membership = {
        id: newId("mem"),
        storeId: store.id,
        agencyId: store.agencyId,
        userId: account?.id ?? null,
        email,
        name: account?.name ?? name,
        role,
        status: account ? "active" : "invited",
        invitedBy: actor.name,
        invitedAt: now,
        acceptedAt: account ? now : null,
        inviteToken: account ? null : newId("inv"),
        ...(isLocale(input.language) ? { language: input.language } : {}),
      };
      // The filter's own fields are written by the upsert itself.
      const filter = { storeId: store.id, email };
      const fields = Object.fromEntries(Object.entries(membership).filter(([key]) => !(key in filter)));
      const result = await db.upsertOne(COLLECTIONS.memberships, filter, { $setOnInsert: fields });
      if (result.upsertedCount === 0) return null;
      recordAudit({
        category: "team",
        action: "team.invited",
        summary: `Invited ${email} as ${STORE_ROLE_LABELS[role].toLowerCase()}`,
        storeId: store.id,
        agencyId: store.agencyId,
        actorId: actor.id,
        actorName: actor.name,
        entity: "membership",
        entityId: membership.id,
        meta: { role, email, via: "people" },
      });
      if (membership.inviteToken) await emailInvitation(store, membership, actor.name);
      revalidatePath(`/app/stores/${store.id}/team`);
      return membership;
    }),
  );
  const created = added.filter((membership): membership is Membership => membership !== null);
  if (created.length === 0) throw new OperationError("conflict", t("alreadyOnAll"), "stores");

  revalidatePath("/app/people");
  return { added: created, accountName: account?.name ?? null };
}

/**
 * Takes a person off the listed stores of the agency in one step. Only the
 * memberships named are removed, so a stale page never takes away access it did
 * not list. Each store records its own activity entry. Returns the ids removed.
 */
export async function removePersonEverywhere(
  actx: AgencyContext,
  input: { email: string; membershipIds: Iterable<string> },
): Promise<string[]> {
  const { agencyId, actor } = actx;
  const email = input.email.trim().toLowerCase();
  const ids = new Set(input.membershipIds);
  if (!email || ids.size === 0) return [];

  const stores = await listStoresForAgency(agencyId);
  const byId = new Map(stores.map((store) => [store.id, store]));
  const memberships = (await listMembershipsForStores([...byId.keys()])).filter(
    (m) => ids.has(m.id) && m.email.toLowerCase() === email,
  );

  const removed = await Promise.all(
    memberships.map(async (membership) => {
      const store = byId.get(membership.storeId)!;
      const result = await db.deleteOne(COLLECTIONS.memberships, { id: membership.id });
      if (result.deletedCount === 0) return null;
      recordAudit({
        category: "team",
        action: "team.removed",
        summary: `Removed ${membership.email} from the store team`,
        storeId: store.id,
        agencyId: store.agencyId,
        actorId: actor.id,
        actorName: actor.name,
        entity: "membership",
        entityId: membership.id,
        meta: { email: membership.email, via: "people" },
      });
      revalidatePath(`/app/stores/${store.id}/team`);
      return membership.id;
    }),
  );
  revalidatePath("/app/people");
  return removed.filter((id): id is string => id !== null);
}
