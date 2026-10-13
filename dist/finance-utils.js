(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DF = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const money = n => 'R ' + Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const makeLabel = value => ['BMW','MINI'].includes(value) ? value : value.toLowerCase().replace(/(^|[ -])\w/g, m => m.toUpperCase());
  const vehicleTitle = car => `${makeLabel(car.make)} ${makeLabel(car.model)}`;
  function estimate({price, deposit = 0, tradeIn = 0, rate, term}) {
    if (![price,deposit,tradeIn,rate,term].every(Number.isFinite) || price <= 0 || deposit < 0 || tradeIn < 0 || deposit + tradeIn > price || rate < 0 || rate > 30 || ![6,12,18,24,30,36,42,48,54,60,66,72,78,84,90,96].includes(term)) return null;
    const principal = price - deposit - tradeIn;
    const monthlyRate = rate / 1200;
    const monthly = monthlyRate === 0 ? principal / term : principal * monthlyRate / -Math.expm1(-term * Math.log1p(monthlyRate));
    const total = monthly * term;
    return {principal, monthly, total, interest: Math.max(0, total - principal)};
  }
  return {money, escapeHtml, vehicleTitle, estimate};
});
