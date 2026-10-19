// Server-rendered pages for search engines and social previews: the homepage showroom, every
// vehicle page, pages per make, the sitemap, and redirects from the old vehicle.html?id= links.
// The markup for cards and vehicle pages is shared with the browser (dist/showroom-card.js and
// dist/vehicle-view.js), so what Google indexes is exactly what visitors see.
const fs=require('node:fs');
const path=require('node:path');
const {vehicleTitle,escapeHtml:e,money}=require('../dist/finance-utils.js');
const {vehicleSlug,vehicleUrl,makeSlug,makeUrl,slugify}=require('../dist/inventory.js');
const {cardMarkup,photosOf,imageUrl}=require('../dist/showroom-card.js');
const {vehicleMarkup,descriptionOf,makeLabel}=require('../dist/vehicle-view.js');

const site='https://www.driving-force.co.za';
const business={
  name:'Driving Force',
  legalName:'Driving Force',
  phone:'+27212038888',phoneDisplay:'021 203 8888',
  workshopPhone:'+27212098888',
  whatsapp:'+27824254253',
  email:'info@drivingforce.biz',
  street:'21 Montague Drive',suburb:'Montague Gardens',city:'Cape Town',region:'Western Cape',postalCode:'7441',country:'ZA',
  map:'https://maps.app.goo.gl/p45mNZaDi8FWgotD6',
  facebook:'https://www.facebook.com/drivingforce.za',
  image:site+'/assets/showroom.webp',
  logo:site+'/assets/logo-original.png',
  hours:[
    {days:['Monday','Tuesday','Wednesday','Thursday','Friday'],opens:'08:00',closes:'17:00'},
    {days:['Saturday'],opens:'09:00',closes:'13:00'}
  ]
};
const templates={};
function template(name){
  if(!templates[name])templates[name]=fs.readFileSync(path.join(__dirname,'..','templates',name+'.html'),'utf8');
  return templates[name];
}
const absolute=url=>/^https?:/.test(url)?url:site+'/'+String(url).replace(/^\/+/,'');
const jsonLd=data=>`<script type="application/ld+json">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>`;
// A copy of the data the page scripts need, in case the live inventory cannot be fetched by the browser.
const slim=car=>Object.fromEntries(['id','make','model','displayName','variant','year','value','mile','transmission','fuelType','body_type','colour','stock_code','photos','localImage','company_id'].filter(k=>car[k]!==undefined).map(k=>[k,car[k]]));
const embedded=(id,data)=>`<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g,'\\u003c')}</script>`;
const makeName=make=>makeLabel({make});
const allMakes=vehicles=>[...new Set(vehicles.map(c=>c.make))].sort((a,b)=>vehicles.filter(c=>c.make===b).length-vehicles.filter(c=>c.make===a).length||a.localeCompare(b));
const cheapest=vehicles=>Math.min(...vehicles.map(c=>Number(c.value)||Infinity));

