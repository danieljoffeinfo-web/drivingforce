const bundledVehicles = require('../dist/vehicles.json').vehicles;
const {liveUrl} = require('../dist/inventory.js');
// Vehicles added in the stock admin are only in the live inventory, so server checks use it,
// falling back to the bundled snapshot if the store cannot be reached.
async function liveVehicles(){
  try{
    const response=await fetch(liveUrl,{signal:AbortSignal.timeout(5000)});
    const data=response.ok?await response.json():null;
    if(Array.isArray(data?.vehicles))return data.vehicles;
  }catch{}
  return bundledVehicles;
}
module.exports={bundledVehicles,liveVehicles};
