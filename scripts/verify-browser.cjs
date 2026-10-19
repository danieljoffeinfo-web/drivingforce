// Fresh headless Chromium profile. Local mode serves files in-memory; production mode is GET-only.
// No personal browser, Safari, live enquiries or finance submissions are used.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {vehicles}=require('../dist/vehicles.json');
const {estimate,money}=require('../dist/finance-utils.js');
const {vehicleUrl}=require('../dist/inventory.js');
const seo=require('../lib/seo.cjs');
const inventory=require('../dist/vehicles.json');
const base=process.env.TEST_BASE_URL||'https://project.test';
const live=Boolean(process.env.TEST_BASE_URL);
const output=path.join(__dirname,'../evidence',live?'production':'local');
const failures=[];
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH||undefined});
  const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});
  let blockedWrites=0;
  await context.route('**/*',async route=>{
    if(route.request().method()!=='GET'){blockedWrites++;return route.abort();}
    if(live)return route.continue();
    const url=new URL(route.request().url());
    if(url.hostname!=='project.test')return route.abort();
    // Server-rendered pages, as api/page.js serves them on Vercel.
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:seo.renderHome(inventory)});
    const slug=url.pathname.match(/^\/vehicles\/([^/]+)$/);
    if(slug){const found=seo.findBySlug(inventory.vehicles,slug[1]);return route.fulfill(found?{contentType:'text/html',body:seo.renderVehicle(found.car,inventory)}:{status:404,contentType:'text/html',body:seo.renderNotFound()});}
    const name=url.pathname.slice(1)+(path.extname(url.pathname)?'':'.html');
    const file=path.resolve(__dirname,'../dist',name);
    if(!file.startsWith(path.resolve(__dirname,'../dist')+path.sep))return route.abort();
    try{await route.fulfill({path:file});}catch{await route.fulfill({status:404,body:'Not found'});}
  });
  const page=await context.newPage();
  page.on('pageerror',e=>failures.push(e.message));
  async function noOverflow(label){
    const result=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(result.scroll<=result.viewport+1,`${label}: ${JSON.stringify(result)}`);
  }
  async function go(url){await page.goto(base+url);await page.locator('#vehicle-title').waitFor();}
  // All 49 pages at desktop and mobile: exact identity, description, image and enquiry payload.
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    for(const car of vehicles){
      await go(vehicleUrl(car));
      assert.equal(await page.locator('#vehicle-title').innerText(),car.year+' '+car.displayName);
      // The stored description comes first; the page adds a closing paragraph about the showroom.
      assert.ok((await page.locator('.vehicle-description').innerText()).startsWith(car.description.join('\n\n')),`description ${car.id}`);
      await page.locator('.detail-photo').evaluate(img=>img.decode());
      assert.ok(await page.locator('.detail-photo').evaluate(img=>img.complete&&img.naturalWidth>0),`photo ${car.id}`);
      const mail=new URL(await page.locator('.vehicle-enquire').getAttribute('href'));
      assert.equal(mail.pathname,'info@drivingforce.biz');
      assert.ok(mail.searchParams.get('subject').includes(car.stock_code));
      assert.ok(mail.searchParams.get('body').includes(vehicleUrl(car)));
      assert.equal(await page.locator('.vehicle-equipment li').count(),car.features.length);
      await noOverflow(`${width}/${car.id}`);
    }
  }
  // Representative screenshots, longest name/variant and the narrowest supported viewport.
  for(const width of [1440,768,390,320]){
    await page.setViewportSize({width,height:1000});
    for(const id of [2746,2583,2726]){
      await go(vehicleUrl(vehicles.find(c=>c.id===id)));await noOverflow(`${width}/${id}`);
      await page.screenshot({path:path.join(output,`vehicle-${id}-${width}.png`),fullPage:true});
    }
    await page.goto(base+'/#showroom');
    await page.locator('.vehicle-card').first().waitFor();
    assert.equal(await page.locator('.vehicle-card').count(),49);
    await noOverflow('catalog '+width);
    await page.locator('.vehicle-card').first().scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`cards-${width}.png`)});
  }
  // Browse/search/sort and native card navigation.
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#vehicle-search').fill('no-such-car');
  assert.equal(await page.locator('.vehicle-card').count(),0);
  await page.locator('#clear-filters').click();
  assert.equal(await page.locator('.vehicle-card').count(),49);
  await page.locator('#vehicle-sort').selectOption('price-asc');
  assert.equal(await page.locator('.vehicle-card-link').first().getAttribute('href'),vehicleUrl(vehicles.find(c=>c.id===2708)));
  await page.locator('#vehicle-search').fill('Porsche');
  assert.equal(await page.locator('.vehicle-card').count(),3);
  const whatsapp=new URL(await page.locator('.vehicle-whatsapp').first().getAttribute('href'));
  assert.equal(await page.locator('.vehicle-whatsapp').count(),3);
  assert.equal(whatsapp.origin+whatsapp.pathname,'https://wa.me/27824254253');
  assert.match(whatsapp.searchParams.get('text'),/Porsche.*stock [A-Z0-9]+/);
  // Email enquiry dialog: validation, vehicle prefill and a mocked delivery (no email is sent).
  let enquiry=null;
  await page.route('**/api/enquiry',route=>{enquiry=route.request().postDataJSON();return route.fulfill({status:200,contentType:'application/json',body:'{"accepted":true}'});});
  await page.locator('.vehicle-email').first().click();
  await page.locator('#enquiry-dialog[open]').waitFor();
  assert.match(await page.locator('#enquiry-vehicle').textContent(),/Porsche.*Stock [A-Z0-9]+/);
  await page.locator('.enquiry-submit').click();
  assert.match(await page.locator('#enquiry-status').textContent(),/enter your name/);
  await page.locator('#enquiry-form [name=name]').fill('Browser Check');
  await page.locator('#enquiry-form [name=email]').fill('check@example.com');
  await page.locator('.enquiry-submit').click();
  await page.locator('#enquiry-status',{hasText:'Thank you'}).waitFor();
  assert.equal(enquiry.name,'Browser Check');assert.ok(enquiry.vehicleId);assert.match(enquiry.message,/Porsche/);
  await page.screenshot({path:path.join(output,'enquiry-dialog.png')});
  await page.locator('.enquiry-close').click();
  await page.unroute('**/api/enquiry');
  await page.locator('.vehicle-card-link').first().click();
  await page.locator('.vehicle-description').waitFor();
  // Photo dialog: keyboard entry, close, focus restoration and phone-sized layout.
  await go(vehicleUrl(vehicles.find(c=>c.id===2746)));
  await page.locator('.photo-open').focus();await page.keyboard.press('Enter');
  assert.ok(await page.locator('dialog').evaluate(d=>d.open));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('dialog').evaluate(d=>d.open),false);
  assert.ok(await page.locator('.photo-open').evaluate(e=>e===document.activeElement));
  await page.setViewportSize({width:390,height:844});
  await page.locator('.photo-open').click();
  await page.screenshot({path:path.join(output,'photo-dialog-mobile.png')});
  await page.locator('.photo-close').click();
  // Finance arithmetic, validation and selected-vehicle handoff (no form submission).
  await page.locator('[name=deposit]').fill('100000');
  const expected=estimate({price:2395995,deposit:100000,tradeIn:0,rate:12,term:72});
  // Node and Chromium can use different thousands-separator spaces for en-ZA, so compare ignoring that.
  const sameMoney=(a,b)=>assert.equal(a.replace(/\s/g,' '),b.replace(/\s/g,' '));
  sameMoney(await page.locator('#estimate-monthly').textContent(),money(expected.monthly));
  await page.locator('[name=deposit]').fill('9999999');
  assert.equal(await page.locator('#estimate-monthly').textContent(),'—');
  assert.ok((await page.locator('#estimate-error').innerText()).length>0);
  await page.locator('[name=deposit]').fill('100000');
  const financeLink=await page.locator('#apply-finance').getAttribute('href');
  assert.ok(financeLink.includes('vehicle=2746')&&financeLink.includes('deposit=100000'));
  await page.locator('#apply-finance').click();
  await page.locator('#application-vehicle h2').waitFor();
  assert.ok((await page.locator('.application-aside').innerText()).includes('Porsche 911 Carrera S'));
  // Mobile navigation, missing ID and recoverable fetch failure.
  await go(vehicleUrl(vehicles.find(c=>c.id===2746)));await page.locator('.menu-button').click();
  assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'),'false');
  await page.goto(base+'/vehicles/does-not-exist-tp0-278');await page.locator('.page-message').waitFor();
  assert.ok((await page.locator('.page-message').innerText()).includes('could not be found'));
  // With the live and bundled inventory unavailable, the server-rendered page still works from its embedded data.
  await page.route('**/vehicles.json',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.goto(base+vehicleUrl(vehicles.find(c=>c.id===2746)));await page.locator('#estimate-monthly').waitFor();
  await page.locator('[name=deposit]').fill('100000');
  sameMoney(await page.locator('#estimate-monthly').textContent(),money(expected.monthly));
  assert.deepEqual(failures,[]);assert.equal(blockedWrites,0);
  const report={mode:live?'production':'local',base,verifiedAt:new Date().toISOString(),vehicleCount:49,vehiclePageChecks:98,widths:[1440,768,390,320],errors:failures,writeRequests:blockedWrites,interactions:['search','sort','card navigation','photo keyboard/close/focus','finance arithmetic/validation/handoff','mobile navigation','missing vehicle','fetch failure fallback']};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;process.exit(1);});
