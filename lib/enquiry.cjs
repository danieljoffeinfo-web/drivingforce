const {createHash} = require('node:crypto');
const {bundledVehicles,liveVehicles} = require('./live-inventory.cjs');
const {escapeHtml,money,vehicleTitle} = require('../dist/finance-utils.js');
const attempts = new Map();
const fallback = 'Please WhatsApp us on 082 425 4253 or call 021 203 8888.';
// Everyone who receives website enquiries. ENQUIRY_TO (comma-separated) overrides this in the hosting environment.
const defaultRecipients = ['danny@drivingforce.biz','danieljoffeinfo@gmail.com','tyron@drivingforce.biz'];
class EnquiryError extends Error {constructor(message,status=400){super(message);this.status=status;}}
function validate(payload, vehicles=bundledVehicles) {
  if(!payload || typeof payload !== 'object' || Array.isArray(payload))throw new EnquiryError('An enquiry is required.');
  if(payload.website)throw new EnquiryError('This enquiry could not be accepted.');
  const text=(key,max,label,required=true)=>{
    const raw=payload[key];
    if(raw!==undefined && typeof raw!=='string')throw new EnquiryError('Invalid '+label+'.');
    const value=(raw||'').trim();
    if(required&&!value)throw new EnquiryError('Please enter your '+label+'.');
    if(value.length>max)throw new EnquiryError('Your '+label+' is too long.');
    return value;
  };
  const enquiry={name:text('name',100,'name'),email:text('email',200,'email address'),phone:text('phone',30,'phone number',false),message:text('message',2000,'message')};
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiry.email))throw new EnquiryError('Enter a valid email address.');
  if(enquiry.phone && !/^\+?[0-9 ()-]{7,20}$/.test(enquiry.phone))throw new EnquiryError('Enter a valid phone number.');
  enquiry.vehicle=payload.vehicleId?vehicles.find(vehicle=>String(vehicle.id)===String(payload.vehicleId)):null;
  if(payload.vehicleId&&!enquiry.vehicle)throw new EnquiryError('This vehicle is no longer listed. '+fallback);
  return enquiry;
}
function messageFor({name,email,phone,message,vehicle}) {
  const car=vehicle?vehicle.year+' '+vehicleTitle(vehicle):null;
  const subject=car?'Website enquiry: '+car+' ('+vehicle.stock_code+')':'Website enquiry from '+name;
  let html='<h2>Driving Force website enquiry</h2>';
  if(vehicle)html+='<h3>Vehicle</h3><p>'+escapeHtml(car+' ('+vehicle.variant+')')+'<br>Stock: '+escapeHtml(vehicle.stock_code)+'<br>Price: '+money(vehicle.value)+'</p>';
  html+='<h3>Customer</h3><table><tr><td>Name</td><td>'+escapeHtml(name)+'</td></tr><tr><td>Email</td><td>'+escapeHtml(email)+'</td></tr><tr><td>Phone</td><td>'+escapeHtml(phone||'Not given')+'</td></tr></table>';
  html+='<h3>Message</h3><p>'+escapeHtml(message).replace(/\n/g,'<br>')+'</p><p><small>Reply to this email to answer the customer directly.</small></p>';
  return {subject,html};
}
function createHandler({fetchImpl=fetch,now=Date.now,env=process.env,loadVehicles=liveVehicles}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Use the enquiry form to send a message.'});}
    try{
      let origin;try{origin=new URL(req.headers.origin);}catch{throw new EnquiryError('Open the enquiry form on this website to send it.',403);}
      if(origin.host!==req.headers.host || !['https:','http:'].includes(origin.protocol))throw new EnquiryError('Enquiries must be sent from this website.',403);
      if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new EnquiryError('Send a valid enquiry.',415);
      if(Number(req.headers['content-length']||0)>20*1024)throw new EnquiryError('The enquiry is too long.',413);
      let body=req.body;
      if(typeof body==='string'){try{body=JSON.parse(body);}catch{throw new EnquiryError('The enquiry could not be read.');}}
      const enquiry=validate(body,await loadVehicles());
      // Resend is configured in the hosting environment; customers never control the sender or recipients.
      const apiKey=env.RESEND_API_KEY, from=env.ENQUIRY_FROM||'Driving Force Website <onboarding@resend.dev>';
      const recipients=(env.ENQUIRY_TO||defaultRecipients.join(',')).split(',').map(address=>address.trim()).filter(Boolean);
      if(!apiKey)throw new EnquiryError('Email enquiries are not available right now. '+fallback,503);
      const timestamp=now();
      for(const [key,value] of attempts)if(timestamp-value.start>600000)attempts.delete(key);
      const key=createHash('sha256').update(String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown')).digest('hex');
      const attempt=attempts.get(key)||{start:timestamp,count:0};
      if(attempt.count>=5)throw new EnquiryError('Please wait a few minutes before sending another enquiry. '+fallback,429);
      attempt.count++;attempts.set(key,attempt);
      const {subject,html}=messageFor(enquiry);
      // One email per recipient, so an address Resend refuses (for example while the sending domain is
      // unverified, when only the account owner's address is accepted) does not stop the others.
      const results=await Promise.all(recipients.map(async address=>{
        try{
          const response=await fetchImpl('https://api.resend.com/emails',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000),body:JSON.stringify({from,to:[address],reply_to:enquiry.email,subject,html})});
          if(response.ok)return true;
          // Log only Resend's reason (e.g. an unverified recipient), never customer details.
          const reason=await response.text().catch(()=>'');
          console.error('Resend rejected enquiry for',address,response.status,reason.slice(0,300));
        }catch(error){console.error('Resend request failed for',address,error.message);}
        return false;
      }));
      if(!results.some(Boolean))throw new EnquiryError('Your enquiry could not be sent. '+fallback,502);
      return res.status(200).json({accepted:true});
    }catch(error){
      const known=error instanceof EnquiryError;
      return res.status(known?error.status:502).json({error:known?error.message:'Your enquiry could not be sent. '+fallback});
    }
  };
}
module.exports={createHandler,validate,messageFor,EnquiryError,defaultRecipients};
