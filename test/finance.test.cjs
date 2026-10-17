const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {estimate}=require('../dist/finance-utils.js');
const {validate,messageFor,createHandler}=require('../lib/finance-application.cjs');
const steps=require('../dist/application-fields.json');
function payload(){
  const fields={};
  for(const field of steps.flatMap(step=>step.fields).filter(field=>field.required))fields[field.id]=field.type==='select'?field.options[0].value:field.type==='number'?'10000':'Example';
  Object.assign(fields,{name:'Example',surname:'Applicant',id:'TEST-PASSPORT',phone:'0000000000',email:'example@example.com',repaymentPeriod:'72',interestRate:'12',deposit:'0'});
  return {submissionId:randomUUID(),fields,vehicleId:'2746',documents:[],consentProcessing:true,consentCredit:true,confirmAccuracy:true,marketing:false,website:''};
}
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(data){this.data=data;return this;}};}
function request(body){return {method:'POST',headers:{origin:'https://example.test',host:'example.test','content-type':'application/json','x-forwarded-for':randomUUID()},body};}
test('standard finance estimate matches amortisation, including trade-in and zero interest',()=>{
  const result=estimate({price:500000,deposit:25000,tradeIn:25000,rate:12,term:72});
  assert.ok(Math.abs(result.monthly-8797.586342)<.01);assert.equal(result.principal,450000);
  assert.equal(estimate({price:500000,deposit:50000,rate:0,term:72}).monthly,6250);
  assert.equal(estimate({price:500000,deposit:500000,rate:12,term:72}).monthly,0);
});
test('invalid finance amounts cannot produce a quoted payment',()=>{
  for(const overrides of [{deposit:400000,tradeIn:200000},{rate:-1},{term:0},{price:NaN},{deposit:-1}])assert.equal(estimate({price:500000,rate:12,term:72,...overrides}),null);
});
test('application requires explicit declarations and complete required fields',()=>{
  const valid=payload();assert.equal(validate(valid).vehicle.id,2746);
  for(const key of ['consentProcessing','consentCredit','confirmAccuracy'])assert.throws(()=>validate({...valid,[key]:false}));
  assert.throws(()=>validate({...valid,fields:{...valid.fields,email:'bad'}}));
  assert.throws(()=>validate({...valid,fields:{...valid.fields,name:''}}));
  assert.throws(()=>validate({...valid,vehicleId:'not-a-vehicle'}));
});
test('uploaded documents must match their declared type and fit the total limit',()=>{
  const valid=payload();const pdf={name:'example.pdf',type:'application/pdf',category:'Proof of identity',data:'data:application/pdf;base64,'+Buffer.from('%PDF-1.4\nExample test fixture').toString('base64')};
  assert.equal(Object.keys(validate({...valid,documents:[pdf]}).attachments).length,1);
  assert.throws(()=>validate({...valid,documents:[{...pdf,data:'data:application/pdf;base64,'+Buffer.from('<script>bad</script>').toString('base64')}]}));
  assert.throws(()=>validate({...valid,documents:[{...pdf,category:'unknown'}]}));
  const large=Buffer.alloc(3*1024*1024+1);large.write('%PDF-');
  assert.throws(()=>validate({...valid,documents:[{...pdf,data:'data:application/pdf;base64,'+large.toString('base64')}]}));
});
test('application values are escaped and cannot choose email recipients',async()=>{
  const body=payload();body.fields.name='<script>test</script>';body.ToList='unexpected@example.com';
  const html=messageFor(validate(body)).message;assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
  let sent;const handler=createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,fetchImpl:async(url,options)=>{sent={url,...JSON.parse(options.body)};return {ok:true,text:async()=>'{"success":true}'};}});
  const res=response();await handler(request(body),res);
  assert.equal(res.statusCode,200);assert.equal(res.data.accepted,true);assert.equal(sent.notification.ToList,'info@drivingforce.biz');assert.equal(sent.notification.BccList,'');assert.equal(res.headers['Cache-Control'],'no-store');
});
test('errors and timeouts never report a submitted application',async()=>{
  for(const fetchImpl of [async()=>({ok:false,text:async()=>'failure'}),async()=>({ok:true,text:async()=>'{"success":false}'}),async()=>{throw Error('timeout');}]){
    const res=response();await createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,fetchImpl})(request(payload()),res);assert.equal(res.statusCode,502);assert.equal(res.data.accepted,undefined);
  }
});
test('cross-origin and invalid requests are rejected before delivery',async()=>{
  let calls=0;const handler=createHandler({loadVehicles:async()=>require('../dist/vehicles.json').vehicles,fetchImpl:async()=>{calls++;throw Error();}});
  const badOrigin=request(payload());badOrigin.headers.origin='https://another.test';const a=response();await handler(badOrigin,a);assert.equal(a.statusCode,403);
  const b=response();await handler(request({}),b);assert.equal(b.statusCode,400);
  const c=response();await handler({...request(payload()),method:'GET'},c);assert.equal(c.statusCode,405);assert.equal(calls,0);
});

test('application uses visible trade-in details and recomputes expense totals',()=>{
  const body=payload();Object.assign(body.fields,{netTradeIn:'20000',netSalary:'20000',otherIncome:'1000',bondRepayment:'5000',foodEntertainment:'2000'});
  const application=validate(body);assert.equal(application.tradeIn,20000);
  const html=messageFor(application).message;assert.ok(html.includes('Expenses: R 7'));assert.ok(html.includes('Disposable income: R 14'));
  assert.throws(()=>validate({...body,fields:{...body.fields,deposit:'2390000'}}));
});
test('vehicle selections are checked against the live admin inventory',()=>{
  const added={...require('../dist/vehicles.json').vehicles[0],id:9001,stock_code:'NEW1'};
  assert.equal(validate({...payload(),vehicleId:'9001'},[added]).vehicle.stock_code,'NEW1');
  assert.throws(()=>validate(payload(),[added]),/available vehicle/);
});
