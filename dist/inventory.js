(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DFInventory = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // Published by the stock admin (admin/). Until the first admin change, or if it cannot be reached,
  // the bundled vehicles.json snapshot is used instead.
  const liveUrl = 'https://n39fqfoyvpcatajv.public.blob.vercel-storage.com/inventory.json';
  const valid = data => data && Array.isArray(data.vehicles) ? data : Promise.reject(new Error('Invalid inventory'));
  const read = (url, options) => fetch(url, options).then(r => { if (!r.ok) throw new Error('Inventory unavailable'); return r.json(); }).then(valid);
  // Server-rendered pages include the data they were built from, used if nothing else can be fetched.
  const embedded = () => { try { const el = typeof document !== 'undefined' && (document.querySelector('#inventory-data') || document.querySelector('#vehicle-data')); return el ? valid(JSON.parse(el.textContent)) : Promise.reject(new Error('No embedded inventory')); } catch (error) { return Promise.reject(error); } };
  const load = () => read(liveUrl, {cache: 'no-cache'}).catch(() => read('/vehicles.json')).catch(embedded);
  // Vehicle pages keep the address scheme of the original website (make-model-stockcode-278),
  // so links that search engines already know carry on working.
  const slugify = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const vehicleSlug = car => `${slugify(car.make + ' ' + car.model)}-${slugify(car.stock_code)}-${car.company_id || '278'}`;
  const vehicleUrl = car => '/vehicles/' + vehicleSlug(car);
  const makeSlug = make => slugify(make);
  const makeUrl = make => '/used-cars/' + makeSlug(make);
  return {liveUrl, load, slugify, vehicleSlug, vehicleUrl, makeSlug, makeUrl};
});
