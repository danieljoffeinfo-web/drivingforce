# Description coverage — 16 October 2026

All 49 current inventory records have two paragraphs of reviewed copy, an exact display name and a source classification. The inventory snapshot remains dated 13 October 2026. Original IDs, order, prices, mileage, colours, variants, photos and every other pre-existing field were preserved.

- 9 descriptions incorporate paraphrased original Driving Force listings, recovered from the Internet Archive. Matching used the exact stock reference in the URL, year, derivative and the original VMG primary image identifier. These also have sourced equipment highlights.
- 40 descriptions use only the verified fields of the exact current inventory record. No original complete listing was recovered for those records; equipment, history, condition and warranties are not asserted. `description-sources.json` identifies every such record.
- The original VMG feed export and public archive index were inspected. Search snippets for additional old listings were found but were not used to make equipment/history claims because the full source could not be recovered.

## Data limitations and conflict handling

- Porsche Cayenne TP12769: archived specification table says manual; current inventory says automatic. Preserved current automatic field and excluded archived gearbox/gears/dimensions.
- Jeep Wrangler TP12831: old page classifies the body as Caravan/Boat/Trailer. Preserved current SUV classification; the exact two-door Sahara variant and matching image identify the vehicle.
- Audi Q5 TP12775: original marketing text calls it second generation, which is not sufficiently established by the listing. Removed that claim, subjective comparisons and condition language.
- Mercedes-Benz GLE TP13011: current variant combines 450/43 AMG. Retained that exact ambiguity and explicitly asks buyers to confirm the precise model; no engine/performance assumptions were added.
- Hyundai H-1 TP12950: current inventory does not establish seat count. Description explicitly tells buyers to confirm the seating configuration.
- All historical prices and mileage were replaced by the unchanged current inventory facts. All archived condition, service-history, warranty, financing-offer and personal contact claims were excluded. The public showroom telephone/email remain the existing destinations.
- Equipment is labelled as recorded in the original dealership listing, with current fitment to be confirmed. No features were inferred from photographs or generic model knowledge.

## Reproducibility

`archive-manifest.json` records the exact original archive URLs. `extracted-listings.json` retains the original descriptive excerpt, equipment evidence, matching image URLs and SHA-256 of each retrieved HTML file. Raw HTML is excluded from Git and deployment. `scripts/enrich-inventory.py` contains the reviewed copy and rebuilds only the new content fields and source ledger.

`npm test` checks source matching and coverage alongside the existing mocked finance tests. `npm run test:browser` checks all 49 pages on desktop/mobile, four representative viewport widths, enquiry links, photo-dialog keyboard support, finance handoff, navigation and failure states. Browser tests use a fresh headless Chromium profile and block every non-GET request; no enquiries are sent.
