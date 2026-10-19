# Driving Force showroom

Responsive website with all 49 vehicles, native vehicle pages, payment estimates and a full eight-step credit application. Navigation stays on this website; telephone, email, WhatsApp and map directions use their appropriate external apps. Every vehicle card has a "WhatsApp us" button that opens a chat with sales on 082 425 4253 (wa.me/27824254253), prefilled with the vehicle, stock code and price.

## Run and verify

Requires Node.js 24. No runtime dependencies or build step are needed. Playwright is a development dependency for browser verification.

- `npm run dev` serves the website and its API at http://localhost:4173.
- `npm test` checks finance arithmetic, application validation, document handling and mocked delivery responses.
- Deploy with Vercel. `dist` is the static output directory and `api/finance-application.js` is the Node function.

The local API uses the real delivery service for valid submissions. Tests mock that service and do not send applications.

## Main files

- `templates/home.html`, `dist/style.css`, `dist/app.js`, `dist/showroom-card.js`: homepage, hero transition, all inventory, filtering and sorting.
- `templates/page.html`, `dist/vehicle.js`, `dist/vehicle-view.js`: individual vehicles, estimates and showroom calls to action.
- `dist/finance.html`, `application.js`, `application-fields.json`: eight-step application, review, optional documents and explicit consent.
- `dist/finance-utils.js`: shared amortisation and formatting.
- `dist/pages.css`, `site.js`: native page styling and navigation.
- `dist/visit.html`, `contact.html`, `privacy.html`: showroom information, sales/workshop contact and privacy information.
- `lib/finance-application.cjs`, `api/finance-application.js`: server validation and application delivery.
- `dist/vehicles.json`, `dist/assets/`: inventory snapshot and self-hosted images/fonts.

## Search engine pages

Search engines cannot run the showroom scripts, so the pages they index are rendered on the server by `api/page.js` (`lib/seo.cjs`), using the live inventory from the stock admin:

- `/` — the homepage with every vehicle card already in the HTML (`templates/home.html`).
- `/vehicles/<make-model-stockcode-278>` — one page per vehicle, the same address scheme as the original website. Old `vehicle.html?id=` links redirect permanently.
- `/used-cars` and `/used-cars/<make>` — pages per make.
- `/sitemap.xml` and `dist/robots.txt`.

Each page carries a canonical address, description, Open Graph tags and schema.org structured data (`AutoDealer`, `Car` with its offer, `BreadcrumbList`, `ItemList`). Card and vehicle-page markup is shared with the browser (`dist/showroom-card.js`, `dist/vehicle-view.js`), so the scripts only add behaviour to what the server rendered. Addresses are clean (`/visit`, `/finance`); `vercel.json` holds the rewrites and redirects, and `scripts/dev.cjs` mirrors them locally.

## Vehicle enquiries

Every vehicle card has two enquiry buttons:

