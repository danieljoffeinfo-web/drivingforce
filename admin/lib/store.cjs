const seed=require('./seed-vehicles.json');
const historyPrefix='inventory/history/';
// inventory.json is the public copy the showroom reads; history snapshots are what the admin reads,
// because list() is never served from the CDN cache and so always returns the latest save.
function createStore(blob=require('@vercel/blob'),fetchImpl=fetch){
  async function load(){
    const {blobs}=await blob.list({prefix:historyPrefix,limit:1000});
    if(!blobs.length)return {retrieved:seed.retrieved,vehicles:seed.vehicles};
    const latest=blobs.reduce((a,b)=>new Date(b.uploadedAt)>new Date(a.uploadedAt)?b:a);
    const response=await fetchImpl(latest.url,{cache:'no-store'});
    if(!response.ok)throw new Error('Inventory could not be read.');
    return response.json();
  }
  async function save(vehicles){
    const data=JSON.stringify({retrieved:new Date().toISOString().slice(0,10),updated:new Date().toISOString(),vehicles});
    await blob.put(historyPrefix+Date.now()+'.json',data,{access:'public',contentType:'application/json',addRandomSuffix:true});
    const result=await blob.put('inventory.json',data,{access:'public',contentType:'application/json',addRandomSuffix:false,allowOverwrite:true,cacheControlMaxAge:60});
    const {blobs}=await blob.list({prefix:historyPrefix,limit:1000});
    const stale=blobs.sort((a,b)=>new Date(b.uploadedAt)-new Date(a.uploadedAt)).slice(30).map(b=>b.url);
    if(stale.length)await blob.del(stale);
    return result.url;
  }
  async function uploadPhoto(buffer){
    const result=await blob.put('vehicles/photo.jpg',buffer,{access:'public',contentType:'image/jpeg',addRandomSuffix:true});
    return result.url;
  }
  async function removePhoto(url){
    if(typeof url==='string'&&/\.blob\.vercel-storage\.com\/vehicles\//.test(url))await blob.del(url);
  }
  return {load,save,uploadPhoto,removePhoto};
}
module.exports={createStore};
