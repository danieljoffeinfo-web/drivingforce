// Renders the pages search engines index: the homepage with its showroom, each vehicle, the
// make pages and the sitemap. Routes arrive from the rewrites in vercel.json.
const {liveVehicles,bundledVehicles}=require('../lib/live-inventory.cjs');
const seo=require('../lib/seo.cjs');
const {vehicleUrl}=require('../dist/inventory.js');
const bundled=require('../dist/vehicles.json');
async function inventory(){
  const vehicles=await liveVehicles();
  return {retrieved:vehicles===bundledVehicles?bundled.retrieved:new Date().toISOString().slice(0,10),vehicles};
}
function createHandler({loadInventory=inventory}={}){
  return async(req,res)=>{
    const url=new URL(req.url,'http://driving-force.co.za');
    const route=url.searchParams.get('route');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    // Pages are cached at the edge for a minute so stock changes from the admin show quickly.
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=60, stale-while-revalidate=86400');
    try{
      const data=await loadInventory();
      if(route==='home')return res.status(200).end(seo.renderHome(data));
      if(route==='sitemap'){res.setHeader('Content-Type','application/xml; charset=utf-8');return res.status(200).end(seo.sitemap(data));}
      if(route==='makes')return res.status(200).end(seo.renderMakes(data));
      if(route==='make'){
        const make=seo.findMake(data.vehicles,url.searchParams.get('make'));
        return make?res.status(200).end(seo.renderMake(make,data)):res.status(404).end(seo.renderNotFound('We don’t have that make in stock right now.'));
      }
      if(route==='legacy'){
        // The previous vehicle.html?id= links move permanently to the vehicle's own address.
        const car=data.vehicles.find(c=>String(c.id)===String(url.searchParams.get('id')));
        if(!car)return res.status(404).end(seo.renderNotFound());
        res.setHeader('Location',vehicleUrl(car));return res.status(301).end();
      }
      if(route==='vehicle'){
        const found=seo.findBySlug(data.vehicles,url.searchParams.get('slug'));
        if(!found)return res.status(404).end(seo.renderNotFound());
        if(!found.canonical){res.setHeader('Location',vehicleUrl(found.car));return res.status(301).end();}
        return res.status(200).end(seo.renderVehicle(found.car,data));
      }
      return res.status(404).end(seo.renderNotFound('That page could not be found.'));
    }catch(error){
      console.error(error);
      res.setHeader('Cache-Control','no-store');
      return res.status(500).end(seo.renderNotFound('Something went wrong loading this page. Please try again.'));
    }
  };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
