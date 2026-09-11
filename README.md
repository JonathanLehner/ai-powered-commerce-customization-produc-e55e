# Parcelith

The commerce operating system agencies use to launch, customise and run branded
product stores for every client — from artwork pre-flight to tracked delivery.

An agency creates an isolated store per client, copies apparel and mugs out of a
shared supplier catalog, places the client's logo inside the supplier's declared
2D print area, reviews a rendered mockup and the full cost-to-margin breakdown,
then publishes. Shoppers buy through the client's own storefront and Stripe
account; paid orders route to the production partner and come back with DHL,
FedEx or UPS tracking.

## What is in the build

| Area | Routes |
| --- | --- |
| Marketing | `/`, `/how-it-works`, `/pricing`, `/contact`, `/legal/terms`, `/legal/privacy` |
| Agency workspace | `/app`, `/app/stores/new`, `/app/stores/[storeId]/…` |
| Platform administration | `/admin/…` — suppliers, shared catalog, tax brackets, agencies, audit |
| Client storefronts | `/s/[slug]/…` — catalog, product, basket, checkout, order status |
| Corporate gift portals | `/g/[slug]/…` — private gift catalogue, bulk order, campaign |

Store sections: overview, catalog, sourcing, AI assistant, storefront editor,
gifting, orders, team, guided setup, activity.

### Core capabilities

- **Isolated multi-store tenancy.** Every store owns its users, catalog, prices,
  orders, storefront and settings. Access is resolved per request from agency
  ownership plus explicit memberships; a store's data is never merged with
  another client's, including in the agency dashboard.
- **Plan limits that are actually applied.** Each agency's plan carries the
  live-store ceiling the pricing page sells — Starter 3, Studio 15, Scale
  unlimited — from one table (`src/lib/plans.ts`) that both the pricing page and
  the workspace read. Creating a store counts the agency's active stores against
  it, and at the limit the create screen names the plan, the ceiling and what is
  in use, and offers the two ways on: archive a live store or move up a plan.
  Archived stores are the plan's unlimited drafts and never count, so restoring
  one is checked the same way (`npm run plan-limit-check`).
- **Store-scoped roles.** Store administrator, catalog manager, order manager and
  viewer, enforced by capability (`store.settings`, `store.team`, `store.catalog`,
  `store.orders`, `store.storefront`, `store.gifting`, `store.view`) in both pages
  and server actions.
- **Guided setup.** Logo upload, theme, default language, selling currencies,
  custom domain with a CNAME check, Stripe connection, DHL/FedEx/UPS accounts and
  the store's default tax bracket — each step saves on its own.
- **Storefronts in nine languages.** A store's default language is what its
  storefront is actually served in: the pages are marked with it so browsers and
  screen readers announce them correctly, prices and dates are formatted to that
  language's conventions, country names come from it, and every piece of built-in
  shopper-facing copy — shop, product, basket, checkout, order status, and the
  messages the server actions and the payment gateway return — is translated.
  English, German, French, Spanish, Italian, Dutch, Portuguese, Japanese and
  Swedish, one dictionary each in `src/lib/copy/`. The dropdown is generated from
  that table, so it can only ever offer a language that is fully supported
  (`npm run locale-check`). What a store's own people wrote — product names and
  descriptions, storefront section copy, order timeline notes — is shown as they
  wrote it.
- **Craft.js storefront editor.** Eight approved section types with generated
  settings panels, page reordering, desktop/tablet/phone preview, version history,
  publish, and revert-draft-to-published. The published tree is rendered
  server-side on the storefront.
- **Shared supplier catalog.** Platform admins curate supplier-backed apparel and
  mugs: variants, base costs, print areas in millimetres, minimum DPI, file rules,
  availability and fulfilment regions. Store managers search, filter, compare
  side by side, and copy into their own catalog as an independent record.
- **Artwork configurator with real pre-flight.** Position, scale and rotate
  artwork inside the print area with a pointer or the keyboard. Every check —
  outside the print area, effective DPI, file format, file size, megapixel
  ceiling, transparency — blocks approval and states exactly how to correct it.
- **Mockups.** The saved placement is composited onto the supplier photography
  for each decorated view in the browser, uploaded, and requires explicit
  approval before the product can be published.
- **Cost to margin.** Supplier cost, customisation per print area, estimated
  shipping, tax bracket and rate, selling price, margin amount and margin
  percentage, all shown before publication and recomputed on every change.
- **Commerce assistant.** Product ideas, supplier recommendations, descriptions,
  tags and prices are stored as pending suggestions. Applying one is a separate,
  audited step.
