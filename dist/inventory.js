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
  const load = () => read(liveUrl, {cache: 'no-cache'}).catch(() => read('vehicles.json'));
  return {liveUrl, load};
});
