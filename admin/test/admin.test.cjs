const test=require('node:test');
const assert=require('node:assert/strict');
process.env.ADMIN_PASSWORD='correct horse battery';
process.env.SESSION_SECRET='x'.repeat(48);
const auth=require('../lib/auth.cjs');
const {buildVehicle}=require('../lib/vehicles.cjs');
const {createStore}=require('../lib/store.cjs');
const {sessionHandler,vehiclesHandler}=require('../lib/handlers.cjs');
const seed=require('../lib/seed-vehicles.json');

function fakeBlob(){
  const files=new Map();let clock=0;
  return {files,
    async put(pathname,body,options){const name=options.addRandomSuffix?pathname.replace(/(\.\w+)$/,'-'+(++clock)+'$1'):pathname;if(files.has(name)&&!options.allowOverwrite)throw Error('exists');const url='https://store.public.blob.vercel-storage.com/'+name;files.set(name,{url,pathname:name,body:String(body),uploadedAt:new Date(1e12+(++clock)*1000).toISOString()});return {url};},
    async list({prefix}){return {blobs:[...files.values()].filter(f=>f.pathname.startsWith(prefix))};},
    async del(urls){for(const url of [].concat(urls))for(const [k,f] of files)if(f.url===url)files.delete(k);}};
}
const fakeFetch=blob=>async url=>{const f=[...blob.files.values()].find(f=>f.url===url);return {ok:!!f,json:async()=>JSON.parse(f.body)};};
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(d){this.data=d;return this;}};}
const host='admin.example';
const request=(method,body,{cookie='',query={}}={})=>({method,body,query,url:'/api/vehicles',headers:{host,origin:'https://'+host,cookie},socket:{}});
const input={make:'Toyota',model:'Hilux',variant:'2.8 GD-6 Legend',year:'2023',price:'659 995',mileage:'31,200',colour:'White',stockCode:'zz90001',bodyType:'Double Cab',transmission:'Automatic',fuelType:'Diesel',description:'',features:'Tow bar\n\nCanopy '};
const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,1,2,3]).toString('base64');

test('password and session checks',()=>{
  assert.equal(auth.passwordMatches('correct horse battery'),true);
  assert.equal(auth.passwordMatches('wrong'),false);
  assert.equal(auth.passwordMatches(undefined),false);
  const token=auth.createSession();
  assert.equal(auth.isAuthenticated({headers:{cookie:'a=1; df_admin='+token}}),true);
  assert.equal(auth.isAuthenticated({headers:{cookie:'df_admin='+token.slice(0,-2)+'xx'}}),false);
  assert.equal(auth.isAuthenticated({headers:{cookie:'df_admin='+auth.createSession(Date.now()-13*3600e3)}}),false);
});

test('new vehicles match the showroom inventory shape',()=>{
  const car=buildVehicle(input,seed.vehicles,{imageUrl:'https://x/photo.jpg'});
  const sample=seed.vehicles[0];
  for(const key of ['make','model','variant','year','value','mile','colour','body_type','transmission','fuelType','stock_code','localImage','description','features','id'])assert.ok(key in car,key);
  assert.equal(typeof car.year,typeof sample.year);
  assert.equal(car.value,659995);assert.equal(car.mile,31200);assert.equal(car.stock_code,'ZZ90001');
  assert.equal(car.id,Math.max(...seed.vehicles.map(c=>c.id))+1);
  assert.deepEqual(car.features,['Tow bar','Canopy']);
  assert.equal(car.description.length,2);assert.match(car.description[1],/R 659 995/);
  assert.throws(()=>buildVehicle({...input,stockCode:sample.stock_code},seed.vehicles,{imageUrl:'x'}),/already listed/);
  assert.throws(()=>buildVehicle({...input,price:'abc'},seed.vehicles,{imageUrl:'x'}),/valid price/);
  assert.throws(()=>buildVehicle({...input,bodyType:'Tank'},seed.vehicles,{imageUrl:'x'}),/body type/);
});

test('login, add and remove vehicles end to end',async()=>{
  const blob=fakeBlob();const store=createStore(blob,fakeFetch(blob));
  const login=sessionHandler(),vehicles=vehiclesHandler({store});
  let res=response();await vehicles(request('GET'),res);assert.equal(res.statusCode,401);
  res=response();await login(request('POST',{password:'nope'}),res);assert.equal(res.statusCode,401);
  res=response();await login(request('POST',{password:'correct horse battery'}),res);assert.equal(res.statusCode,200);
  const cookie=res.headers['Set-Cookie'].split(';')[0];
  assert.match(res.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
  res=response();await vehicles(request('GET',null,{cookie}),res);assert.equal(res.data.vehicles.length,49);
  res=response();await vehicles({...request('POST',{vehicle:input,photo:jpeg},{cookie}),headers:{host,origin:'https://evil.example',cookie}},res);assert.equal(res.statusCode,403);
  res=response();await vehicles(request('POST',{vehicle:{...input,colour:''},photo:jpeg},{cookie}),res);assert.equal(res.statusCode,400);
  assert.equal([...blob.files.keys()].some(k=>k.startsWith('vehicles/')),false,'rejected forms upload nothing');
  res=response();await vehicles(request('POST',{vehicle:input,photo:jpeg},{cookie}),res);assert.equal(res.statusCode,201);
  const added=res.data.vehicle;
  const published=JSON.parse(blob.files.get('inventory.json').body);
  assert.equal(published.vehicles.length,50);assert.equal(published.vehicles[0].stock_code,'ZZ90001');
  res=response();await vehicles(request('DELETE',null,{cookie,query:{id:String(added.id)}}),res);assert.equal(res.statusCode,200);
  res=response();await vehicles(request('DELETE',null,{cookie,query:{id:String(seed.vehicles[0].id)}}),res);assert.equal(res.statusCode,200);
  res=response();await vehicles(request('GET',null,{cookie}),res);
  assert.equal(res.data.vehicles.length,48);
  assert.ok(!res.data.vehicles.some(c=>c.id===seed.vehicles[0].id||c.id===added.id));
  assert.equal([...blob.files.keys()].some(k=>k.startsWith('vehicles/')),false,'removed vehicle photo is deleted');
  assert.equal(JSON.parse(blob.files.get('inventory.json').body).vehicles.length,48);
  res=response();await vehicles(request('DELETE',null,{cookie,query:{id:String(added.id)}}),res);assert.equal(res.statusCode,404);
});
