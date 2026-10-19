const {createHash}=require('node:crypto');
const accessCookie='df_at',refreshCookie='df_rt';
const refreshLifetime=30*24*60*60;
const failures=new Map(),verified=new Map();
const normaliseEmail=value=>typeof value==='string'?value.trim().toLowerCase():'';
const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=200;
function readCookie(req,name){
  for(const part of String(req.headers.cookie||'').split(';')){const [key,...rest]=part.trim().split('=');if(key===name)return decodeURIComponent(rest.join('='));}
  return '';
}
const cookie=(name,value,maxAge)=>name+'='+encodeURIComponent(value)+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge;
const sessionCookies=s=>[cookie(accessCookie,s.accessToken,refreshLifetime),cookie(refreshCookie,s.refreshToken,refreshLifetime)];
const clearedCookies=[cookie(accessCookie,'',0),cookie(refreshCookie,'',0)];
function throttled(keys,now=Date.now()){
  for(const [k,v] of failures)if(now-v.start>900000)failures.delete(k);
  return keys.some(key=>(failures.get(key)?.count||0)>=8);
}
function recordFailure(keys,now=Date.now()){for(const key of keys){const f=failures.get(key)||{start:now,count:0};f.count++;failures.set(key,f);}}
function sameOrigin(req){
  try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}
}
// Resolves the signed-in person from their Supabase session cookies, refreshing an expired access token.
// A verified token is remembered for a minute so a burst of requests makes one Supabase check.
async function resolveUser(req,res,supabase,now=Date.now()){
  let token=readCookie(req,accessCookie);const refreshToken=readCookie(req,refreshCookie);
  if(!token&&!refreshToken)return null;
  for(const [k,v] of verified)if(v.until<now)verified.delete(k);
  const cached=token&&verified.get(createHash('sha256').update(token).digest('hex'));
  if(cached)return cached.user;
  let user;
  try{user=token&&await supabase.getUser(token);}catch(error){if(error.status!==401&&error.status!==403)throw error;}
  if(!user){
    if(!refreshToken)return null;
    let session;
    try{session=await supabase.refresh(refreshToken);}catch(error){if(error.status>=400&&error.status<500){res.setHeader('Set-Cookie',clearedCookies);return null;}throw error;}
    token=session.accessToken;user=session.user||await supabase.getUser(token);
    res.setHeader('Set-Cookie',sessionCookies(session));
  }
  const role=await supabase.role(token);
  if(role!=='owner'&&role!=='staff')return null;
  const result={id:user.id,email:normaliseEmail(user.email),name:user.user_metadata?.name||user.user_metadata?.full_name||'',owner:role==='owner',token};
  verified.set(createHash('sha256').update(token).digest('hex'),{user:result,until:now+60000});
  return result;
}
function forget(req){const token=readCookie(req,accessCookie);if(token)verified.delete(createHash('sha256').update(token).digest('hex'));}
module.exports={normaliseEmail,validEmail,readCookie,sessionCookies,clearedCookies,throttled,recordFailure,sameOrigin,resolveUser,forget,accessCookie};
