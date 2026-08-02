import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Breadcrumbs, Callout, PageHeader } from "@/components/ui";
import { getAgency, listAgencies } from "@/lib/data";
import { accessibleStores, requireUser } from "@/lib/session";
import { NewStoreForm } from "./NewStoreForm";

export default async function NewStorePage() {
  const user = await requireUser();
  if (user.platformRole === "agency_member") redirect("/app?denied=1");

  const stores = await accessibleStores(user);
  const agency = user.agencyId ? await getAgency(user.agencyId) : (await listAgencies())[0] ?? null;

  return (
    <>
      <AppHeader user={user} stores={stores} />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-7 sm:px-6">
        <Breadcrumbs items={[{ label: "Stores", href: "/app" }, { label: "New store" }]} />
        <PageHeader
          eyebrow={agency?.name ?? "Agency"}
          title="Create a client store"
          description="A store is an isolated commerce channel: its own catalog, customers, orders, currencies, tax settings, storefront and Stripe account."
        />

        <div className="mt-6">
          {agency ? (
            <NewStoreForm agencyId={agency.id} agencyName={agency.name} />
          ) : (
            <Callout tone="amber" title="No agency assigned">
              Your account is not linked to an agency yet, so there is nowhere to create the store. Ask the
              platform administrator to add you to one.
            </Callout>
          )}
        </div>

        <div className="mt-6">
          <Callout tone="brand" title="What happens next">
            You will land on the six-step setup checklist: branding, language and currencies, custom domain,
            Stripe, carriers and tax. The storefront stays offline until payments and shipping are connected.
          </Callout>
        </div>
      </div>
    </>
  );
}
