const auth=require('./auth.cjs');
const prefix='users/accounts';
// Each save writes a new file with a random name; the newest one is current and the last five are kept.
function createUserStore(blob=require('@vercel/blob'),fetchImpl=fetch){
  async function load(){
    const {blobs}=await blob.list({prefix,limit:1000});
    if(!blobs.length){
      // First run: the owner signs in with OWNER_EMAIL and the original ADMIN_PASSWORD.
      const email=auth.normaliseEmail(process.env.OWNER_EMAIL),password=process.env.ADMIN_PASSWORD||'';
      if(!auth.validEmail(email)||password.length<8)return [];
      const users=[{email,name:'',owner:true,...auth.hashPassword(password),created:new Date().toISOString()}];
      await save(users);
      return users;
    }
    const latest=blobs.reduce((a,b)=>new Date(b.uploadedAt)>new Date(a.uploadedAt)?b:a);
    const response=await fetchImpl(latest.url,{cache:'no-store'});
    if(!response.ok)throw new Error('Accounts could not be read.');
    return auth.decrypt(await response.text()).users;
  }
  async function save(users){
    await blob.put(prefix+'.json',auth.encrypt({users}),{access:'public',contentType:'application/json',addRandomSuffix:true,cacheControlMaxAge:60});
    const {blobs}=await blob.list({prefix,limit:1000});
    const stale=blobs.sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt)).slice(5).map(b=>b.url);
    if(stale.length)await blob.del(stale);
  }
  return {load,save};
}
module.exports={createUserStore};
