// Anonymous visit counting for the Driving Force stock admin. No cookies or storage are used,
// nothing personal is sent, and browsers asking not to be tracked are respected.
(function () {
  if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) return;
  if (!/(^|\.)driving-force\.co\.za$/.test(location.hostname)) return;
  const endpoint = 'https://driving-force-admin.vercel.app/api/track';
  const params = new URLSearchParams(location.search);
  const source = params.get('utm_source') || (document.referrer && new URL(document.referrer).hostname !== location.hostname ? document.referrer : '');
  function send(kind, vehicleId) {
    // Vehicle pages are grouped as one section; the vehicle itself is sent separately.
    const path = location.pathname.replace(/^\/vehicles\/.+/, '/vehicles/').replace(/\.html$/, '').replace(/^\/index$/, '/');
    const body = JSON.stringify({kind, path, source, vehicleId: vehicleId || undefined});
    try { if (navigator.sendBeacon && navigator.sendBeacon(endpoint, body)) return; } catch {}
    fetch(endpoint, {method: 'POST', body, keepalive: true, mode: 'no-cors'}).catch(() => {});
  }
  const pageVehicle = document.querySelector('#vehicle-content')?.dataset.vehicle || (/^\/vehicle(\.html)?$/.test(location.pathname) ? params.get('id') : null);
  send('pageview', pageVehicle);
  if (pageVehicle) send('vehicle_view', pageVehicle);
  const vehicleOf = el => el.closest('.vehicle-card')?.dataset.vehicle || el.dataset?.vehicle || pageVehicle;
  document.addEventListener('click', event => {
    const el = event.target.closest('a,button'); if (!el) return;
    const href = el.getAttribute('href') || '';
    if (el.matches('.vehicle-card-link,.vehicle-track')) send('card_click', vehicleOf(el));
    else if (/wa\.me|whatsapp/i.test(href) || el.matches('.vehicle-whatsapp')) send('whatsapp', vehicleOf(el));
    else if (href.startsWith('mailto:') || el.matches('.vehicle-email')) send('email', vehicleOf(el));
    else if (href.startsWith('tel:')) send('phone', vehicleOf(el));
    else if (/^\/finance(\.html)?(\?|#|$)/.test(href)) send('finance', vehicleOf(el));
    else if (/maps\.(app\.)?goo\.gl|google\.[a-z.]+\/maps/.test(href)) send('directions');
  }, true);
})();
