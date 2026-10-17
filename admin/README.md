# Driving Force stock admin

A separate Vercel project (`driving-force-admin`) for adding vehicles to, and removing them from, the showroom website.

- Sign in with the `ADMIN_PASSWORD` environment variable. `SESSION_SECRET` signs the 12-hour sign-in cookie. Change either in the Vercel project settings and redeploy.
- Inventory and new photos are stored in the `driving-force-inventory` Vercel Blob store (`BLOB_READ_WRITE_TOKEN`).
- Every change publishes `inventory.json` to the store. The showroom (`dist/inventory.js`) reads that file and falls back to the bundled `dist/vehicles.json` until the first change, or if the store cannot be reached. Changes appear on the website within about a minute.
- The last 30 saves are kept under `inventory/history/` in the store for recovery.
- Until the first change, the admin starts from `lib/seed-vehicles.json`, a copy of the showroom snapshot.
- `npm test` runs the admin tests against an in-memory store.

Deploy with Vercel using `admin` as the root directory. The main site only serves `dist` and `api`, so this folder does not affect it.
