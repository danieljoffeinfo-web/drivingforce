const bodyTypes=['Hatchback','Sedan','SUV','Coupe','Convertible','Station Wagon','Double Cab','Single Cab','Bakkie','MPV','Panel Van','Other'];
const transmissions=['Automatic','Manual'];
const fuelTypes=['Petrol','Diesel','Hybrid','Electric'];
class VehicleError extends Error {constructor(message,status=400){super(message);this.status=status;}}
const groupDigits=n=>String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
function text(input,key,label,{required=true,max=80}={}){
  const value=typeof input[key]==='string'?input[key].trim().replace(/\s+/g,' '):'';
  if(required&&!value)throw new VehicleError('Please enter the '+label+'.');
  if(value.length>max)throw new VehicleError('The '+label+' is too long.');
  return value;
}
function whole(input,key,label,min,max){
  const value=Number(String(input[key]??'').replace(/[\s,]/g,''));
  if(!Number.isInteger(value)||value<min||value>max)throw new VehicleError('Please enter a valid '+label+'.');
  return value;
}
function choice(input,key,label,options){
  if(!options.includes(input[key]))throw new VehicleError('Please choose the '+label+'.');
  return input[key];
}
// Builds a record in the same shape as the original inventory feed so the showroom renders it unchanged.
function buildVehicle(input,inventory,{imageUrl,now=Date.now()}={}){
  if(!input||typeof input!=='object')throw new VehicleError('Vehicle details are required.');
  const make=text(input,'make','make',{max:40}).toUpperCase();
  const model=text(input,'model','model',{max:60}).toUpperCase();
  const variant=text(input,'variant','variant',{max:100});
  const displayName=text(input,'displayName','display name',{required:false,max:80});
  const stockCode=text(input,'stockCode','stock code',{max:30}).toUpperCase();
  const colour=text(input,'colour','colour',{max:30});
  const year=whole(input,'year','year',1950,new Date(now).getFullYear()+1);
  const price=whole(input,'price','price',1000,100000000);
  const mileage=whole(input,'mileage','mileage',0,2000000);
  const bodyType=choice(input,'bodyType','body type',bodyTypes);
  const transmission=choice(input,'transmission','transmission',transmissions);
  const fuelType=choice(input,'fuelType','fuel type',fuelTypes);
  if(inventory.some(car=>String(car.stock_code).toUpperCase()===stockCode))throw new VehicleError('A vehicle with stock code '+stockCode+' is already listed.',409);
  if(!imageUrl)throw new VehicleError('Please add a photo of the vehicle.');
  const paragraphs=typeof input.description==='string'?input.description.split(/\n\s*\n/).map(p=>p.trim().replace(/\s+/g,' ')).filter(Boolean):[];
  if(paragraphs.join(' ').length>3000)throw new VehicleError('The description is too long.');
  const features=typeof input.features==='string'?input.features.split('\n').map(f=>f.trim()).filter(Boolean):[];
  if(features.length>40||features.some(f=>f.length>120))throw new VehicleError('Please keep equipment to 40 short lines.');
  const name=displayName||[make,model].join(' ');
  const description=paragraphs.length?paragraphs:[
    `This ${year} ${name} is the ${variant} derivative, presented in ${colour}. It pairs ${bodyType==='Other'?'its':'the '+bodyType.toLowerCase()} body with ${fuelType.toLowerCase()} power and ${transmission==='Automatic'?'an automatic':'a manual'} transmission.`,
    `It has a recorded mileage of ${groupDigits(mileage)} km and is advertised at R ${groupDigits(price)}. Its stock reference is ${stockCode}. Contact Driving Force to confirm availability, discuss the vehicle’s history and fitted equipment, or arrange a viewing at the Montague Gardens showroom.`
  ];
  const id=inventory.reduce((max,car)=>Math.max(max,Number(car.id)||0),0)+1;
  const vehicle={make,model,price:groupDigits(price),year,mileage:mileage.toLocaleString('en-US'),fuelType,transmission,imageUrl,value:price,minprice:price,maxprice:price,vehicleName:make+' '+model,variant,id,colour,company_id:'278',body_type:bodyType,mile:mileage,stock_code:stockCode,iid:stockCode,dateString:Math.floor(now/1000),localImage:imageUrl,description,features,descriptionSource:'admin'};
  if(displayName)vehicle.displayName=displayName;
  return vehicle;
}
module.exports={buildVehicle,VehicleError,bodyTypes,transmissions,fuelTypes};
