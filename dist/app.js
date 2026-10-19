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
  const makeLabel = s => s === 'BMW' || s === 'MINI' ? s : s.toLowerCase().replace(/(^|[ -])\w/g,m=>m.toUpperCase());
  const title = c => c.displayName || `${makeLabel(c.make)} ${makeLabel(c.model)}`;
  // Vehicle enquiries go to the sales WhatsApp line (082 425 4253), prefilled with the car and stock code.
  const whatsappNumber = '27824254253';
  const whatsappLink = c => `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi Driving Force, I'm interested in the ${c.year} ${title(c)} (${c.variant}, stock ${c.stock_code}) advertised at ${money(c.value)}. Is it still available?`)}`;
  const emailIcon = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18"><path fill="none" stroke="currentColor" stroke-width="1.6" d="M3 5.5h18v13H3z M3.5 6l8.5 7 8.5-7"/></svg>';
  const whatsappIcon = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.5 14.97L2 22l5.17-1.5A9.93 9.93 0 1 0 12.04 2Zm0 18.13a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.07.9.91-2.99-.2-.31a8.22 8.22 0 1 1 6.85 3.73Zm4.5-6.15c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.16.25-.63.8-.78.97-.14.16-.29.18-.53.06a6.74 6.74 0 0 1-3.37-2.94c-.25-.44.25-.41.72-1.36.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.74 2.74 0 0 0-.86 2.04 4.76 4.76 0 0 0 1 2.53 10.9 10.9 0 0 0 4.18 3.69c1.55.67 2.16.73 2.94.61.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.16-.47-.28Z"/></svg>';
  function inCategory(c) {
    if(category==='all')return true;
    if(category==='suv')return c.body_type==='SUV';
    if(category==='performance')return ['Coupe','Convertible'].includes(c.body_type)||/\b(AMG|RS[345]|M135i)\b/i.test(c.variant);
    return ['Hatchback','Sedan','Station Wagon'].includes(c.body_type);
  }
  // Card photos slide sideways (swipe, or the arrows on hover); cars with one photo show it as before.
  // The photo strip is a separate link so the arrow buttons are not nested inside a link.
  function cardPhotos(c){
    const photos=(Array.isArray(c.photos)&&c.photos.length?c.photos:[c.localImage]).filter(Boolean);
    const alt=escapeHtml(c.year+' '+title(c)+' — '+c.colour);
    const strip=`<a class="vehicle-image vehicle-track" href="vehicle.html?id=${c.id}" tabindex="-1" aria-hidden="true">${photos.map((src,i)=>`<img src="${escapeHtml(src)}" alt="${i?'':alt}" loading="lazy" width="800" height="533" draggable="false">`).join('')}</a>`;
    if(photos.length<2)return `<div class="vehicle-media">${strip}</div>`;
    const name=escapeHtml(c.year+' '+title(c));
    return `<div class="vehicle-media" data-count="${photos.length}">${strip}<button type="button" class="carousel-btn carousel-prev" data-step="-1" aria-label="Previous photo of the ${name}">‹</button><button type="button" class="carousel-btn carousel-next" data-step="1" aria-label="Next photo of the ${name}">›</button><span class="carousel-count" aria-hidden="true">1 / ${photos.length}</span><span class="carousel-dots" aria-hidden="true">${photos.map((_,i)=>`<i${i?'':' class="on"'}></i>`).join('')}</span></div>`;
  }
  function renderInventory(){
    const query=$('#vehicle-search').value.trim().toLowerCase();
    let results=inventory.filter(c=>inCategory(c)&&`${c.make} ${c.model} ${c.variant} ${c.year}`.toLowerCase().includes(query));
    const sort=$('#vehicle-sort').value;
    if(sort==='price-asc')results.sort((a,b)=>a.value-b.value);
    if(sort==='price-desc')results.sort((a,b)=>b.value-a.value);
    if(sort==='year-desc')results.sort((a,b)=>b.year-a.year);
    $('#result-count').textContent=`${results.length} vehicle${results.length===1?'':'s'} on display`;
    $('#vehicle-grid').innerHTML=results.map(c=>`<article class="vehicle-card">${cardPhotos(c)}<a class="vehicle-card-link" href="vehicle.html?id=${c.id}" aria-label="View ${escapeHtml(c.year+' '+title(c))}, ${money(c.value)}"><div class="vehicle-info"><p class="vehicle-meta"><span>${c.year}</span><span>${escapeHtml(c.body_type)}</span></p><h3>${escapeHtml(title(c))}</h3><p class="vehicle-variant">${escapeHtml(c.variant)}</p><div class="vehicle-specs"><span>${Number(c.mile).toLocaleString('en-ZA').replace(/,/g,' ')} km</span><span>${escapeHtml(c.transmission)}</span><span>${escapeHtml(c.fuelType)}</span></div><div class="vehicle-card-bottom"><span class="vehicle-price">${money(c.value)}</span><span class="vehicle-view">View vehicle <span aria-hidden="true">↗</span></span></div></div></a><div class="vehicle-contact"><a class="vehicle-whatsapp" href="${escapeHtml(whatsappLink(c))}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp us about the ${escapeHtml(c.year+' '+title(c))} (opens WhatsApp)">${whatsappIcon}<span>WhatsApp us</span></a><button type="button" class="vehicle-email" data-vehicle="${c.id}" aria-haspopup="dialog" aria-label="Email us about the ${escapeHtml(c.year+' '+title(c))}">${emailIcon}<span>Email us</span></button></div></article>`).join('') || '<div class="empty-state"><h3>No matches. More possibilities.</h3><p>Try another make or model, or clear your filters to see the full collection.</p><button id="clear-filters" class="button button-black">Clear filters <span>↗</span></button></div>';
    if($('#clear-filters'))$('#clear-filters').addEventListener('click',()=>{category='all';$('#vehicle-search').value='';$('#vehicle-sort').value='featured';updateTabs();renderInventory();$('#vehicle-search').focus();});
  }
  // Email enquiries post to /api/enquiry, which delivers them through Resend.
  const enquiryDialog=$('#enquiry-dialog'), enquiryForm=$('#enquiry-form'), enquiryStatus=$('#enquiry-status');
  let enquiryOpener=null;
  $('#vehicle-grid').addEventListener('click',event=>{
    const button=event.target.closest('.vehicle-email');if(!button)return;
    const c=inventory.find(car=>String(car.id)===button.dataset.vehicle);if(!c)return;
    enquiryOpener=button;enquiryForm.reset();enquiryStatus.textContent='';enquiryStatus.classList.remove('error');
    enquiryForm.hidden=false;enquiryForm.querySelectorAll('input,textarea,button').forEach(el=>el.disabled=false);
    enquiryForm.vehicleId.value=c.id;
    $('#enquiry-vehicle').textContent=`${c.year} ${title(c)} · ${money(c.value)} · Stock ${c.stock_code}`;
    enquiryForm.message.value=`Hi, I'm interested in the ${c.year} ${title(c)} (stock ${c.stock_code}). Is it still available?`;
    $('#enquiry-whatsapp').href=whatsappLink(c);
    enquiryDialog.showModal();enquiryForm.name.focus();
  });
  $('.enquiry-close').addEventListener('click',()=>enquiryDialog.close());
  enquiryDialog.addEventListener('click',event=>{if(event.target===enquiryDialog)enquiryDialog.close();});
  enquiryDialog.addEventListener('close',()=>{if(enquiryOpener)enquiryOpener.focus();});
  enquiryForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const invalid=[...enquiryForm.elements].find(el=>el.willValidate&&!el.checkValidity());
    if(invalid){enquiryStatus.textContent=invalid.name==='email'&&invalid.value?'Enter a valid email address.':`Please enter your ${invalid.name==='message'?'message':invalid.name==='phone'?'phone number':invalid.name}.`;enquiryStatus.classList.add('error');invalid.focus();return;}
    const submit=enquiryForm.querySelector('.enquiry-submit');
    submit.disabled=true;enquiryStatus.classList.remove('error');enquiryStatus.textContent='Sending your enquiry…';
    try{
      const response=await fetch('/api/enquiry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(enquiryForm)))});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Your enquiry could not be sent. Please WhatsApp us on 082 425 4253 or call 021 203 8888.');
      enquiryForm.querySelectorAll('input,textarea,button:not(.enquiry-close)').forEach(el=>el.disabled=true);
      enquiryStatus.textContent='Thank you. Your enquiry has been sent and our sales team will be in touch shortly.';
    }catch(error){
      submit.disabled=false;enquiryStatus.classList.add('error');
      enquiryStatus.textContent=error instanceof TypeError?'You appear to be offline. Please WhatsApp us on 082 425 4253 or call 021 203 8888.':error.message;
    }
  });
  function updateTabs(){$$('.filter').forEach(b=>{const active=b.dataset.category===category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
  $$('.filter').forEach(b=>b.addEventListener('click',()=>{category=b.dataset.category;updateTabs();renderInventory();}));
  $('#vehicle-search').addEventListener('input',()=>{renderInventory();});
  const grid=$('#vehicle-grid');
  grid.addEventListener('click',event=>{
    const button=event.target.closest('.carousel-btn');if(!button)return;
    const track=button.parentElement.querySelector('.vehicle-track'),count=track.children.length;
    const index=Math.round(track.scrollLeft/track.clientWidth),next=(index+Number(button.dataset.step)+count)%count;
    track.scrollTo({left:next*track.clientWidth,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  });
  // Keep the dots and counter in step with swiping as well as the arrows.
  grid.addEventListener('scroll',event=>{
    const track=event.target;if(!track.classList?.contains('vehicle-track'))return;
    const media=track.parentElement,index=Math.round(track.scrollLeft/track.clientWidth);
    const count=media.querySelector('.carousel-count');if(!count)return;
    count.textContent=(index+1)+' / '+track.children.length;
    media.querySelectorAll('.carousel-dots i').forEach((dot,i)=>dot.classList.toggle('on',i===index));
  },true);
  $('#vehicle-sort').addEventListener('change',()=>{renderInventory();});
  DFInventory.load().then(data=>{inventory=data.vehicles;$('#all-count').textContent=inventory.length;renderInventory();}).catch(()=>{$('#result-count').textContent='The collection could not be loaded.';$('#vehicle-grid').innerHTML='<div class="empty-state"><h3>Your next drive is waiting.</h3><p>Visit the full Driving Force showroom to browse current stock.</p><a class="button button-black" href="visit.html" >Visit the showroom <span>↗</span></a></div>';});
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
