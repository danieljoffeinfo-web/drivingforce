const test=require('node:test');
const assert=require('node:assert/strict');
const {AuthError}=require('../lib/supabase.cjs');
const auth=require('../lib/auth.cjs');
const {buildVehicle}=require('../lib/vehicles.cjs');
const {createStore}=require('../lib/store.cjs');
const {sessionHandler,accountHandler,vehiclesHandler,photosHandler}=require('../lib/handlers.cjs');
const seed=require('../lib/seed-vehicles.json');

// In-memory stand-in for Supabase Auth plus the dashboard_users list.
function fakeSupabase(){
  const accounts=new Map([['owner@example.com',{id:'u1',password:'owner-password-1',confirmed:true}],['sales@example.com',{id:'u2',password:'sales-password-1',confirmed:true}],['stranger@example.com',{id:'u3',password:'stranger-pass-1',confirmed:true}]]);
  const roles=new Map([['owner@example.com','owner'],['sales@example.com','staff']]);
  const tokens=new Map();let n=0;const log=[];
  const issue=email=>{const a='at'+(++n),r='rt'+n;tokens.set(a,{email,kind:'access'});tokens.set(r,{email,kind:'refresh'});return {accessToken:a,refreshToken:r,user:{id:accounts.get(email).id,email,user_metadata:{}}};};
  const who=token=>{const t=tokens.get(token);if(!t||t.kind!=='access'||t.expired)throw new AuthError('invalid JWT',401);return t.email;};
  return {accounts,roles,tokens,log,
    async signIn(email,password){const a=accounts.get(email);if(!a||a.password!==password)throw new AuthError('Invalid login credentials',400);return issue(email);},
    async refresh(rt){const t=tokens.get(rt);if(!t||t.kind!=='refresh')throw new AuthError('Invalid Refresh Token',400);tokens.delete(rt);return issue(t.email);},
    async getUser(token){const email=who(token);return {id:accounts.get(email).id,email,user_metadata:{}};},
    async role(token){const email=who(token);return roles.get(email)??null;},
    async updatePassword(token,password){const email=who(token);accounts.get(email).password=password;return {};},
    async signOut(token){tokens.delete(token);},
    async recover(email,redirect){log.push(['recover',email,redirect]);return {};}
  };
}