- **WhatsApp us** opens a chat with sales on 082 425 4253 (`wa.me/27824254253`), prefilled with the vehicle, stock code and price.
- **Email us** opens a short form (name, email, optional phone, message) prefilled with the vehicle. It posts to `api/enquiry.js` (`lib/enquiry.cjs`), which sends the enquiry through [Resend](https://resend.com) with the customer's address as reply-to.

Enquiries are in-house alerts, so no sending domain is verified in Resend. Email delivery needs these Vercel environment variables:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | Resend API key (sensitive) |
| `ENQUIRY_TO` | The email address that owns the Resend account. Defaults to `info@drivingforce.biz` |
| `ENQUIRY_FROM` | Optional. Defaults to `Driving Force Website <onboarding@resend.dev>` |

Without a verified domain, Resend only delivers mail sent from `onboarding@resend.dev` to the Resend account owner's address, so `ENQUIRY_TO` must be that address (or the Resend account must be registered to `info@drivingforce.biz`). Verifying a domain later only requires setting `ENQUIRY_FROM`.

Until `RESEND_API_KEY` is set, the form explains that email is unavailable and points customers to WhatsApp and the sales line. Recipients and sender are server-side only; customers cannot change them. Requests must be same-origin JSON, and each instance throttles repeat senders.

## Finance application

The field structure follows Driving Force's publicly linked EazyFin application (company 278), with personal, address, next-of-kin, employment, banking, income, expenses/declarations, and document/review steps. It is rebuilt natively, not embedded. Net trade-in is included explicitly, and marketing consent is optional and unchecked.

Applications are sent server-side to the same VMG delivery endpoint used by the existing application, with the fixed dealer recipient `info@drivingforce.biz`. Field values are escaped in the email. Supporting PDF/JPG/PNG documents are optional (six files and 3 MB combined), validated for size, declared type and file signature. The application details are in the email body; this implementation does not generate the original EazyFin PDF or create a CRM lead.

No application details are saved in browser storage or an application database, and payloads are not logged. The browser holds the draft only while the page stays open. The server enforces required fields, explicit declarations, same-origin JSON requests, a fixed recipient, a delivery timeout, and per-instance request throttling and retry deduplication. The latter are best-effort controls, not a distributed rate-limit store. Hosting request metadata may still be retained by Vercel, and submitted data is retained by the dealer and delivery provider under their own processes.

The live delivery endpoint has been inspected, but no actual finance application has been sent during development. Unit tests use mocked success/failure/timeout responses. A controlled, authorised dealer delivery test remains necessary to verify receipt end to end. A successful provider response confirms hand-off to that provider, not credit approval or inbox receipt.

## Inventory and estimates

Inventory is a static snapshot from 13 October 2026, sourced from the public Driving Force inventory feed. Refresh `vehicles.json` and associated images to update availability. There are no user-facing links to the old dealership website.

Calculators use standard amortisation, editable illustrative interest, deposit and net trade-in, and no fees, insurance or balloon payment. Quotes are estimates, not credit offers. The selected vehicle's advertised price is read-only on its detail page. Application terms can be reviewed by the finance team, including any residual value requested in the full form.

## Hero and controls

The supplied black and white Porsche creative fades progressively on hover and as the user scrolls. Leaving the car returns it to the current scroll colour. Keyboard and reduced-motion support remain available. The car uses a small neutral ring cursor. Header links and category tabs use simple text and underline states; finance fields have open underline styling.

## Verification

- All 49 cards have a native View vehicle call to action.
- Vehicle estimates, prefilled finance navigation and showroom links checked in the browser.
- Eight application steps walked through with synthetic details; no application sent.
- Desktop and mobile layouts inspected; no horizontal overflow on vehicle/application pages.
- Application consent boxes remain unchecked, document constraints and expense totals checked.
- All local page/asset paths and old-site link removal audited.
- Automated finance and delivery-handler tests pass without external email calls.

## Vehicle descriptions and browsing

Every listing has reviewed descriptions and an exact display name. Nine incorporate matched archived Driving Force listings; forty use only verified inventory fields. See `research/description-review.md` and the per-vehicle ledger `research/description-sources.json` for sources and data limitations. Existing inventory facts are preserved.

Cards use a single accessible vehicle link, separate model/variant and price rows, and larger text. Detail pages include photo enlargement, overview, specifications, sourced equipment where available, stock-specific email enquiries and the existing finance application handoff. No enquiry is sent until a visitor chooses to send an email or submit an application.

For reproducible browser checks, run `npm ci`, `npx playwright install chromium --only-shell`, then `npm run test:browser`. Set `PLAYWRIGHT_BROWSERS_PATH` if the browser is stored outside the default cache. Local browser tests serve project files in memory and need no running server. For read-only production checks, set `TEST_BASE_URL=https://www.driving-force.co.za`. Both modes block non-GET requests and write screenshots/reports under ignored `evidence/`.