- **Corporate gifting.** A store runs a private gift catalogue per company:
  link- or invite-gated, drawn from that store's own published products, with a
  spend limit per recipient. A buyer pastes or uploads a recipient list — names,
  addresses, sizes, quantities, an optional gift message — and every row is
  checked against the catalogue before anything is created: bad addresses,
  unknown countries, sizes that are not made, gifts over the limit. The list goes
  to the company's approver on a link of their own, and only then can the buyer
  pay. One payment raises one order per recipient, all grouped under the campaign
  in the store's order queue so fulfilment and exceptions are worked per
  programme (`npm run gifting-check`). The public site sells it: a section on
  the landing page, a stage in the walkthrough, and a line in every plan's
  feature list — gifting is not tiered, so all three plans carry the same one.
- **Bulk sourcing and quotes.** Alibaba.com listings sit in the same shared
  catalog and the same side-by-side comparison as the print-on-demand partners,
  but carry a minimum order quantity and no unit cost: a factory prices each run.
  A store manager starts a bulk sourcing enquiry from the Sourcing page —
  against a listing, any other catalog item, or a product described in their
  own words — with quantity, target unit cost, destination market and the
  decoration needed. Open enquiries and their status are listed on the Sourcing
  page and the store overview. The platform sourcing desk (`/admin/quotes`)
  records each supplier quote that comes back; quotes appear as columns in the
  side-by-side comparison next to print-on-demand listings. The store accepts
  one and copies it into the catalog at the quoted cost as a product flagged
  for manual fulfilment, whose orders are always held for a hand-raised
  purchase order. Every step is in the audit history (`npm run sourcing-check`).
- **Checkout and fulfilment.** Multi-currency storefronts, Stripe charges against
  the store's own connected account, supplier routing after payment, manual
  handling flags for sourcing marketplaces and out-of-region destinations,
  carrier tracking links, refunds, cancellations and exception resolution.
- **Audit history.** Store setup, imports, price changes, AI approvals,
  publishing, order routing and administration are all recorded per store and
  platform-wide.
