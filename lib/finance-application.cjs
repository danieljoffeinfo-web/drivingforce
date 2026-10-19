const {createHash} = require('node:crypto');
const steps = require('../dist/application-fields.json');
const {bundledVehicles,liveVehicles} = require('./live-inventory.cjs');
const {escapeHtml,estimate,money,vehicleTitle} = require('../dist/finance-utils.js');
const schema = steps.flatMap(step=>step.fields).filter(field=>!field.readonly);
const categories = ['Proof of identity','Proof of residence','Payslip','Bank statement','Driver’s licence','Additional document'];
const maximumBytes = 3 * 1024 * 1024;
const attempts = new Map(), completed = new Map();
class ApplicationError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function validate(payload, vehicles=bundledVehicles) {
  if(!payload || typeof payload !== 'object' || Array.isArray(payload))throw new ApplicationError('An application is required.');
  if(payload.website)throw new ApplicationError('This application could not be accepted.');
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(payload.submissionId||''))throw new ApplicationError('Please reload the application and try again.');
  if(payload.consentProcessing!==true||payload.consentCredit!==true||payload.confirmAccuracy!==true)throw new ApplicationError('Please review and accept the application declarations.');
  if(!payload.fields||typeof payload.fields!=='object'||Array.isArray(payload.fields))throw new ApplicationError('Application details are required.');
  const fields={};
  for(const field of schema){
    const raw=payload.fields[field.id];
    if(raw!==undefined && typeof raw!=='string')throw new ApplicationError('Invalid '+field.label+'.');
    const value=(raw||'').trim();
    if(field.required&&!value)throw new ApplicationError('Please complete '+field.label+'.');
    if(value.length>(field.type==='textarea'?1500:200))throw new ApplicationError(field.label+' is too long.');
    if(value && field.type==='number' && (!Number.isFinite(Number(value)) || Number(value)<0 || Number(value)>(field.max??100000000)))throw new ApplicationError('Enter a valid '+field.label.toLowerCase()+'.');
    if(value && field.type==='email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new ApplicationError('Enter a valid email address.');
    if(value && field.type==='select' && !field.options.some(option=>option.value===value))throw new ApplicationError('Choose a valid '+field.label.toLowerCase()+'.');
    if(value && field.type==='date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))))throw new ApplicationError('Enter a valid '+field.label.toLowerCase()+'.');
    fields[field.id]=value;
  }
  const vehicle=payload.vehicleId?vehicles.find(vehicle=>String(vehicle.id)===String(payload.vehicleId)):null;
  if(payload.vehicleId&&!vehicle)throw new ApplicationError('Please choose an available vehicle or leave the vehicle selection blank.');
  const tradeIn=Number(fields.netTradeIn||0);
  if(vehicle && Number(fields.deposit||0)+tradeIn>vehicle.value)throw new ApplicationError('The deposit and net trade-in cannot exceed the vehicle price.');
  if(!Array.isArray(payload.documents)||payload.documents.length>6)throw new ApplicationError('Choose up to six supporting documents.');
  let totalBytes=0;const attachments={};
  payload.documents.forEach((document,index)=>{
    if(!document||typeof document.name!=='string'||document.name.length>200||!categories.includes(document.category))throw new ApplicationError('Choose a category for each document.');
    if(!['application/pdf','image/jpeg','image/png'].includes(document.type)||typeof document.data!=='string')throw new ApplicationError('Only PDF, JPG and PNG documents are accepted.');
    const prefix='data:'+document.type+';base64,';
    if(!document.data.startsWith(prefix))throw new ApplicationError('A document could not be read.');
    const base64=document.data.slice(prefix.length);
    if(!base64||base64.length>maximumBytes*4/3+4||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new ApplicationError('A document is invalid or too large.');
    const bytes=Buffer.from(base64,'base64');totalBytes+=bytes.length;
    const valid=document.type==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':document.type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    if(!valid)throw new ApplicationError('A document does not match its file type.');
    const extension={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'}[document.type];
    const filename=String(index+1).padStart(2,'0')+'-'+document.category.replace(/[^a-z0-9]+/gi,'-').toLowerCase()+'.'+extension;
    attachments[filename]=document.data;
  });
  if(totalBytes>maximumBytes)throw new ApplicationError('Supporting documents must total 3 MB or less.',413);
  return {fields,vehicle,attachments,submissionId:payload.submissionId,tradeIn,marketing:payload.marketing===true};
}
function messageFor(application) {
  const {fields,vehicle,tradeIn}=application;
  const reference='DF-'+application.submissionId.slice(0,8).toUpperCase();
  let message='<h2>Driving Force finance application</h2><p>Reference: '+reference+'</p>';
  if(vehicle)message+='<h3>Selected vehicle</h3><p>'+escapeHtml(vehicle.year+' '+vehicleTitle(vehicle)+' '+vehicle.variant)+'</p><p>Stock: '+escapeHtml(vehicle.stock_code)+'<br>Price: '+money(vehicle.value)+'</p>';
  else message+='<p>Vehicle not selected yet.</p>';
  for(const step of steps){
    if(!step.fields.length)continue;
    message+='<h3>'+escapeHtml(step.title)+'</h3><table>';
    for(const field of step.fields.filter(field=>!field.readonly)){
      let value=fields[field.id];if(!value)continue;
      if(field.type==='select')value=field.options.find(option=>option.value===value)?.label||value;
      message+='<tr><td>'+escapeHtml(field.label)+'</td><td>'+escapeHtml(value)+'</td></tr>';
    }
    message+='</table>';
  }
  const expenses=['bondRepayment','transportation','vehicleInstalments','education','creditCards','householdExpenses','clothingAccounts','utilitiesRatesTaxes','policyInsurance','loans','furnitureAccounts','bankingCosts','telephoneInternet','foodEntertainment','medical','maintenance','other'];
  const totalExpenses=expenses.reduce((total,key)=>total+Number(fields[key]||0),0);
  const disposable=Number(fields.netSalary||0)+Number(fields.otherIncome||0)-totalExpenses;
  message+='<h3>Monthly totals</h3><p>Expenses: '+money(totalExpenses)+'<br>Disposable income: '+money(disposable)+'</p>';
  const result=vehicle?estimate({price:vehicle.value,deposit:Number(fields.deposit||0),tradeIn,rate:Number(fields.interestRate||0),term:Number(fields.repaymentPeriod)}):null;
  if(result)message+='<h3>Illustrative estimate</h3><p>Net trade-in: '+money(tradeIn)+'<br>Amount financed: '+money(result.principal)+'<br>Monthly payment: '+money(result.monthly)+'</p><p>Estimate excludes fees, insurance and balloon payments. Not a credit approval.</p>';
  message+='<h3>Declarations</h3><p>Applicant expressly agreed to application processing and sharing with finance providers, necessary credit checks, and accuracy and authority to supply these details.<br>Optional marketing consent: '+(application.marketing?'Yes':'No')+'</p>';
  return {reference,message};
}
function createHandler({fetchImpl=fetch,now=Date.now,loadVehicles=liveVehicles}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use the finance application to submit a request.'});}
    try{
      let origin;try{origin=new URL(req.headers.origin);}catch{throw new ApplicationError('Open the finance application on this website to submit it.',403);}
      if(origin.host!==req.headers.host || !['https:','http:'].includes(origin.protocol))throw new ApplicationError('Applications must be submitted from this website.',403);
      if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new ApplicationError('Send a valid application.',415);
      if(Number(req.headers['content-length']||0)>4.3*1024*1024)throw new ApplicationError('The application is too large. Reduce the document sizes.',413);
      let body=req.body;
      if(typeof body==='string'){try{body=JSON.parse(body);}catch{throw new ApplicationError('The application could not be read.');}}
      const application=validate(body,await loadVehicles());
      const timestamp=now();
      for(const [key,value] of attempts)if(timestamp-value.start>600000)attempts.delete(key);
      for(const [key,value] of completed)if(timestamp-value.time>600000)completed.delete(key);
      const prior=completed.get(application.submissionId);
      if(prior)return res.status(200).json({accepted:true,reference:prior.reference});
      const key=createHash('sha256').update(String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown')).digest('hex');
      const attempt=attempts.get(key)||{start:timestamp,count:0};
      if(attempt.count>=4)throw new ApplicationError('Please wait a few minutes before submitting another application, or call 021 203 8888.',429);
      attempt.count++;attempts.set(key,attempt);
      const {reference,message}=messageFor(application);
      // This fixed recipient and endpoint match Driving Force's existing EazyFin application.
      // Applicant fields never control recipients, sender addresses or the destination URL.
      const response=await fetchImpl('https://newsendemail.vmgsoftware.co.za/api/sendemail',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(20000),body:JSON.stringify({notification:{ToList:'info@drivingforce.biz',CcList:'',BccList:'',Subject:'Driving Force Finance Application '+reference,Message:message,ToName:'Driving Force',FromName:'Driving Force website',FromEmail:'NoReply@eazyfin.co.za',Attachments:application.attachments}})});
      const text=await response.text();
      let provider;try{provider=JSON.parse(text);}catch{provider=null;}
      if(!response.ok||provider===false||provider?.success===false||provider?.error||/^(error|failed|failure)\b/i.test(text.trim()))throw new ApplicationError('The delivery service could not confirm this application. Please call 021 203 8888 before trying again.',502);
      completed.set(application.submissionId,{reference,time:timestamp});
      return res.status(200).json({accepted:true,reference});
    }catch(error){
      const known=error instanceof ApplicationError;
      return res.status(known?error.status:502).json({error:known?error.message:'The application could not be confirmed. Your details remain on this page. Please call 021 203 8888 before trying again.'});
    }
  };
}
module.exports={createHandler,validate,messageFor,ApplicationError};
