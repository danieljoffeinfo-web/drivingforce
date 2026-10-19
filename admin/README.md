# Driving Force stock admin

A separate Vercel project (`driving-force-admin`) for adding vehicles to, and removing them from, the showroom website.

- Everyone signs in with their own email and password. Owners add and remove people, and reset passwords, under **Account**; everyone can change their own password there. Passwords need at least 10 characters and are stored as scrypt hashes.
- The first owner is `OWNER_EMAIL`, who signs in with `ADMIN_PASSWORD` the first time. After that, accounts live in an encrypted file in the Blob store (`users/`, encrypted with `DATA_KEY`), and `ADMIN_PASSWORD` is no longer used. Changing `DATA_KEY` makes the existing accounts unreadable.
- `SESSION_SECRET` signs the 12-hour sign-in cookie. Changing or resetting a password, or removing a person, signs out their other sessions straight away.
- There is no emailed "forgot password" link: an owner resets the password and shares it privately.
- Inventory and new photos are stored in the `driving-force-inventory` Vercel Blob store (`BLOB_READ_WRITE_TOKEN`).
- Every change publishes `inventory.json` to the store. The showroom (`dist/inventory.js`) reads that file and falls back to the bundled `dist/vehicles.json` until the first change, or if the store cannot be reached. Changes appear on the website within about a minute.
- The last 30 saves are kept under `inventory/history/` in the store for recovery.
- Until the first change, the admin starts from `lib/seed-vehicles.json`, a copy of the showroom snapshot.
- `npm test` runs the admin tests against an in-memory store.

Deploy with Vercel using `admin` as the root directory. The main site only serves `dist` and `api`, so this folder does not affect it.
