# Driving Force stock admin

A separate Vercel project (`driving-force-admin`) for adding vehicles to, and removing them from, the showroom website.

- Sign-in uses Supabase Auth in the `drivingforce` Supabase project (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`). Create logins and set or reset passwords under **Authentication → Users** ("Add user", tick "Auto Confirm User").
- Only emails listed in the `public.dashboard_users` table (role `owner` or `staff`) get into the dashboard; deleting a row removes access within a minute. The table has row-level security with no policies, so it is not readable through the public API; the server checks it with the `dashboard_role()` function.
- Sessions are the Supabase access and refresh tokens in HttpOnly cookies; expired access tokens are refreshed automatically. Everyone can change their own password under **Account**, and "Forgot password?" sends a Supabase reset email that returns to the dashboard.
- Inventory and new photos are stored in the `driving-force-inventory` Vercel Blob store (`BLOB_READ_WRITE_TOKEN`).
- Every change publishes `inventory.json` to the store. The showroom (`dist/inventory.js`) reads that file and falls back to the bundled `dist/vehicles.json` until the first change, or if the store cannot be reached. Changes appear on the website within about a minute.
- Vehicles can have up to 20 photos; the first is the main photo. Photos upload one at a time through `/api/photos` and are scaled to 1600px in the browser first.
- Vehicles show as a grid of cards. Drag any card to reorder (or type a position in its # box), then Save order. Cards are large by default. Each card has inline price editing and two buttons: Edit (details and photos) and Remove.
- The add form has make, model and colour suggestions, photo drag-and-drop, Ctrl+Enter to publish and "Publish & add another". Keyboard: N adds a vehicle, / searches.
- Prices are edited inline on each card. The vehicle order in the admin is the order on the website's default (featured) view.
- Safety net: the showroom Vercel project (`driving-force-showroom`) has a project-level routing rule, "Live stock list from admin", that rewrites `/vehicles.json` to the live `inventory.json`. It is set in Vercel, not in this repository, so even a deployment from a branch without the live-inventory code still shows the admin's stock.
- The last 30 saves are kept under `inventory/history/` in the store for recovery.
- Until the first change, the admin starts from `lib/seed-vehicles.json`, a copy of the showroom snapshot.
- `npm test` runs the admin tests against an in-memory store.

Deploy with Vercel using `admin` as the root directory. The main site only serves `dist` and `api`, so this folder does not affect it.

## Analytics

- The showroom loads `dist/analytics.js` on every page. It sends anonymous events (page views, vehicle views, showroom card clicks, WhatsApp, email, phone, finance and directions clicks) to this project's `/api/track`, and skips browsers sending Do Not Track or Global Privacy Control. No cookies or browser storage are used.
- `/api/track` drops bots and other sites, rate-limits per address, looks up vehicle names from the live stock list, and stores each event through the Supabase function `track_event`, which requires `ANALYTICS_SECRET`. Visitors are a daily-rotating hash of address and browser; IP addresses are never stored. Events older than about 13 months are deleted.
- The Analytics tab reads `dashboard_analytics(days)`, which only people on `dashboard_users` can call.
