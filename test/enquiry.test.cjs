const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {validate,messageFor,createHandler}=require('../lib/enquiry.cjs');
const env={RESEND_API_KEY:'re_test',ENQUIRY_FROM:'Driving Force <enquiries@example.test>'};
const payload=()=>({name:'Example Customer',email:'customer@example.com',phone:'082 000 0000',message:'Is this car still available?',vehicleId:'2746',website:''});
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};}
function request(body){return {method:'POST',headers:{origin:'https://example.test',host:'example.test','content-type':'application/json','x-forwarded-for':randomUUID()},body};}
test('enquiry requires contact details and a listed vehicle',()=>{
  assert.equal(validate(payload()).vehicle.stock_code,'TP12828');
  assert.equal(validate({...payload(),vehicleId:''}).vehicle,null);
  for(const change of [{name:''},{email:'bad'},{message:''},{phone:'call me'},{vehicleId:'missing'},{website:'bot'},{message:'x'.repeat(2001)}])assert.throws(()=>validate({...payload(),...change}));
});
test('enquiry email escapes values and names the vehicle',()=>{
  const {subject,html}=messageFor(validate({...payload(),message:'<b>hi</b>\nthere'}));
  assert.match(subject,/2020 Porsche 911 Carrera S \(TP12828\)/);
  assert.match(html,/&lt;b&gt;hi&lt;\/b&gt;<br>there/);assert.match(html,/R\s2\s395\s995/);
});
test('enquiry is sent through Resend to each fixed recipient with the customer as reply-to',async()=>{
  const sent=[];const handler=createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,env,fetchImpl:async(url,options)=>{sent.push({url,options});return new Response('{"id":"1"}',{status:200});}});
  const res=response();await handler(request({...payload(),to:'attacker@example.com'}),res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(sent.map(s=>JSON.parse(s.options.body).to),[['danny@drivingforce.biz'],['danieljoffeinfo@gmail.com'],['tyron@drivingforce.biz']]);
  for(const {url,options} of sent){
    const body=JSON.parse(options.body);
    assert.equal(url,'https://api.resend.com/emails');assert.equal(body.reply_to,'customer@example.com');assert.equal(body.from,env.ENQUIRY_FROM);
    assert.equal(options.headers.Authorization,'Bearer re_test');
  }
});
test('one refused recipient does not stop the others, and ENQUIRY_TO overrides the list',async()=>{
  const delivered=[];
  const fetchImpl=async(url,options)=>{const [to]=JSON.parse(options.body).to;if(to!=='danieljoffeinfo@gmail.com')return new Response('{"message":"You can only send testing emails to your own email address"}',{status:403});delivered.push(to);return new Response('{"id":"1"}',{status:200});};
  const errors=console.error;console.error=()=>{};
  try{
    let res=response();await createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,env,fetchImpl})(request(payload()),res);
    assert.equal(res.statusCode,200);assert.deepEqual(delivered,['danieljoffeinfo@gmail.com']);
    const to=[];res=response();
    await createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,env:{...env,ENQUIRY_TO:'a@example.test, b@example.test'},fetchImpl:async(url,options)=>{to.push(...JSON.parse(options.body).to);return new Response('{}',{status:200});}})(request(payload()),res);
    assert.deepEqual(to,['a@example.test','b@example.test']);
  }finally{console.error=errors;}
});
test('enquiry uses the Resend onboarding sender when no domain sender is configured',async()=>{
  let body;const handler=createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,env:{RESEND_API_KEY:'re_test'},fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return new Response('{"id":"1"}',{status:200});}});
  const res=response();await handler(request(payload()),res);
  assert.equal(res.statusCode,200);assert.equal(body.from,'Driving Force Website <onboarding@resend.dev>');
});
test('enquiry reports missing configuration, provider failures and cross-site requests',async()=>{
  let res=response();await createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,env:{},fetchImpl:()=>assert.fail('should not send')})(request(payload()),res);
  assert.equal(res.statusCode,503);assert.match(res.data.error,/082 425 4253/);
  const errors=console.error;console.error=()=>{};
  res=response();await createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,env,fetchImpl:async()=>new Response('{}',{status:422})})(request(payload()),res);
  console.error=errors;
  assert.equal(res.statusCode,502);
  res=response();const req=request(payload());req.headers.origin='https://other.test';
  await createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,env,fetchImpl:()=>assert.fail('should not send')})(req,res);assert.equal(res.statusCode,403);
});
test('enquiries accept vehicles that exist only in the live admin inventory',()=>{
  const added={...require('../dist/vehicles.json').vehicles[0],id:9001,stock_code:'NEW1'};
  assert.equal(validate({...payload(),vehicleId:'9001'},[added]).vehicle.stock_code,'NEW1');
});
