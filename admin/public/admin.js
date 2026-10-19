(() => {
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => 'R ' + Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ');
  const makeLabel = value => ['BMW','MINI'].includes(value) ? value : String(value).toLowerCase().replace(/(^|[ -])\w/g, m => m.toUpperCase());
  const title = car => car.displayName || `${makeLabel(car.make)} ${makeLabel(car.model)}`;
  const photosOf = car => Array.isArray(car.photos) && car.photos.length ? car.photos : [car.localImage].filter(Boolean);
  let vehicles = [], savedOrder = [], siteUrl = '', options = null, removing = null, me = null, dragId = null;

  async function api(path, init = {}) {
    const response = await fetch(path, {...init, headers: {'Content-Type': 'application/json', ...(init.headers || {})}});
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/api/session' && !(path === '/api/users' && init.method === 'PATCH')) showLogin();
    if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }
  function showLogin() { me = null; $('#app-view').hidden = true; $('#session').hidden = true; $('#login-view').hidden = false; $('#login-form [name=email]').focus(); }
  function showApp(user) { me = user; $('#who').textContent = user.name || user.email; $('#login-view').hidden = true; $('#app-view').hidden = false; $('#session').hidden = false; load(); }
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
      render();
    } catch (error) { $('#summary').textContent = error.message; }
  }

  // ---- List, prices and ordering ----
  const orderChanged = () => vehicles.some((car, i) => String(car.id) !== savedOrder[i]);
  function render() {
    const query = $('#search').value.trim().toLowerCase();
    const arranging = !query;
    const shown = vehicles.filter(car => `${car.make} ${car.model} ${car.variant} ${car.year} ${car.stock_code} ${car.displayName || ''}`.toLowerCase().includes(query));
    $('#summary').textContent = `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} live on the website` + (query ? ` · ${shown.length} matching · clear the search to change the order` : '');
    $('#order-bar').hidden = !orderChanged();
    const last = vehicles.length - 1;
    $('#list').innerHTML = shown.map(car => {
      const i = vehicles.indexOf(car), photos = photosOf(car);
      const move = arranging ? `<div class="move"><span class="handle" title="Drag to reorder" aria-hidden="true">⠿</span><button class="icon" type="button" data-move="up" ${i === 0 ? 'disabled' : ''} aria-label="Move ${escapeHtml(title(car))} up">↑</button><span class="position" title="Position on the website">${i + 1}</span><button class="icon" type="button" data-move="down" ${i === last ? 'disabled' : ''} aria-label="Move ${escapeHtml(title(car))} down">↓</button><button class="icon" type="button" data-move="top" ${i === 0 ? 'disabled' : ''} title="Move to top" aria-label="Move ${escapeHtml(title(car))} to the top">⤒</button></div>` : `<div class="move"><span class="position">${i + 1}</span></div>`;
      return `<li class="item" data-id="${escapeHtml(car.id)}">${move}<img src="${escapeHtml(imageFor(photos[0]))}" alt="" loading="lazy"><div><h3>${car.year} ${escapeHtml(title(car))}${car.descriptionSource === 'admin' ? '<span class="new">Added here</span>' : ''}</h3><p class="meta">${escapeHtml(car.variant)} · ${escapeHtml(car.colour)} · ${Number(car.mile).toLocaleString('en-ZA').replace(/,/g, ' ')} km · Stock ${escapeHtml(car.stock_code)}</p><form class="price-form" data-price="${escapeHtml(car.id)}"><label class="currency" for="price-${escapeHtml(car.id)}">R</label><input id="price-${escapeHtml(car.id)}" name="price" inputmode="numeric" value="${car.value}" aria-label="Price of ${escapeHtml(title(car))} in rand" autocomplete="off"><button class="button small" type="submit" hidden>Save price</button><span class="saved" role="status"></span></form></div><div class="row-actions"><button class="button ghost small" type="button" data-photos="${escapeHtml(car.id)}">Photos (${photos.length})</button><button class="button ghost small" type="button" data-remove="${escapeHtml(car.id)}">Remove</button></div></li>`;
    }).join('') || `<li class="empty">${vehicles.length ? 'No vehicles match your search.' : 'No vehicles are listed yet. Add your first one.'}</li>`;
  }
  function move(id, to) {
    const from = vehicles.findIndex(car => String(car.id) === String(id));
    if (from < 0 || to < 0 || to >= vehicles.length || to === from) return;
    const [car] = vehicles.splice(from, 1); vehicles.splice(to, 0, car); render();
  }
  $('#list').addEventListener('click', event => {
    const button = event.target.closest('[data-move]');
    if (button) {
      const id = button.closest('.item').dataset.id, i = vehicles.findIndex(car => String(car.id) === id);
      move(id, {up: i - 1, down: i + 1, top: 0}[button.dataset.move]);
      document.querySelector(`.item[data-id="${CSS.escape(id)}"] [data-move="${button.dataset.move}"]:not(:disabled)`)?.focus();
    }
  });
  // Pointer-based dragging works with a mouse and on touch screens.
  let dropTarget = null, pointer = null;
  function updateTarget() {
    const item = document.elementFromPoint(pointer.x, pointer.y)?.closest('.item');
    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
    dropTarget = item && item.dataset.id !== dragId ? item : null;
    dropTarget?.classList.add('drop-target');
  }
  // Keeps scrolling while the pointer is held near the top or bottom edge, so cars can be dragged up a long list.
  function autoScroll() {
    if (!dragId) return;
    const edge = 80, speed = pointer.y < edge ? -(edge - pointer.y) / 4 : pointer.y > innerHeight - edge ? (pointer.y - innerHeight + edge) / 4 : 0;
    if (speed) { scrollBy(0, speed); updateTarget(); }
    requestAnimationFrame(autoScroll);
  }
  $('#list').addEventListener('pointerdown', event => {
    const handle = event.target.closest('.handle'); if (!handle) return;
    event.preventDefault();
    dragId = handle.closest('.item').dataset.id; pointer = {x: event.clientX, y: event.clientY};
    handle.setPointerCapture(event.pointerId);
    handle.closest('.item').classList.add('dragging');
    requestAnimationFrame(autoScroll);
  });
  $('#list').addEventListener('pointermove', event => {
    if (!dragId) return;
    pointer = {x: event.clientX, y: event.clientY}; updateTarget();
  });
  function endDrag() {
    if (!dragId) return;
    const id = dragId, target = dropTarget; dragId = null; dropTarget = null;
    document.querySelectorAll('.dragging,.drop-target').forEach(el => el.classList.remove('dragging', 'drop-target'));
    if (target) move(id, vehicles.findIndex(car => String(car.id) === target.dataset.id));
  }
  $('#list').addEventListener('pointerup', endDrag);
  $('#list').addEventListener('pointercancel', () => { dropTarget = null; endDrag(); });
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
    form.price.classList.toggle('changed', changed); form.querySelector('button').hidden = !changed; form.querySelector('.saved').textContent = '';
  });
  $('#list').addEventListener('keydown', event => {
    const form = event.target.closest('.price-form');
    if (form && event.key === 'Escape') { const car = vehicles.find(c => String(c.id) === form.dataset.price); form.price.value = car.value; form.price.dispatchEvent(new Event('input', {bubbles: true})); }
  });
  $('#list').addEventListener('submit', async event => {
    const form = event.target.closest('.price-form'); if (!form) return;
    event.preventDefault();
    const car = vehicles.find(c => String(c.id) === form.dataset.price), status = form.querySelector('.saved'), button = form.querySelector('button');
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
    grid.addEventListener('change', async event => {
      const files = [...event.target.files]; if (!files.length) return;
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
    });
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

  // ---- Add a vehicle ----
  const addDialog = $('#add-dialog'), addForm = $('#add-form'), addPhotos = photoPicker($('#add-photos'));
  let added = false;
  $('#add-open').addEventListener('click', () => { addForm.querySelector('.error').textContent = ''; addPhotos.set([]); added = false; addDialog.showModal(); });
  addDialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => addDialog.close()));
  addDialog.addEventListener('close', () => { if (!added) addPhotos.cleanupAll(); });
  addForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = addForm.querySelector('[type=submit]'), error = addForm.querySelector('.error');
    error.textContent = '';
    if (addPhotos.busy()) { error.textContent = 'Please wait for the photos to finish uploading.'; return; }
    if (!addPhotos.urls().length) { error.textContent = 'Please add at least one photo of the vehicle.'; return; }
    const missing = [...addForm.querySelectorAll('[required]')].find(field => !field.value.trim());
    if (missing) { error.textContent = `Please fill in ${missing.closest('label').firstChild.textContent.trim().toLowerCase()}.`; missing.focus(); return; }
    const vehicle = Object.fromEntries(new FormData(addForm));
    button.disabled = true; button.textContent = 'Publishing…';
    try {
      const {vehicle: car} = await api('/api/vehicles', {method: 'POST', body: JSON.stringify({vehicle, photos: addPhotos.urls()})});
      added = true; addPhotos.discard();
      vehicles.unshift(car); savedOrder.unshift(String(car.id)); render(); addDialog.close(); addForm.reset();
      notify(`${car.year} ${title(car)} is now listed at the top. It appears on the website within about a minute.`);
    } catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; button.textContent = 'Publish to website'; }
  });

  // ---- Manage photos of a listed vehicle ----
  const photosDialog = $('#photos-dialog'), editPhotos = photoPicker($('#edit-photos'));
  let editing = null, photosSaved = false;
  $('#list').addEventListener('click', event => {
    const button = event.target.closest('[data-photos]'); if (!button) return;
    editing = vehicles.find(car => String(car.id) === button.dataset.photos);
    photosSaved = false; photosDialog.querySelector('.error').textContent = '';
    $('#photos-name').textContent = `${editing.year} ${title(editing)} — stock ${editing.stock_code}. The main photo is shown first on the website.`;
    editPhotos.set(photosOf(editing)); photosDialog.showModal();
  });
  photosDialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => photosDialog.close()));
  photosDialog.addEventListener('close', () => { if (!photosSaved) editPhotos.cleanupAll(); });
  $('#photos-save').addEventListener('click', async event => {
    const button = event.currentTarget, error = photosDialog.querySelector('.error');
    error.textContent = '';
    if (editPhotos.busy()) { error.textContent = 'Please wait for the photos to finish uploading.'; return; }
    if (!editPhotos.urls().length) { error.textContent = 'A vehicle needs at least one photo.'; return; }
    button.disabled = true; button.textContent = 'Saving…';
    try {
      const {vehicle} = await api('/api/vehicles', {method: 'PATCH', body: JSON.stringify({action: 'photos', id: editing.id, photos: editPhotos.urls()})});
      photosSaved = true; editPhotos.discard();
      Object.assign(editing, vehicle); render(); photosDialog.close();
      notify(`Photos updated for ${editing.year} ${title(editing)}.`);
    } catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; button.textContent = 'Save photos'; }
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

  const accountDialog = $('#account-dialog'), passwordForm = $('#password-form'), userForm = $('#user-form');
  accountDialog.querySelector('[data-close]').addEventListener('click', () => accountDialog.close());
  async function loadTeam() {
    const {users} = await api('/api/users');
    $('#team-list').innerHTML = users.map(u => `<li><div><strong>${escapeHtml(u.name || u.email)}</strong>${u.owner ? '<span class="badge">Owner</span>' : ''}${u.name ? `<div class="meta">${escapeHtml(u.email)}</div>` : ''}</div>${u.email === me.email ? '<span class="meta">You</span>' : `<div class="row-actions"><button class="button ghost small" type="button" data-reset="${escapeHtml(u.email)}">Reset password</button><button class="button ghost small" type="button" data-remove-user="${escapeHtml(u.email)}">Remove</button></div>`}</li>`).join('');
  }
  $('#account-open').addEventListener('click', () => {
    passwordForm.reset(); userForm.reset(); accountDialog.querySelectorAll('.error').forEach(e => e.textContent = '');
    passwordForm.username.value = me.email;
    $('#team').hidden = !me.owner;
    if (me.owner) loadTeam().catch(e => { userForm.querySelector('.error').textContent = e.message; });
    accountDialog.showModal();
  });
  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = passwordForm.querySelector('button'), error = passwordForm.querySelector('.error');
    button.disabled = true; error.textContent = '';
    try { await api('/api/users', {method: 'PATCH', body: JSON.stringify({currentPassword: passwordForm.currentPassword.value, newPassword: passwordForm.newPassword.value})}); passwordForm.reset(); accountDialog.close(); notify('Your password has been updated.'); }
    catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  });
  userForm.addEventListener('submit', async event => {
    event.preventDefault();
    const button = userForm.querySelector('button'), error = userForm.querySelector('.error');
    button.disabled = true; error.textContent = '';
    try {
      const {user} = await api('/api/users', {method: 'POST', body: JSON.stringify({email: userForm.email.value, name: userForm.name.value, password: userForm.password.value, owner: userForm.owner.checked})});
      userForm.reset(); await loadTeam(); error.textContent = ''; notify(`${user.email} can now sign in with the starting password you set.`);
    } catch (e) { error.textContent = e.message; }
    finally { button.disabled = false; }
  });
  $('#team-list').addEventListener('click', async event => {
    const error = userForm.querySelector('.error'); error.textContent = '';
    const reset = event.target.closest('[data-reset]'), remove = event.target.closest('[data-remove-user]');
    try {
      if (reset) {
        const password = prompt(`New password for ${reset.dataset.reset} (at least 10 characters). Share it with them privately.`);
        if (!password) return;
        await api('/api/users', {method: 'PATCH', body: JSON.stringify({email: reset.dataset.reset, newPassword: password})});
        notify(`Password reset for ${reset.dataset.reset}. Their other sessions have been signed out.`);
      }
      if (remove) {
        if (!confirm(`Remove ${remove.dataset.removeUser}? They will be signed out and can no longer sign in.`)) return;
        await api('/api/users?email=' + encodeURIComponent(remove.dataset.removeUser), {method: 'DELETE'});
        await loadTeam(); notify(`${remove.dataset.removeUser} has been removed.`);
      }
    } catch (e) { error.textContent = e.message; }
  });

  api('/api/session').then(data => data.authenticated ? showApp(data.user) : showLogin()).catch(showLogin);
})();
