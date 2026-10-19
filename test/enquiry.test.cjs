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
test('enquiry is sent through Resend to the fixed recipient with the customer as reply-to',async()=>{
  let sent;const handler=createHandler({env,fetchImpl:async(url,options)=>{sent={url,options};return new Response('{"id":"1"}',{status:200});}});
  const res=response();await handler(request({...payload(),to:'attacker@example.com'}),res);
  assert.equal(res.statusCode,200);assert.equal(sent.url,'https://api.resend.com/emails');
  const body=JSON.parse(sent.options.body);
  assert.deepEqual(body.to,['info@drivingforce.biz']);assert.equal(body.reply_to,'customer@example.com');assert.equal(body.from,env.ENQUIRY_FROM);
  assert.equal(sent.options.headers.Authorization,'Bearer re_test');
});
test('enquiry reports missing configuration, provider failures and cross-site requests',async()=>{
  let res=response();await createHandler({env:{},fetchImpl:()=>assert.fail('should not send')})(request(payload()),res);
  assert.equal(res.statusCode,503);assert.match(res.data.error,/082 425 4253/);
  res=response();await createHandler({env,fetchImpl:async()=>new Response('{}',{status:422})})(request(payload()),res);
  assert.equal(res.statusCode,502);
  res=response();const req=request(payload());req.headers.origin='https://other.test';
  await createHandler({env,fetchImpl:()=>assert.fail('should not send')})(req,res);assert.equal(res.statusCode,403);
});
