(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const frame = $('#car-frame'), swap = $('#car-swap'), whiteCar = $('.car-white');
  const revealCursor = $('#reveal-cursor');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  swap.classList.toggle('cursor-ready', finePointer.matches);
  let chosenColour = 'black';
  let touchingCar = false, hoveringCar = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hero = $('.hero'), stage = $('#car-stage');
  let scrollWhiteness = 0, paintWhiteness = 0, targetWhiteness = 0;
  let fadeStart = 0, fadeDistance = 1, paintFrame = 0, lastPaintTime = 0;

  function animatePaint(time) {
    const elapsed = lastPaintTime ? Math.min(time - lastPaintTime, 64) : 16;
    lastPaintTime = time;
    paintWhiteness += (targetWhiteness - paintWhiteness) * (1 - Math.exp(-elapsed / 180));
    if (Math.abs(targetWhiteness - paintWhiteness) < 0.001) paintWhiteness = targetWhiteness;
    frame.style.setProperty('--car-whiteness', paintWhiteness.toFixed(4));
    if (paintWhiteness !== targetWhiteness) paintFrame = requestAnimationFrame(animatePaint);
    else {paintFrame = 0;lastPaintTime = 0;}
  }
  function updatePaint() {
    targetWhiteness = chosenColour === 'white' || hoveringCar ? 1 : scrollWhiteness;
    if (reducedMotion.matches) {
      cancelAnimationFrame(paintFrame);
      paintFrame = 0;lastPaintTime = 0;paintWhiteness = targetWhiteness;
      frame.style.setProperty('--car-whiteness', paintWhiteness.toFixed(4));
    } else if (!paintFrame && paintWhiteness !== targetWhiteness) {
      paintFrame = requestAnimationFrame(animatePaint);
    }
  }
  function readScrollProgress() {
    scrollWhiteness = Math.max(0, Math.min(1, (window.scrollY - fadeStart) / fadeDistance));
  }
  function measureScrollFade() {
    fadeStart = Math.max(0, hero.offsetTop - $('.header').offsetHeight);
    // Complete the change while the car is still visible beneath the header.
    fadeDistance = Math.max(1, Math.min(stage.offsetHeight * 0.7, window.innerHeight * 0.45));
    readScrollProgress();updatePaint();
  }
  reducedMotion.addEventListener('change', updatePaint);
  window.addEventListener('resize', measureScrollFade, {passive:true});
  window.addEventListener('pageshow', measureScrollFade);
  document.fonts.ready.then(measureScrollFade);
  measureScrollFade();
  function showColour(colour) {
    revealCursor.classList.remove('is-visible');
    swap.classList.toggle('cursor-ready', finePointer.matches && colour === 'black');
    hoveringCar = false;
    updatePaint();
    $('.car-black').setAttribute('aria-hidden', String(colour === 'white'));
    whiteCar.setAttribute('aria-hidden', String(colour !== 'white'));
    swap.setAttribute('aria-pressed', String(colour === 'white'));
    swap.setAttribute('aria-label', 'Scroll, hover over or hold the Porsche to turn it white. Press Enter to toggle the colour.');
  }
  function revealAt(event) {
    if (chosenColour === 'white') return;
    if (event.pointerType === 'mouse' && finePointer.matches) {
      revealCursor.style.setProperty('--cursor-x', `${event.clientX}px`);
      revealCursor.style.setProperty('--cursor-y', `${event.clientY}px`);
      revealCursor.classList.add('is-visible');
    }
    hoveringCar = true;
    updatePaint();
  }
  function endReveal() {
    revealCursor.classList.remove('is-visible');
    touchingCar = false;
    hoveringCar = false;
    updatePaint();
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
  window.addEventListener('blur', endReveal);
  window.addEventListener('scroll', () => {readScrollProgress();endReveal();}, {passive:true});
  finePointer.addEventListener('change', () => {endReveal();swap.classList.toggle('cursor-ready', finePointer.matches && chosenColour === 'black');});
  // Keyboard users can keep either colour visible without holding a pointer over the car.
  swap.addEventListener('click', event => {
    if(event.detail !== 0 || event.pointerType) return;
    chosenColour = chosenColour === 'black' ? 'white' : 'black';showColour(chosenColour);
  });
  const menu = $('.menu-button'), nav = $('#mobile-nav');
  function closeMenu() {menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');nav.hidden=true;}
  menu.addEventListener('click', () => {const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');nav.hidden=!open;});
  $$('#mobile-nav a').forEach(a=>a.addEventListener('click',closeMenu));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!nav.hidden){closeMenu();menu.focus();}});
  window.matchMedia('(min-width: 901px)').addEventListener('change',e=>{if(e.matches)closeMenu();});
  let inventory=[], category='all';
  const money = n => 'R ' + Math.round(n).toLocaleString('en-ZA').replace(/,/g,' ');
  const escapeHtml = text => String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title = DF.vehicleTitle;
  const {cardMarkup,wireCarousels}=DFCard;
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
    $('#result-count').textContent=`${results.length} vehicle${results.length===1?'':'s'} on display`;
    $('#vehicle-grid').innerHTML=results.map(c=>cardMarkup(c)).join('') || '<div class="empty-state"><h3>No matches. More possibilities.</h3><p>Try another make or model, or clear your filters to see the full collection.</p><button id="clear-filters" class="button button-black">Clear filters <span>↗</span></button></div>';
    if($('#clear-filters'))$('#clear-filters').addEventListener('click',()=>{category='all';$('#vehicle-search').value='';$('#vehicle-sort').value='featured';updateTabs();renderInventory();$('#vehicle-search').focus();});
  }
  // The email enquiry form is shared with the vehicle pages (enquiry-form.js).
  $('#vehicle-grid').addEventListener('click',event=>{
    const button=event.target.closest('.vehicle-email');if(!button)return;
    const c=inventory.find(car=>String(car.id)===button.dataset.vehicle);if(c)DFEnquiry.open(c,button);
  });
  function updateTabs(){$$('.filter').forEach(b=>{const active=b.dataset.category===category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;updateTabs();renderInventory();}));
  $('#vehicle-search').addEventListener('input',()=>{renderInventory();});
  wireCarousels($('#vehicle-grid'));
  $('#vehicle-sort').addEventListener('change',()=>{renderInventory();});
  DFInventory.load().then(data=>{inventory=data.vehicles;$('#all-count').textContent=inventory.length;renderInventory();}).catch(()=>{$('#result-count').textContent='The collection could not be loaded.';$('#vehicle-grid').innerHTML='<div class="empty-state"><h3>Your next drive is waiting.</h3><p>Visit the full Driving Force showroom to browse current stock.</p><a class="button button-black" href="/visit">Visit the showroom <span>↗</span></a></div>';});
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
