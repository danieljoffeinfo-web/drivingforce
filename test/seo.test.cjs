const test=require('node:test');
const assert=require('node:assert/strict');
const data=require('../dist/vehicles.json');
const seo=require('../lib/seo.cjs');
const {createHandler}=require('../api/page.js');
const {vehicleUrl,vehicleSlug}=require('../dist/inventory.js');
const {money}=require('../dist/finance-utils.js');

const handler=createHandler({loadInventory:async()=>data});
async function request(query){
  const headers={};let body='',status=200;
  const res={setHeader:(k,v)=>{headers[k]=v;},status(code){status=code;return res;},end(text){body=text||'';}};
  await handler({url:'/api/page?'+query},res);
  return {status,headers,body};
}
const jsonLd=html=>[...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m=>JSON.parse(m[1]));
const links=html=>[...html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)].map(m=>m[1]);
const porsche=data.vehicles.find(c=>c.stock_code==='TP12828');

test('vehicle addresses match the original website so indexed links keep working',()=>{
  for(const car of data.vehicles){
    const old=car.permaLink.replace(/\/$/,'').split('/').pop();
    const found=seo.findBySlug(data.vehicles,old);
    assert.equal(found.car.id,car.id,old);
  }
  assert.equal(vehicleUrl(porsche),'/vehicles/porsche-911-tp12828-278');
  assert.equal(seo.findBySlug(data.vehicles,'nothing-here-278'),null);
});

test('the homepage is rendered with every vehicle, structured data and social tags',async()=>{
  const {status,headers,body}=await request('route=home');
  assert.equal(status,200);
  assert.match(headers['Cache-Control'],/s-maxage=60/);
  assert.equal((body.match(/class="vehicle-card"/g)||[]).length,data.vehicles.length);
  assert.ok(body.includes(`href="${vehicleUrl(porsche)}"`));
  assert.ok(body.includes('<link rel="canonical" href="https://www.driving-force.co.za/">'));
  assert.match(body,/<title>Used Cars for Sale in Cape Town/);
  assert.ok(body.includes('property="og:image"'));
  assert.ok(body.includes('id="showroom-heading"'));
  assert.ok(body.includes('href="/used-cars/porsche"'));
  const types=jsonLd(body).map(d=>d['@type']);
  assert.deepEqual(types,['AutoDealer','WebSite','ItemList']);
  assert.equal(jsonLd(body)[2].numberOfItems,data.vehicles.length);
  for(const url of links(body))assert.ok(/^(https?:|\/|mailto:|tel:|data:)/.test(url)&&!/\.html(\?|#|$)/.test(url),url);
});

test('vehicle pages carry the car as structured data and a canonical address',async()=>{
  const {status,body}=await request('route=vehicle&slug='+vehicleSlug(porsche));
  assert.equal(status,200);
  assert.ok(body.includes('data-rendered="server"'));
  assert.ok(body.includes(`data-vehicle="${porsche.id}"`));
  assert.ok(body.includes(`<title>2020 Porsche 911 Carrera S 911 CARRERA S PDK for sale in Cape Town | ${money(2395995)} | Driving Force</title>`));
  assert.ok(body.includes('<link rel="canonical" href="https://www.driving-force.co.za/vehicles/porsche-911-tp12828-278">'));
  assert.ok(body.includes('<h1 id="vehicle-title">2020 Porsche 911 Carrera S</h1>'));
  const [car,crumbs]=jsonLd(body);
  assert.equal(car['@type'],'Car');
  assert.equal(car.offers.price,2395995);
  assert.equal(car.offers.priceCurrency,'ZAR');
  assert.equal(car.mileageFromOdometer.value,45267);
  assert.equal(car.sku,'TP12828');
  assert.equal(crumbs.itemListElement.length,4);
  assert.ok(body.includes('href="/used-cars/porsche"'));
  for(const url of links(body))assert.ok(/^(https?:|\/|mailto:|tel:|data:)/.test(url)&&!/\.html(\?|#|$)/.test(url),url);
});

test('old links redirect permanently to the vehicle address',async()=>{
  const legacy=await request('route=legacy&id='+porsche.id);
  assert.equal(legacy.status,301);
  assert.equal(legacy.headers.Location,'/vehicles/porsche-911-tp12828-278');
  const renamed=await request('route=vehicle&slug=renault-clio-v-tp12835-278');
  assert.equal(renamed.status,301);
  assert.equal(renamed.headers.Location,'/vehicles/renault-clio-iv-tp12835-278');
  const missing=await request('route=vehicle&slug=ferrari-f40-tp00000-278');
  assert.equal(missing.status,404);
  assert.ok(missing.body.includes('noindex'));
  assert.equal((await request('route=legacy&id=999999')).status,404);
});

test('make pages list only that make and the sitemap lists every page',async()=>{
  const makes=await request('route=makes');
  assert.equal(makes.status,200);
  assert.ok(makes.body.includes('href="/used-cars/mercedes-benz"'));
  const page=await request('route=make&make=mercedes-benz');
  assert.equal(page.status,200);
  const count=data.vehicles.filter(c=>c.make==='MERCEDES-BENZ').length;
  assert.equal((page.body.match(/class="vehicle-card"/g)||[]).length,count);
  assert.match(page.body,/<title>Used Mercedes-Benz for Sale in Cape Town \| \d+ in Stock/);
  assert.ok(!page.body.includes('vehicle-email'),'make pages have no email dialog');
  assert.equal((await request('route=make&make=ferrari')).status,404);
  const sitemap=await request('route=sitemap');
  assert.equal(sitemap.headers['Content-Type'],'application/xml; charset=utf-8');
  const urls=[...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
  assert.ok(urls.includes('https://www.driving-force.co.za/'));
  assert.ok(urls.includes('https://www.driving-force.co.za/used-cars/porsche'));
  assert.equal(urls.filter(u=>u.includes('/vehicles/')).length,data.vehicles.length);
  assert.equal(new Set(urls).size,urls.length);
});

test('static pages have descriptions, canonicals and clean links',()=>{
  const fs=require('node:fs');
  for(const name of ['visit','contact','finance','privacy','terms']){
    const html=fs.readFileSync(`${__dirname}/../dist/${name}.html`,'utf8');
    assert.ok(html.includes(`<link rel="canonical" href="https://www.driving-force.co.za/${name}">`),name);
    assert.match(html,/<meta name="description" content="[^"]{60,}">/,name);
    for(const url of links(html))assert.ok(/^(https?:|\/|mailto:|tel:|data:)/.test(url)&&!/\.html(\?|#|$)/.test(url),name+' '+url);
  }
  const robots=fs.readFileSync(`${__dirname}/../dist/robots.txt`,'utf8');
  assert.ok(robots.includes('Sitemap: https://www.driving-force.co.za/sitemap.xml'));
});
