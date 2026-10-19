// The vehicle enquiry form, shared by the showroom cards and the vehicle pages. It posts to
// /api/enquiry, which emails the sales team through Resend. Pages without the dialog get it added.
(function () {
  const {money, vehicleTitle: title} = DF;
  const {whatsappLink} = DFCard;
  const fallback = 'Please WhatsApp us on 082 425 4253 or call 021 203 8888.';
  const markup = '<dialog class="enquiry-dialog" id="enquiry-dialog" aria-labelledby="enquiry-title"><form id="enquiry-form" novalidate><div class="enquiry-top"><div><p class="enquiry-eyebrow">EMAIL US</p><h2 id="enquiry-title">Ask about this vehicle</h2><p class="enquiry-vehicle" id="enquiry-vehicle"></p></div><button type="button" class="enquiry-close" aria-label="Close enquiry form">×</button></div><input type="hidden" name="vehicleId"><label class="enquiry-trap" aria-hidden="true">Leave blank <input name="website" tabindex="-1" autocomplete="off"></label><label>Name<input name="name" autocomplete="name" required maxlength="100"></label><label>Email<input name="email" type="email" autocomplete="email" required maxlength="200"></label><label>Phone <small>(optional)</small><input name="phone" type="tel" autocomplete="tel" maxlength="30"></label><label>Message<textarea name="message" rows="4" required maxlength="2000"></textarea></label><p class="enquiry-status" id="enquiry-status" role="status" aria-live="polite"></p><button type="submit" class="button button-black enquiry-submit">Send enquiry <span aria-hidden="true">↗</span></button><p class="enquiry-note">Our sales team replies by email. Prefer to chat? <a id="enquiry-whatsapp" href="https://wa.me/27824254253" target="_blank" rel="noopener noreferrer">WhatsApp 082 425 4253</a>.</p></form></dialog>';
  let dialog = document.querySelector('#enquiry-dialog');
  if (!dialog) { document.body.insertAdjacentHTML('beforeend', markup); dialog = document.querySelector('#enquiry-dialog'); }
  const form = dialog.querySelector('#enquiry-form'), status = dialog.querySelector('#enquiry-status');
  let opener = null;
  function open(car, from) {
    opener = from || null;
    form.reset(); status.textContent = ''; status.classList.remove('error');
    form.querySelectorAll('input,textarea,button').forEach(el => { el.disabled = false; });
    form.vehicleId.value = car.id;
    dialog.querySelector('#enquiry-vehicle').textContent = `${car.year} ${title(car)} · ${money(car.value)} · Stock ${car.stock_code}`;
    form.message.value = `Hi, I'm interested in the ${car.year} ${title(car)} (stock ${car.stock_code}). Is it still available?`;
    dialog.querySelector('#enquiry-whatsapp').href = whatsappLink(car);
    dialog.showModal(); form.name.focus();
  }
  dialog.querySelector('.enquiry-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (opener) opener.focus({preventScroll: true}); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const invalid = [...form.elements].find(el => el.willValidate && !el.checkValidity());
    if (invalid) { status.textContent = invalid.name === 'email' && invalid.value ? 'Enter a valid email address.' : `Please enter your ${invalid.name === 'message' ? 'message' : invalid.name === 'phone' ? 'phone number' : invalid.name}.`; status.classList.add('error'); invalid.focus(); return; }
    const submit = form.querySelector('.enquiry-submit');
    submit.disabled = true; status.classList.remove('error'); status.textContent = 'Sending your enquiry…';
    try {
      const response = await fetch('/api/enquiry', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(Object.fromEntries(new FormData(form)))});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Your enquiry could not be sent. ' + fallback);
      form.querySelectorAll('input,textarea,button:not(.enquiry-close)').forEach(el => { el.disabled = true; });
      status.textContent = 'Thank you. Your enquiry has been sent and our sales team will be in touch shortly.';
    } catch (error) {
      submit.disabled = false; status.classList.add('error');
      status.textContent = error instanceof TypeError ? 'You appear to be offline. ' + fallback : error.message;
    }
  });
  window.DFEnquiry = {open};
})();