function dealerJsonLd(){
  return {
    '@context':'https://schema.org','@type':'AutoDealer','@id':site+'/#dealer',
    name:business.name,url:site,telephone:business.phone,email:business.email,
    image:business.image,logo:business.logo,priceRange:'R',
    description:'Driving Force is a pre-owned vehicle dealership in Montague Gardens, Cape Town, selling quality used cars, bakkies and SUVs with vehicle finance, trade-ins and a service centre.',
    address:{'@type':'PostalAddress',streetAddress:business.street,addressLocality:business.suburb,addressRegion:business.region,postalCode:business.postalCode,addressCountry:business.country},
    areaServed:[{'@type':'City',name:'Cape Town'},{'@type':'State',name:'Western Cape'}],
    hasMap:business.map,sameAs:[business.facebook],
    openingHoursSpecification:business.hours.map(h=>({'@type':'OpeningHoursSpecification',dayOfWeek:h.days,opens:h.opens,closes:h.closes})),
    contactPoint:[
      {'@type':'ContactPoint',contactType:'sales',telephone:business.phone,availableLanguage:['en','af']},
      {'@type':'ContactPoint',contactType:'customer service',telephone:business.workshopPhone,name:'Workshop'}
    ],
    department:{'@type':'AutoRepair',name:'Driving Force Service Centre',telephone:business.workshopPhone,url:site+'/contact?reason=service',address:{'@type':'PostalAddress',streetAddress:business.street,addressLocality:business.suburb,addressRegion:business.region,postalCode:business.postalCode,addressCountry:business.country}}
  };
}
function breadcrumbJsonLd(items){
  return {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:items.map(([name,url],i)=>({'@type':'ListItem',position:i+1,name,item:absolute(url)}))};
}
function carJsonLd(car){
  const url=absolute(vehicleUrl(car));
  return {
    '@context':'https://schema.org','@type':'Car','@id':url+'#car',
    name:`${car.year} ${vehicleTitle(car)} ${car.variant}`,url,
    brand:{'@type':'Brand',name:makeName(car.make)},
    manufacturer:{'@type':'Organization',name:makeName(car.make)},
    model:car.model,vehicleConfiguration:car.variant,vehicleModelDate:String(car.year),modelDate:String(car.year),
    productionDate:String(car.year),
    color:car.colour,bodyType:car.body_type,fuelType:car.fuelType,vehicleTransmission:car.transmission,
    mileageFromOdometer:{'@type':'QuantitativeValue',value:Number(car.mile)||0,unitCode:'KMT'},
    sku:car.stock_code,image:photosOf(car).map(p=>absolute(imageUrl(p))),
    description:descriptionOf(car).join(' '),
    itemCondition:'https://schema.org/UsedCondition',
    offers:{'@type':'Offer',url,price:Number(car.value),priceCurrency:'ZAR',availability:'https://schema.org/InStock',itemCondition:'https://schema.org/UsedCondition',
      priceValidUntil:new Date(Date.now()+30*864e5).toISOString().slice(0,10),
      seller:{'@id':site+'/#dealer'},areaServed:{'@type':'Country',name:'South Africa'}}
  };
}
function listJsonLd(name,vehicles,url){
  return {'@context':'https://schema.org','@type':'ItemList',name,url:absolute(url),numberOfItems:vehicles.length,
    itemListElement:vehicles.map((car,i)=>({'@type':'ListItem',position:i+1,url:absolute(vehicleUrl(car)),name:`${car.year} ${vehicleTitle(car)} ${car.variant}`}))};
}
// Head tags shared by every page: canonical, description, social previews and structured data.
function head({title,description,url,image=business.image,type='website',robots,ld=[]}){
  const canonical=absolute(url);
  return [
    `<meta name="description" content="${e(description)}">`,
    `<link rel="canonical" href="${canonical}">`,
    robots?`<meta name="robots" content="${robots}">`:'<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">',
    `<meta property="og:site_name" content="Driving Force">`,
    `<meta property="og:locale" content="en_ZA">`,
    `<meta property="og:type" content="${type}">`,
    `<meta property="og:title" content="${e(title)}">`,
    `<meta property="og:description" content="${e(description)}">`,
    `<meta property="og:url" content="${canonical}">`,
    `<meta property="og:image" content="${e(absolute(image))}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${e(title)}">`,
    `<meta name="twitter:description" content="${e(description)}">`,
    `<meta name="twitter:image" content="${e(absolute(image))}">`,
    `<meta name="geo.region" content="ZA-WC"><meta name="geo.placename" content="Montague Gardens, Cape Town">`,
    `<link rel="preconnect" href="https://n39fqfoyvpcatajv.public.blob.vercel-storage.com" crossorigin>`,
    `<link rel="dns-prefetch" href="https://s3-eu-west-1.amazonaws.com">`,
    ...ld.map(jsonLd)
  ].join('');
}
function shell({title,headTags,main,bodyClass='',scripts=''}){
  return template('page').replace('<!--TITLE-->',e(title)).replace('<!--HEAD-->',headTags).replace('<!--MAIN-->',main).replace('<!--BODYCLASS-->',bodyClass).replace('<!--SCRIPTS-->',scripts);
}
const makeLinks=vehicles=>`<nav class="make-links" aria-label="Browse used cars by make"><span>Browse by make</span>${allMakes(vehicles).map(make=>`<a href="${makeUrl(make)}">${e(makeName(make))} <small>${vehicles.filter(c=>c.make===make).length}</small></a>`).join('')}<a href="/used-cars">All makes</a></nav>`;