function fakeBlob(){
  const files=new Map();let clock=0;
  return {files,
    async put(pathname,body,options){const name=options.addRandomSuffix?pathname.replace(/(\.\w+)$/,'-'+(++clock)+'$1'):pathname;if(files.has(name)&&!options.allowOverwrite)throw Error('exists');const url='https://teststore.public.blob.vercel-storage.com/'+name;files.set(name,{url,pathname:name,body:String(body),uploadedAt:new Date(1e12+(++clock)*1000).toISOString()});return {url};},
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
  const blob=fakeBlob(),fetchImpl=fakeFetch(blob),supabase=fakeSupabase();
  const store=createStore(blob,fetchImpl);
  return {blob,supabase,login:sessionHandler({supabase}),account:accountHandler({supabase}),vehicles:vehiclesHandler({store,supabase}),photos:photosHandler({store,supabase})};
}
const cookiesFrom=res=>[].concat(res.headers['Set-Cookie']||[]).map(c=>c.split(';')[0]).join('; ');
async function signIn(login,email,password){
  const res=response();await login(request('POST',{email,password}),res);
  return {res,cookie:cookiesFrom(res)};
}

test('Supabase sign-in is limited to the dashboard_users list',async()=>{
  const {supabase,login,vehicles}=setup();
  let res=response();await vehicles(request('GET'),res);assert.equal(res.statusCode,401);
  assert.equal((await signIn(login,'owner@example.com','wrong')).res.statusCode,401);
  const stranger=await signIn(login,'stranger@example.com','stranger-pass-1');
  assert.equal(stranger.res.statusCode,403,'a Supabase login that is not on the list is refused');assert.match(stranger.res.data.error,/dashboard_users/);
  assert.equal(stranger.cookie,'');
  const owner=await signIn(login,' OWNER@example.com ','owner-password-1');
  assert.equal(owner.res.statusCode,200);assert.deepEqual(owner.res.data.user,{email:'owner@example.com',name:'',owner:true});
  assert.match([].concat(owner.res.headers['Set-Cookie']).join(),/HttpOnly; Secure; SameSite=Strict/);
  res=response();await vehicles(request('GET',null,{cookie:owner.cookie}),res);assert.equal(res.statusCode,200);
  const staff=await signIn(login,'sales@example.com','sales-password-1');assert.equal(staff.res.data.user.owner,false);
  supabase.roles.delete('sales@example.com');
  res=response();await vehicles(request('GET',null,{cookie:staff.cookie}),res);assert.equal(res.statusCode,401,'removing someone from the list ends their access');
  res=response();await vehicles(request('GET',null,{cookie:'df_at=forged; df_rt=forged'}),res);assert.equal(res.statusCode,401);
});

test('expired sessions refresh, sign out, password change and reset',async()=>{
  const {supabase,login,account,vehicles}=setup();
  const owner=await signIn(login,'owner@example.com','owner-password-1');
  const access=owner.cookie.match(/df_at=([^;]+)/)[1];
  supabase.tokens.get(access).expired=true;
  let res=response();await vehicles(request('GET',null,{cookie:owner.cookie}),res);
  assert.equal(res.statusCode,200,'an expired access token is refreshed');assert.match(cookiesFrom(res),/df_at=at\d+; df_rt=rt\d+/);
  const refreshed=cookiesFrom(res);
  res=response();await account(request('PATCH',{currentPassword:'nope',newPassword:'brand-new-pass-1'},{cookie:refreshed}),res);assert.equal(res.statusCode,400);
  res=response();await account(request('PATCH',{currentPassword:'owner-password-1',newPassword:'short'},{cookie:refreshed}),res);assert.equal(res.statusCode,400);
  res=response();await account(request('PATCH',{currentPassword:'owner-password-1',newPassword:'brand-new-pass-1'},{cookie:refreshed}),res);assert.equal(res.statusCode,200);
  assert.equal(supabase.accounts.get('owner@example.com').password,'brand-new-pass-1');
  res=response();await login(request('DELETE',null,{cookie:refreshed}),res);assert.match(cookiesFrom(res),/df_at=; df_rt=/);
  res=response();await vehicles(request('GET',null,{cookie:refreshed.replace(/df_rt=[^;]+/,'df_rt=gone')}),res);assert.equal(res.statusCode,401,'signed-out tokens stop working');

  res=response();await login({...request('POST',{action:'recover',email:'owner@example.com'}),headers:{host:'admin.example',origin:'https://admin.example'}},res);
  assert.equal(res.statusCode,200);assert.deepEqual(supabase.log.at(-1),['recover','owner@example.com','https://admin.example/']);
  res=response();await login(request('POST',{action:'recover',email:'nobody@example.com'}),res);assert.equal(res.statusCode,200,'unknown emails get the same answer');
  const {accessToken}=await supabase.signIn('owner@example.com','brand-new-pass-1');
  res=response();await login(request('POST',{action:'reset',accessToken:'bad',password:'reset-pass-123'}),res);assert.equal(res.statusCode,400);
  res=response();await login(request('POST',{action:'reset',accessToken,password:'reset-pass-123'}),res);assert.equal(res.statusCode,200);
  assert.equal((await signIn(login,'owner@example.com','reset-pass-123')).res.statusCode,200);
});

test('new vehicles match the showroom inventory shape',()=>{
  const car=buildVehicle(input,seed.vehicles,{photos:['https://x/1.jpg','https://x/2.jpg']});
  const sample=seed.vehicles[0];
  assert.equal(car.localImage,'https://x/1.jpg');assert.deepEqual(car.photos,['https://x/1.jpg','https://x/2.jpg']);
  assert.throws(()=>buildVehicle(input,seed.vehicles,{photos:[]}),/at least one photo/);
  for(const key of ['make','model','variant','year','value','mile','colour','body_type','transmission','fuelType','stock_code','localImage','description','features','id'])assert.ok(key in car,key);
  assert.equal(typeof car.year,typeof sample.year);
  assert.equal(car.value,659995);assert.equal(car.mile,31200);assert.equal(car.stock_code,'ZZ90001');
  assert.equal(car.id,Math.max(...seed.vehicles.map(c=>c.id))+1);
  assert.deepEqual(car.features,['Tow bar','Canopy']);
  assert.equal(car.description.length,2);assert.match(car.description[1],/R 659 995/);
  assert.throws(()=>buildVehicle({...input,stockCode:sample.stock_code},seed.vehicles,{photos:['x']}),/already listed/);
  assert.throws(()=>buildVehicle({...input,price:'abc'},seed.vehicles,{photos:['x']}),/valid price/);
  assert.throws(()=>buildVehicle({...input,bodyType:'Tank'},seed.vehicles,{photos:['x']}),/body type/);
});

test('photos, prices, order and removal end to end',async()=>{
  const {blob,login,vehicles,photos}=setup();
  const {cookie}=await signIn(login,'owner@example.com','owner-password-1');
  const call=async(handler,method,body,query={})=>{const res=response();await handler(request(method,body,{cookie,query}),res);return res;};
  const photoFiles=()=>[...blob.files.keys()].filter(k=>k.startsWith('vehicles/'));
  let res=await call(vehicles,'GET');assert.equal(res.data.vehicles.length,49);

  res=await call(photos,'POST',{photo:'data:image/png;base64,AAAA'});assert.equal(res.statusCode,400);
  const urls=[];
  for(let i=0;i<3;i++){res=await call(photos,'POST',{photo:jpeg});assert.equal(res.statusCode,201);urls.push(res.data.url);}
  assert.equal(photoFiles().length,3);
  res=await call(vehicles,'POST',{vehicle:input,photos:['https://evil.example/x.jpg']});assert.equal(res.statusCode,400);
  res=await call(vehicles,'POST',{vehicle:{...input,colour:''},photos:urls});assert.equal(res.statusCode,400);
  res=await call(vehicles,'POST',{vehicle:input,photos:urls});assert.equal(res.statusCode,201);
  const added=res.data.vehicle;assert.deepEqual(added.photos,urls);assert.equal(added.localImage,urls[0]);
  let published=JSON.parse(blob.files.get('inventory.json').body);
  assert.equal(published.vehicles.length,50);assert.equal(published.vehicles[0].stock_code,'ZZ90001');
  res=await call(photos,'DELETE',null,{url:urls[0]});assert.equal(res.statusCode,409,'photos in use cannot be discarded');

  res=await call(vehicles,'PATCH',{action:'price',id:added.id,price:'abc'});assert.equal(res.statusCode,400);
  res=await call(vehicles,'PATCH',{action:'price',id:added.id,price:'R 649 995'});assert.equal(res.statusCode,200);
  assert.equal(res.data.vehicle.value,649995);assert.equal(res.data.vehicle.price,'649 995');
  assert.match(res.data.vehicle.description[1],/R 649 995/);assert.doesNotMatch(res.data.vehicle.description.join(' '),/R 659 995/);
  const original=seed.vehicles[0];
  res=await call(vehicles,'PATCH',{action:'price',id:original.id,price:'2300000'});assert.equal(res.data.vehicle.value,2300000);
  assert.match(res.data.vehicle.description.join(' '),/R 2 300 000/);

  res=await call(vehicles,'GET');const ids=res.data.vehicles.map(c=>String(c.id));
  const reordered=[ids[3],...ids.filter(id=>id!==ids[3])];
  res=await call(vehicles,'PATCH',{action:'order',ids:reordered.slice(1)});assert.equal(res.statusCode,409,'a partial order is rejected');
  res=await call(vehicles,'PATCH',{action:'order',ids:[...reordered.slice(0,-1),reordered[0]]});assert.equal(res.statusCode,409,'duplicates are rejected');
  res=await call(vehicles,'PATCH',{action:'order',ids:reordered});assert.equal(res.statusCode,200);
  published=JSON.parse(blob.files.get('inventory.json').body);
  assert.deepEqual(published.vehicles.map(c=>String(c.id)),reordered);

  res=await call(photos,'POST',{photo:jpeg});const extra=res.data.url;
  res=await call(vehicles,'PATCH',{action:'photos',id:added.id,photos:[urls[2],extra,urls[0]]});assert.equal(res.statusCode,200);
  assert.equal(res.data.vehicle.localImage,urls[2]);
  assert.ok(!photoFiles().some(k=>urls[1].endsWith(k)),'a photo taken out is deleted');
  res=await call(vehicles,'PATCH',{action:'photos',id:added.id,photos:[]});assert.equal(res.statusCode,400);
  res=await call(photos,'POST',{photo:jpeg});
  res=await call(vehicles,'PATCH',{action:'photos',id:original.id,photos:[original.localImage,res.data.url]});assert.equal(res.statusCode,200,'original site photos can be kept alongside new ones');
  res=await call(vehicles,'PATCH',{action:'photos',id:original.id,photos:['assets/somebody-elses.jpg']});assert.equal(res.statusCode,400);

  res=await call(photos,'POST',{photo:jpeg});const unused=res.data.url;
  res=await call(photos,'DELETE',null,{url:unused});assert.equal(res.statusCode,200,'cancelled uploads are discarded');

  res=await call(vehicles,'DELETE',null,{id:String(added.id)});assert.equal(res.statusCode,200);
  res=await call(vehicles,'DELETE',null,{id:String(added.id)});assert.equal(res.statusCode,404);
  res=await call(vehicles,'GET');assert.equal(res.data.vehicles.length,49);
  assert.equal(photoFiles().length,1,'only the photo still used by the original vehicle remains');
});
