# Driving Force homepage
A responsive, buildless homepage using the supplied black and white Porsche photos and supplied logo, with a gradual black-to-white hover and scroll transition, a small neutral cursor, and a full 49-vehicle searchable collection, finance estimator, and finance / selling / service / about sections.

## Run locally
Run `python3 -m http.server 4173 --directory dist` from this folder and open http://localhost:4173.

## Files
- `dist/index.html`: page structure and content
- `dist/style.css`: responsive design
- `dist/app.js`: colour transition, navigation, filters, sorting, full inventory and finance estimate
- `dist/vehicles.json`: inventory snapshot from 13 October 2026
- `dist/assets/`: supplied photographs and logo, downloaded dealership photographs, self-hosted Google fonts

## Content and boundaries
Inventory source: https://driving-force.co.za/wp-content/themes/vmg-motors-theme/filterData.php (the public feed used by https://driving-force.co.za/showroom/).
The inventory is a static snapshot, not a live integration. Refresh vehicles.json and associated images to update the collection. Vehicle enquiries link to original vehicle pages. Finance applications, service bookings and valuations link to the original dealership website. No visitor data is collected by this homepage.
The hero features supplied Porsche Turbo S creative. It is not represented as a stock listing and its colour transition does not claim the inventory cars are available in those colours.
The calculator uses standard amortisation with an editable illustrative annual rate, no balloon, no fees and no insurance. It is an estimate and not a credit offer.

## Verification
- Rendered at desktop and mobile breakpoints; no horizontal document overflow after refinement.
- All local images and assets load.
- Search and category intersection: Porsche SUVs returns two Cayennes.
- Empty search state and clear filters work.
- All 49 vehicles display without a load-more control; filtering, empty-state reset and sorting operate on the full collection.
- Finance: R450,000 financed over 72 months at 12% gives approximately R8,798/month; 0% gives R6,250. Deposit above vehicle price produces an error.
- Keyboard colour toggle, mobile menu and in-page links checked.
- JavaScript syntax checked; local server returned HTTP 200.

## Colour transition
Scrolling through the hero gradually increases the white photo opacity, completing while the car is still visible. Scrolling back to the top returns it to black. Hovering or holding the car smoothly takes it fully white; leaving or releasing returns it to the current scroll position’s colour. Enter toggles a full-white override for keyboard users. Reduced-motion preferences remove the easing. Resize and restored scroll positions are handled.

## Cursor design
A small, thin neutral ring follows the mouse over the car. It hides when leaving the car, scrolling or changing window focus. There are no colour swatches or extra cursor decorations.

## Control styling
Header links and category tabs remain available with simple text and underline focus states. Category counts have no box. The finance calculator has no outer card or rectangular field borders; fields use subtle underlines with a stronger focus underline.
