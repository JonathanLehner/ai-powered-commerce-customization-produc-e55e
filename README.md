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
| Marketing | `/`, `/how-it-works`, `/pricing`, `/legal/terms`, `/legal/privacy` |
| Agency workspace | `/app`, `/app/stores/new`, `/app/stores/[storeId]/…` |
| Platform administration | `/admin/…` — suppliers, shared catalog, tax brackets, agencies, audit |
| Client storefronts | `/s/[slug]/…` — catalog, product, basket, checkout, order status |

Store sections: overview, catalog, sourcing, AI assistant, storefront editor,
orders, team, guided setup, activity.

### Core capabilities

- **Isolated multi-store tenancy.** Every store owns its users, catalog, prices,
  orders, storefront and settings. Access is resolved per request from agency
  ownership plus explicit memberships; a store's data is never merged with
  another client's, including in the agency dashboard.
- **Store-scoped roles.** Store administrator, catalog manager, order manager and
  viewer, enforced by capability (`store.settings`, `store.team`, `store.catalog`,
  `store.orders`, `store.storefront`, `store.view`) in both pages and server
  actions.
- **Guided setup.** Logo upload, theme, default language, selling currencies,
  custom domain with a CNAME check, Stripe connection, DHL/FedEx/UPS accounts and
  the store's default tax bracket — each step saves on its own.
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
- **Checkout and fulfilment.** Multi-currency storefronts, Stripe charges against
  the store's own connected account, supplier routing after payment, manual
  handling flags for sourcing marketplaces and out-of-region destinations,
  carrier tracking links, refunds, cancellations and exception resolution.
- **Audit history.** Store setup, imports, price changes, AI approvals,
  publishing, order routing and administration are all recorded per store and
  platform-wide.

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

`scripts/backfill-product-identity.mjs` is a one-off migration for databases
seeded before store products carried a SKU: it assigns one per product and
breaks any duplicate slugs left by a double-submitted import. It skips records
that are already in good shape, so it is safe to re-run.

## Architecture notes

- Next.js App Router, React 19, Tailwind CSS v4, TypeScript. Marketing, login and
  legal pages are pinned static; everything behind a session is dynamic.
- All platform calls live in `src/lib/platform.ts` and are server-only. The
  platform DB accepts `sort`/`limit` but does not apply them, so ordering and
  truncation happen in that wrapper.
- Documents carry their own `id` field: Mongo `_id` values never match generated
  string ids, and the API has no upsert.
- Mutations are server actions. Checkout is idempotent on a per-cart key so a
  double click or a retried request cannot create a second order; copying a
  supplier product into a store works the same way, on a per-form import key.
- A store may hold several copies of one supplier product. Each copy gets its own
  name, slug and store SKU (`NORTHW-ORG-COT-TEE`, then `-2`), and copying in one
  the store already has asks first — see `src/lib/sku.ts`.
