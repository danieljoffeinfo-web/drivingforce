(() => {
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => 'R ' + Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ');
  const makeLabel = value => ['BMW','MINI'].includes(value) ? value : String(value).toLowerCase().replace(/(^|[ -])\w/g, m => m.toUpperCase());
  const title = car => car.displayName || `${makeLabel(car.make)} ${makeLabel(car.model)}`;
  let vehicles = [], siteUrl = '', options = null, removing = null, photoData = '';

  async function api(path, init = {}) {
    const response = await fetch(path, {...init, headers: {'Content-Type': 'application/json', ...(init.headers || {})}});
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/api/session') showLogin();
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  function showLogin() { $('#app-view').hidden = true; $('#sign-out').hidden = true; $('#login-view').hidden = false; $('#login-form [name=password]').focus(); }
  function showApp() { $('#login-view').hidden = true; $('#app-view').hidden = false; $('#sign-out').hidden = false; load(); }
  function notify(message) { const n = $('#notice'); n.textContent = message; n.hidden = !message; }
  const imageFor = car => /^https?:/.test(car.localImage) ? car.localImage : new URL(car.localImage, siteUrl).href;

  async function load() {
    try {
      const data = await api('/api/vehicles');
      vehicles = data.vehicles; siteUrl = data.siteUrl;
      if (!options) {
        options = data.options;
        for (const [name, list] of [['bodyType', options.bodyTypes], ['transmission', options.transmissions], ['fuelType', options.fuelTypes]])
          $(`#add-form [name=${name}]`).innerHTML = '<option value="">Choose…</option>' + list.map(o => `<option>${escapeHtml(o)}</option>`).join('');
      }
      render();
    } catch (error) { $('#summary').textContent = error.message; }
  }
  function render() {
    const query = $('#search').value.trim().toLowerCase();
    const shown = vehicles.filter(car => `${car.make} ${car.model} ${car.variant} ${car.year} ${car.stock_code} ${car.displayName || ''}`.toLowerCase().includes(query));
    $('#summary').textContent = `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} live on the website` + (query ? ` · ${shown.length} matching` : '');
    $('#list').innerHTML = shown.map(car => `<li class="item"><img src="${escapeHtml(imageFor(car))}" alt="" loading="lazy"><div><h3>${car.year} ${escapeHtml(title(car))}${car.descriptionSource === 'admin' ? '<span class="new">Added here</span>' : ''}</h3><p class="meta">${escapeHtml(car.variant)} · ${escapeHtml(car.colour)} · ${Number(car.mile).toLocaleString('en-ZA').replace(/,/g, ' ')} km · Stock ${escapeHtml(car.stock_code)}</p><p class="price">${money(car.value)}</p></div><button class="button ghost" type="button" data-remove="${escapeHtml(car.id)}">Remove</button></li>`).join('') || `<li class="empty">${vehicles.length ? 'No vehicles match your search.' : 'No vehicles are listed yet. Add your first one.'}</li>`;
  }

  // Large phone photos are scaled down in the browser so uploads stay small and fast.
  function resize(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be opened. Please choose a JPG or PNG.')); };
      img.src = url;
    });
  }

  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button'), error = form.querySelector('.error');
    button.disabled = true; error.textContent = '';
    try { await api('/api/session', {method: 'POST', body: JSON.stringify({password: form.password.value})}); form.reset(); showApp(); }
    catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  });
  $('#sign-out').addEventListener('click', async () => { await api('/api/session', {method: 'DELETE'}).catch(() => {}); vehicles = []; $('#list').innerHTML = ''; showLogin(); });
  $('#search').addEventListener('input', render);

  const addDialog = $('#add-dialog'), addForm = $('#add-form');
  $('#add-open').addEventListener('click', () => { addForm.querySelector('.error').textContent = ''; addDialog.showModal(); });
  addDialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => addDialog.close()));
  addForm.photo.addEventListener('change', async () => {
    const preview = addForm.querySelector('.photo-drop img'), error = addForm.querySelector('.error');
    photoData = ''; preview.hidden = true; error.textContent = '';
    const file = addForm.photo.files[0]; if (!file) return;
    try { photoData = await resize(file); preview.src = photoData; preview.hidden = false; }
    catch (e) { error.textContent = e.message; addForm.photo.value = ''; }
  });
  addForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = addForm.querySelector('[type=submit]'), error = addForm.querySelector('.error');
    error.textContent = '';
    const missing = [...addForm.querySelectorAll('[required]')].find(field => field.type === 'file' ? !photoData : !field.value.trim());
    if (missing) { error.textContent = missing.type === 'file' ? 'Please add a photo of the vehicle.' : `Please fill in ${missing.closest('label').firstChild.textContent.trim().toLowerCase()}.`; missing.focus(); return; }
    const vehicle = Object.fromEntries([...new FormData(addForm)].filter(([key]) => key !== 'photo'));
    button.disabled = true; button.textContent = 'Publishing…';
    try {
      const {vehicle: added} = await api('/api/vehicles', {method: 'POST', body: JSON.stringify({vehicle, photo: photoData})});
      vehicles.unshift(added); render(); addDialog.close(); addForm.reset(); photoData = ''; addForm.querySelector('.photo-drop img').hidden = true;
      notify(`${added.year} ${title(added)} is now listed. It appears on the website within about a minute.`);
    } catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; button.textContent = 'Publish to website'; }
  });

  const removeDialog = $('#remove-dialog');
  $('#list').addEventListener('click', event => {
    const button = event.target.closest('[data-remove]'); if (!button) return;
    removing = vehicles.find(car => String(car.id) === button.dataset.remove); if (!removing) return;
    $('#remove-name').textContent = `${removing.year} ${title(removing)} — ${removing.variant} (stock ${removing.stock_code}, ${money(removing.value)})`;
    removeDialog.querySelector('.error').textContent = '';
    removeDialog.showModal();
  });
  $('#remove-confirm').addEventListener('click', async event => {
    event.preventDefault();
    const button = event.currentTarget; button.disabled = true;
    try {
      await api('/api/vehicles?id=' + encodeURIComponent(removing.id), {method: 'DELETE'});
      vehicles = vehicles.filter(car => car !== removing); render(); removeDialog.close();
      notify(`${removing.year} ${title(removing)} has been taken off. The website updates within about a minute.`);
    } catch (e) { removeDialog.querySelector('.error').textContent = e.message; }
    finally { button.disabled = false; }
  });

  api('/api/session').then(data => data.authenticated ? showApp() : showLogin()).catch(showLogin);
})();
