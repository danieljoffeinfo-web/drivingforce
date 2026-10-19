(() => {
  const {money,vehicleTitle,estimate} = DF;
  const {vehicleMarkup} = DFVehicleView;
  const {photosOf,imageUrl} = DFCard;
  const root = document.querySelector('#vehicle-content');
  // The server renders the page at /vehicles/<slug>; the id is in its markup. Old links carry ?id=.
  const id = root.dataset.vehicle || new URLSearchParams(location.search).get('id');
  if (id) root.dataset.vehicle = id;
  DFInventory.load().then(data => {
    const car = data.vehicles.find(item => String(item.id) === id);
    if (!car) {root.innerHTML = '<div class="page-message"><h1>Let’s find your next drive.</h1><p>This vehicle could not be found in the current collection.</p><a class="button button-black" href="/#showroom">Back to the showroom <span>↗</span></a></div>';return;}
    if (root.dataset.rendered !== 'server') document.title = `${car.year} ${vehicleTitle(car)} ${car.variant} for sale in Cape Town | Driving Force`;
    const photos = photosOf(car).map(imageUrl);
    if (root.dataset.rendered !== 'server') root.innerHTML = vehicleMarkup(car, data);
    const photoDialog = document.querySelector('.vehicle-photo-dialog');
    let current = 0;
    function showPhoto(index) {
      current = (index + photos.length) % photos.length;
      document.querySelector('.detail-photo').src = photos[current];
      document.querySelector('.dialog-image').src = photos[current];
      document.querySelectorAll('.photo-thumb').forEach((thumb,i)=>thumb.setAttribute('aria-pressed',String(i===current)));
      const count = document.querySelector('.photo-count'); if(count) count.textContent = (current+1)+' / '+photos.length;
    }
    document.querySelectorAll('.photo-thumb').forEach(thumb=>thumb.addEventListener('click',()=>showPhoto(Number(thumb.dataset.photo))));
    document.querySelector('.photo-prev')?.addEventListener('click',()=>showPhoto(current-1));
    document.querySelector('.photo-next')?.addEventListener('click',()=>showPhoto(current+1));
    photoDialog.addEventListener('keydown',event=>{if(photos.length>1&&(event.key==='ArrowLeft'||event.key==='ArrowRight'))showPhoto(current+(event.key==='ArrowLeft'?-1:1));});
    const photoOpen = document.querySelector('.photo-open');
    photoOpen.addEventListener('click',()=>photoDialog.showModal());
    document.querySelector('.photo-close').addEventListener('click',()=>photoDialog.close());
    photoDialog.addEventListener('click',event=>{if(event.target===photoDialog){const r=photoDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)photoDialog.close();}});
    photoDialog.addEventListener('close',()=>photoOpen.focus({preventScroll:true}));
    const form = document.querySelector('#vehicle-estimate');
    form.addEventListener('submit',event=>event.preventDefault());
    function calculate() {
      const values = Object.fromEntries([...new FormData(form)].map(([name,value])=>[name,value === '' ? NaN : Number(value)]));
      const result = form.checkValidity() ? estimate(values) : null;
      document.querySelector('#estimate-error').textContent = result ? '' : 'Enter valid amounts. Deposit and net trade-in together cannot exceed the vehicle price.';
      for(const key of ['monthly','principal','interest','total']) document.querySelector('#estimate-'+key).textContent = result ? money(result[key]) : '—';
      // Only non-personal vehicle and estimate values are passed to the application.
      const params = new URLSearchParams({vehicle:car.id});
      if(result) for(const key of ['deposit','tradeIn','rate','term']) params.set(key,values[key]);
      document.querySelector('#apply-finance').href = '/finance?'+params;
    }
    form.addEventListener('input',calculate);calculate();
  }).catch(()=>{root.innerHTML='<div class="page-message"><h1>The vehicle could not load.</h1><p>Please try again or contact our showroom.</p><a class="button button-black" href="/#showroom">Back to the showroom</a></div>';});
})();
