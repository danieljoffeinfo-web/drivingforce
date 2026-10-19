(() => {
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => 'R ' + Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ');
  const makeLabel = value => ['BMW','MINI'].includes(value) ? value : String(value).toLowerCase().replace(/(^|[ -])\w/g, m => m.toUpperCase());
  const title = car => car.displayName || `${makeLabel(car.make)} ${makeLabel(car.model)}`;
  const photosOf = car => Array.isArray(car.photos) && car.photos.length ? car.photos : [car.localImage].filter(Boolean);
  let vehicles = [], savedOrder = [], siteUrl = '', options = null, removing = null, me = null;

  async function api(path, init = {}) {
    const response = await fetch(path, {...init, headers: {'Content-Type': 'application/json', ...(init.headers || {})}});
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/api/session') showLogin();
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  function showLogin() { me = null; $('#app-view').hidden = true; $('#login-view').hidden = false; $('#recover-form').hidden = true; $('#reset-form').hidden = true; $('#login-form').hidden = false; $('#login-form [name=email]').focus(); }
  function showApp(user) {
    me = user; const name = user.name || user.email;
    $('#who').textContent = name; $('#who-role').textContent = user.owner ? 'Owner' : 'Staff'; $('#avatar').textContent = name.trim()[0].toUpperCase();
    $('#login-view').hidden = true; $('#app-view').hidden = false;
    let saved = 'home'; try { saved = localStorage.getItem('df-view') || 'home'; } catch {}
    load().then(() => go(saved));
  }
  function notify(message) { const n = $('#notice'); n.textContent = message; n.hidden = !message; }
  const imageFor = url => /^https?:/.test(url) ? url : new URL(url, siteUrl).href;

  async function load() {
    try {
      const data = await api('/api/vehicles');
      vehicles = data.vehicles; savedOrder = vehicles.map(car => String(car.id)); siteUrl = data.siteUrl;
      if (!options) {
        options = data.options;
        for (const [name, list] of [['bodyType', options.bodyTypes], ['transmission', options.transmissions], ['fuelType', options.fuelTypes]])
          $(`#add-form [name=${name}]`).innerHTML = '<option value="">Choose…</option>' + list.map(o => `<option>${escapeHtml(o)}</option>`).join('');
      }
      fillSuggestions(); render();
      $('#site-pill').classList.add('on'); $('#site-link').href = siteUrl || $('#site-link').href;
    } catch (error) { $('#summary').textContent = error.message; $('#site-pill').classList.remove('on'); }
  }

  // ---- Grid, prices and ordering ----
  const orderChanged = () => vehicles.some((car, i) => String(car.id) !== savedOrder[i]);
  const km = n => Number(n).toLocaleString('en-ZA').replace(/,/g, ' ') + ' km';
  function render() {
    const query = $('#search').value.trim().toLowerCase();
    const shown = vehicles.filter(car => `${car.make} ${car.model} ${car.variant} ${car.year} ${car.stock_code} ${car.displayName || ''} ${car.colour}`.toLowerCase().includes(query));
    $('#summary').textContent = `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} live on the website` + (query ? ` · ${shown.length} matching · clear the search to drag cards` : '');
    $('#order-bar').hidden = !orderChanged(); $('#nav-stock-count').textContent = vehicles.length || '';
    if (homeData) renderStockHealth();
    $('#list').innerHTML = shown.map(car => {
      const i = vehicles.indexOf(car), photos = photosOf(car), id = escapeHtml(car.id);
      return `<li class="vcard${query ? ' searching' : ''}" data-id="${id}"><img src="${escapeHtml(imageFor(photos[0]))}" alt="" loading="lazy" draggable="false"><label class="pos" title="Position on the website — type a number and press Enter"><span>#</span><input name="position" inputmode="numeric" value="${i + 1}" aria-label="Position of ${escapeHtml(title(car))}" autocomplete="off"></label>${car.descriptionSource === 'admin' ? '<span class="badge">New</span>' : ''}${photos.length > 1 ? `<span class="photo-count">${photos.length} photos</span>` : ''}<div class="card-body"><h3 title="${escapeHtml(car.year + ' ' + title(car))}">${car.year} ${escapeHtml(title(car))}</h3><p class="meta" title="${escapeHtml(car.variant)}">${escapeHtml(car.variant)}</p><p class="meta">${km(car.mile)} · ${escapeHtml(car.stock_code)}</p><form class="price-form" data-price="${id}"><span class="currency">R</span><input name="price" inputmode="numeric" value="${car.value}" aria-label="Price of ${escapeHtml(title(car))} in rand" autocomplete="off"><button class="button small" type="submit" hidden>Save</button></form><span class="saved" role="status"></span></div><div class="card-actions"><button type="button" class="edit" data-edit="${id}">Edit</button><button type="button" class="remove" data-remove="${id}" aria-label="Remove ${escapeHtml(title(car))}">Remove</button></div></li>`;
    }).join('') || `<li class="empty">${vehicles.length ? 'No vehicles match your search.' : 'No vehicles are listed yet. Add your first one.'}</li>`;
  }
  function move(id, to) {
    const from = vehicles.findIndex(car => String(car.id) === String(id));
    to = Math.max(0, Math.min(vehicles.length - 1, to));
    if (from < 0 || to === from) return;
    const [car] = vehicles.splice(from, 1); vehicles.splice(to, 0, car); render();
  }
  // Typing a position number moves the card there.
  $('#list').addEventListener('change', event => {
    if (event.target.name !== 'position') return;
    const id = event.target.closest('.vcard').dataset.id, n = parseInt(event.target.value, 10);
    if (Number.isFinite(n)) move(id, n - 1); else render();
    document.querySelector(`.vcard[data-id="${CSS.escape(id)}"] [name=position]`)?.focus();
  });
  $('#list').addEventListener('keydown', event => {
    if (event.target.name === 'position' && event.key === 'Enter') { event.preventDefault(); event.target.dispatchEvent(new Event('change', {bubbles: true})); }
  });

  // Drag any card. The card moves live as you drag; the drop is saved with "Save order".
  let drag = null;
  const cardAt = (x, y) => document.elementFromPoint(x, y)?.closest('.vcard:not(.ghost)');
  $('#list').addEventListener('pointerdown', event => {
    const card = event.target.closest('.vcard');
    if (!card || event.button !== 0 || $('#search').value.trim() || event.target.closest('input,button,select,textarea,label,form')) return;
    drag = {card, id: card.dataset.id, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false, pointerId: event.pointerId};
  });
  function startDrag() {
    const rect = drag.card.getBoundingClientRect();
    drag.active = true; drag.offsetX = drag.startX - rect.left; drag.offsetY = drag.startY - rect.top;
    drag.ghost = drag.card.cloneNode(true); drag.ghost.classList.add('ghost'); drag.ghost.style.width = rect.width + 'px';
    document.body.append(drag.ghost); drag.card.classList.add('dragging');
    try { drag.card.setPointerCapture(drag.pointerId); } catch {}
    requestAnimationFrame(dragFrame);
  }
  function dragFrame() {
    if (!drag?.active) return;
    drag.ghost.style.left = (drag.x - drag.offsetX) + 'px'; drag.ghost.style.top = (drag.y - drag.offsetY) + 'px';
    const edge = 90, speed = drag.y < edge ? -(edge - drag.y) / 3 : drag.y > innerHeight - edge ? (drag.y - innerHeight + edge) / 3 : 0;
    if (speed) scrollBy(0, speed);
    const target = cardAt(drag.x, drag.y);
    if (target && target !== drag.card) {
      const r = target.getBoundingClientRect(), after = drag.x > r.left + r.width / 2;
      const ref = after ? target.nextSibling : target;
      if (ref !== drag.card && drag.card.nextSibling !== ref) $('#list').insertBefore(drag.card, ref);
    }
    requestAnimationFrame(dragFrame);
  }
  addEventListener('pointermove', event => {
    if (!drag) return;
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.active && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) { event.preventDefault(); startDrag(); }
  });
  function endDrag() {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.active) return;
    d.ghost.remove(); d.card.classList.remove('dragging');
    const byId = new Map(vehicles.map(car => [String(car.id), car]));
    vehicles = [...$('#list').querySelectorAll('.vcard')].map(el => byId.get(el.dataset.id)).filter(Boolean);
    render();
  }
  addEventListener('pointerup', endDrag);
  addEventListener('pointercancel', endDrag);
  // Stop the browser starting its own image drag or text selection.
  $('#list').addEventListener('dragstart', event => event.preventDefault());

  // Card size, remembered on this device.
  const sizeSelect = $('#card-size');
  sizeSelect.value = 'l';
  try { sizeSelect.value = localStorage.getItem('df-card-size-v2') || 'l'; } catch {}
  const applySize = () => { $('#list').className = 'card-grid size-' + sizeSelect.value; };
  sizeSelect.addEventListener('change', () => { applySize(); try { localStorage.setItem('df-card-size-v2', sizeSelect.value); } catch {} });
  applySize();
  $('#order-undo').addEventListener('click', () => {
    const byId = new Map(vehicles.map(car => [String(car.id), car]));
    vehicles = savedOrder.map(id => byId.get(id)).filter(Boolean); render();
  });
  $('#order-save').addEventListener('click', async event => {
    const button = event.currentTarget; button.disabled = true; button.textContent = 'Saving…';
    try {
      const {ids} = await api('/api/vehicles', {method: 'PATCH', body: JSON.stringify({action: 'order', ids: vehicles.map(car => String(car.id))})});
      savedOrder = ids; render(); notify('The new order is saved. The website updates within about a minute.');
    } catch (e) { notify(e.message); }
    finally { button.disabled = false; button.textContent = 'Save order'; }
  });
  window.addEventListener('beforeunload', event => { if (orderChanged()) event.preventDefault(); });

  $('#list').addEventListener('input', event => {
    const form = event.target.closest('.price-form'); if (!form) return;
    const car = vehicles.find(c => String(c.id) === form.dataset.price);
    const changed = form.price.value.replace(/[\s,R]/g, '') !== String(car.value);
    form.price.classList.toggle('changed', changed); form.querySelector('button').hidden = !changed; form.nextElementSibling.textContent = '';
  });
  $('#list').addEventListener('keydown', event => {
    const form = event.target.closest('.price-form');
    if (form && event.key === 'Escape') { const car = vehicles.find(c => String(c.id) === form.dataset.price); form.price.value = car.value; form.price.dispatchEvent(new Event('input', {bubbles: true})); }
  });
  $('#list').addEventListener('submit', async event => {
    const form = event.target.closest('.price-form'); if (!form) return;
    event.preventDefault();
    const car = vehicles.find(c => String(c.id) === form.dataset.price), status = form.nextElementSibling, button = form.querySelector('button');
    if (button.hidden) return;
    button.disabled = true; status.textContent = 'Saving…';
    try {
      const {vehicle} = await api('/api/vehicles', {method: 'PATCH', body: JSON.stringify({action: 'price', id: car.id, price: form.price.value})});
      Object.assign(car, vehicle);
      form.price.value = car.value; form.price.classList.remove('changed'); button.hidden = true;
      status.textContent = '✓ Saved ' + money(car.value);
    } catch (e) { status.textContent = ''; notify(e.message); form.price.focus(); }
    finally { button.disabled = false; }
  });

  // ---- Photo picker shared by the add form and the photos dialog ----
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
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} could not be opened. Please choose a JPG, PNG or WebP.`)); };
      img.src = url;
    });
  }
  function photoPicker(root) {
    let items = [], uploaded = [];
    const status = document.createElement('p'); status.className = 'photo-status'; status.setAttribute('role', 'status');
    const grid = document.createElement('ul'); grid.className = 'photo-grid';
    root.replaceChildren(grid, status);
    function draw() {
      grid.innerHTML = items.map((item, i) => `<li class="${item.url ? '' : 'uploading'}"><img src="${escapeHtml(item.preview)}" alt="Photo ${i + 1}">${i === 0 ? '<span class="tag cover">Main photo</span>' : `<span class="tag">${i + 1}</span>`}<div class="photo-tools"><span><button class="icon" type="button" data-photo-move="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move photo ${i + 1} earlier">←</button> <button class="icon" type="button" data-photo-move="1" data-i="${i}" ${i === items.length - 1 ? 'disabled' : ''} aria-label="Move photo ${i + 1} later">→</button></span><button class="icon" type="button" data-photo-remove="${i}" aria-label="Remove photo ${i + 1}">×</button></div></li>`).join('')
        + `<li class="photo-add"><input type="file" accept="image/jpeg,image/png,image/webp" multiple aria-label="Add photos"><span>+ Add photos<br><small>Select several at once</small></span></li>`;
    }
    grid.addEventListener('click', event => {
      const m = event.target.closest('[data-photo-move]'), r = event.target.closest('[data-photo-remove]');
      if (m) { const i = Number(m.dataset.i), j = i + Number(m.dataset.photoMove); [items[i], items[j]] = [items[j], items[i]]; draw(); }
      if (r) { items.splice(Number(r.dataset.photoRemove), 1); draw(); }
    });
    grid.addEventListener('change', event => addFiles([...event.target.files]));
    // Photos can also be dragged straight from the computer onto the photo area.
    root.addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); root.classList.add('drop-hover'); } });
    root.addEventListener('dragleave', event => { if (!root.contains(event.relatedTarget)) root.classList.remove('drop-hover'); });
    root.addEventListener('drop', event => { event.preventDefault(); root.classList.remove('drop-hover'); addFiles([...event.dataTransfer.files].filter(f => /^image\//.test(f.type))); });
    async function addFiles(files) {
      if (!files.length) return;
      const errors = []; let done = 0;
      const queue = files.map(file => { const item = {preview: '', url: ''}; items.push(item); return {file, item}; });
      status.textContent = `Uploading 0 of ${files.length}…`;
      // Three uploads at a time keeps a batch quick without overloading a phone connection.
      const worker = async () => {
        for (let job; (job = queue.shift());) {
          try {
            job.item.preview = await resize(job.file); draw();
            const {url} = await api('/api/photos', {method: 'POST', body: JSON.stringify({photo: job.item.preview})});
            job.item.url = url; uploaded.push(url);
          } catch (e) { errors.push(e.message); items = items.filter(i => i !== job.item); }
          status.textContent = `Uploading ${++done} of ${files.length}…`; draw();
        }
      };
      draw();
      await Promise.all([worker(), worker(), worker()]);
      status.textContent = errors.length ? errors.join(' ') : `${files.length} photo${files.length === 1 ? '' : 's'} added.`;
    }
    return {
      set(urls) { items = urls.map(url => ({url, preview: imageFor(url)})); uploaded = []; status.textContent = ''; draw(); },
      urls: () => items.map(item => item.url),
      busy: () => items.some(item => !item.url),
      // Uploads that never got saved to a vehicle are deleted again.
      discard() { const unused = uploaded.filter(url => !items.some(i => i.url === url)); return this.cleanup(unused); },
      cleanupAll() { return this.cleanup(uploaded); },
      cleanup(urls) { for (const url of urls) api('/api/photos?url=' + encodeURIComponent(url), {method: 'DELETE'}).catch(() => {}); uploaded = uploaded.filter(u => !urls.includes(u)); }
    };
  }

  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button'), error = form.querySelector('.error');
    button.disabled = true; error.textContent = '';
    try { const data = await api('/api/session', {method: 'POST', body: JSON.stringify({email: form.email.value, password: form.password.value})}); form.reset(); showApp(data.user); }
    catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  });
  $('#sign-out').addEventListener('click', async () => { await api('/api/session', {method: 'DELETE'}).catch(() => {}); vehicles = []; $('#list').innerHTML = ''; showLogin(); });
  $('#search').addEventListener('input', render);

  // ---- Suggestions for make, model and colour ----
  const knownMakes = ['ALFA ROMEO','ASTON MARTIN','AUDI','BENTLEY','BMW','CHERY','CHEVROLET','CITROEN','FERRARI','FIAT','FORD','GWM','HAVAL','HONDA','HYUNDAI','ISUZU','JAGUAR','JEEP','KIA','LAMBORGHINI','LAND ROVER','LEXUS','MAHINDRA','MASERATI','MAZDA','MCLAREN','MERCEDES-BENZ','MINI','MITSUBISHI','NISSAN','OPEL','PEUGEOT','PORSCHE','RENAULT','ROLLS-ROYCE','SUBARU','SUZUKI','TOYOTA','VOLKSWAGEN','VOLVO'];
  function fillSuggestions() {
    const uniq = list => [...new Set(list.filter(Boolean))].sort();
    $('#make-options').innerHTML = uniq([...knownMakes, ...vehicles.map(c => c.make)]).map(v => `<option value="${escapeHtml(v)}">`).join('');
    $('#model-options').innerHTML = uniq(vehicles.map(c => c.model)).map(v => `<option value="${escapeHtml(v)}">`).join('');
    $('#colour-options').innerHTML = uniq(vehicles.map(c => c.colour)).map(v => `<option value="${escapeHtml(v)}">`).join('');
  }
  // ---- Add and edit a vehicle (one form) ----
  const addDialog = $('#add-dialog'), addForm = $('#add-form'), addPhotos = photoPicker($('#add-photos'));
  const fieldNames = ['make', 'model', 'variant', 'year', 'price', 'mileage', 'colour', 'stockCode', 'bodyType', 'transmission', 'fuelType', 'displayName', 'description', 'features'];
  let added = false, mode = 'add', editTarget = null;
  function setField(name, value, mark) {
    const field = addForm.elements[name]; if (!field || value == null || value === '') return false;
    if (field.tagName === 'SELECT') {
      const option = [...field.options].find(o => o.value && o.value.toLowerCase() === String(value).toLowerCase());
      if (!option) return false; field.value = option.value;
    } else field.value = value;
    if (mark) field.classList.add('filled');
    return true;
  }
  const valuesOf = car => ({make: car.make, model: car.model, variant: car.variant, year: car.year, price: car.value, mileage: car.mile, colour: car.colour, stockCode: car.stock_code, bodyType: car.body_type, transmission: car.transmission, fuelType: car.fuelType, displayName: car.displayName || '', description: (car.description || []).join('\n\n'), features: (car.features || []).join('\n')});
  function openForm(nextMode, car) {
    mode = nextMode; editTarget = nextMode === 'edit' ? car : null; added = false;
    addForm.reset(); addForm.querySelectorAll('.filled').forEach(f => f.classList.remove('filled'));
    addForm.querySelector('.error').textContent = '';
    addPhotos.set([]);
    if (car) {
      const values = valuesOf(car);
      for (const name of fieldNames) setField(name, values[name], false);
      addPhotos.set(photosOf(car));
    }
    $('#add-title').textContent = nextMode === 'edit' ? `Edit ${car.year} ${title(car)}` : 'Add a vehicle';
    $('#add-again').hidden = nextMode === 'edit';
    $('#add-submit').textContent = nextMode === 'edit' ? 'Save changes' : 'Publish to website';
    addDialog.showModal();
    (nextMode === 'edit' ? addForm.price : addForm.make).focus();
  }
  $('#add-open').addEventListener('click', () => openForm('add'));
  addDialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => addDialog.close()));
  addDialog.addEventListener('close', () => { if (!added) addPhotos.cleanupAll(); });
  addForm.addEventListener('input', event => event.target.classList?.remove('filled'));
  addForm.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('#add-submit').click(); } });
  addForm.addEventListener('submit', async event => {
    event.preventDefault();
    const again = event.submitter?.value === 'again';
    const button = event.submitter || $('#add-submit'), label = button.textContent, error = addForm.querySelector('.error');
    error.textContent = '';
    if (addPhotos.busy()) { error.textContent = 'Please wait for the photos to finish uploading.'; return; }
    if (!addPhotos.urls().length) { error.textContent = 'Please add at least one photo of the vehicle (drag them onto the photo area).'; return; }
    const missing = [...addForm.querySelectorAll('[required]')].find(field => !field.value.trim());
    if (missing) { error.textContent = `Please fill in ${missing.closest('label').firstChild.textContent.trim().toLowerCase()}.`; missing.focus(); return; }
    const vehicle = Object.fromEntries(fieldNames.map(name => [name, addForm.elements[name].value]));
    button.disabled = true; button.textContent = mode === 'edit' ? 'Saving…' : 'Publishing…';
    try {
      if (mode === 'edit') {
        let {vehicle: car} = await api('/api/vehicles', {method: 'PATCH', body: JSON.stringify({action: 'details', id: editTarget.id, vehicle})});
        const photos = addPhotos.urls();
        if (JSON.stringify(photos) !== JSON.stringify(photosOf(car))) ({vehicle: car} = await api('/api/vehicles', {method: 'PATCH', body: JSON.stringify({action: 'photos', id: editTarget.id, photos})}));
        Object.assign(editTarget, car); added = true; addPhotos.discard(); fillSuggestions(); render(); addDialog.close();
        notify(`Saved changes to ${car.year} ${title(car)}. The website updates within about a minute.`);
        return;
      }
      const {vehicle: car} = await api('/api/vehicles', {method: 'POST', body: JSON.stringify({vehicle, photos: addPhotos.urls()})});
      added = true; addPhotos.discard();
      vehicles.unshift(car); savedOrder.unshift(String(car.id)); fillSuggestions(); render();
      notify(`${car.year} ${title(car)} is now listed at position 1. It appears on the website within about a minute.`);
      if (again) openForm('add'); else addDialog.close();
    } catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; button.textContent = label; }
  });
  $('#list').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) openForm('edit', vehicles.find(car => String(car.id) === edit.dataset.edit));
  });
  // Keyboard shortcuts: N adds a vehicle, / jumps to search.
  addEventListener('keydown', event => {
    if (!me || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (event.key === 'n' || event.key === 'N') { event.preventDefault(); openForm('add'); }
    if (event.key === '/') { event.preventDefault(); $('#search').focus(); }
  });

  // ---- Remove a vehicle ----
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
      vehicles = vehicles.filter(car => car !== removing); savedOrder = savedOrder.filter(id => id !== String(removing.id)); render(); removeDialog.close();
      notify(`${removing.year} ${title(removing)} has been taken off. The website updates within about a minute.`);
    } catch (e) { removeDialog.querySelector('.error').textContent = e.message; }
    finally { button.disabled = false; }
  });

  const accountDialog = $('#account-dialog'), passwordForm = $('#password-form');
  accountDialog.querySelector('[data-close]').addEventListener('click', () => accountDialog.close());
  $('#account-open').addEventListener('click', () => {
    passwordForm.reset(); passwordForm.querySelector('.error').textContent = '';
    passwordForm.username.value = me.email; $('#team').hidden = !me.owner;
    accountDialog.showModal();
  });
  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = passwordForm.querySelector('button'), error = passwordForm.querySelector('.error');
    button.disabled = true; error.textContent = '';
    try { await api('/api/account', {method: 'PATCH', body: JSON.stringify({currentPassword: passwordForm.currentPassword.value, newPassword: passwordForm.newPassword.value})}); passwordForm.reset(); accountDialog.close(); notify('Your password has been updated.'); }
    catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  });

  // ---- Forgotten passwords, handled by Supabase reset emails ----
  function showForm(id) { ['#login-form', '#recover-form', '#reset-form'].forEach(f => { $(f).hidden = f !== id; }); $(id).querySelector('input:not([hidden])').focus(); }
  $('#forgot-open').addEventListener('click', () => { $('#recover-form').email.value = $('#login-form').email.value; showForm('#recover-form'); });
  $('#recover-form [data-back]').addEventListener('click', () => showForm('#login-form'));
  $('#recover-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('[type=submit]'), error = form.querySelector('.error');
    button.disabled = true; error.textContent = '';
    try { await api('/api/session', {method: 'POST', body: JSON.stringify({action: 'recover', email: form.email.value})}); error.textContent = ''; form.querySelector('.muted').textContent = 'If that email has a login, a reset link is on its way. Check your inbox (and spam folder).'; }
    catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  });
  // Supabase reset links return here with the one-time token in the address fragment.
  const recovery = new URLSearchParams(location.hash.slice(1));
  const resetToken = recovery.get('type') === 'recovery' ? recovery.get('access_token') : null;
  if (location.hash) history.replaceState(null, '', location.pathname);
  $('#reset-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button'), error = form.querySelector('.error');
    button.disabled = true; error.textContent = '';
    try { await api('/api/session', {method: 'POST', body: JSON.stringify({action: 'reset', accessToken: resetToken, password: form.password.value})}); form.reset(); showForm('#login-form'); $('#login-form .error').textContent = ''; $('#login-form .muted').textContent = 'Your password has been changed. Sign in with the new password.'; }
    catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  });

  // ---- Layout: sidebar sections, theme and mobile menu ----
  const titles = {home: 'Home', stock: 'Stock', analytics: 'Analytics'};
  let view = 'home', analyticsLoaded = false, homeLoaded = false, homeData = null;
  function go(name) {
    view = titles[name] ? name : 'home';
    document.querySelectorAll('.tab').forEach(t => { const on = t.dataset.tab === view; t.classList.toggle('active', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    for (const key of Object.keys(titles)) $(`#${key}-view`).hidden = key !== view;
    $('#page-title').textContent = titles[view]; closeMenu();
    try { localStorage.setItem('df-view', view); } catch {}
    if (view === 'analytics' && !analyticsLoaded) loadAnalytics();
    if (view === 'home') { if (!homeLoaded) loadHome(); else renderHome(); }
    if (view === 'analytics' && lastAnalytics) requestAnimationFrame(() => renderCharts(lastAnalytics));
  }
  document.querySelectorAll('.tab, [data-goto]').forEach(b => b.addEventListener('click', () => go(b.dataset.tab || b.dataset.goto)));
  const closeMenu = () => { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; };
  $('#menu-open').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; });
  $('#scrim').addEventListener('click', closeMenu);
  const themeToggle = $('#theme-toggle');
  const applyTheme = dark => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; themeToggle.checked = dark; };
  try { applyTheme(localStorage.getItem('df-theme') !== 'light'); } catch { applyTheme(true); }
  themeToggle.addEventListener('change', () => {
    applyTheme(themeToggle.checked); try { localStorage.setItem('df-theme', themeToggle.checked ? 'dark' : 'light'); } catch {}
    redrawCharts();
  });

  // ---- Shared helpers for the overview and analytics ----
  const fmt = n => Number(n || 0).toLocaleString('en-ZA').replace(/,/g, ' ');
  const short = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.0', '') + 'm' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n >= 1e3 ? (n / 1e3).toFixed(1).replace('.0', '') + 'k' : fmt(n);
  const pctOf = (a, b) => b ? Math.round(a / b * 100) : 0;
  const dayOf = value => new Date(String(value).slice(0, 10) + 'T12:00:00');
  const dateLabel = (value, opts) => dayOf(value).toLocaleDateString('en-ZA', opts);
  const countryName = code => { try { return code && code !== '??' ? new Intl.DisplayNames(['en'], {type: 'region'}).of(code) : 'Unknown'; } catch { return code; } };
  const sourceName = s => ({direct: 'Direct / typed in', google: 'Google', facebook: 'Facebook', instagram: 'Instagram', bing: 'Bing', 'chatgpt.com': 'ChatGPT'}[s] || s);
  const pageName = p => ({'/': 'Home / showroom', '/index.html': 'Home / showroom', '/vehicle.html': 'Vehicle pages', '/finance.html': 'Finance application', '/visit.html': 'Visit us', '/contact.html': 'Contact', '/privacy.html': 'Privacy policy', '/terms.html': 'Terms of use'}[p] || p);
  const carById = id => vehicles.find(car => String(car.id) === String(id));
  const carName = (id, fallback) => { const car = carById(id); return car ? `${car.year} ${title(car)}` : (fallback || `Vehicle ${id}`).replace(/ · [^·]*$/, '') + ' (sold / removed)'; };
  // Widths are set from script because the dashboard's security policy blocks inline style attributes.
  const applyWidths = root => root.querySelectorAll('[data-width]').forEach(el => { el.style.width = el.dataset.width + '%'; });
  function trend(now, before, suffix = '') {
    if (!before) return now ? `<span class="trend up">▲ new</span>${suffix}` : `<span class="trend">–</span>${suffix}`;
    const pct = Math.round((now - before) / before * 100);
    return `<span class="trend ${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}">${pct > 0 ? '▲' : pct < 0 ? '▼' : ''} ${Math.abs(pct)}%</span>${suffix}`;
  }
  function barList(el, rows, label, value, tone = '') {
    const max = Math.max(1, ...rows.map(value));
    el.innerHTML = rows.length ? rows.map(r => `<li><span class="name" title="${escapeHtml(label(r))}">${escapeHtml(label(r))}</span><span class="track"><span class="fill ${tone}" data-width="${Math.max(3, value(r) / max * 100)}"></span></span><span class="num">${fmt(value(r))}</span></li>`).join('') : '<li class="empty-note">No data yet.</li>';
    applyWidths(el);
  }
  function tooltip(el, svg, w, h) {
    const tip = el.querySelector('.chart-tip'), cursor = svg.querySelector('.cursor');
    svg.addEventListener('pointermove', event => {
      const hit = event.target.closest('.hit'); if (!hit) { tip.hidden = true; cursor?.classList.remove('on'); return; }
      const sx = svg.clientWidth / w, sy = svg.clientHeight / h;
      tip.innerHTML = hit.dataset.tip; tip.hidden = false;
      tip.style.left = Math.min(Math.max(hit.dataset.x * sx, 70), svg.clientWidth - 70) + 'px'; tip.style.top = hit.dataset.y * sy + 'px';
      if (cursor) { cursor.setAttribute('x1', hit.dataset.x); cursor.setAttribute('x2', hit.dataset.x); cursor.classList.add('on'); }
    });
    svg.addEventListener('pointerleave', () => { tip.hidden = true; cursor?.classList.remove('on'); });
  }
  const niceTop = max => { const step = Math.pow(10, Math.floor(Math.log10(Math.max(1, max)))); return Math.max(4, Math.ceil(max / step) * step); };

  // Line chart of this period against the one before, drawn at the panel's real width so text is never stretched.
  function lineChart(el, rows) {
    const w = Math.max(280, el.clientWidth || 640), h = el.clientHeight || 240, pad = {l: 34, r: 12, t: 14, b: 26};
    if (!rows.length || rows.every(d => !d.visitors && !d.prev_visitors)) { el.innerHTML = '<p class="empty-note">No visits recorded yet. Figures appear here as people use the website.</p>'; return; }
    const top = niceTop(Math.max(...rows.map(d => Math.max(d.visitors, d.prev_visitors || 0))));
    const n = rows.length, x = i => pad.l + (n === 1 ? (w - pad.l - pad.r) / 2 : i * (w - pad.l - pad.r) / (n - 1)), y = v => pad.t + (h - pad.t - pad.b) * (1 - v / top);
    const line = key => rows.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[key] || 0).toFixed(1)}`).join(' ');
    const ticks = [0, top / 2, top].map(v => `<line class="gridline" x1="${pad.l}" x2="${w - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('');
    const every = Math.ceil(n / Math.max(2, Math.floor(w / 80)));
    const labels = rows.map((d, i) => (i % every === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < every / 2) ? `<text class="axis" x="${x(i)}" y="${h - 6}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${escapeHtml(n <= 8 ? dateLabel(d.day, {weekday: 'short'}) : dateLabel(d.day, {day: 'numeric', month: 'short'}))}</text>` : '').join('');
    const slot = (w - pad.l - pad.r) / Math.max(1, n - 1);
    const hits = rows.map((d, i) => `<rect class="hit" x="${x(i) - slot / 2}" y="${pad.t}" width="${slot}" height="${h - pad.t - pad.b}" data-x="${x(i)}" data-y="${y(d.visitors)}" data-tip="<strong>${escapeHtml(dateLabel(d.day, {weekday: 'short', day: 'numeric', month: 'short'}))}</strong><br>${fmt(d.visitors)} visitor${d.visitors === 1 ? '' : 's'} · ${fmt(d.pageviews)} page views${d.enquiries ? ' · ' + fmt(d.enquiries) + ' enquiries' : ''}<br><span>Period before: ${fmt(d.prev_visitors)}</span>"/>`).join('');
    const dots = rows.map((d, i) => d.visitors ? `<circle class="dot" cx="${x(i)}" cy="${y(d.visitors)}" r="${n > 40 ? 0 : 3}"/>` : '').join('');
    const gid = 'g' + el.id;
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Visitors per day"><defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="stop-a"/><stop offset="1" class="stop-b"/></linearGradient></defs>${ticks}<path class="area" fill="url(#${gid})" d="${line('visitors')} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z"/><path class="prev" d="${line('prev_visitors')}"/><path class="line" d="${line('visitors')}"/>${dots}<line class="cursor" x1="0" x2="0" y1="${pad.t}" y2="${h - pad.b}"/>${labels}${hits}</svg><div class="chart-tip" hidden></div>`;
    tooltip(el, el.querySelector('svg'), w, h);
  }
  // Small column chart: hourly visitors for the hero tile, busiest hours and weekdays.
  function miniBars(el, values, labels, tips, every = 1) {
    const max = Math.max(1, ...values);
    el.innerHTML = `<div class="cols">${values.map((v, i) => `<span class="col${v === max && v ? ' peak' : ''}" title="${escapeHtml(tips[i])}"><span class="colbar" data-height="${Math.max(v ? 6 : 2, v / max * 100)}"></span>${labels ? `<small>${i % every === 0 ? escapeHtml(labels[i]) : ''}</small>` : ''}</span>`).join('')}</div>`;
    el.querySelectorAll('[data-height]').forEach(b => { b.style.height = b.dataset.height + '%'; });
  }

  // ---- Home overview ----
  async function loadHome() {
    homeLoaded = true; $('#home-error').textContent = '';
    try {
      const [month, week] = await Promise.all([api('/api/analytics?days=35'), api('/api/analytics?days=7')]);
      homeData = {...month, vehiclesWeek: week.vehicles || []}; setLive(homeData.live); renderHome();
    }
    catch (e) { homeLoaded = false; $('#home-error').textContent = e.message; }
  }
  function setLive(n) { $('#live-count').textContent = fmt(n); $('#live-pill').classList.toggle('on', n > 0); }
  function renderHome() {
    if (!homeData || view !== 'home') return;
    const a = homeData, t = a.today || {}, now = new Date(String(a.now).slice(0, 19));
    const daily = a.daily || [], last7 = daily.slice(-7), prev7 = daily.slice(-14, -7);
    const sum = (rows, key) => rows.reduce((s, d) => s + (d[key] || 0), 0);
    const live = vehicles.length, stockValue = vehicles.reduce((s, c) => s + (Number(c.value) || 0), 0);
    const hour = now.getHours();
    const tile = (cls, icon, label, value, sub, extra = '') => `<div class="hero-cell"><div class="hero-label"><span class="panel-icon ${cls}">${icon}</span><span>${label}</span></div><div class="hero-row"><p class="hero-value ${cls}-text">${value}</p><p class="hero-sub">${sub}</p>${extra}</div></div>`;
    const svg = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
    $('#hero').innerHTML = `<div class="hero-today"><strong>Today</strong><span>${escapeHtml(now.toLocaleDateString('en-ZA', {weekday: 'short', day: 'numeric', month: 'short'}))}</span></div>`
      + tile('red', svg('<path d="M4 20V10m6 10V4m6 16v-7"/>'), 'Visitors today', fmt(t.visitors), `${trend(t.visitors, t.y_visitors, ' vs this time yesterday')} · ${fmt(t.pageviews)} page views`, '<div class="spark" id="hero-spark"></div>')
      + tile('amber', svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'), 'Vehicle views today', fmt(t.vehicle_views), trend(t.vehicle_views, t.y_vehicle_views, ' vs this time yesterday'))
      + tile('blue', svg('<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12z"/>'), 'Enquiries today', fmt(t.enquiries), 'WhatsApp, email, calls and finance')
      + tile('teal', svg('<path d="M5 17h14M6.5 17l1.6-5.2A2 2 0 0 1 10 10.4h4a2 2 0 0 1 1.9 1.4L17.5 17"/><circle cx="8" cy="17.5" r="1.8"/><circle cx="16" cy="17.5" r="1.8"/>'), 'Live vehicles', fmt(live), `${money(stockValue)} in stock`)
      + tile('violet', svg('<circle cx="12" cy="12" r="3"/><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/>'), 'Browsing now', fmt(a.live), 'on the website in the last 5 minutes');
    miniBars($('#hero-spark'), (t.hourly || []).slice(0, hour + 1), null, (t.hourly || []).slice(0, hour + 1).map((v, i) => `${String(i).padStart(2, '0')}:00 · ${v} visitor${v === 1 ? '' : 's'}`));

    // Forecast: each weekday's usual visitors; today adds the share of the day that is usually still to come.
    const fc = a.forecast || [], usual = new Map(fc.map(f => [dayOf(f.day).getDay(), f.visitors]));
    const hours = a.hours || [], dayShare = hours.reduce((s, v) => s + v, 0) ? hours.slice(0, hour + 1).reduce((s, v) => s + v, 0) / hours.reduce((s, v) => s + v, 0) : Math.min(1, (hour + 1) / 24);
    const todayForecast = Math.max(t.visitors, Math.round(t.visitors + (usual.get(now.getDay()) || 0) * (1 - dayShare)));
    const forecastFor = date => dayOf(date).toDateString() === now.toDateString() ? todayForecast : (usual.get(dayOf(date).getDay()) || 0);
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const actual = new Map(daily.map(d => [String(d.day).slice(0, 10), d.visitors]));
    const range = (from, to) => { const out = []; for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) out.push(iso(d)); return out; };
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1), monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const todayIso = iso(now);
    const period = days => { let taken = 0, expected = 0; for (const d of days) { const got = actual.get(d) || 0; if (d < todayIso) { taken += got; expected += got; } else if (d === todayIso) { taken += got; expected += todayForecast; } else expected += forecastFor(d); } return {taken, expected}; };
    const cells = [
      ['Today', `usually ${Math.round(dayShare * 100)}% in by now`, period([todayIso])],
      ['This week', `${Math.round((weekEnd - now) / 864e5)} days left`, period(range(weekStart, weekEnd))],
      [now.toLocaleDateString('en-ZA', {month: 'long'}), `${monthEnd.getDate() - now.getDate()} days left`, period(range(monthStart, monthEnd))]];
    const next = fc.map(f => ({day: f.day, forecast: forecastFor(f.day), taken: f.actual ?? null}));
    const top = Math.max(1, ...next.map(r => Math.max(r.forecast, r.taken || 0)));
    $('#forecast').innerHTML = cells.map(([label, hint, p]) => `<div class="fc-cell"><p class="fc-label"><strong>${escapeHtml(label)}</strong> ${escapeHtml(hint)}</p><p class="fc-value">${fmt(p.expected)}</p><span class="progress"><span data-width="${Math.min(100, pctOf(p.taken, p.expected))}"></span></span><p class="fc-sub"><strong>${fmt(p.taken)}</strong> so far · ${pctOf(p.taken, p.expected)}% of forecast</p><p class="fc-hint">expected visitors</p></div>`).join('')
      + `<div class="fc-week"><div class="fc-week-head"><span>Next 7 days</span><span class="legend"><span><i class="key red"></i>So far</span><span><i class="key dim"></i>Forecast</span></span></div><div class="fc-bars">${next.map((r, i) => `<div class="fc-day${i === 0 ? ' today' : ''}"><small>${short(r.forecast)}</small><span class="fc-track"><span class="fc-bar" data-height="${r.forecast / top * 100}"></span>${r.taken !== null ? `<span class="fc-taken" data-height="${r.taken / top * 100}"></span>` : ''}</span><strong>${i === 0 ? 'Today' : escapeHtml(dateLabel(r.day, {weekday: 'short'}))}</strong><span>${dayOf(r.day).getDate()}</span></div>`).join('')}</div></div>`;
    applyWidths($('#forecast')); $('#forecast').querySelectorAll('[data-height]').forEach(b => { b.style.height = Math.max(2, b.dataset.height) + '%'; });
    $('#forecast-note').textContent = (a.weeks_of_data || 0) < 3
      ? `The forecast learns from your traffic. It has ${a.weeks_of_data || 0} week${a.weeks_of_data === 1 ? '' : 's'} of history so far and gets sharper over the next few weeks. Each day is projected from the same weekday over the last eight weeks.`
      : 'Each day is projected from the same weekday over the last eight weeks, recent weeks counting more. Today adds what usually comes in after this time of day.';

    // Activity: last 7 days against the 7 before.
    const rows = last7.map((d, i) => ({...d, prev_visitors: prev7[i]?.visitors || 0}));
    $('#activity-total').textContent = fmt(sum(last7, 'visitors'));
    $('#activity-sub').innerHTML = `visitors in the last 7 days · ${trend(sum(last7, 'visitors'), sum(prev7, 'visitors'), ' vs the 7 days before')}`;
    lineChart($('#home-chart'), rows);

    // Vehicle interest, matched to the current stock list.
    const views = sum(last7, 'vehicle_views'), enquiries = sum(last7, 'enquiries');
    const week = homeData.vehiclesWeek || [];
    $('#interest-views').textContent = fmt(views); $('#interest-enquiries').textContent = fmt(enquiries);
    $('#interest-browsers').textContent = fmt(sum(last7, 'visitors')); $('#interest-rate').textContent = pctOf(enquiries, sum(last7, 'visitors')) + '%';
    const bar = $('#interest-bar'), share = views + enquiries ? views / (views + enquiries) * 100 : 100;
    bar.querySelector('.a').style.width = share + '%'; bar.querySelector('.b').style.width = (100 - share) + '%';
    barList($('#home-vehicles'), week.slice(0, 6), r => carName(r.id, r.label), r => r.views + r.clicks, 'teal');
    renderStockHealth();
  }
  function renderStockHealth() {
    if (!$('#stock-stats') || view !== 'home') return;
    const values = vehicles.map(c => Number(c.value) || 0).filter(Boolean), miles = vehicles.map(c => Number(c.mile) || 0);
    const nowSec = Date.now() / 1000, ages = vehicles.map(c => c.dateString ? (nowSec - c.dateString) / 86400 : null).filter(v => v !== null && v >= 0);
    const avg = list => list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0;
    const stat = (label, value) => `<div class="stat"><p>${label}</p><strong>${value}</strong></div>`;
    $('#stock-stats').innerHTML = stat('Vehicles live', fmt(vehicles.length)) + stat('Stock value', money(values.reduce((s, v) => s + v, 0))) + stat('Average price', values.length ? money(avg(values)) : '–')
      + stat('Average mileage', miles.length ? km(Math.round(avg(miles) / 100) * 100) : '–') + stat('Average days listed', ages.length ? fmt(Math.round(avg(ages))) : '–') + stat('Photos per vehicle', vehicles.length ? avg(vehicles.map(c => photosOf(c).length)).toFixed(1) : '–');
    const bands = [[0, 200000, 'Under R200k'], [200000, 400000, 'R200k – R400k'], [400000, 700000, 'R400k – R700k'], [700000, 1000000, 'R700k – R1m'], [1000000, Infinity, 'Over R1m']]
      .map(([lo, hi, name]) => ({name, n: values.filter(v => v >= lo && v < hi).length})).filter(b => b.n);
    barList($('#price-bands'), bands, r => r.name, r => r.n, 'amber');
    // Listings with little interest, few photos or a long time on the site.
    const seen = new Map((homeData?.vehiclesWeek || []).map(r => [String(r.id), r]));
    const items = [], counts = {views: 0, photos: 0, old: 0, noEnquiry: 0};
    for (const car of vehicles) {
      const r = seen.get(String(car.id)), photos = photosOf(car).length, days = car.dateString ? Math.floor((nowSec - car.dateString) / 86400) : null;
      if (homeData && !r) { counts.views++; items.push({car, level: 3, text: 'No views in the last 7 days. Try a better cover photo or check the price.'}); }
      if (r && r.views >= 5 && !r.enquiries) { counts.noEnquiry++; items.push({car, level: 2, text: `${r.views} views but no enquiries. The price or details may be holding people back.`}); }
      if (days !== null && days > 90) { counts.old++; items.push({car, level: 2, text: `Listed ${days} days ago. Worth a price review.`}); }
      if (photos < 3) { counts.photos++; items.push({car, level: 1, text: `Only ${photos} photo${photos === 1 ? '' : 's'}. Listings with 6+ photos get more enquiries.`}); }
    }
    items.sort((a, b) => b.level - a.level);
    $('#attention-chips').innerHTML = [[counts.views, 'with no views this week', 2], [counts.noEnquiry, 'viewed but no enquiries', 1], [counts.old, 'listed over 90 days', 1], [counts.photos, 'with fewer than 3 photos', 1]]
      .filter(([n]) => n).map(([n, label, level]) => `<span class="chip lvl${level}"><strong>${n}</strong>${label}</span>`).join('');
    $('#attention').innerHTML = items.length ? items.slice(0, 6).map(i => `<li class="lvl${Math.min(2, i.level)}"><img src="${escapeHtml(imageFor(photosOf(i.car)[0] || ''))}" alt="" loading="lazy"><div><strong>${escapeHtml(i.car.year + ' ' + title(i.car))}</strong><span>${escapeHtml(i.text)}</span></div><button type="button" class="button ghost small" data-edit-car="${escapeHtml(i.car.id)}">Edit</button></li>`).join('') + (items.length > 6 ? `<li class="more">and ${items.length - 6} more suggestions</li>` : '')
      : '<li class="all-good">Everything looks healthy. Every vehicle has photos and is getting views.</li>';
  }
  $('#attention').addEventListener('click', event => { const b = event.target.closest('[data-edit-car]'); if (b) openForm('edit', carById(b.dataset.editCar)); });

  // ---- Full analytics ----
  let lastAnalytics = null, resizeTimer = null;
  const redrawCharts = () => { if (view === 'analytics' && lastAnalytics) renderCharts(lastAnalytics); if (view === 'home' && homeData) renderHome(); };
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(redrawCharts, 150); });
  $('#analytics-days').addEventListener('change', loadAnalytics);
  $('#analytics-refresh').addEventListener('click', loadAnalytics);
  function renderCharts(a) {
    lineChart($('#daily-chart'), a.daily || []);
    const hours = a.hours || [], days = a.weekdays || [], names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    miniBars($('#hours-chart'), hours, hours.map((_, i) => String(i).padStart(2, '0')), hours.map((v, i) => `${String(i).padStart(2, '0')}:00–${String(i + 1).padStart(2, '0')}:00 · ${v} visits`), innerWidth < 600 ? 6 : 3);
    miniBars($('#weekday-chart'), days, names, days.map((v, i) => `${names[i]} · ${v} visits`));
  }
  async function loadAnalytics() {
    analyticsLoaded = true; $('#analytics-error').textContent = '';
    const days = $('#analytics-days').value, range = $('#analytics-days').selectedOptions[0].textContent.toLowerCase().replace('last ', '');
    try {
      const a = await api('/api/analytics?days=' + days); lastAnalytics = a; setLive(a.live);
      const t = a.totals, p = a.previous, spark = key => (a.daily || []).map(d => d[key] || 0);
      $('#kpis').innerHTML = [['red', 'Visitors', t.visitors, p.visitors, 'visitors'], ['blue', 'Page views', t.pageviews, p.pageviews, 'pageviews'], ['amber', 'Vehicle page views', t.vehicle_views, p.vehicle_views, 'vehicle_views'], ['teal', 'Enquiry clicks', t.enquiries, p.enquiries, 'enquiries']]
        .map(([tone, label, now, before, key]) => `<div class="kpi ${tone}"><p class="label">${label}</p><p class="value">${fmt(now)}</p><p class="change">${trend(now, before, ` vs previous ${escapeHtml(range)}`)}</p><div class="spark kpi-spark" data-key="${key}"></div></div>`).join('');
      $('#kpis').querySelectorAll('.kpi-spark').forEach(el => { const v = spark(el.dataset.key); miniBars(el, v, null, (a.daily || []).map((d, i) => `${dateLabel(d.day, {day: 'numeric', month: 'short'})} · ${fmt(v[i])}`)); });
      $('#daily-sub').textContent = `Daily visitors · ${$('#analytics-days').selectedOptions[0].textContent.toLowerCase()} against the ${range} before`;
      renderCharts(a);
      const f = a.funnel || {visitors: t.visitors, browsed: 0, enquired: 0};
      $('#funnel').innerHTML = [['Visited the website', f.visitors, 'red'], ['Looked at a vehicle', f.browsed, 'amber'], ['Made an enquiry', f.enquired, 'teal']]
        .map(([label, n, tone], i, all) => `<li><div class="funnel-row"><span>${label}</span><strong>${fmt(n)}</strong></div><span class="track"><span class="fill ${tone}" data-width="${Math.max(2, pctOf(n, f.visitors))}"></span></span><small>${i ? `${pctOf(n, all[i - 1][1])}% of the step before · ${pctOf(n, f.visitors)}% of visitors` : 'Unique visitors, counted once per day'}</small></li>`).join('');
      applyWidths($('#funnel'));
      const v = a.vehicles || [];
      $('#vehicle-table').innerHTML = v.length ? `<thead><tr><th>#</th><th>Vehicle</th><th>Price</th><th>Page views</th><th>Showroom clicks</th><th>WhatsApp</th><th>Email</th><th>Finance</th><th>Visitors</th><th>Enquiry rate</th></tr></thead><tbody>${v.slice(0, 25).map((r, i) => { const car = carById(r.id); return `<tr${car ? '' : ' class="gone"'}><td>${i + 1}</td><td><span class="veh">${car ? `<img src="${escapeHtml(imageFor(photosOf(car)[0] || ''))}" alt="" loading="lazy">` : '<span class="ph"></span>'}${escapeHtml(carName(r.id, r.label))}</span></td><td>${car ? money(car.value) : '–'}</td><td>${fmt(r.views)}</td><td>${fmt(r.clicks)}</td><td>${fmt(r.whatsapp)}</td><td>${fmt(r.email)}</td><td>${fmt(r.finance)}</td><td>${fmt(r.visitors)}</td><td>${r.visitors ? pctOf(r.enquiries, r.visitors) + '%' : '–'}</td></tr>`; }).join('')}</tbody>` : '<tbody><tr><td class="empty-note">No vehicle views yet.</td></tr></tbody>';
      barList($('#sources'), a.sources || [], r => sourceName(r.name), r => r.visitors, 'blue');
      barList($('#devices'), a.devices || [], r => r.name[0].toUpperCase() + r.name.slice(1), r => r.visitors, 'teal');
      barList($('#countries'), a.countries || [], r => countryName(r.name), r => r.visitors, 'violet');
      barList($('#pages'), a.pages || [], r => pageName(r.name), r => r.views, 'amber');
      barList($('#enquiry-types'), [['WhatsApp', t.whatsapp], ['Email', t.email], ['Phone calls', t.phone], ['Finance application', t.finance], ['Directions', t.directions]].map(([name, n]) => ({name, n})).filter(r => r.n), r => r.name, r => r.n);
      $('#analytics-summary').textContent = `Anonymous visits to driving-force.co.za since ${new Date(a.since).toLocaleDateString('en-ZA', {day: 'numeric', month: 'long', year: 'numeric'})}. No cookies, and no personal details are stored.`;
    } catch (e) { $('#analytics-error').textContent = e.message; }
  }
  // Keep the "browsing" pill and the overview fresh while the dashboard is open.
  setInterval(() => { if (!me || document.hidden) return; if (view === 'home') loadHome(); else api('/api/analytics?days=1').then(a => setLive(a.live)).catch(() => {}); }, 60000);

  if (resetToken) { $('#login-view').hidden = false; showForm('#reset-form'); }
  else api('/api/session').then(data => data.authenticated ? showApp(data.user) : showLogin()).catch(showLogin);
})();
