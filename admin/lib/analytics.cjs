const {createHmac}=require('node:crypto');
const {createSupabaseAuth}=require('./supabase.cjs');
const auth=require('./auth.cjs');
const kinds=['pageview','vehicle_view','card_click','whatsapp','email','phone','finance','directions'];
const siteOrigins=['https://www.driving-force.co.za','https://driving-force.co.za'];
const bots=/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp\/|curl|wget|python|node-fetch/i;
const hits=new Map();
let labels={at:0,map:new Map()};
function device(ua){
  if(/ipad|tablet|kindle|playbook|silk|(android(?!.*mobile))/i.test(ua))return 'tablet';
  return /mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)?'mobile':'desktop';
}
// A visitor is a hash of IP and browser that changes every day, so nobody can be followed across days
// and no IP address, cookie or identifier is ever stored.
function visitorHash(ip,ua,now=new Date()){
  const day=now.toISOString().slice(0,10);
  const secret=process.env.ANALYTICS_SECRET||'';
  return createHmac('sha256',secret+day).update(ip+'|'+ua).digest('base64url').slice(0,22);
}
function cleanSource(value){
  const text=String(value||'').trim().toLowerCase().slice(0,80);
  if(!text)return 'direct';
  const host=text.replace(/^https?:\/\//,'').split('/')[0].replace(/^www\./,'').replace(/^m\./,'').replace(/^l\./,'').replace(/^lm\./,'');
  if(/(^|\.)google\./.test(host))return 'google';
  if(/(^|\.)(facebook|fb)\.com$/.test(host))return 'facebook';
  if(/(^|\.)instagram\.com$/.test(host))return 'instagram';
  if(/(^|\.)(bing|duckduckgo|yahoo)\./.test(host))return host.split('.')[0];
  if(/driving-force\.co\.za$/.test(host))return 'direct';
  return host||'direct';
}
// Vehicle names come from the live stock list rather than from the browser, refreshed every few minutes.
async function vehicleLabel(id,fetchImpl){
  if(!id)return null;
  if(Date.now()-labels.at>300000){
    try{
      const data=await (await fetchImpl('https://n39fqfoyvpcatajv.public.blob.vercel-storage.com/inventory.json',{signal:AbortSignal.timeout(4000)})).json();
      labels={at:Date.now(),map:new Map(data.vehicles.map(v=>[String(v.id),`${v.year} ${v.displayName||(v.make+' '+v.model)} · ${v.stock_code}`]))};
    }catch{labels.at=Date.now()-240000;}
  }
  return labels.map.get(String(id))||null;
}
function trackHandler({supabase=createSupabaseAuth(),fetchImpl=fetch,now=Date.now}={}){
  return async(req,res)=>{
    const origin=req.headers.origin;
    if(siteOrigins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
    res.setHeader('Cache-Control','no-store');
    if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Content-Type');return res.status(204).end();}
    if(req.method!=='POST')return res.status(405).end();
    try{
      if(origin&&!siteOrigins.includes(origin))return res.status(204).end();
      const ua=String(req.headers['user-agent']||'');
      if(!ua||bots.test(ua))return res.status(204).end();
      const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim();
      // Simple per-address limit so a single source cannot flood the figures.
      const t=now(),hit=hits.get(ip)||{start:t,count:0};
      if(t-hit.start>60000){hit.start=t;hit.count=0;}
      if(++hit.count>60)return res.status(204).end();
      hits.set(ip,hit);if(hits.size>5000)hits.clear();
      let body=req.body;if(typeof body==='string'){try{body=JSON.parse(body);}catch{body=null;}}
      if(!body||!kinds.includes(body.kind))return res.status(204).end();
      const vehicleId=/^\d{1,10}$/.test(String(body.vehicleId||''))?String(body.vehicleId):null;
      const path=String(body.path||'/').replace(/[?#].*$/,'').slice(0,200)||'/';
      await supabase.rpc('track_event',{p_secret:process.env.ANALYTICS_SECRET,p_kind:body.kind,p_path:path,p_vehicle_id:vehicleId,p_vehicle_label:await vehicleLabel(vehicleId,fetchImpl),p_visitor:visitorHash(ip,ua,new Date(t)),p_source:cleanSource(body.source),p_device:device(ua),p_country:String(req.headers['x-vercel-ip-country']||'').slice(0,2)||null});
      return res.status(204).end();
    }catch(error){console.error(error);return res.status(204).end();}
  };
}
function analyticsHandler({supabase=createSupabaseAuth()}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      const user=await auth.resolveUser(req,res,supabase);
      if(!user)return res.status(401).json({error:'Please sign in again.'});
      const days=Math.max(1,Math.min(365,parseInt(new URL(req.url,'http://admin').searchParams.get('days'),10)||30));
      return res.status(200).json(await supabase.rpc('dashboard_analytics',{p_days:days},user.token));
    }catch(error){console.error(error);return res.status(500).json({error:'Analytics could not be loaded. Please try again.'});}
  };
}
// Form enquiries with the people who sent them, plus WhatsApp, call and finance taps from the website.
function enquiriesHandler({supabase=createSupabaseAuth()}={}){
  return async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      const user=await auth.resolveUser(req,res,supabase);
      if(!user)return res.status(401).json({error:'Please sign in again.'});
      const days=Math.max(1,Math.min(730,parseInt(new URL(req.url,'http://admin').searchParams.get('days'),10)||30));
      return res.status(200).json(await supabase.rpc('dashboard_enquiries',{p_days:days},user.token));
    }catch(error){console.error(error);return res.status(500).json({error:'Enquiries could not be loaded. Please try again.'});}
  };
}
module.exports={trackHandler,analyticsHandler,enquiriesHandler,cleanSource,device,visitorHash};
