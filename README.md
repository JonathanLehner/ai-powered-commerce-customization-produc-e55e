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
| Client storefronts | `/s/[slug]/…` — catalog, collections, product, basket, checkout, order status |
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
  custom domain with a CNAME check, Stripe Connect onboarding, DHL/FedEx/UPS accounts and
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
  (`npm run locale-check`). What a store's own people wrote (section copy, the
  announcement bar, navigation labels, the footer note, product names,
  descriptions and option labels, gift portal intros) is kept in the default
  language with a translation per enabled language beside it; a missing
  translation falls back to the default language (`src/lib/translations.ts`).
- **Parcelith in nine languages.** The public site, sign-in, every workspace
  and platform-admin screen, server action messages and toasts use next-intl
  with one message file per language in `messages/` (English is the source).
  Invitation and approval emails go out in the recipient's language: their
  saved preference if they have an account, else the language picked when
  inviting (approvals fall back to the store's language). Marketing pages are prerendered per language, with
  English at the root and `/de/pricing` and so on for the rest, hreflang
  alternates and a footer language switcher. Signed-in users pick their language
  in the user menu; otherwise the browser's language is used, then English.
  `npm run messages-check` fails on a missing or empty translation.
- **Craft.js storefront editor.** Twenty-three section types (`SECTION_DEFS`:
  heroes over photo or video, slideshow, countdown, product grid and carousel,
  featured product, collection tiles, columns, story, impact numbers, gallery,
  video, logo strip, testimonials, FAQ, contact and more), each with background,
  spacing, alignment and width controls, image upload with a focal point (the
  browser resizes photos before they go to the platform upload), generated
  settings panels, page reordering, desktop/tablet/phone preview, version history,
  publish, and revert-draft-to-published. The published tree is rendered
  server-side on the storefront. A language switcher edits the shop in any
  enabled language: fields without a translation show a "Not translated" badge,
  "Translate missing" fills them with the platform text model (marked machine
  translated until a person saves them, never overwriting a translation), and
  the Products and Gift portals tabs translate those records. The Design tab
  sets the store's tokens on top of its preset (`src/lib/store-design.ts`):
  brand colours with automatic 4.5:1 text contrast, heading and body fonts from
  22 self-hosted web fonts with pairings, corners, button style, density, light
  or dark, and product photo shape. The header and footer panel adds rotating
  announcements with a countdown, logo left or centred, sticky or transparent
  header, a mega menu, footer layouts, newsletter, social links, payment and
  trust badges (`src/lib/storefront-layout.ts`). The Product page tab arranges
  the blocks every product page is built from (`src/lib/product-template.ts`).
  A store that has not published a page gets one generated from its products
  and name (`src/lib/storefront-defaults.ts`). The "Shop text"
  panel overrides any built-in shopper string per store and language; overrides
  are merged over the next-intl messages at request time (`src/lib/shop-text.ts`,
  `npm run translation-check`).
- **Collections.** Catalog → Collections groups a store's products into pages
  at `/s/<slug>/collections/<handle>` (and `/de/collections/…` and so on). A
  collection has a name, an address handle, a description and an image; the
  team creates them, drags them into order, and adds, removes and drags the
  products inside each one (`@dnd-kit`, with keyboard support). A product can
  be in any number of collections. The storefront page shows the header, the
  tag filter and four sorts (featured, which is the team's order, price low to
  high, price high to low, newest), and only products on sale. Names and
  descriptions are translated in the storefront editor's Collections tab and
  by "Translate missing"; the editor's Header and footer panel picks which
  collections the header links to, and the Product grid section's Source
  shows all products or one collection. Collections are in the store's
  sitemap (`src/lib/collections.ts`, `npm run collections-check`).
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
- **Checkout and fulfilment.** Multi-currency storefronts, hosted Stripe
  Checkout as a direct charge on the store's own Connect account, payment
  confirmed only by the verified webhook, refunds through the Refunds API on
  that account, supplier routing after payment, manual
  handling flags for sourcing marketplaces and out-of-region destinations,
  carrier tracking links, refunds, cancellations and exception resolution.
- **Customers.** Each store has a Customers tab for the people who work its
  orders. A record per email address per store is built from that store's
  orders and kept current by checkout, gift campaigns, refunds and
  cancellations: name, country, first and last order, order count, lifetime
  spend less refunds, preferred language and currency. The list searches,
  filters, sorts, pages and downloads as CSV. The detail page shows the order
  history, refunds and the team's notes, and can export everything held about
  the customer as JSON or delete their name, email and address from the record
  and its orders while keeping the amounts. Notes, exports and deletions are in
  the audit history (`npm run customers-check`).
- **Audit history.** Store setup, imports, price changes, AI approvals,
  publishing, order routing and administration are all recorded per store and
  platform-wide.
- **Transactional email.** Four messages leave the platform: the shopper's order
  confirmation with the signed status link, the shipping notification when
  tracking is added, the team invitation with its acceptance link, and the gift
  campaign approval request to the approver. Each is built from the store's own
  storefront language and branding — logo, store name, merchant of record and
  support address — by one send function (`src/lib/email.ts`). The provider is
  configured with environment variables; with none set, the message is logged and
  written to the store's activity history under the Email category instead of
  failing, and nothing an email does can block or fail a checkout
  (`npm run email-check`).
- **Custom domains.** A store administrator connects a domain (a subdomain, or
  a root domain together with its www) on the Domains page. Each one becomes a
  Cloudflare for SaaS custom hostname on the platform's zone, validated over
  HTTP, plus a Worker route `{hostname}/*` to this app, through Cloudflare's SDK
  (`src/lib/cloudflare-saas.ts`). The zone is shared, so a host name already
  on it, as a hostname or under any route, is refused, as is anything under
  clawcorp.ai; the ids Cloudflare returns are written to `store_domains`, and
  only those are ever deleted, each read back first. The page shows the CNAME
  (or ALIAS for a root domain) and the live verification and certificate
  status. Once the primary domain is active the storefront is served at its
  root, `/s/<slug>` and the other domains redirect to it, and canonical links,
  the sitemap and emails use it. Without the Cloudflare settings a domain is
  saved as setup pending and connects on its next check
  (`npm run domains-check`, which mocks Cloudflare entirely).
- **Presentment currencies.** Each extra selling currency has an automatic
  (daily market rate) or manual exchange rate and a rounding rule (.00, .90,
  .95, .99; 10 or 100 without cents). The storefront opens in the shopper's
  country's currency when the store sells in it, with the header switcher to
  change it; Stripe Checkout charges in that currency and the order records
  the shop currency, its total in it and the rate (`npm run currency-check`).
- **Import from Shopify.** The Import page reads Shopify's product export, and
  optionally the customer and order exports, previews them with every problem
  by line, and imports in the background with progress: handles, options,
  variants, photos (copied into the store's own storage), SEO fields and stock,
  then customers and orders. A product whose handle is taken gets a new address
  and a 301 from `/products/<old-handle>`; merchants add their own redirects for
  `/collections/…` and `/pages/…` (`npm run shopify-import-check`).
- **Addresses that no longer work.** An old product link, a renamed shop, a
  mistyped path: each lands on a page belonging to the surface it was aimed at.
  Inside a shop the store's header, logo and footer stay, the copy is in the
  store's own language, and the way on is Browse all products, Your basket or
  Order status; an address that is not a shop says so and points at Parcelith;
  the workspace and platform administration keep the app header and offer the
  store or the dashboard. Every surface has a matching error page with a retry,
  so a failure mid-flow is explained rather than blank (`npm run fallback-check`).

- **API and MCP for everything.** Every operation is defined once in
  `src/lib/api/operations.ts` (modules under `src/lib/api/ops`) and served as a
  REST endpoint, an OpenAPI operation and an MCP tool. The Admin API
  (`/api/v1/stores/{storeId}`, MCP at `/api/mcp`) covers every workspace edit,
  including section-by-section storefront editing of the draft
  (list/add/update/move/duplicate/remove sections, validated against
  `SECTION_DEFS`), header and footer settings, the product page template, a
  signed draft preview link, design tokens (`updateTheme`), image and video
  uploads, newsletter sign-ups, API and platform keys, notifications, workspace language, billing
  links and plan enquiries. The public Storefront API (`/api/v1/shop/{storeHandle}`,
  MCP for shopping agents at `/api/mcp/shop?store=…`) runs catalogue reads,
  carts, checkout, order lookup, reviews and shopper accounts, anonymously or
  with a publishable key. Only browser sign-in/out and accepting invitations
  stay UI-only (`npm run api-coverage-check`, `npm run storefront-sections-check`,
  `npm run shop-api-check`).

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm run start
```

`.env.local` needs two values:

```
CLAWCORP_API_KEY=…
AUTH_SECRET=…
MONGODB_URI=mongodb+srv://…
MONGODB_DB=parcelith_dev    # .env.local only — never on the deployment
```

`MONGODB_URI` is the app's own MongoDB, reached with the official driver
(`src/lib/mongo.ts`; a Worker secret in the deployment). The database is named
by `MONGODB_DB`, and production — where it is never set — uses `parcelith`.
Local development, the `*-check` scripts, the seeds and the acceptance replay
all work on `parcelith_dev`, so a test run never writes into live data. On
Workers the name is read from the Worker's own bindings rather than
`process.env`, because OpenNext copies the build machine's `.env*` files into
the bundle. A client lives for one request (a Worker socket cannot be shared
between requests). The indexes in `src/lib/db-indexes.ts` are created with
`npm run create-indexes`, and by the first isolate that finds the list changed
since they were last put in place (the version is recorded in `app_state`).

`CLAWCORP_API_KEY` authenticates the ClawCorp platform services used from server
code only: text generation, and the asset upload endpoint that stores logos,
artwork and rendered mockups.

`AUTH_SECRET` is the key Auth.js signs and encrypts the staff session cookie
with (`npx auth secret` generates one; it is a Worker secret in the deployment).
There is no fallback: without it, anything behind a sign-in raises rather than
quietly accepting unsigned sessions.

Transactional email is optional. With these set, messages are sent through the
provider; with any of them missing, every message is logged and recorded in the
store's activity history instead, which is what a preview or a development run
wants:

```
EMAIL_PROVIDER=clawcorp     # ClawCorp Mail, or resend
EMAIL_API_KEY=ccm_…         # ClawCorp Mail → Settings → API keys, send scope, this sender allowed
EMAIL_FROM=orders@…         # a sender on a domain verified in the provider
EMAIL_API_URL=…             # optional; ClawCorp Mail's address, defaults to mailbox-for-startups-6e48.clawcorp.ai
APP_ORIGIN=https://…        # optional; otherwise the request's own origin is used
SALES_INBOX=sales@…         # optional, comma separated; otherwise every platform admin
```

A Contact sales enquiry emails the visitor a confirmation in the language of the
page they used, and alerts `SALES_INBOX` with the details, a reply-to set to the
visitor and a link to the enquiry at `/admin/enquiries/<id>`.

### Stripe

The platform's Stripe keys are live keys: every charge on a connected store is
real money.

```
STRIPE_SECRET_KEY=sk_live_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…           # parcelith-platform destination
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_…   # parcelith-connect destination
```

All calls go through the official `stripe` SDK with
`Stripe.createFetchHttpClient()` and `Stripe.createSubtleCryptoProvider()`
(`src/lib/stripe.ts`), so they run the same in Node and on Workers.

- **Connect onboarding.** Guided setup → Stripe account → "Connect Stripe"
  creates an Express account for the store in the chosen country and sends the
  store admin to Stripe's hosted onboarding (Account Links). Stripe returns to
  `/app/stores/<id>/setup/stripe`, which reads the account back and shows its
  payments (`charges_enabled`) and payouts (`payouts_enabled`) state; an
  expired link goes through `…/setup/stripe/refresh` for a fresh one. The
  account can be reopened, or disconnected and replaced. Every step is in the
  store's activity log.
- **Which stores take real payments** (`src/lib/payment-mode.ts`): a store
  whose Connect account has `charges_enabled` sends shoppers to Stripe Checkout.
  A demo store simulates payment. Anything else, including account ids typed in
  by hand before Connect onboarding, shows checkout as unavailable and setup
  asks to reconnect.
- **Storefront checkout.** After the delivery details the order is written as
  awaiting payment and the shopper goes to a Checkout Session created on the
  store's connected account (direct charge) in the store currency, with the
  basket's line items, shipping, tax rows and the discount as a single-use
  coupon, in the storefront language. Success returns to the order status
  page, cancel to the basket. The order is marked paid only by the webhook.
  Gift campaigns on a live store pay the same way.
- **Plan billing.** Self-serve sign-up opens a subscription Checkout on
  Parcelith's own account. `/app/billing` shows the plan, its status and the
  next invoice, and "Manage billing" opens the Stripe Customer Portal (enable
  the portal once in the Stripe dashboard). A failed renewal puts the plan past
  due and shows a banner across the workspace.
- **When the free trial ends** without payment details (`src/lib/trial.ts`):
  every workspace page shows a banner linking to Billing, the dashboard
  redirects there, and store pages stay open read-only (changes from the
  workspace and API writes are refused). Storefronts keep taking orders for a
  7-day grace period, with the closing date in the banner, then show "This
  store is temporarily unavailable" and refuse new baskets and checkouts until
  payment details are added. The owner is emailed 3 days and 1 day before the
  trial ends and on the day it ends (`src/lib/trial-reminders.ts`, run by the
  scheduler); set `APP_ORIGIN` so the emails' Billing link is absolute.

#### Webhook

The Stripe dashboard (Developers → Webhooks) has two destinations, both
pointing at:

```
https://ai-powered-commerce-customization-produc-e55e.clawcorp.ai/api/stripe/webhook
```

Events to send:

| Event | Destination | What it does |
| --- | --- | --- |
| `checkout.session.completed` | `parcelith-platform`, `parcelith-connect` | Activates a plan; marks a storefront order or gift campaign paid |
| `checkout.session.async_payment_succeeded` | `parcelith-platform`, `parcelith-connect` | Same, for delayed payment methods |
| `checkout.session.async_payment_failed` | `parcelith-platform`, `parcelith-connect` | Closes the order and returns its discount use; plan goes past due |
| `checkout.session.expired` | `parcelith-connect` | Closes an abandoned order and returns its discount use |
| `customer.subscription.updated` | `parcelith-platform` | Keeps the plan status and period end current |
| `customer.subscription.deleted` | `parcelith-platform` | Marks the plan cancelled |
| `invoice.payment_failed` | `parcelith-platform` | Marks the plan past due (workspace banner) |
| `account.updated` | `parcelith-connect` | Refreshes a store's payments and payouts state |

Each destination has its own signing secret (open the destination, then
"Signing secret"):

| Variable | Destination | Events from |
| --- | --- | --- |
| `STRIPE_WEBHOOK_SECRET` | `parcelith-platform` | Your account: plan checkout, subscriptions, invoices |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `parcelith-connect` | Connected accounts: storefront and gift checkout sessions, `account.updated` |

Each request is verified with `stripe.webhooks.constructEventAsync` against
each configured secret in turn and accepted on the first that matches; a
request no secret verifies is refused with 400. Connected-account events are
told apart by the event's `account` field. Each event id is
claimed in `stripe_events` before it is handled, so a redelivery is
acknowledged without running twice (`src/lib/stripe-webhook.ts`).

`npm run stripe-check` exercises the SDK calls against mocked Stripe responses
with a made-up test key, and the webhook signature check;
`npm run stripe-webhook-check` sends signed events through the handler against
throwaway records in the development database to prove verification and
idempotency. Neither reaches Stripe.

### Custom domains

```
CLOUDFLARE_SAAS_API_TOKEN=…   # custom hostnames and Worker routes on the zone
CLOUDFLARE_ZONE_ID=…
CLOUDFLARE_SAAS_CNAME_TARGET=customers.clawcorp.ai
CLOUDFLARE_WORKER_NAME=…      # this app's Worker script
```

All four are read per request. With any missing, the Domains page says setup
is pending and domains are saved without calling Cloudflare.

### Demo accounts

Pick an account at `/login` — the persona cards sign you straight in, through
Auth.js's `persona` credentials provider, so a one-click demo login gets the
same signed session as a real one. The form below them signs in with an email
address and password; every seeded account uses `parcelith`, stored as a bcrypt
hash (`scripts/backfill-password-hashes.mjs` upgrades rows seeded before that).

"Forgot password?" next to the password field opens `/login/forgot`. It gives
the same answer whether or not the address has an account; for one that does it
emails a single-use link to `/login/reset/<token>`, valid for an hour, in the
person's workspace language. Choosing a new password there signs the person in
and removes every other link they hold. The tokens are kept hashed through
Auth.js's MongoDB adapter (`password_reset_tokens`), requests are limited to 3
an hour per address and 10 per IP (`password_reset_limits`), and requests and
resets are written to the audit log. An account invited before passwords were
asked can set its first one this way. See `src/lib/password-reset.ts`.

| Account | Sees |
| --- | --- |
| `alex@northlight.studio` | Agency director — full control of four client stores |
| `sam@northlight.studio` | Catalog producer — catalog rights on two stores, no access to Rivet |
| `ines@northlight.studio` | Fulfilment lead — orders only, on Northwind |
| `dana@northwind.example` | Client stakeholder — viewer on Northwind |
| `ops@parcelith.com` | Platform operations — suppliers, catalog, tax, agencies |

Storefronts are public: `/s/northwind-supply`, `/s/lumen-studio`,
`/s/ferro-coffee`, `/s/rivet-hardware`.

These four stores and the Northwind gift portal are demo stores (`demo: true`):
their checkout is labelled "Demo store: no real payment" and simulates payment
with Stripe's published test numbers, so nobody is charged. `4242 4242 4242 4242`
succeeds, `4000 0000 0000 0002` is declined, `4000 0000 0000 9995` reports
insufficient funds.

## Seeding

`scripts/seed.mjs` writes the agencies, users, suppliers, shared catalog, stores,
storefront layouts, products, orders and audit history. `scripts/generate-images.mjs`
renders the supplier and marketing photography once and records the permanent
asset URLs in `scripts/image-manifest.json`, so no image is generated at request
time.

```bash
node --env-file=.env.local scripts/seed.mjs   # clears and reseeds MONGODB_DB; refuses production
```

`scripts/migrate-to-mongodb.mjs` copied production off the ClawCorp platform
database API into `parcelith`, keeping every `id` and `_id`. It pages past the
API's per-read cap and upserts by `id`, so it is safe to re-run:
`MONGODB_DB=parcelith node --env-file=.env.local --experimental-strip-types scripts/migrate-to-mongodb.mjs`.

`scripts/seed-gifting.mjs` adds the corporate gifting demo — a private catalogue
for Northwind, a paid campaign with one order per recipient (including an
exception to work) and a second campaign sitting with its approver. It reads the
store and its products back out of the database and does nothing if the
catalogue is already there, so it is safe to run on its own; `seed.mjs` calls it
at the end.

`scripts/seed-collections.mjs` adds the demo collections (Northwind: Apparel,
Drinkware, New hires; Lumen, Ferro and Rivet a set each), with their German,
French or English translations where the store has that language, their header
images from `image-manifest.json`, and header links on a storefront that has
none yet. It looks stores and products up by slug and skips any handle a store
already has, so it is additive and safe to re-run, including on a live
database; `seed.mjs` calls it at the end.

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

`npm run backfill-customers` builds every store's customer records from its
orders. Run it after seeding, and once on a database that has orders from
before customers existed. Records are rebuilt by store and email, so it is safe
to re-run, and the team's notes are kept.

`scripts/mark-demo-stores.mjs` marks the seeded stores as demo stores on a
database seeded before they carried the flag, so their checkout keeps
simulating payment. It touches only those four slugs and is safe to re-run.

`scripts/backfill-password-hashes.mjs` is a one-off migration for databases
seeded before the password was checked at all: it replaces each user's
plain-text password with a bcrypt hash and leaves rows that already hold one
alone, so it is safe to re-run.

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
- Staff sessions are Auth.js (`src/auth.ts`). Nothing in the app writes a session
  cookie: Auth.js issues a signed, encrypted JWT and `src/lib/session.ts` reads
  the user id out of it, then loads the user from the database on every request —
  so a role change lands on the next page view instead of at the next sign-in,
  and the id in the cookie is worth nothing without `AUTH_SECRET`. There is no
  adapter, because the users collection lives behind the platform DB API, hence
  the `jwt` strategy. Two credentials providers: `password` checks email and
  password with bcrypt, and `persona` takes an email alone to back the demo
  buttons on `/login` and the "accepted an invitation" box — email-only on
  purpose for this demo workspace, and still a signed session rather than a
  cookie anyone can type. `/api/auth/*` is the one path `src/proxy.ts`
  skips, since Auth.js owns it through a catch-all and it is deliberately absent
  from the route table.
- Page weight and Worker memory. A Worker isolate has 128 MB, and the bundled
  server code alone is some 40 MB of it, so:
  - `scripts/ascii-worker.mjs` runs as wrangler's build step and escapes the
    handful of non-ASCII characters in the server code; one of them is enough
    for V8 to hold the whole source as two bytes per character. wrangler also
    minifies the bundle (`wrangler.jsonc`).
  - The browser gets only the messages its client components read: the shell's
    from `WorkspaceDocument`, and each section's from `ClientMessages` in its
    layout (`src/i18n/workspace-messages.ts`, `npm run client-messages-check`).
  - Client components are handed the fields they show (the workspace header gets
    names and roles, not user and store records), and store figures are added
    up in MongoDB (`src/lib/metrics-data.ts`, `npm run metrics-check`) instead
    of reading every order.
  - `npm run payload-check` signs in as the demo agency director, loads the
    main workspace and storefront pages against the deployed site (or
    `BASE_URL`), prints response times and fails when a page is not a 200 or
    its HTML is over budget.
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
