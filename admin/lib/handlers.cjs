const auth=require('./auth.cjs');
const {updateDetails,buildVehicle,VehicleError,bodyTypes,transmissions,fuelTypes,photosOf,parsePrice,setPrice,setPhotos}=require('./vehicles.cjs');
const {createStore}=require('./store.cjs');
const {createSupabaseAuth}=require('./supabase.cjs');
const maxPhotoBytes=3*1024*1024;
const minPassword=10;
const publicUser=user=>({email:user.email,name:user.name||'',owner:Boolean(user.owner)});
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
// Only photos this admin uploaded to the store may be attached to a vehicle.
const uploadedPhoto=url=>typeof url==='string'&&/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/vehicles\/[\w.-]+\.jpg$/.test(url);
function photoList(value){
  if(!Array.isArray(value)||value.some(url=>typeof url!=='string'||url.length>500))throw new VehicleError('The photos could not be read. Please add them again.');
  return [...new Set(value)];
}
function readPhoto(dataUrl){
  const prefix='data:image/jpeg;base64,';
  if(typeof dataUrl!=='string'||!dataUrl.startsWith(prefix))throw new VehicleError('Please choose a JPG, PNG or WebP photo.');
  const photo=Buffer.from(dataUrl.slice(prefix.length),'base64');
  if(photo.length>maxPhotoBytes)throw new VehicleError('The photo is too large.',413);
  if(!(photo[0]===255&&photo[1]===216&&photo[2]===255))throw new VehicleError('The photo could not be read. Please choose a JPG or PNG.');
  return photo;
}
const queryValue=(req,key)=>String(req.query?.[key]??new URL(req.url,'http://admin').searchParams.get(key)??'');
async function requireUser(req,res,supabase){
  const user=await auth.resolveUser(req,res,supabase);
  if(!user)throw new VehicleError('Please sign in again.',401);
  return user;
}
function checkPassword(password){
  if(typeof password!=='string'||password.length<minPassword)throw new VehicleError('Passwords need at least '+minPassword+' characters.');
  if(password.length>200)throw new VehicleError('That password is too long.');
  return password;
}
const notOnList='This email can sign in to Supabase but has not been given access to the stock admin. Ask an owner to add it to the dashboard_users list.';
function sessionHandler({supabase=createSupabaseAuth()}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      guard(req);
      if(req.method==='GET'){const user=await auth.resolveUser(req,res,supabase);return res.status(200).json({authenticated:Boolean(user),user:user?publicUser(user):null});}
      if(req.method==='DELETE'){
        const token=auth.readCookie(req,auth.accessCookie);auth.forget(req);
        if(token)await supabase.signOut(token);
        res.setHeader('Set-Cookie',auth.clearedCookies);return res.status(200).json({authenticated:false});
      }
      if(req.method!=='POST'){res.setHeader('Allow','GET, POST, DELETE');return res.status(405).json({error:'Method not allowed.'});}
      const body=parseBody(req),email=auth.normaliseEmail(body.email);
      const keys=['ip:'+String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim(),'email:'+email];
      if(auth.throttled(keys))throw new VehicleError('Too many attempts. Please wait 15 minutes and try again.',429);
      if(body.action==='recover'){
        // Always answers the same way so the form does not reveal which emails have accounts.
        if(!auth.validEmail(email))throw new VehicleError('Please enter a valid email address.');
        auth.recordFailure(keys);
        await supabase.recover(email,'https://'+req.headers.host+'/').catch(error=>console.error(error));
        return res.status(200).json({sent:true});
      }
      if(body.action==='reset'){
        // Sets a new password with the one-time token from a Supabase password-reset link.
        const password=checkPassword(body.password);
        if(typeof body.accessToken!=='string'||!body.accessToken)throw new VehicleError('This reset link is not valid. Please request a new one.');
        try{await supabase.updatePassword(body.accessToken,password);}catch(error){if(error.status>=400&&error.status<500)throw new VehicleError(error.status===422?error.message:'This reset link has expired. Please request a new one.',400);throw error;}
        return res.status(200).json({updated:true});
      }
      let session;
      try{session=await supabase.signIn(email,typeof body.password==='string'?body.password:'');}
      catch(error){if(error.status>=400&&error.status<500){auth.recordFailure(keys);throw new VehicleError(/confirm/i.test(error.message)?'Please confirm this email address in Supabase first.':'That email and password do not match.',401);}throw error;}
      const role=await supabase.role(session.accessToken);
      if(role!=='owner'&&role!=='staff'){await supabase.signOut(session.accessToken);throw new VehicleError(notOnList,403);}
      res.setHeader('Set-Cookie',auth.sessionCookies(session));
      return res.status(200).json({authenticated:true,user:publicUser({email:auth.normaliseEmail(session.user?.email||email),name:session.user?.user_metadata?.name||'',owner:role==='owner'})});
    }catch(error){return respondError(res,error);}
  };
}
function accountHandler({supabase=createSupabaseAuth()}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      guard(req);
      const me=await requireUser(req,res,supabase);
      if(req.method!=='PATCH'){res.setHeader('Allow','PATCH');return res.status(405).json({error:'Method not allowed.'});}
      const body=parseBody(req),password=checkPassword(body.newPassword);
      try{await supabase.signIn(me.email,typeof body.currentPassword==='string'?body.currentPassword:'');}
      catch(error){if(error.status>=400&&error.status<500)throw new VehicleError('Your current password is not correct.',400);throw error;}
      try{await supabase.updatePassword(me.token,password);}
      catch(error){if(error.status===422)throw new VehicleError(error.message);throw error;}
      return res.status(200).json({updated:true});
    }catch(error){return respondError(res,error);}
  };
}
function vehiclesHandler({store=createStore(),supabase=createSupabaseAuth()}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      guard(req);
      await requireUser(req,res,supabase);
      if(req.method==='GET'){
        const data=await store.load();
        return res.status(200).json({vehicles:data.vehicles,updated:data.updated||null,options:{bodyTypes,transmissions,fuelTypes},siteUrl:process.env.SITE_URL||'https://www.driving-force.co.za/'});
      }
      if(req.method==='POST'){
        const body=parseBody(req);
        const photos=photoList(body.photos);
        if(photos.some(url=>!uploadedPhoto(url)))throw new VehicleError('The photos could not be read. Please add them again.');
        const data=await store.load();
        const vehicle=buildVehicle(body.vehicle,data.vehicles,{photos});
        await store.save([vehicle,...data.vehicles]);
        return res.status(201).json({vehicle});
      }
      if(req.method==='PATCH'){
        const body=parseBody(req);
        const data=await store.load();
        if(body.action==='order'){
          // The new order must contain exactly the current vehicles, so a car added or removed meanwhile is never lost.
          const ids=Array.isArray(body.ids)?body.ids.map(String):[];
          const byId=new Map(data.vehicles.map(car=>[String(car.id),car]));
          if(ids.length!==byId.size||new Set(ids).size!==ids.length||ids.some(id=>!byId.has(id)))throw new VehicleError('The list changed while you were arranging it. Please refresh and try again.',409);
          await store.save(ids.map(id=>byId.get(id)));
          return res.status(200).json({ids});
        }
        const car=data.vehicles.find(c=>String(c.id)===String(body.id));
        if(!car)throw new VehicleError('That vehicle is no longer listed. Please refresh.',404);
        if(body.action==='price'){
          setPrice(car,parsePrice(body.price));
          await store.save(data.vehicles);
          return res.status(200).json({vehicle:car});
        }
        if(body.action==='details'){
          updateDetails(car,body.vehicle,data.vehicles);
          await store.save(data.vehicles);
          return res.status(200).json({vehicle:car});
        }
        if(body.action==='photos'){
          const before=photosOf(car),photos=photoList(body.photos);
          // Existing photos (including the original site images) may be kept or reordered; new ones must be uploads.
          if(photos.some(url=>!before.includes(url)&&!uploadedPhoto(url)))throw new VehicleError('The photos could not be read. Please add them again.');
          setPhotos(car,photos);
          await store.save(data.vehicles);
          for(const url of before.filter(url=>!photos.includes(url)))try{await store.removePhoto(url);}catch(error){console.error(error);}
          return res.status(200).json({vehicle:car});
        }
        throw new VehicleError('Unknown change.');
      }
      if(req.method==='DELETE'){
        const id=queryValue(req,'id');
        const data=await store.load();
        const vehicle=data.vehicles.find(car=>String(car.id)===id);
        if(!vehicle)throw new VehicleError('That vehicle has already been removed.',404);
        await store.save(data.vehicles.filter(car=>car!==vehicle));
        for(const url of photosOf(vehicle))try{await store.removePhoto(url);}catch(error){console.error(error);}
        return res.status(200).json({removed:vehicle.id});
      }
      res.setHeader('Allow','GET, POST, PATCH, DELETE');
      return res.status(405).json({error:'Method not allowed.'});
    }catch(error){return respondError(res,error);}
  };
}
// Photos upload one per request to stay well inside the platform's request size limit.
function photosHandler({store=createStore(),supabase=createSupabaseAuth()}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      guard(req);
      await requireUser(req,res,supabase);
      if(req.method==='POST'){
        const url=await store.uploadPhoto(readPhoto(parseBody(req).photo));
        return res.status(201).json({url});
      }
      if(req.method==='DELETE'){
        // Discards an upload that was never attached, e.g. when a form is cancelled.
        const url=queryValue(req,'url');
        if(!uploadedPhoto(url))throw new VehicleError('Unknown photo.');
        const data=await store.load();
        if(data.vehicles.some(car=>photosOf(car).includes(url)))throw new VehicleError('That photo is in use.',409);
        await store.removePhoto(url);
        return res.status(200).json({removed:url});
      }
      res.setHeader('Allow','POST, DELETE');
      return res.status(405).json({error:'Method not allowed.'});
    }catch(error){return respondError(res,error);}
  };
}
module.exports={sessionHandler,accountHandler,vehiclesHandler,photosHandler};
