const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const handler=require('../api/finance-application.js');
const root=path.resolve(__dirname,'../dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
http.createServer(async(req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  if(req.url.split('?')[0]==='/api/finance-application'){
    let size=0;const chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>4.3*1024*1024)return res.status(413).json({error:'Application too large.'});chunks.push(chunk);}
    req.body=Buffer.concat(chunks).toString();return handler(req,res);
  }
  let filename;try{filename=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{return res.status(400).end();}
  if(filename==='/')filename='/index.html';
  const target=path.resolve(root,'.'+filename);
  if(!target.startsWith(root+path.sep))return res.status(403).end();
  try{const data=await fs.readFile(target);res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.status(404).end('Not found');}
}).listen(4173,()=>console.log('Preview ready: http://localhost:4173'));
