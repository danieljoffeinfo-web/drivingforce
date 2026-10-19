const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const handler=require('../api/finance-application.js');
const enquiryHandler=require('../api/enquiry.js');
const pageHandler=require('../api/page.js');
const root=path.resolve(__dirname,'../dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain','.ttf':'font/ttf'};
// The same addresses as the rewrites in vercel.json, served by api/page.js.
function pageRoute(pathname,search){
  if(pathname==='/')return 'route=home';
  if(pathname==='/sitemap.xml')return 'route=sitemap';
  if(pathname==='/used-cars')return 'route=makes';
  let m=pathname.match(/^\/used-cars\/([^/]+)$/);if(m)return 'route=make&make='+m[1];
  m=pathname.match(/^\/vehicles\/([^/]+)\/?$/);if(m)return 'route=vehicle&slug='+m[1];
  if(pathname==='/vehicle'||pathname==='/vehicle.html')return 'route=legacy&'+search.slice(1);
  return null;
}
http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(req.url.split('?')[0]==='/api/finance-application'){
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>4.3*1024*1024)return res.status(413).json({error:'Application too large.'});chunks.push(chunk);}
    req.body=Buffer.concat(chunks).toString();return handler(req,res);
  }
  if(req.url.split('?')[0]==='/api/enquiry'){
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>20*1024)return res.status(413).json({error:'Enquiry too long.'});chunks.push(chunk);}
    req.body=Buffer.concat(chunks).toString();return enquiryHandler(req,res);
  }
  let url;try{url=new URL(req.url,'http://localhost');}catch{return res.status(400).end();}
  const route=pageRoute(decodeURIComponent(url.pathname),url.search);
  if(route){req.url='/api/page?'+route;return pageHandler(req,res);}
  let filename=decodeURIComponent(url.pathname);
  // Clean addresses, as on Vercel: /visit serves visit.html.
  if(!path.extname(filename))filename+='.html';
  const target=path.resolve(root,'.'+filename);
  if(!target.startsWith(root+path.sep))return res.status(403).end();
  try{const data=await fs.readFile(target);res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.status(404).end('Not found');}
}).listen(4173,()=>console.log('Preview ready: http://localhost:4173'));