function renderHome(data){
  const vehicles=data.vehicles;
  const makes=allMakes(vehicles);
  const title='Used Cars for Sale in Cape Town | Driving Force, Montague Gardens';
  const description=`Browse ${vehicles.length} quality pre-owned cars, SUVs and bakkies for sale in Cape Town from R ${Math.round(cheapest(vehicles)).toLocaleString('en-ZA').replace(/,/g,' ')}. ${makes.slice(0,6).map(makeName).join(', ')} and more. Vehicle finance, trade-ins and a service centre at Driving Force, Montague Gardens.`;
  const ld=[dealerJsonLd(),{'@context':'https://schema.org','@type':'WebSite',url:site,name:'Driving Force',potentialAction:{'@type':'SearchAction',target:site+'/?q={search_term_string}','query-input':'required name=search_term_string'}},listJsonLd('Used cars for sale at Driving Force, Cape Town',vehicles,'/')];
  let html=template('home');
  html=html.replace(/<title>[^<]*<\/title>/,`<title>${e(title)}</title>`).replace(/<meta name="description"[^>]*>/,'');
  html=html.replace('<!--HEAD-->',head({title,description,url:'/',image:'/assets/porsche-black.jpg',ld}));
  html=html.replace('<div class="vehicle-grid" id="vehicle-grid"></div>',`<div class="vehicle-grid" id="vehicle-grid">${vehicles.map(c=>cardMarkup(c)).join('')}</div>`);
  html=html.replace('<span id="all-count"></span>',`<span id="all-count">${vehicles.length}</span>`);
  html=html.replace('Loading the collection…',`${vehicles.length} vehicles on display`);
  html=html.replace('<!--MAKES-->',makeLinks(vehicles)+embedded('inventory-data',{retrieved:data.retrieved,vehicles:vehicles.map(slim)}));
  return html;
}
function renderVehicle(car,data){
  const name=`${car.year} ${vehicleTitle(car)}`;
  const title=`${name} ${car.variant} for sale in Cape Town | ${money(car.value)} | Driving Force`;
  const description=`Used ${name} ${car.variant} for sale at Driving Force, Montague Gardens, Cape Town. ${car.colour}, ${Number(car.mile).toLocaleString('en-ZA').replace(/,/g,' ')} km, ${car.transmission}, ${car.fuelType}. Asking ${money(car.value)}, finance available. Stock ${car.stock_code}.`;
  const ld=[carJsonLd(car),breadcrumbJsonLd([['Home','/'],['Used cars','/used-cars'],[makeName(car.make),makeUrl(car.make)],[name,vehicleUrl(car)]])];
  return shell({title,bodyClass:'vehicle-page',headTags:head({title,description,url:vehicleUrl(car),image:imageUrl(photosOf(car)[0]),type:'product',ld}),
    main:`<div id="vehicle-content" data-vehicle="${e(car.id)}" data-rendered="server">${vehicleMarkup(car,data)}</div>${embedded('vehicle-data',{retrieved:data.retrieved,vehicles:[car]})}`,scripts:'<script src="/vehicle.js" defer></script>'});
}
function listingMain({eyebrow,heading,lead,vehicles,extra=''}){
  return `<nav class="vehicle-breadcrumb" aria-label="Breadcrumb"><ol class="crumbs"><li><a href="/">Home</a></li><li><a href="/used-cars">Used cars</a></li>${heading.crumb?`<li aria-current="page">${e(heading.crumb)}</li>`:''}</ol></nav><p class="eyebrow"><span class="red-line"></span> ${e(eyebrow)}</p><h1 class="page-heading">${heading.html}</h1><p class="page-lead">${lead}</p>${extra}<p class="inventory-status listing-count" role="status">${vehicles.length} vehicle${vehicles.length===1?'':'s'} on display</p><div class="vehicle-grid" id="vehicle-grid">${vehicles.map(c=>cardMarkup(c,{contact:false})).join('')}</div><div class="listing-foot"><p>Can’t see what you’re after? New stock arrives every week. <a href="/contact">Tell our team what you need ↗</a> or <a href="/#showroom">browse the full showroom ↗</a>.</p></div>`;
}
function renderMakes(data){
  const vehicles=data.vehicles,makes=allMakes(vehicles);
  const title='Used Cars by Make in Cape Town | Driving Force';
  const description=`Used ${makes.slice(0,8).map(makeName).join(', ')} and more for sale in Cape Town. ${vehicles.length} pre-owned vehicles in stock at Driving Force, Montague Gardens, with finance and trade-ins.`;
  const ld=[breadcrumbJsonLd([['Home','/'],['Used cars','/used-cars']]),{'@context':'https://schema.org','@type':'ItemList',name:'Used cars by make',itemListElement:makes.map((make,i)=>({'@type':'ListItem',position:i+1,name:makeName(make),url:absolute(makeUrl(make))}))}];
  const grid=`<ul class="make-grid">${makes.map(make=>{const cars=vehicles.filter(c=>c.make===make);return `<li><a href="${makeUrl(make)}"><strong>${e(makeName(make))}</strong><span>${cars.length} vehicle${cars.length===1?'':'s'} · from ${money(cheapest(cars))}</span></a></li>`;}).join('')}</ul>`;
  const main=`<nav class="vehicle-breadcrumb" aria-label="Breadcrumb"><ol class="crumbs"><li><a href="/">Home</a></li><li aria-current="page">Used cars</li></ol></nav><p class="eyebrow"><span class="red-line"></span> THE COLLECTION</p><h1 class="page-heading">USED CARS FOR SALE IN CAPE TOWN.</h1><p class="page-lead">Every vehicle at Driving Force is hand-picked, checked and ready to drive away from our showroom in Montague Gardens. Choose a make to see what’s in stock today, or <a href="/#showroom">browse all ${vehicles.length} vehicles</a>.</p>${grid}<div class="listing-foot"><p>Looking for something specific? <a href="/contact">Tell our team what you need ↗</a> and we’ll help you find it.</p></div>`;
  return shell({title,bodyClass:'listing-page',headTags:head({title,description,url:'/used-cars',ld}),main,scripts:'<script src="/listing.js" defer></script>'});
}
function renderMake(make,data){
  const vehicles=data.vehicles.filter(c=>c.make===make),name=makeName(make);
  const models=[...new Set(vehicles.map(c=>vehicleTitle(c).replace(name,'').trim()).filter(Boolean))];
  const title=`Used ${name} for Sale in Cape Town | ${vehicles.length} in Stock | Driving Force`;
  const description=`${vehicles.length} used ${name} vehicle${vehicles.length===1?'':'s'} for sale in Cape Town${models.length?` including ${models.slice(0,5).join(', ')}`:''}, from ${money(cheapest(vehicles))}. Finance, trade-ins and test drives at Driving Force, Montague Gardens.`;
  const ld=[breadcrumbJsonLd([['Home','/'],['Used cars','/used-cars'],[name,makeUrl(make)]]),listJsonLd(`Used ${name} for sale at Driving Force`,vehicles,makeUrl(make))];
  const main=listingMain({eyebrow:'PRE-OWNED '+name.toUpperCase(),heading:{html:`USED ${e(name.toUpperCase())}<br>FOR SALE IN CAPE TOWN.`,crumb:name},vehicles,
    lead:`${vehicles.length===1?'One':vehicles.length} pre-owned ${e(name)}${models.length?` — ${models.map(m=>e(m)).join(', ')} —`:''} in stock at Driving Force, Montague Gardens. Every car comes with a personal walk-around, a test drive and <a href="/finance">vehicle finance</a> options. Prices from ${money(cheapest(vehicles))}.`,
    extra:makeLinks(data.vehicles)});
  return shell({title,bodyClass:'listing-page',headTags:head({title,description,url:makeUrl(make),image:imageUrl(photosOf(vehicles[0])[0]),ld}),main,scripts:'<script src="/listing.js" defer></script>'});
}
function renderNotFound(message='This vehicle could not be found in the current collection.'){
  const title='Let’s find your next drive | Driving Force';
  return shell({title,bodyClass:'vehicle-page',headTags:head({title,description:'Browse the current Driving Force collection of used cars for sale in Cape Town.',url:'/',robots:'noindex, follow'}),
    main:`<div class="page-message"><h1>Let’s find your next drive.</h1><p>${e(message)} Great cars don’t stand still, but there’s plenty more in the showroom.</p><a class="button button-black" href="/#showroom">Back to the showroom <span>↗</span></a></div>`});
}
function findBySlug(vehicles,slug){
  const wanted=String(slug||'').toLowerCase().replace(/\/+$/,'');
  const exact=vehicles.find(car=>vehicleSlug(car)===wanted);
  if(exact)return {car:exact,canonical:true};
  // Older links can spell the model differently; the stock code in the address still identifies the car.
  const tokens=new Set(wanted.split('-'));
  const byStock=vehicles.find(car=>tokens.has(slugify(car.stock_code)));
  return byStock?{car:byStock,canonical:false}:null;
}
function findMake(vehicles,slug){
  return allMakes(vehicles).find(make=>makeSlug(make)===String(slug||'').toLowerCase())||null;
}
function sitemap(data){
  const vehicles=data.vehicles,today=new Date().toISOString().slice(0,10);
  const entry=(url,lastmod,priority,changefreq='weekly')=>`<url><loc>${absolute(url)}</loc><lastmod>${lastmod}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
  const pages=[entry('/',today,'1.0','daily'),entry('/used-cars',today,'0.8','daily'),entry('/finance',today,'0.7','monthly'),entry('/visit',today,'0.6','monthly'),entry('/contact',today,'0.6','monthly'),entry('/privacy',today,'0.2','yearly'),entry('/terms',today,'0.2','yearly')];
  const makes=allMakes(vehicles).map(make=>entry(makeUrl(make),today,'0.7','daily'));
  const cars=vehicles.map(car=>entry(vehicleUrl(car),car.dateString?new Date(car.dateString*1000).toISOString().slice(0,10):today,'0.8'));
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...pages,...makes,...cars].join('')}</urlset>`;
}
module.exports={site,business,head,dealerJsonLd,breadcrumbJsonLd,carJsonLd,renderHome,renderVehicle,renderMakes,renderMake,renderNotFound,findBySlug,findMake,sitemap,allMakes,makeName};
