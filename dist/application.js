(() => {
  const {escapeHtml:e,money,vehicleTitle} = DF;
  const root = document.querySelector('#application-root');
  const query = new URLSearchParams(location.search);
  const categories = ['Proof of identity','Proof of residence','Payslip','Bank statement','Driver’s licence','Additional document'];
  const expenses = ['bondRepayment','transportation','vehicleInstalments','education','creditCards','householdExpenses','clothingAccounts','utilitiesRatesTaxes','policyInsurance','loans','furnitureAccounts','bankingCosts','telephoneInternet','foodEntertainment','medical','maintenance','other'];
  let currentStep = 0, documents = [], submitting = false;
  const submissionId = crypto.randomUUID();
  Promise.all([fetch('application-fields.json').then(r=>{if(!r.ok)throw Error();return r.json();}),DFInventory.load()]).then(([steps,data])=>{
    const fields = steps.flatMap(step=>step.fields);
    function input(field) {
      const id = 'app-'+field.id, required = field.required?'required':'';
      const common = `id="${id}" name="${field.id}" ${required} ${field.readonly?'readonly':''}`;
      const label = e(field.label)+(field.required?' *':'');
      if(field.type==='select')return `<label>${label}<select ${common}><option value="">Select an option</option>${field.options.map(option=>`<option value="${e(option.value)}">${e(option.label)}</option>`).join('')}</select></label>`;
      if(field.type==='textarea')return `<label class="span-two">${label}<textarea ${common} maxlength="1500"></textarea></label>`;
      return `<label>${label}<input ${common} type="${e(field.type)}" ${field.type==='number'?`step="any" ${field.readonly?'':`min="${field.min??0}"`} ${field.max!==undefined?`max="${field.max}"`:''} inputmode="decimal"`:'maxlength="200"'} ${field.id==='email'?'autocomplete="email"':field.id==='phone'?'autocomplete="tel"':''}></label>`;
    }
    root.innerHTML = `<form id="finance-application" novalidate><div class="application-progress"><div><span id="step-name"></span><span id="step-counter"></span></div><progress id="step-progress" max="8" value="1" aria-label="Application progress"></progress></div><label class="honeypot" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>${steps.map((step,index)=>`<section class="application-step" data-step="${index}" ${index?'hidden':''}><h2 tabindex="-1">${e(step.title)}</h2><p class="step-intro">${index===7?'Attach supporting documents if you have them ready, then review and submit.':'Fields marked * are required. Other details can help the finance team review your application.'}</p>${index===0?`<div class="form-grid" style="margin-bottom:28px"><label class="span-two">Vehicle<select id="application-car"><option value="">I haven’t chosen a vehicle yet</option>${data.vehicles.map(car=>`<option value="${car.id}">${car.year} ${e(vehicleTitle(car))} — ${money(car.value)} · ${e(car.stock_code)}</option>`).join('')}</select></label></div>`:''}<div class="form-grid">${step.fields.map(input).join('')}</div>${index===7?`<label class="document-upload">Supporting documents<input id="application-documents" type="file" accept="application/pdf,image/jpeg,image/png" multiple></label><p class="estimate-note">PDF, JPG or PNG. Up to 6 files, 3 MB combined. Documents can also be provided to the finance team later. Do not upload password-protected files.</p><ul class="document-list" id="document-list"></ul><div id="application-review"></div><label class="checkbox-label"><input type="checkbox" id="consent-processing" required><span>I agree that Driving Force and its service providers may process and share the information and documents in this application with finance providers to assess my finance request. I have read the <a href="/privacy" target="_blank" rel="noopener">privacy information</a>.</span></label><label class="checkbox-label"><input type="checkbox" id="consent-credit" required><span>I authorise the credit checks needed to consider this finance application.</span></label><label class="checkbox-label"><input type="checkbox" id="confirm-accuracy" required><span>I confirm that the information is accurate and I am authorised to provide it, including any next-of-kin details.</span></label><label class="checkbox-label"><input type="checkbox" id="consent-marketing"><span>I would like to receive marketing updates from Driving Force. (Optional)</span></label>`:''}</section>`).join('')}<p id="application-error" class="form-error" role="alert"></p><div class="step-actions"><button type="button" class="plain-button" id="application-back" hidden>Back</button><button class="button button-red" id="application-next" type="submit">Continue <span>→</span></button></div><p class="application-privacy">Your application is sent to Driving Force through its existing VMG delivery service when you select “Submit application”. This is a finance request, not approval of credit. Your draft is not saved; keep this page open until you finish.</p></form>`;
    const form = document.querySelector('#finance-application');
    const carSelect = document.querySelector('#application-car');
    if(data.vehicles.some(car=>String(car.id)===query.get('vehicle')))carSelect.value=query.get('vehicle');
    const initial = {deposit:query.get('deposit')??'0',netTradeIn:query.get('tradeIn')??'0',interestRate:query.get('rate')??'12',repaymentPeriod:query.get('term')??'72'};
    for(const [key,value] of Object.entries(initial)) if(Number.isFinite(Number(value)) && Number(value)>=0 && Number(value)<=10000000)document.querySelector('#app-'+key).value=value;
    function updateVehicle() {
      const car = data.vehicles.find(car=>String(car.id)===carSelect.value);
      const aside = document.querySelector('#application-vehicle');
      aside.innerHTML=car?`<img src="${e(car.localImage)}" alt="${e(vehicleTitle(car))}" width="800" height="533"><h2>${car.year} ${e(vehicleTitle(car))}</h2><p>${e(car.variant)}</p><strong>${money(car.value)}</strong><p>Stock ${e(car.stock_code)}</p><a class="phone-link" href="${DFInventory.vehicleUrl(car)}">View vehicle & estimate</a><a class="button button-black full-width" href="/visit?vehicle=${car.id}">Visit the showroom <span>↗</span></a>`:'<h2>Find your next drive.</h2><p>You can apply now and discuss a vehicle with our team.</p><a class="button button-black full-width" href="/#showroom">Browse the showroom <span>↗</span></a><a class="phone-link" href="tel:+27212038888">021 203 8888</a>';
    }
    carSelect.addEventListener('change',updateVehicle);updateVehicle();
    function totals() {
      const total=expenses.reduce((sum,id)=>sum+(Number(form.elements[id].value)||0),0);
      form.elements.totalMonthlyExpenses.value=total.toFixed(2);
      form.elements.disposableIncome.value=((Number(form.elements.netSalary.value)||0)+(Number(form.elements.otherIncome.value)||0)-total).toFixed(2);
    }
    form.addEventListener('input',totals);totals();
    function readFields(){return Object.fromEntries(fields.filter(field=>!field.readonly).map(field=>[field.id,form.elements[field.id].value.trim()]));}
    function review(){
      document.querySelector('#application-review').innerHTML=steps.slice(0,7).map((step,index)=>`<div class="review-group"><h3>${e(step.title)}</h3><dl>${step.fields.filter(field=>form.elements[field.id].value).map(field=>{let value=form.elements[field.id].value;if(['id','accountNumber'].includes(field.id)&&value.length>4)value='•••• '+value.slice(-4);if(field.type==='select')value=field.options.find(o=>o.value===value)?.label||value;return `<div><dt>${e(field.label)}</dt><dd>${e(value)}</dd></div>`;}).join('')}</dl><button type="button" class="plain-button" data-edit="${index}">Edit ${e(step.title.toLowerCase())}</button></div>`).join('');
      document.querySelectorAll('[data-edit]').forEach(button=>button.addEventListener('click',()=>showStep(Number(button.dataset.edit))));
    }
    function showStep(index,focus=true){
      currentStep=index;
      document.querySelectorAll('.application-step').forEach((element,i)=>element.hidden=i!==index);
      document.querySelector('#step-name').textContent=steps[index].title;
      document.querySelector('#step-counter').textContent=`${index+1} of 8`;
      document.querySelector('#step-progress').value=index+1;
      document.querySelector('#application-back').hidden=index===0;
      document.querySelector('#application-next').innerHTML=index===7?'Submit application <span>↗</span>':'Continue <span>→</span>';
      document.querySelector('#application-error').textContent='';
      if(index===7)review();
      if(focus){const heading=document.querySelector(`[data-step="${index}"] h2`);heading.focus({preventScroll:true});document.querySelector('.application-progress').scrollIntoView({block:'start',behavior:'auto'});}
    }
    function validStep(index){
      const controls=[...document.querySelector(`[data-step="${index}"]`).querySelectorAll('input,select,textarea')];
      const invalid=controls.find(input=>!input.checkValidity());
      if(invalid){showStep(index);invalid.reportValidity();return false;}
      return true;
    }
    document.querySelector('#application-back').addEventListener('click',()=>showStep(Math.max(0,currentStep-1)));
    function renderDocuments(){
      document.querySelector('#document-list').innerHTML=documents.map((document,index)=>`<li><span>${e(document.file.name)} (${Math.ceil(document.file.size/1024)} KB)</span><select aria-label="Document category for ${e(document.file.name)}" data-document="${index}" required><option value="">Select document type</option>${categories.map(category=>`<option ${category===document.category?'selected':''}>${e(category)}</option>`).join('')}</select><button type="button" class="plain-button" data-remove="${index}" aria-label="Remove ${e(document.file.name)}">Remove</button></li>`).join('');
      document.querySelectorAll('[data-document]').forEach(select=>select.addEventListener('change',()=>documents[Number(select.dataset.document)].category=select.value));
      document.querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>{documents.splice(Number(button.dataset.remove),1);renderDocuments();}));
    }
    document.querySelector('#application-documents').addEventListener('change',event=>{
      const incoming=[...event.target.files];event.target.value='';
      const error=document.querySelector('#application-error');
      if(incoming.some(file=>!['application/pdf','image/jpeg','image/png'].includes(file.type))){error.textContent='Choose PDF, JPG or PNG documents.';return;}
      if(documents.length+incoming.length>6||documents.reduce((sum,item)=>sum+item.file.size,0)+incoming.reduce((sum,file)=>sum+file.size,0)>3*1024*1024){error.textContent='Choose up to 6 documents with a combined size of 3 MB or less.';return;}
      documents.push(...incoming.map(file=>({file,category:''})));error.textContent='';renderDocuments();
    });
    const readFile=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('A document could not be read. Please attach it again.'));reader.readAsDataURL(file);});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(submitting)return;
      if(!validStep(currentStep))return;
      if(currentStep<7){showStep(currentStep+1);return;}
      for(let index=0;index<8;index++)if(!validStep(index))return;
      submitting=true;const next=document.querySelector('#application-next');next.disabled=true;next.textContent='Sending application…';document.querySelector('#application-back').disabled=true;
      try{
        const payload={submissionId,vehicleId:carSelect.value||null,fields:readFields(),consentProcessing:document.querySelector('#consent-processing').checked,consentCredit:document.querySelector('#consent-credit').checked,confirmAccuracy:document.querySelector('#confirm-accuracy').checked,marketing:document.querySelector('#consent-marketing').checked,website:form.elements.website.value,documents:await Promise.all(documents.map(async document=>({name:document.file.name,type:document.file.type,category:document.category,data:await readFile(document.file)})))};
        const response=await fetch('/api/finance-application',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||!result.accepted)throw new Error(result.error||'The application could not be confirmed. Please call 021 203 8888 before trying again.');
        documents=[];form.reset();
        root.innerHTML=`<div class="page-message"><h2 class="page-heading" tabindex="-1">APPLICATION SENT.</h2><p>Your application has been passed to Driving Force’s delivery service for review by the finance team. This is not a credit approval.</p><p>Reference: <strong>${e(result.reference)}</strong></p><a class="button button-red" href="/visit">Visit the showroom <span>↗</span></a><p><a class="phone-link" href="tel:+27212038888">Call 021 203 8888</a></p></div>`;
        root.querySelector('h2').focus();
      }catch(error){document.querySelector('#application-error').textContent=error.message;next.disabled=false;next.innerHTML='Submit application <span>↗</span>';document.querySelector('#application-back').disabled=false;submitting=false;}
    });
    showStep(0,false);
  }).catch(()=>{root.innerHTML='<p class="form-error">The application could not load. Please reload this page or call <a href="tel:+27212038888">021 203 8888</a>.</p>';});
})();
