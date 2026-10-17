const auth=require('./auth.cjs');
const {buildVehicle,VehicleError,bodyTypes,transmissions,fuelTypes}=require('./vehicles.cjs');
const {createStore}=require('./store.cjs');
const maxPhotoBytes=3*1024*1024;
function parseBody(req){
  if(typeof req.body==='string'){try{return JSON.parse(req.body);}catch{throw new VehicleError('The request could not be read.');}}
  return req.body||{};
}
function guard(req){
  if(req.method!=='GET'&&!auth.sameOrigin(req))throw new VehicleError('Please use the admin dashboard.',403);
}
function respondError(res,error){
  const known=error instanceof VehicleError;
  if(!known)console.error(error);
  return res.status(known?error.status:500).json({error:known?error.message:'Something went wrong. Please try again.'});
}
function sessionHandler(){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      guard(req);
      if(req.method==='GET')return res.status(200).json({authenticated:auth.isAuthenticated(req)});
      if(req.method==='DELETE'){res.setHeader('Set-Cookie',auth.clearedCookie);return res.status(200).json({authenticated:false});}
      if(req.method!=='POST'){res.setHeader('Allow','GET, POST, DELETE');return res.status(405).json({error:'Method not allowed.'});}
      const key=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
      if(auth.throttled(key))throw new VehicleError('Too many attempts. Please wait 15 minutes and try again.',429);
      if(!auth.passwordMatches(parseBody(req).password)){auth.recordFailure(key);throw new VehicleError('That password is not correct.',401);}
      res.setHeader('Set-Cookie',auth.sessionCookie(auth.createSession()));
      return res.status(200).json({authenticated:true});
    }catch(error){return respondError(res,error);}
  };
}
function vehiclesHandler({store=createStore()}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      guard(req);
      if(!auth.isAuthenticated(req))throw new VehicleError('Please sign in again.',401);
      if(req.method==='GET'){
        const data=await store.load();
        return res.status(200).json({vehicles:data.vehicles,updated:data.updated||null,options:{bodyTypes,transmissions,fuelTypes},siteUrl:process.env.SITE_URL||'https://www.driving-force.co.za/'});
      }
      if(req.method==='POST'){
        const body=parseBody(req);
        const prefix='data:image/jpeg;base64,';
        if(typeof body.photo!=='string'||!body.photo.startsWith(prefix))throw new VehicleError('Please add a photo of the vehicle.');
        const photo=Buffer.from(body.photo.slice(prefix.length),'base64');
        if(photo.length>maxPhotoBytes)throw new VehicleError('The photo is too large.',413);
        if(!(photo[0]===255&&photo[1]===216&&photo[2]===255))throw new VehicleError('The photo could not be read. Please choose a JPG or PNG.');
        const data=await store.load();
        // Validate before uploading so a rejected form never leaves an orphaned photo behind.
        buildVehicle(body.vehicle,data.vehicles,{imageUrl:'pending'});
        const imageUrl=await store.uploadPhoto(String(body.vehicle.stockCode).trim(),photo);
        const vehicle=buildVehicle(body.vehicle,data.vehicles,{imageUrl});
        await store.save([vehicle,...data.vehicles]);
        return res.status(201).json({vehicle});
      }
      if(req.method==='DELETE'){
        const id=String(req.query?.id??new URL(req.url,'http://admin').searchParams.get('id')??'');
        const data=await store.load();
        const vehicle=data.vehicles.find(car=>String(car.id)===id);
        if(!vehicle)throw new VehicleError('That vehicle has already been removed.',404);
        await store.save(data.vehicles.filter(car=>car!==vehicle));
        try{await store.removePhoto(vehicle.localImage);}catch(error){console.error(error);}
        return res.status(200).json({removed:vehicle.id});
      }
      res.setHeader('Allow','GET, POST, DELETE');
      return res.status(405).json({error:'Method not allowed.'});
    }catch(error){return respondError(res,error);}
  };
}
module.exports={sessionHandler,vehiclesHandler};
