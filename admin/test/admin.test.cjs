const test=require('node:test');
const assert=require('node:assert/strict');
process.env.ADMIN_PASSWORD='correct horse battery';
process.env.OWNER_EMAIL='Owner@Example.com';
process.env.SESSION_SECRET='x'.repeat(48);
process.env.DATA_KEY='k'.repeat(48);
const auth=require('../lib/auth.cjs');
const {buildVehicle}=require('../lib/vehicles.cjs');
const {createStore}=require('../lib/store.cjs');
const {createUserStore}=require('../lib/users.cjs');
const {sessionHandler,usersHandler,vehiclesHandler}=require('../lib/handlers.cjs');
const seed=require('../lib/seed-vehicles.json');

function fakeBlob(){
  const files=new Map();let clock=0;
  return {files,
    async put(pathname,body,options){const name=options.addRandomSuffix?pathname.replace(/(\.\w+)$/,'-'+(++clock)+'$1'):pathname;if(files.has(name)&&!options.allowOverwrite)throw Error('exists');const url='https://store.public.blob.vercel-storage.com/'+name;files.set(name,{url,pathname:name,body:String(body),uploadedAt:new Date(1e12+(++clock)*1000).toISOString()});return {url};},
    async list({prefix}){return {blobs:[...files.values()].filter(f=>f.pathname.startsWith(prefix))};},
    async del(urls){for(const url of [].concat(urls))for(const [k,f] of files)if(f.url===url)files.delete(k);}};
}
const fakeFetch=blob=>async url=>{const f=[...blob.files.values()].find(f=>f.url===url);return {ok:!!f,json:async()=>JSON.parse(f.body),text:async()=>f.body};};
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(d){this.data=d;return this;}};}
const host='admin.example';
const request=(method,body,{cookie='',query={}}={})=>({method,body,query,url:'/api/vehicles',headers:{host,origin:'https://'+host,cookie},socket:{}});
const input={make:'Toyota',model:'Hilux',variant:'2.8 GD-6 Legend',year:'2023',price:'659 995',mileage:'31,200',colour:'White',stockCode:'zz90001',bodyType:'Double Cab',transmission:'Automatic',fuelType:'Diesel',description:'',features:'Tow bar\n\nCanopy '};
const jpeg='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,1,2,3]).toString('base64');

function setup(){
  const blob=fakeBlob(),fetchImpl=fakeFetch(blob);
  const users=createUserStore(blob,fetchImpl),store=createStore(blob,fetchImpl);
  return {blob,users,login:sessionHandler({users}),accounts:usersHandler({users}),vehicles:vehiclesHandler({store,users})};
}
async function signIn(login,email,password){
  const res=response();await login(request('POST',{email,password}),res);
  return {res,cookie:res.headers['Set-Cookie']?.split(';')[0]};
}

test('passwords are hashed and accounts are stored encrypted',async()=>{
  const {blob,users}=setup();
  const [owner]=await users.load();
  assert.equal(owner.email,'owner@example.com');assert.equal(owner.owner,true);
  assert.ok(!('password' in owner));
  assert.equal(auth.verifyPassword(owner,'correct horse battery'),true);
  assert.equal(auth.verifyPassword(owner,'wrong'),false);
  assert.equal(auth.verifyPassword(undefined,'correct horse battery'),false);
  const stored=[...blob.files.values()].find(f=>f.pathname.startsWith('users/'));
  assert.ok(stored,'first owner is saved');
  assert.ok(!stored.body.includes('owner@example.com'),'account file is encrypted');
  assert.equal((await users.load())[0].salt,owner.salt,'owner account is stable across loads');
});

