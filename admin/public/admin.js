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
  function showLogin() { me = null; $('#app-view').hidden = true; $('#session').hidden = true; $('#login-view').hidden = false; $('#recover-form').hidden = true; $('#reset-form').hidden = true; $('#login-form').hidden = false; $('#login-form [name=email]').focus(); }
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
      fillSuggestions(); render();
    } catch (error) { $('#summary').textContent = error.message; }
  }

  // ---- Grid, prices and ordering ----
  const orderChanged = () => vehicles.some((car, i) => String(car.id) !== savedOrder[i]);
  const km = n => Number(n).toLocaleString('en-ZA').replace(/,/g, ' ') + ' km';
  function render() {
    const query = $('#search').value.trim().toLowerCase();
    const shown = vehicles.filter(car => `${car.make} ${car.model} ${car.variant} ${car.year} ${car.stock_code} ${car.displayName || ''} ${car.colour}`.toLowerCase().includes(query));
    $('#summary').textContent = `${vehicles.length} vehicle${vehicles.length === 1 ? '' : 's'} live on the website` + (query ? ` · ${shown.length} matching · clear the search to drag cards` : '');
    $('#order-bar').hidden = !orderChanged();
    $('#list').innerHTML = shown.map(car => {
      const i = vehicles.indexOf(car), photos = photosOf(car), id = escapeHtml(car.id);
      return `<li class="vcard${query ? ' searching' : ''}" data-id="${id}"><img src="${escapeHtml(imageFor(photos[0]))}" alt="" loading="lazy" draggable="false"><label class="pos" title="Position on the website — type a number and press Enter"><span>#</span><input name="position" inputmode="numeric" value="${i + 1}" aria-label="Position of ${escapeHtml(title(car))}" autocomplete="off"></label>${car.descriptionSource === 'admin' ? '<span class="badge">New</span>' : ''}${photos.length > 1 ? `<span class="photo-count">${photos.length} photos</span>` : ''}<div class="card-body"><h3 title="${escapeHtml(car.year + ' ' + title(car))}">${car.year} ${escapeHtml(title(car))}</h3><p class="meta" title="${escapeHtml(car.variant)}">${escapeHtml(car.variant)}</p><p class="meta">${km(car.mile)} · ${escapeHtml(car.stock_code)}</p><form class="price-form" data-price="${id}"><span class="currency">R</span><input name="price" inputmode="numeric" value="${car.value}" aria-label="Price of ${escapeHtml(title(car))} in rand" autocomplete="off"><button class="button small" type="submit" hidden>Save</button></form><span class="saved" role="status"></span></div><div class="card-actions"><button type="button" data-edit="${id}" title="Edit details">Edit</button><button type="button" data-photos="${id}" title="Manage photos">Photos</button><button type="button" data-duplicate="${id}" title="Add a similar vehicle using these details">Copy+</button><button type="button" data-copy="${id}" title="Copy the details as text">Copy</button><button type="button" class="danger" data-remove="${id}" title="Take off the website" aria-label="Remove ${escapeHtml(title(car))}">✕</button></div></li>`;
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
  try { sizeSelect.value = localStorage.getItem('df-card-size') || 's'; } catch {}
  const applySize = () => { $('#list').className = 'card-grid size-' + sizeSelect.value; };
  sizeSelect.addEventListener('change', () => { applySize(); try { localStorage.setItem('df-card-size', sizeSelect.value); } catch {} });
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

  // ---- Suggestions, paste-to-fill and copy ----
  const knownMakes = ['ALFA ROMEO','ASTON MARTIN','AUDI','BENTLEY','BMW','CHERY','CHEVROLET','CITROEN','FERRARI','FIAT','FORD','GWM','HAVAL','HONDA','HYUNDAI','ISUZU','JAGUAR','JEEP','KIA','LAMBORGHINI','LAND ROVER','LEXUS','MAHINDRA','MASERATI','MAZDA','MCLAREN','MERCEDES-BENZ','MINI','MITSUBISHI','NISSAN','OPEL','PEUGEOT','PORSCHE','RENAULT','ROLLS-ROYCE','SUBARU','SUZUKI','TOYOTA','VOLKSWAGEN','VOLVO'];
  const makeAliases = {'MERCEDES': 'MERCEDES-BENZ', 'MERC': 'MERCEDES-BENZ', 'VW': 'VOLKSWAGEN', 'LANDROVER': 'LAND ROVER', 'RANGE ROVER': 'LAND ROVER'};
  const colours = ['white','black','silver','grey','gray','blue','red','green','yellow','orange','brown','beige','gold','bronze','maroon','burgundy','purple','champagne','charcoal','navy'];
  function fillSuggestions() {
    const uniq = list => [...new Set(list.filter(Boolean))].sort();
    $('#make-options').innerHTML = uniq([...knownMakes, ...vehicles.map(c => c.make)]).map(v => `<option value="${escapeHtml(v)}">`).join('');
    $('#model-options').innerHTML = uniq(vehicles.map(c => c.model)).map(v => `<option value="${escapeHtml(v)}">`).join('');
    $('#colour-options').innerHTML = uniq(vehicles.map(c => c.colour)).map(v => `<option value="${escapeHtml(v)}">`).join('');
  }
  const digits = value => String(value).replace(/[^\d]/g, '');
  // Reads vehicle details from pasted text: "Key: value" lines first, then patterns in free text.
  function parseDetails(text) {
    const out = {}, t = text.replace(/ /g, ' ');
    const keys = {make: /^make$/, model: /^model$/, variant: /^(variant|derivative|version|spec)$/, year: /^(year|model year|reg(istration)? year|first registered)$/, price: /^(price|asking price|selling price|retail price)$/, mileage: /^(mileage|odometer|kilomet(re|er)s|km)$/, colour: /^(colou?r|exterior colou?r)$/, stockCode: /^(stock|stock (code|no\.?|number|#|ref(erence)?)|ref(erence)?|ref no\.?)$/, bodyType: /^(body|body ?type|body ?style|type)$/, transmission: /^(transmission|gearbox|gear ?box)$/, fuelType: /^(fuel|fuel ?type)$/, displayName: /^(display name|title|name)$/, description: /^description$/, features: /^(equipment|features|extras)$/};
    for (const line of t.split(/\n/)) {
      const m = line.match(/^\s*([A-Za-z#. ]{2,30}?)\s*[:=\t]\s*(.+?)\s*$/); if (!m) continue;
      const key = Object.keys(keys).find(k => keys[k].test(m[1].trim().toLowerCase()));
      if (key && !out[key]) out[key] = m[2];
    }
    const flat = t.replace(/\n/g, ' · ');
    if (!out.price) { const m = flat.match(/\bR\s?(\d{1,3}(?:[ ,.]\d{3})+|\d{4,})/i); if (m) out.price = m[1]; }
    if (!out.mileage) { const m = flat.match(/(\d{1,3}(?:[ ,.]\d{3})+|\d{1,7})\s?(?:km|kms|kilomet)/i); if (m) out.mileage = m[1]; }
    if (!out.year) { const m = flat.match(/(?<![\d ,.])((?:19[5-9]|20[0-4])\d)(?![\d,.]| ?km| \d{3}\b)/); if (m) out.year = m[1]; }
    if (!out.stockCode) { const m = flat.match(/\bstock(?: ?(?:code|no\.?|number|ref))?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{2,})/i) || flat.match(/\b(TP\d{4,})\b/i); if (m) out.stockCode = m[1]; }
    if (!out.transmission) { if (/\bmanual\b|\bm\/t\b|\b\d-?speed manual/i.test(flat)) out.transmission = 'Manual'; else if (/\b(auto(matic)?|a\/t|dct|dsg|pdk|cvt|tiptronic|steptronic|s ?tronic|edc)\b/i.test(flat)) out.transmission = 'Automatic'; }
    if (!out.fuelType) { const m = flat.match(/\b(diesel|petrol|hybrid|electric)\b/i); if (m) out.fuelType = m[1]; }
    if (!out.bodyType) {
      const bodies = [[/double ?cab|d\/cab|dc\b/i, 'Double Cab'], [/single ?cab|s\/cab/i, 'Single Cab'], [/station ?wagon|estate|touring|avant/i, 'Station Wagon'], [/convertible|cabrio(let)?|roadster|spider|spyder/i, 'Convertible'], [/coup[eé]/i, 'Coupe'], [/hatch(back)?/i, 'Hatchback'], [/sedan|saloon/i, 'Sedan'], [/\bsuv\b/i, 'SUV'], [/bakkie|pick-? ?up/i, 'Bakkie'], [/\bmpv\b|minivan|people carrier/i, 'MPV'], [/panel ?van/i, 'Panel Van']];
      const hit = bodies.find(([re]) => re.test(flat)); if (hit) out.bodyType = hit[1];
    }
    if (!out.colour) { const m = flat.match(new RegExp('\\b(' + colours.join('|') + ')\\b', 'i')); if (m) out.colour = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase(); }
    if (!out.make) {
      const makes = [...new Set([...Object.keys(makeAliases), ...knownMakes, ...vehicles.map(c => c.make)])].sort((a, b) => b.length - a.length);
      for (const segment of [t.split(/\n/).find(l => l.trim()) || '', ...flat.split(/\s*[·|•,\n]\s*/)]) {
        const upper = segment.toUpperCase(), make = makes.find(mk => new RegExp('(^|[^A-Z])' + mk.replace(/[-]/g, '[- ]?') + '($|[^A-Z])').test(upper));
        if (!make) continue;
        out.make = makeAliases[make] || make;
        // Words after the make: the first is the model, the rest of the title is the variant.
        const after = segment.slice(upper.search(new RegExp(make.replace(/[-]/g, '[- ]?'))) + make.length).replace(/^[\s-]+/, '');
        const words = after.split(/\s+(?:·|\||-|–|,)\s+|\s+R\s?\d/)[0].trim().split(/\s+/).filter(Boolean);
        if (make === 'RANGE ROVER') words.unshift('RANGE ROVER');
        if (!out.model && words.length) out.model = make === 'RANGE ROVER' ? 'RANGE ROVER' : words.shift();
        else if (make === 'RANGE ROVER') words.shift();
        if (!out.variant && words.length) out.variant = words.join(' ').replace(/\b(19|20)\d\d\b/, '').trim();
        break;
      }
    }
    for (const k of ['price', 'mileage', 'year']) if (out[k]) out[k] = digits(out[k]);
    return out;
  }
  // Text for the clipboard, in the same "Key: value" form the paste box reads back.
  function detailsText(car) {
    return [`${car.year} ${title(car)}`, `Make: ${car.make}`, `Model: ${car.model}`, `Variant: ${car.variant}`, `Year: ${car.year}`, `Price: ${money(car.value)}`, `Mileage: ${km(car.mile)}`, `Colour: ${car.colour}`, `Body type: ${car.body_type}`, `Transmission: ${car.transmission}`, `Fuel type: ${car.fuelType}`, `Stock code: ${car.stock_code}`, car.displayName ? `Display name: ${car.displayName}` : '', car.features?.length ? `Equipment: ${car.features.join('; ')}` : ''].filter(Boolean).join('\n');
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); const ok = document.execCommand('copy'); area.remove(); return ok; }
  }

  // ---- Add, duplicate and edit a vehicle (one form) ----
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
    addForm.querySelector('.error').textContent = ''; addForm.querySelector('.paste-result').textContent = ''; $('#paste-text').value = '';
    addPhotos.set([]);
    if (car) {
      const values = valuesOf(car);
      // A duplicate keeps the specification but needs its own stock code, price check, photos and description.
      if (nextMode === 'duplicate') { values.stockCode = ''; values.description = ''; }
      for (const name of fieldNames) setField(name, values[name], nextMode === 'duplicate' && ['price', 'mileage', 'colour', 'year'].includes(name));
    }
    $('#add-title').textContent = nextMode === 'edit' ? `Edit ${car.year} ${title(car)}` : nextMode === 'duplicate' ? `Add a vehicle like the ${car.year} ${title(car)}` : 'Add a vehicle';
    $('#add-photos').hidden = nextMode === 'edit'; addForm.querySelector('.form-columns').classList.toggle('no-photos', nextMode === 'edit');
    $('#add-again').hidden = nextMode === 'edit';
    $('#add-submit').textContent = nextMode === 'edit' ? 'Save changes' : 'Publish to website';
    addDialog.showModal();
    (nextMode === 'duplicate' ? addForm.stockCode : $('#paste-text')).focus();
  }
  $('#add-open').addEventListener('click', () => openForm('add'));
  addDialog.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => addDialog.close()));
  addDialog.addEventListener('close', () => { if (!added) addPhotos.cleanupAll(); });
  addForm.addEventListener('input', event => event.target.classList?.remove('filled'));
  $('#paste-text').addEventListener('input', () => {
    const found = parseDetails($('#paste-text').value);
    const filled = Object.entries(found).filter(([name, value]) => setField(name, value, true)).map(([name]) => addForm.elements[name].closest('label').firstChild.textContent.trim());
    addForm.querySelector('.paste-result').textContent = filled.length ? `Filled ${filled.length}: ${filled.join(', ')}. Check the highlighted fields.` : '';
  });
  addForm.addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('#add-submit').click(); } });
  addForm.addEventListener('submit', async event => {
    event.preventDefault();
    const again = event.submitter?.value === 'again';
    const button = event.submitter || $('#add-submit'), label = button.textContent, error = addForm.querySelector('.error');
    error.textContent = '';
    if (mode !== 'edit') {
      if (addPhotos.busy()) { error.textContent = 'Please wait for the photos to finish uploading.'; return; }
      if (!addPhotos.urls().length) { error.textContent = 'Please add at least one photo of the vehicle (drag them onto the photo area).'; return; }
    }
    const missing = [...addForm.querySelectorAll('[required]')].find(field => !field.value.trim());
    if (missing) { error.textContent = `Please fill in ${missing.closest('label').firstChild.textContent.trim().toLowerCase()}.`; missing.focus(); return; }
    const vehicle = Object.fromEntries(fieldNames.map(name => [name, addForm.elements[name].value]));
    button.disabled = true; button.textContent = mode === 'edit' ? 'Saving…' : 'Publishing…';
    try {
      if (mode === 'edit') {
        const {vehicle: car} = await api('/api/vehicles', {method: 'PATCH', body: JSON.stringify({action: 'details', id: editTarget.id, vehicle})});
        Object.assign(editTarget, car); added = true; fillSuggestions(); render(); addDialog.close();
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
  $('#list').addEventListener('click', async event => {
    const edit = event.target.closest('[data-edit]'), dup = event.target.closest('[data-duplicate]'), copy = event.target.closest('[data-copy]');
    const find = el => vehicles.find(car => String(car.id) === el.dataset[el.dataset.edit ? 'edit' : el.dataset.duplicate ? 'duplicate' : 'copy']);
    if (edit) openForm('edit', find(edit));
    if (dup) openForm('duplicate', find(dup));
    if (copy) { const car = find(copy); const ok = await copyText(detailsText(car)); copy.textContent = ok ? 'Copied ✓' : 'Failed'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); }
  });
  // Keyboard shortcuts: N adds a vehicle, / jumps to search.
  addEventListener('keydown', event => {
    if (!me || document.querySelector('dialog[open]') || event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    if (event.key === 'n' || event.key === 'N') { event.preventDefault(); openForm('add'); }
    if (event.key === '/') { event.preventDefault(); $('#search').focus(); }
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

  if (resetToken) { $('#login-view').hidden = false; showForm('#reset-form'); }
  else api('/api/session').then(data => data.authenticated ? showApp(data.user) : showLogin()).catch(showLogin);
})();
