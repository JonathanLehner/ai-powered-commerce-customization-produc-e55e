import Link from "next/link";
import { Badge, PageHeader, StatCard } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  listAgencies,
  listAllStores,
  listAudit,
  listCatalogProducts,
  listPlanEnquiries,
  listSuppliers,
  listTaxBrackets,
} from "@/lib/data";
import { planEnquiryLabel, UNDECIDED } from "@/lib/enquiry";
import { formatDateTime } from "@/lib/util";

/** The column-head style every table in the workspace shares. */
const TH = "px-0 text-xs font-semibold tracking-wide uppercase text-muted-foreground";

export default async function AdminOverviewPage() {
  const [agencies, stores, suppliers, catalog, brackets, audit, enquiries] = await Promise.all([
    listAgencies(),
    listAllStores(),
    listSuppliers(),
    listCatalogProducts(),
    listTaxBrackets(),
    listAudit({}, 12),
    listPlanEnquiries(8),
  ]);

  const pendingSuppliers = suppliers.filter((s) => s.status === "pending_review");
  const activeStores = stores.filter((s) => s.status === "active");

  return (
    <div className="space-y-7">
      <PageHeader
        title="Operations overview"
        description="Suppliers, the shared catalog, global tax rates and agency access."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Agencies" value={String(agencies.length)} sub={`${agencies.filter((a) => a.status === "active").length} active`} />
        <StatCard label="Stores" value={String(stores.length)} sub={`${activeStores.length} active`} />
        <StatCard
          label="Approved suppliers"
          value={String(suppliers.filter((s) => s.status === "approved").length)}
          sub={`${pendingSuppliers.length} awaiting review`}
          tone={pendingSuppliers.length > 0 ? "amber" : "green"}
        />
        <StatCard label="Catalog products" value={String(catalog.length)} sub={`${brackets.length} tax brackets`} />
      </div>

      {pendingSuppliers.length> 0 ? (
        <Card asChild>
        <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>Suppliers awaiting review</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {pendingSuppliers.map((supplier) => (
                  <li key={supplier.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{supplier.name}</p>
                      <p className="text-xs text-muted-foreground">{supplier.summary}</p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/admin/suppliers">Review</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
        </section>
        </Card>
      ) : null}

      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>Stores across the platform</h2>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Platform administrators can see that a store exists and who operates it. Order and customer
              records stay with the store team.
            </p>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
              <Table className="min-w-[42rem]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className={TH}>Store</TableHead>
                    <TableHead className={TH}>Agency</TableHead>
                    <TableHead className={TH}>Currencies</TableHead>
                    <TableHead className={TH}>Payments</TableHead>
                    <TableHead className={TH}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store) => (
                    <TableRow key={store.id} className="hover:bg-transparent">
                      <TableCell className="px-0 py-3 align-top whitespace-normal">
                        <Link
                          href={`/app/stores/${store.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {store.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{store.clientName}</p>
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top whitespace-normal text-muted-foreground">
                        {agencies.find((a) => a.id === store.agencyId)?.name ?? "—"}
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top whitespace-normal text-muted-foreground">
                        {store.currencies.join(", ")}
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top whitespace-normal">
                        <Badge tone={store.stripe.connected ? "green" : "amber"}>
                          {store.stripe.connected ? "Stripe connected" : "Not connected"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-0 py-3 align-top whitespace-normal">
                        <Badge tone={store.status === "active" ? "green" : "slate"}>{store.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
      </section>
      </Card>

      {enquiries.length> 0 ? (
        <Card asChild>
        <section>
            <CardHeader>
              <CardTitle asChild>
                <h2>Plan enquiries</h2>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Left on the public pricing page. Nothing here creates an agency or a login — someone has to
                reply and open the workspace.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {enquiries.map((enquiry) => (
                  <li key={enquiry.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {enquiry.company} · {enquiry.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <a href={`mailto:${enquiry.email}`} className="hover:underline">
                          {enquiry.email}
                        </a>
                        {enquiry.wantsCall ? " · asked for a call" : null}
                      </p>
                      {enquiry.message ? (
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{enquiry.message}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={enquiry.plan === UNDECIDED ? "slate" : "brand"}>
                        {planEnquiryLabel(enquiry.plan)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(enquiry.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
        </section>
        </Card>
      ) : null}

      <Card asChild>
      <section>
          <CardHeader>
            <CardTitle asChild>
              <h2>Recent platform activity</h2>
            </CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/audit">Full audit log</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ol className="divide-y divide-border text-sm">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <span className="text-foreground">{entry.summary}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.actorName} · {formatDateTime(entry.at)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
      </section>
      </Card>
    </div>
  );
}