test('email and password sign-in, sessions and team management',async()=>{
  const {login,accounts,vehicles}=setup();
  let res=response();await vehicles(request('GET'),res);assert.equal(res.statusCode,401);
  assert.equal((await signIn(login,'owner@example.com','wrong password')).res.statusCode,401);
  assert.equal((await signIn(login,'nobody@example.com','correct horse battery')).res.statusCode,401);
  const owner=await signIn(login,' OWNER@example.com ','correct horse battery');
  assert.equal(owner.res.statusCode,200);assert.deepEqual(owner.res.data.user,{email:'owner@example.com',name:'',owner:true});
  assert.match(owner.res.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
  res=response();await login(request('GET',null,{cookie:owner.cookie}),res);assert.equal(res.data.user.email,'owner@example.com');

  res=response();await accounts(request('POST',{email:'sales@example.com',name:'Sam',password:'short'},{cookie:owner.cookie}),res);assert.equal(res.statusCode,400);
  res=response();await accounts(request('POST',{email:'sales@example.com',name:'Sam',password:'sales-start-123'},{cookie:owner.cookie}),res);assert.equal(res.statusCode,201);
  res=response();await accounts(request('POST',{email:'SALES@example.com',password:'sales-start-123'},{cookie:owner.cookie}),res);assert.equal(res.statusCode,409);
  const staff=await signIn(login,'sales@example.com','sales-start-123');assert.equal(staff.res.statusCode,200);assert.equal(staff.res.data.user.owner,false);
  res=response();await vehicles(request('GET',null,{cookie:staff.cookie}),res);assert.equal(res.statusCode,200);
  res=response();await accounts(request('GET',null,{cookie:staff.cookie}),res);assert.equal(res.statusCode,403,'staff cannot manage accounts');
  res=response();await accounts(request('PATCH',{email:'owner@example.com',newPassword:'taken-over-123'},{cookie:staff.cookie}),res);assert.equal(res.statusCode,403);

  res=response();await accounts(request('PATCH',{currentPassword:'wrong',newPassword:'sales-new-pass-1'},{cookie:staff.cookie}),res);assert.equal(res.statusCode,401);
  res=response();await accounts(request('PATCH',{currentPassword:'sales-start-123',newPassword:'sales-new-pass-1'},{cookie:staff.cookie}),res);assert.equal(res.statusCode,200);
  const refreshed=res.headers['Set-Cookie'].split(';')[0];
  res=response();await vehicles(request('GET',null,{cookie:staff.cookie}),res);assert.equal(res.statusCode,401,'old sessions end after a password change');
  res=response();await vehicles(request('GET',null,{cookie:refreshed}),res);assert.equal(res.statusCode,200,'this device stays signed in');
  assert.equal((await signIn(login,'sales@example.com','sales-start-123')).res.statusCode,401);
  assert.equal((await signIn(login,'sales@example.com','sales-new-pass-1')).res.statusCode,200);

  res=response();await accounts(request('PATCH',{email:'sales@example.com',newPassword:'owner-reset-123'},{cookie:owner.cookie}),res);assert.equal(res.statusCode,200);
  res=response();await vehicles(request('GET',null,{cookie:refreshed}),res);assert.equal(res.statusCode,401,'a reset signs the person out');
  res=response();await accounts(request('DELETE',null,{cookie:owner.cookie,query:{email:'owner@example.com'}}),res);assert.equal(res.statusCode,400,'owners cannot remove themselves');
  const again=await signIn(login,'sales@example.com','owner-reset-123');
  res=response();await accounts(request('DELETE',null,{cookie:owner.cookie,query:{email:'sales@example.com'}}),res);assert.equal(res.statusCode,200);
  res=response();await vehicles(request('GET',null,{cookie:again.cookie}),res);assert.equal(res.statusCode,401,'removed people lose access immediately');
  assert.equal((await signIn(login,'sales@example.com','owner-reset-123')).res.statusCode,401);
  const forged=owner.cookie.replace(/.$/,c=>c==='A'?'B':'A');
  res=response();await vehicles(request('GET',null,{cookie:forged}),res);assert.equal(res.statusCode,401);
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

test('add and remove vehicles end to end',async()=>{
  const {blob,login,vehicles}=setup();
  const {cookie}=await signIn(login,'owner@example.com','correct horse battery');
  let res=response();await vehicles(request('GET',null,{cookie}),res);assert.equal(res.data.vehicles.length,49);
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
