// The enquiry alert email the sales team receives. Email clients ignore most modern CSS, so this is
// table-based with inline styles. The vehicle photo is attached and also shown inline (by content id).
const {escapeHtml:e,money,vehicleTitle}=require('../dist/finance-utils.js');
const {vehicleUrl}=require('../dist/inventory.js');

const site='https://www.driving-force.co.za';
const red='#ce202e', ink='#161616', muted='#6b6b6b', line='#e7e7e4', soft='#f5f5f3';
const font="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const photoId='vehicle-photo';

const absolute=src=>/^https?:/.test(src)?src:site+'/'+String(src).replace(/^\/+/,'');
const photoOf=car=>{const photos=Array.isArray(car.photos)&&car.photos.length?car.photos:[car.localImage||car.imageUrl];return photos.find(Boolean)||null;};
const km=n=>Number(n||0).toLocaleString('en-ZA').replace(/\s|,/g,' ')+' km';
// South African numbers as dialled (082 …) become international (2782 …) for WhatsApp and tel links.
function international(phone){
  const digits=String(phone||'').replace(/\D/g,'');
  if(!digits)return null;
  if(digits.startsWith('27'))return digits;
  if(digits.startsWith('0'))return '27'+digits.slice(1);
  return digits;
}
const button=(href,label,{fill=ink,color='#ffffff',border=fill}={})=>`<a href="${e(href)}" style="display:inline-block;background:${fill};color:${color};border:1px solid ${border};font:600 14px/1 ${font};text-decoration:none;padding:13px 20px;border-radius:2px;mso-padding-alt:0;" target="_blank">${label}</a>`;
const spec=(label,value)=>`<td width="33%" valign="top" style="padding:14px 16px;border-top:1px solid ${line};"><div style="font:600 10px/1.4 ${font};letter-spacing:1.4px;text-transform:uppercase;color:${muted};">${label}</div><div style="font:600 15px/1.4 ${font};color:${ink};padding-top:3px;white-space:nowrap;">${e(value)}</div></td>`;

