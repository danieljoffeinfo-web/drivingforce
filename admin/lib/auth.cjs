const {createHmac,timingSafeEqual,randomBytes,scryptSync,createCipheriv,createDecipheriv,createHash}=require('node:crypto');
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
const normaliseEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=200;
function hashPassword(password,salt=randomBytes(16).toString('base64url')){
  return {salt,hash:scryptSync(password,salt,32,{N:16384,r:8,p:1}).toString('base64url')};
}
// A fixed dummy hash keeps the response time the same whether or not the email exists.
const dummy=hashPassword('not-a-real-password','dummy-salt');
function verifyPassword(user,password){
  if(typeof password!=='string'||password.length>200)return false;
  const target=user||dummy;
  const ok=same(hashPassword(password,target.salt).hash,target.hash);
  return Boolean(user)&&ok;
}
// The session is tied to the password salt, so changing or resetting a password signs out its other sessions.
function createSession(user,now=Date.now()){
  const payload=Buffer.from(user.email).toString('base64url')+'.'+user.salt.slice(0,8)+'.'+(now+lifetime)+'.'+randomBytes(9).toString('base64url');
  return payload+'.'+sign(payload);
}
function readCookie(req){
  for(const part of String(req.headers.cookie||'').split(';')){const [key,...rest]=part.trim().split('=');if(key===cookieName)return rest.join('=');}
  return '';
}
function readSession(req,now=Date.now()){
  const parts=readCookie(req).split('.');
  if(parts.length!==5)return null;
  const payload=parts.slice(0,4).join('.');
  if(!same(sign(payload),parts[4])||Number(parts[2])<=now)return null;
  return {email:Buffer.from(parts[0],'base64url').toString(),saltPrefix:parts[1]};
}
function sessionCookie(token){return cookieName+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+lifetime/1000;}
const clearedCookie=cookieName+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
function throttled(keys,now=Date.now()){
  for(const [k,v] of failures)if(now-v.start>900000)failures.delete(k);
  return keys.some(key=>(failures.get(key)?.count||0)>=8);
}
function recordFailure(keys,now=Date.now()){for(const key of keys){const f=failures.get(key)||{start:now,count:0};f.count++;failures.set(key,f);}}
function sameOrigin(req){
  try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}
}
// Accounts are kept in the public Blob store, so the file is encrypted with DATA_KEY.
function dataKey(){
  const value=process.env.DATA_KEY||'';
  if(value.length<32)throw new Error('DATA_KEY is not configured.');
  return createHash('sha256').update(value).digest();
}
function encrypt(data){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',dataKey(),iv);
  const body=Buffer.concat([cipher.update(JSON.stringify(data)),cipher.final()]);
  return JSON.stringify({v:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:body.toString('base64')});
}
function decrypt(text){
  const box=JSON.parse(text),decipher=createDecipheriv('aes-256-gcm',dataKey(),Buffer.from(box.iv,'base64'));
  decipher.setAuthTag(Buffer.from(box.tag,'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(box.data,'base64')),decipher.final()]).toString());
}
module.exports={normaliseEmail,validEmail,hashPassword,verifyPassword,createSession,readSession,sessionCookie,clearedCookie,throttled,recordFailure,sameOrigin,encrypt,decrypt};
