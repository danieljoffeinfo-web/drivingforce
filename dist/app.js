(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const frame = $('#car-frame'), swap = $('#car-swap'), whiteCar = $('.car-white');
  let chosenColour = 'black';
  let touchingCar = false;
  function showColour(colour) {
    frame.classList.remove('is-revealing');
    frame.classList.toggle('is-white', colour === 'white');
    $('.car-black').setAttribute('aria-hidden', String(colour === 'white'));
    whiteCar.setAttribute('aria-hidden', String(colour !== 'white'));
    swap.setAttribute('aria-pressed', String(colour === 'white'));
    swap.setAttribute('aria-label', 'Move across the Porsche to reveal white paint. Press Enter to switch the full colour.');
    $('#colour-label').textContent = colour === 'white' ? '02 — WHITE' : '01 — BLACK';
    $$('.swatch').forEach(b => {const active=b.dataset.colour===colour;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
  }
  function revealAt(event) {
    if (chosenColour === 'white') return;
    // Match pointer coordinates to the overlaid photograph, including its responsive crop.
    const bounds = whiteCar.getBoundingClientRect();
    frame.style.setProperty('--reveal-x', `${event.clientX - bounds.left}px`);
    frame.style.setProperty('--reveal-y', `${event.clientY - bounds.top}px`);
    frame.style.setProperty('--reveal-radius', `${Math.max(68, Math.min(145, bounds.width * 0.14))}px`);
    frame.classList.add('is-revealing');
    $('#colour-label').textContent = 'MOVE TO REVEAL';
  }
  function endReveal() {
    touchingCar = false;
    frame.classList.remove('is-revealing');
    $('#colour-label').textContent = chosenColour === 'white' ? '02 — WHITE' : '01 — BLACK';
  }
  swap.addEventListener('pointerenter', event => {if(event.pointerType !== 'touch') revealAt(event);});
  swap.addEventListener('pointermove', event => {if(event.pointerType !== 'touch' || touchingCar) revealAt(event);});
  swap.addEventListener('pointerdown', event => {
    if(event.pointerType === 'touch') {touchingCar = true; swap.setPointerCapture(event.pointerId);}
    revealAt(event);
  });
  swap.addEventListener('pointerleave', endReveal);
  swap.addEventListener('pointercancel', endReveal);
  swap.addEventListener('pointerup', event => {if(event.pointerType === 'touch') endReveal();});
  swap.addEventListener('blur', endReveal);
  // Full-colour switching remains an explicit keyboard or swatch action, never a hover action.
  swap.addEventListener('click', event => {
    if(event.detail !== 0 || event.pointerType) return;
    chosenColour = chosenColour === 'black' ? 'white' : 'black';showColour(chosenColour);
  });
  $$('.swatch').forEach(b => b.addEventListener('click', () => {chosenColour=b.dataset.colour;showColour(chosenColour);}));
  const menu = $('.menu-button'), nav = $('#mobile-nav');
  function closeMenu() {menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');nav.hidden=true;}
  menu.addEventListener('click', () => {const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');nav.hidden=!open;});
  $$('#mobile-nav a').forEach(a=>a.addEventListener('click',closeMenu));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!nav.hidden){closeMenu();menu.focus();}});
  window.matchMedia('(min-width: 901px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
  let inventory=[], category='all', limit=6;
  const money = n => 'R ' + Math.round(n).toLocaleString('en-ZA').replace(/,/g,' ');
  const escapeHtml = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const makeLabel = s => s === 'BMW' || s === 'MINI' ? s : s.toLowerCase().replace(/(^|[ -])\w/g,m=>m.toUpperCase());
  const title = c => `${makeLabel(c.make)} ${c.model === '911' ? '911 Carrera S' : c.model === 'RS4' ? 'RS4 Avant' : c.model === 'X6' ? 'X6 M Sport' : c.model === 'MUSTANG' ? 'Mustang GT' : c.model === 'CAYENNE' ? 'Cayenne GTS' : makeLabel(c.model)}`;
  function inCategory(c) {
    if(category==='all')return true;
    if(category==='suv')return c.body_type==='SUV';
    if(category==='performance')return ['Coupe','Convertible'].includes(c.body_type)||/\b(AMG|RS[345]|M135i)\b/i.test(c.variant);
    return ['Hatchback','Sedan','Station Wagon'].includes(c.body_type);
  }
  function renderInventory(){
    const query=$('#vehicle-search').value.trim().toLowerCase();
    let results=inventory.filter(c=>inCategory(c)&&`${c.make} ${c.model} ${c.variant} ${c.year}`.toLowerCase().includes(query));
    const sort=$('#vehicle-sort').value;
    if(sort==='price-asc')results.sort((a,b)=>a.value-b.value);
    if(sort==='price-desc')results.sort((a,b)=>b.value-a.value);
    if(sort==='year-desc')results.sort((a,b)=>b.year-a.year);
    const visible=results.slice(0,limit);
    $('#result-count').textContent=`${results.length} vehicle${results.length===1?'':'s'} · ${visible.length} on display`;
    $('#vehicle-grid').innerHTML=visible.map(c=>`<article class="vehicle-card"><a href="${escapeHtml(c.permaLink)}" target="_blank" rel="noopener" aria-label="View ${escapeHtml(c.year+' '+title(c))}, ${money(c.value)}"><div class="vehicle-image"><img src="${escapeHtml(c.localImage)}" alt="${escapeHtml(c.year+' '+c.vehicleName+' '+c.variant)}" loading="lazy" width="800" height="533"><span class="vehicle-year">${c.year}</span><span class="vehicle-arrow" aria-hidden="true">↗</span></div><div class="vehicle-info"><div class="vehicle-title-row"><h3>${escapeHtml(title(c))}</h3><span class="vehicle-price">${money(c.value)}</span></div><p class="vehicle-variant">${escapeHtml(c.variant)}</p><div class="vehicle-specs"><span>${Number(c.mile).toLocaleString('en-ZA').replace(/,/g,' ')} km</span><span>${escapeHtml(c.transmission)}</span><span>${escapeHtml(c.fuelType)}</span></div></div></a></article>`).join('') || '<div class="empty-state"><h3>No matches. More possibilities.</h3><p>Try another make or model, or clear your filters to see the full collection.</p><button id="clear-filters" class="button button-black">Clear filters <span>↗</span></button></div>';
    $('#load-more').hidden=limit>=results.length;
    if($('#clear-filters'))$('#clear-filters').addEventListener('click',()=>{category='all';limit=6;$('#vehicle-search').value='';$('#vehicle-sort').value='featured';updateTabs();renderInventory();$('#vehicle-search').focus();});
  }
  function updateTabs(){$$('.filter').forEach(b=>{const active=b.dataset.category===category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;limit=6;updateTabs();renderInventory();}));
  $('#vehicle-search').addEventListener('input',()=>{limit=6;renderInventory();});
  $('#vehicle-sort').addEventListener('change',()=>{limit=6;renderInventory();});
  $('#load-more').addEventListener('click',()=>{const previous=limit;limit+=6;renderInventory();const next=$$('.vehicle-card a')[previous];if(next)next.focus({preventScroll:true});});
  fetch('vehicles.json').then(r=>{if(!r.ok)throw new Error('Inventory unavailable');return r.json();}).then(data=>{inventory=data.vehicles;$('#all-count').textContent=inventory.length;renderInventory();}).catch(()=>{$('#result-count').textContent='The collection could not be loaded.';$('#load-more').hidden=true;$('#vehicle-grid').innerHTML='<div class="empty-state"><h3>Your next drive is waiting.</h3><p>Visit the full Driving Force showroom to browse current stock.</p><a class="button button-black" href="https://driving-force.co.za/showroom/" target="_blank" rel="noopener">Open the showroom <span>↗</span></a></div>';});
  function calculate(){
    const price=Number($('#calc-price').value), deposit=Number($('#calc-deposit').value), rate=Number($('#calc-rate').value)/1200, term=Number($('#calc-term').value);
    const valid=['#calc-price','#calc-deposit','#calc-rate'].every(s=>$(s).value!==''&&$(s).checkValidity())&&deposit<=price;
    $('#calc-deposit').setAttribute('aria-invalid',String(deposit>price));
    if(!valid){$('#monthly-payment').textContent='—';$('#calc-disclaimer').textContent='Enter a price of R 10 000–R 10 000 000, a deposit no greater than the price, and an annual interest rate of 0–30%.';return;}
    const principal=price-deposit, payment=rate===0?principal/term:principal*rate/(1-Math.pow(1+rate,-term));
    $('#monthly-payment').textContent=money(payment);
    $('#calc-disclaimer').textContent='Illustrative estimate, not a finance offer. Excludes fees, insurance and a balloon payment. Final terms are subject to lender approval.';
  }
  $$('.calc-fields input, .calc-fields select').forEach(input=>input.addEventListener('input',calculate));calculate();
})();
