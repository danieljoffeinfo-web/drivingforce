const {createHmac,timingSafeEqual,randomBytes}=require('node:crypto');
const cookieName='df_admin';
const lifetime=12*60*60*1000;
const failures=new Map();
function secret(){
  const value=process.env.SESSION_SECRET||'';
  if(value.length<32)throw new Error('SESSION_SECRET is not configured.');
  return value;
}
const sign=payload=>createHmac('sha256',secret()).update(payload).digest('base64url');
function same(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
function passwordMatches(candidate){
  const expected=process.env.ADMIN_PASSWORD||'';
  if(expected.length<8||typeof candidate!=='string')return false;
  // Compare digests so the comparison takes the same time whatever the input length.
  const digest=value=>createHmac('sha256','df-admin-password').update(value).digest();
  return timingSafeEqual(digest(candidate),digest(expected));
}
function createSession(now=Date.now()){
  const payload=(now+lifetime)+'.'+randomBytes(12).toString('base64url');
  return payload+'.'+sign(payload);
}
function readCookie(req){
  const header=String(req.headers.cookie||'');
  for(const part of header.split(';')){const [key,...rest]=part.trim().split('=');if(key===cookieName)return rest.join('=');}
  return '';
}
function isAuthenticated(req,now=Date.now()){
  const token=readCookie(req);const parts=token.split('.');
  if(parts.length!==3)return false;
  const payload=parts[0]+'.'+parts[1];
  return same(sign(payload),parts[2])&&Number(parts[0])>now;
}
function sessionCookie(token){return cookieName+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+lifetime/1000;}
const clearedCookie=cookieName+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
function throttled(key,now=Date.now()){
  for(const [k,v] of failures)if(now-v.start>900000)failures.delete(k);
  return (failures.get(key)?.count||0)>=8;
}
function recordFailure(key,now=Date.now()){const f=failures.get(key)||{start:now,count:0};f.count++;failures.set(key,f);}
function sameOrigin(req){
  try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}
}
module.exports={passwordMatches,createSession,isAuthenticated,sessionCookie,clearedCookie,throttled,recordFailure,sameOrigin};