function enquiryEmail({name,email,phone,message,vehicle},{receivedAt=new Date()}={}){
  const car=vehicle?`${vehicle.year} ${vehicleTitle(vehicle)}`:null;
  const subject=car?`New enquiry: ${car} (${vehicle.stock_code}) from ${name}`:`New website enquiry from ${name}`;
  const firstName=String(name).trim().split(/\s+/)[0];
  const wa=international(phone);
  const when=receivedAt.toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg',weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const replySubject=car?`Your enquiry about the ${car}`:'Your enquiry with Driving Force';
  const replyBody=`Hi ${firstName},\n\nThank you for your enquiry${car?` about the ${car}`:''}.\n\n`;
  const mailto=`mailto:${email}?`+new URLSearchParams({subject:replySubject,body:replyBody}).toString().replace(/\+/g,'%20');
  const waText=`Hi ${firstName}, this is Driving Force. Thank you for your enquiry${car?` about the ${car} (stock ${vehicle.stock_code})`:''}.`;
  const photo=vehicle&&photoOf(vehicle);
  const pageUrl=vehicle?site+vehicleUrl(vehicle):site;
  const preheader=car?`${name} is asking about the ${car}, ${money(vehicle.value)}. Reply, call or WhatsApp straight from this email.`:`${name} sent a message through the website.`;

  const vehicleBlock=vehicle?`
        <tr><td style="padding:0;">${photo?`<a href="${e(pageUrl)}" target="_blank" style="display:block;"><img src="cid:${photoId}" width="600" alt="${e(`${car} ${vehicle.variant} in ${vehicle.colour}`)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;background:${soft};"></a>`:''}</td></tr>
        <tr><td style="padding:26px 32px 6px;">
          <div style="font:600 10px/1.4 ${font};letter-spacing:1.6px;text-transform:uppercase;color:${red};">The vehicle · Stock ${e(vehicle.stock_code)}</div>
          <div style="font:700 26px/1.15 ${font};color:${ink};padding-top:8px;letter-spacing:-.4px;">${e(car)}</div>
          <div style="font:400 14px/1.5 ${font};color:${muted};padding-top:4px;">${e(vehicle.variant)}</div>
          <div style="font:700 30px/1.1 ${font};color:${ink};padding-top:14px;letter-spacing:-.6px;">${money(vehicle.value)}</div>
        </td></tr>
        <tr><td style="padding:16px 16px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
            <tr>${spec('Mileage',km(vehicle.mile))}${spec('Transmission',vehicle.transmission||'—')}${spec('Fuel',vehicle.fuelType||'—')}</tr>
            <tr>${spec('Year',vehicle.year)}${spec('Colour',vehicle.colour||'—')}${spec('Body',vehicle.body_type||'—')}</tr>
          </table>
        </td></tr>
        <tr><td style="padding:14px 32px 30px;">${button(pageUrl,'View the listing &rarr;',{fill:'#ffffff',color:ink,border:ink})}</td></tr>
        <tr><td style="padding:0 32px;"><div style="height:1px;background:${line};line-height:1px;font-size:0;">&nbsp;</div></td></tr>`:'';

  const html=`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${e(subject)}</title>
<style>@media (max-width:620px){.wrap{width:100%!important}.pad{padding-left:22px!important;padding-right:22px!important}.stack td{display:block!important;width:100%!important}.btn a{display:block!important;text-align:center!important;margin:0 0 10px!important}}</style></head>
<body style="margin:0;padding:0;background:${soft};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${soft};">${e(preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${soft};"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${line};">
    <tr><td style="background:${ink};padding:22px 32px;" class="pad">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="font:800 20px/1 ${font};color:#ffffff;letter-spacing:.5px;"><span style="color:${red};">DRIVING</span>FORCE</td>
        <td align="right" style="font:600 10px/1.4 ${font};letter-spacing:1.6px;text-transform:uppercase;color:#a8a8a8;">Website enquiry</td>
      </tr></table>
    </td></tr>
    <tr><td style="height:4px;background:${red};line-height:4px;font-size:0;">&nbsp;</td></tr>
    <tr><td style="padding:30px 32px 26px;" class="pad">
      <div style="font:700 28px/1.15 ${font};color:${ink};letter-spacing:-.6px;">${car?`${e(firstName)} wants to know more.`:`New message from ${e(firstName)}.`}</div>
      <div style="font:400 15px/1.6 ${font};color:${muted};padding-top:8px;">${car?`A new enquiry about the <strong style="color:${ink};">${e(car)}</strong> came in through driving-force.co.za. Get back to them quickly; the first dealer to reply usually wins the sale.`:'A new enquiry came in through driving-force.co.za.'}</div>
      <div style="font:400 12px/1.5 ${font};color:${muted};padding-top:10px;">Received ${e(when)}</div>
    </td></tr>
    ${vehicleBlock}
    <tr><td style="padding:28px 32px 6px;" class="pad">
      <div style="font:600 10px/1.4 ${font};letter-spacing:1.6px;text-transform:uppercase;color:${red};">The customer</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;border:1px solid ${line};border-collapse:collapse;">
        <tr><td style="padding:12px 16px;font:400 13px/1.4 ${font};color:${muted};width:90px;border-bottom:1px solid ${line};">Name</td><td style="padding:12px 16px;font:600 15px/1.4 ${font};color:${ink};border-bottom:1px solid ${line};">${e(name)}</td></tr>
        <tr><td style="padding:12px 16px;font:400 13px/1.4 ${font};color:${muted};border-bottom:1px solid ${line};">Email</td><td style="padding:12px 16px;font:600 15px/1.4 ${font};border-bottom:1px solid ${line};"><a href="mailto:${e(email)}" style="color:${ink};text-decoration:underline;">${e(email)}</a></td></tr>
        <tr><td style="padding:12px 16px;font:400 13px/1.4 ${font};color:${muted};">Phone</td><td style="padding:12px 16px;font:600 15px/1.4 ${font};color:${ink};">${phone?`<a href="tel:+${e(wa)}" style="color:${ink};text-decoration:underline;">${e(phone)}</a>`:`<span style="color:${muted};font-weight:400;">Not given</span>`}</td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:22px 32px 6px;" class="pad">
      <div style="font:600 10px/1.4 ${font};letter-spacing:1.6px;text-transform:uppercase;color:${red};">Their message</div>
      <div style="margin-top:12px;background:${soft};border-left:3px solid ${red};padding:18px 20px;font:400 15px/1.65 ${font};color:${ink};">${e(message).replace(/\n/g,'<br>')}</div>
    </td></tr>
    <tr><td style="padding:24px 32px 32px;" class="pad btn">
      ${button(mailto,`Reply to ${e(firstName)}`,{fill:red,border:red})}&nbsp;
      ${wa?`${button(`https://wa.me/${wa}?text=${encodeURIComponent(waText)}`,'WhatsApp',{fill:'#1f9d55',border:'#1f9d55'})}&nbsp;
      ${button(`tel:+${wa}`,'Call',{fill:'#ffffff',color:ink,border:ink})}`:''}
      <div style="font:400 12px/1.6 ${font};color:${muted};padding-top:14px;">Replying to this email goes straight to ${e(email)}.</div>
    </td></tr>
    <tr><td style="background:${ink};padding:22px 32px;" class="pad">
      <div style="font:600 13px/1.6 ${font};color:#ffffff;">Driving Force</div>
      <div style="font:400 12px/1.7 ${font};color:#a8a8a8;">21 Montague Drive, Montague Gardens, Cape Town · <a href="tel:+27212038888" style="color:#a8a8a8;">021 203 8888</a> · <a href="${site}" style="color:#a8a8a8;">driving-force.co.za</a></div>
      <div style="font:400 11px/1.6 ${font};color:#777777;padding-top:8px;">Sent automatically by the website enquiry form. Handle the customer's details in line with the website privacy policy (POPIA).</div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text=[
    car?`New enquiry: ${car} (stock ${vehicle.stock_code})`:'New website enquiry',
    `Received ${when}`,'',
    ...(vehicle?[`${car} — ${vehicle.variant}`,`${money(vehicle.value)} · ${km(vehicle.mile)} · ${vehicle.transmission} · ${vehicle.fuelType} · ${vehicle.colour}`,pageUrl,'']:[]),
    'CUSTOMER',`Name: ${name}`,`Email: ${email}`,`Phone: ${phone||'Not given'}`,'',
    'MESSAGE',message,'',
    `Reply to this email to answer ${firstName} directly.`
  ].join('\n');

  // Shown inline through its content id, and attached so it is kept with the email.
  const attachments=photo?[{path:absolute(photo),filename:`${vehicle.stock_code}-${vehicleTitle(vehicle).toLowerCase().replace(/[^a-z0-9]+/g,'-')}.jpg`,content_id:photoId}]:[];
  return {subject,html,text,attachments};
}
module.exports={enquiryEmail,international};