- **Addresses that no longer work.** An old product link, a renamed shop, a
  mistyped path: each lands on a page belonging to the surface it was aimed at.
  Inside a shop the store's header, logo and footer stay, the copy is in the
  store's own language, and the way on is Browse all products, Your basket or
  Order status; an address that is not a shop says so and points at Parcelith;
  the workspace and platform administration keep the app header and offer the
  store or the dashboard. Every surface has a matching error page with a retry,
  so a failure mid-flow is explained rather than blank (`npm run fallback-check`).

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm run start
```

`.env.local` needs a single value:

```
CLAWCORP_API_KEY=…
```

It authenticates the ClawCorp platform services used from server code only:
the project-scoped MongoDB, text generation, and the asset upload endpoint that
stores logos, artwork and rendered mockups.

### Demo accounts

Pick an account at `/login` — the persona cards sign you straight in.

| Account | Sees |
| --- | --- |
| `alex@northlight.studio` | Agency director — full control of four client stores |
| `sam@northlight.studio` | Catalog producer — catalog rights on two stores, no access to Rivet |
| `ines@northlight.studio` | Fulfilment lead — orders only, on Northwind |
| `dana@northwind.example` | Client stakeholder — viewer on Northwind |
| `ops@parcelith.com` | Platform operations — suppliers, catalog, tax, agencies |

Storefronts are public: `/s/northwind-supply`, `/s/lumen-studio`,
`/s/ferro-coffee`, `/s/rivet-hardware`.

Checkout runs against Stripe's published test numbers — `4242 4242 4242 4242`
succeeds, `4000 0000 0000 0002` is declined, `4000 0000 0000 9995` reports
insufficient funds.

## Seeding

`scripts/seed.mjs` writes the agencies, users, suppliers, shared catalog, stores,
storefront layouts, products, orders and audit history. `scripts/generate-images.mjs`
renders the supplier and marketing photography once and records the permanent
asset URLs in `scripts/image-manifest.json`, so no image is generated at request
time.

```bash
node scripts/seed.mjs         # requires CLAWCORP_API_KEY in the environment
```

`scripts/seed-gifting.mjs` adds the corporate gifting demo — a private catalogue
for Northwind, a paid campaign with one order per recipient (including an
exception to work) and a second campaign sitting with its approver. It reads the
store and its products back out of the database and does nothing if the
catalogue is already there, so it is safe to run on its own; `seed.mjs` calls it
at the end.

`scripts/seed-bulk-sourcing.mjs` writes the three Alibaba.com bulk-sourcing
listings into the shared catalog of a database that is already live, leaving
every store, order and quote request alone. It replaces a listing that is
already there rather than adding a second, so it is safe to re-run;
`scripts/bulk-sourcing-catalog.mjs` holds the listings themselves and `seed.mjs`
reads the same file, so a full rebuild and an upsert can never drift apart.

`scripts/backfill-product-identity.mjs` is a one-off migration for databases
seeded before store products carried a SKU: it assigns one per product and
breaks any duplicate slugs left by a double-submitted import. It skips records
that are already in good shape, so it is safe to re-run.

## Architecture notes

- Next.js App Router, React 19, Tailwind CSS v4, TypeScript. Marketing, login and
  legal pages are pinned static; everything behind a session is dynamic.
- The app has several root layouts rather than one, because `<html lang>` is what
  a browser and a screen reader announce and only a root layout can set it: a
  client storefront has to be marked with its own store's language, not the
  workspace's English. Each of `(marketing)`, `login`, `invite`, `app`, `admin`,
  `g/[slug]` and `s/[slug]` owns one, and they all render the shared
  `<Document>` in `src/components/Document.tsx` so the fonts, the global
  stylesheet and the base metadata stay in one place. Navigating between two of
  them is a full page load, which the app never does inside a single surface.
- Each surface owns its `not-found.tsx` and `error.tsx`, plus a `[...rest]`
  catch-all page whose only job is to raise `notFound()` — without it an address
  matching no page never reaches a boundary and falls out of the surface
  entirely. No layout raises `notFound()`: a layout's own 404 escapes its own
  boundary, taking the chrome it was meant to keep with it, so a storefront or
  gift portal whose slug resolves to nothing renders a Parcelith shell around
  `children` and lets the page below raise the 404. Boundaries are handed no
  params, so the storefront ones read the store — slug, theme, language — from
  context provided by the layout, and the workspace ones read the store from the
  path. `src/app/not-found.tsx` is the site-wide 404: a prerendered page, not a
  boundary, so an unmatched address arrives as finished HTML.
- `src/lib/i18n.ts` is the one table of supported storefront languages: the code,
  the BCP-47 tag used for `lang` and every `Intl` call, and the dictionary. The
  workspace dropdowns, the storefront renderer and the `resolveLanguage` guard on
  the save actions all read it, so a store can never be saved with a language the
  storefront cannot render, and a store saved with one that is later retired
  falls back to English rather than breaking. Dictionary values are plain strings
  with `{placeholders}` so a group can be handed to a client component as a prop;
  `npm run locale-check` fails the build if a language drifts from English on
  keys or placeholders.
- All platform calls live in `src/lib/platform.ts` and are server-only. The
  platform DB accepts `sort`/`limit` but does not apply them, so ordering and
  truncation happen in that wrapper.
- Documents carry their own `id` field: Mongo `_id` values never match generated
  string ids, and the API has no upsert.
- Mutations are server actions. Checkout is idempotent on a per-cart key so a
  double click or a retried request cannot create a second order; copying a
  supplier product into a store works the same way, on a per-form import key, and
  so does the public plan enquiry, on a key the form mints per visitor.
- The pricing page's three buttons go to `/contact`, carrying the plan in
  `?plan=`. That page is prerendered like the rest of the marketing site, so the
  plan is read from the address in the browser rather than at request time. An
  enquiry is a sales record and nothing more — it creates no agency and no login
  — and it surfaces in platform administration for someone to answer. The rules
  that clamp and check the fields are in `src/lib/enquiry.ts`
  (`npm run enquiry-check`).
- Checkout asks for the destination as a searchable list of country names and
  submits the ISO code, defaulting to the store's Stripe account country.
  `src/lib/countries.ts` holds the country → fulfilment region table used both by
  the storefront, to warn before payment when the destination is outside the
  regions of the supplier behind a basket item, and by the routing engine that
  applies the same test afterwards (`npm run country-check`).
- A gifting buyer has no Parcelith account. `src/lib/gift-access.ts` issues HMAC
  tokens over the catalogue's own rotating secret — the private link, the cookie
  for an invited address, and one token each for the buyer and the approver of a
  campaign, so the approval step cannot be taken by whoever placed the order.
  Regenerating a catalogue's access rotates that secret and closes every link and
  session handed out before it.
- A store may hold several copies of one supplier product. Each copy gets its own
  name, slug and store SKU (`NORTHW-ORG-COT-TEE`, then `-2`), and copying in one
  the store already has asks first — see `src/lib/sku.ts`.
