// Vehicle cards for the showroom and make pages. Shared by the browser and the server-rendered
// pages so search engines see exactly what visitors see.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./finance-utils.js'), require('./inventory.js'));
  else root.DFCard = factory(root.DF, root.DFInventory);
})(typeof window !== 'undefined' ? window : globalThis, function (DF, DFInventory) {
  const {money, escapeHtml, vehicleTitle: title} = DF;
  const {vehicleUrl} = DFInventory;
  // Vehicle enquiries go to the sales WhatsApp line (082 425 4253), prefilled with the car and stock code.
  const whatsappNumber = '27824254253';
  const whatsappLink = c => `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi Driving Force, I'm interested in the ${c.year} ${title(c)} (${c.variant}, stock ${c.stock_code}) advertised at ${money(c.value)}. Is it still available?`)}`;
  const emailIcon = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M3 5.5h18v13H3z M3.5 6l8.5 7 8.5-7"/></svg>';
  const whatsappIcon = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.5 14.97L2 22l5.17-1.5A9.93 9.93 0 1 0 12.04 2Zm0 18.13a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.07.9.91-2.99-.2-.31a8.22 8.22 0 1 1 6.85 3.73Zm4.5-6.15c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.16.25-.63.8-.78.97-.14.16-.29.18-.53.06a6.74 6.74 0 0 1-3.37-2.94c-.25-.44.25-.41.72-1.36.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.74 2.74 0 0 0-.86 2.04 4.76 4.76 0 0 0 1 2.53 10.9 10.9 0 0 0 4.18 3.69c1.55.67 2.16.73 2.94.61.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.16-.47-.28Z"/></svg>';
  const km = n => Number(n).toLocaleString('en-ZA').replace(/,/g, ' ') + ' km';
  const photosOf = c => (Array.isArray(c.photos) && c.photos.length ? c.photos : [c.localImage]).filter(Boolean);
  const imageUrl = src => /^https?:/.test(src) ? src : '/' + String(src).replace(/^\/+/, '');
  // Card photos slide sideways (swipe, or the arrows on hover); cars with one photo show it as before.
  // The photo strip is a separate link so the arrow buttons are not nested inside a link.
  function cardPhotos(c) {
    const photos = photosOf(c);
    const alt = escapeHtml(`${c.year} ${title(c)} ${c.variant} in ${c.colour}, for sale at Driving Force Cape Town`);
    const strip = `<a class="vehicle-image vehicle-track" href="${vehicleUrl(c)}" tabindex="-1" aria-hidden="true">${photos.map((src, i) => `<img src="${escapeHtml(imageUrl(src))}" alt="${i ? '' : alt}" loading="lazy" width="800" height="533" draggable="false">`).join('')}</a>`;
    if (photos.length < 2) return `<div class="vehicle-media">${strip}</div>`;
    const name = escapeHtml(c.year + ' ' + title(c));
    return `<div class="vehicle-media" data-count="${photos.length}">${strip}<button type="button" class="carousel-btn carousel-prev" data-step="-1" aria-label="Previous photo of the ${name}">‹</button><button type="button" class="carousel-btn carousel-next" data-step="1" aria-label="Next photo of the ${name}">›</button><span class="carousel-count" aria-hidden="true">1 / ${photos.length}</span><span class="carousel-dots" aria-hidden="true">${photos.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</span></div>`;
  }
  // The contact row needs the email dialog from the homepage; pages without it leave it out.
  function cardMarkup(c, {contact = true} = {}) {
    const name = escapeHtml(c.year + ' ' + title(c));
    return `<article class="vehicle-card" data-vehicle="${escapeHtml(c.id)}">${cardPhotos(c)}<a class="vehicle-card-link" href="${vehicleUrl(c)}" aria-label="View ${name}, ${money(c.value)}"><div class="vehicle-info"><p class="vehicle-meta"><span>${c.year}</span><span>${escapeHtml(c.body_type)}</span></p><h3>${escapeHtml(title(c))}</h3><p class="vehicle-variant">${escapeHtml(c.variant)}</p><div class="vehicle-specs"><span>${km(c.mile)}</span><span>${escapeHtml(c.transmission)}</span><span>${escapeHtml(c.fuelType)}</span></div><div class="vehicle-card-bottom"><span class="vehicle-price">${money(c.value)}</span><span class="vehicle-view">View vehicle <span aria-hidden="true">↗</span></span></div></div></a>${contact ? `<div class="vehicle-contact"><a class="vehicle-whatsapp" href="${escapeHtml(whatsappLink(c))}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp us about the ${name} (opens WhatsApp)">${whatsappIcon}<span>WhatsApp us</span></a><button type="button" class="vehicle-email" data-vehicle="${escapeHtml(c.id)}" aria-haspopup="dialog" aria-label="Email us about the ${name}">${emailIcon}<span>Email us</span></button></div>` : ''}</article>`;
  }
  // Arrow buttons and swipe tracking for the card carousels inside a grid.
  function wireCarousels(grid) {
    grid.addEventListener('click', event => {
      const button = event.target.closest('.carousel-btn'); if (!button) return;
      const track = button.parentElement.querySelector('.vehicle-track'), count = track.children.length;
      const index = Math.round(track.scrollLeft / track.clientWidth), next = (index + Number(button.dataset.step) + count) % count;
      track.scrollTo({left: next * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
    });
    // Keep the dots and counter in step with swiping as well as the arrows.
    grid.addEventListener('scroll', event => {
      const track = event.target; if (!track.classList?.contains('vehicle-track')) return;
      const media = track.parentElement, index = Math.round(track.scrollLeft / track.clientWidth);
      const count = media.querySelector('.carousel-count'); if (!count) return;
      count.textContent = (index + 1) + ' / ' + track.children.length;
      media.querySelectorAll('.carousel-dots i').forEach((dot, i) => dot.classList.toggle('on', i === index));
    }, true);
  }
  return {cardMarkup, cardPhotos, whatsappLink, wireCarousels, photosOf, imageUrl, km};
});
