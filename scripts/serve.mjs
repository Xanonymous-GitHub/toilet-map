import http from 'node:http';
import {readFile} from 'node:fs/promises';
const worker=await import('data:text/javascript;base64,'+Buffer.from(await readFile('dist/server/index.js','utf8')).toString('base64'));
const port=Number(process.env.RELIEF_PORT||8787);
const server=http.createServer(async(req,res)=>{try{const response=await worker.default.fetch(new Request('http://127.0.0.1:'+port+req.url,{method:req.method,headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers.entries()));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){res.writeHead(500);res.end(String(e));}});
server.listen(port,'0.0.0.0',()=>console.log('Local: http://127.0.0.1:'+port));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
