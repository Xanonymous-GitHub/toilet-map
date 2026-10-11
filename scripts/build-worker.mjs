import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {build} from 'esbuild';
const root=process.cwd(),client=resolve(root,'dist/client');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json','.json':'application/json'};
const files=[];async function walk(dir){for(const d of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,d.name);if(d.isDirectory())await walk(p);else files.push(p);}}await walk(client);
const assets={};for(const p of files){const binary=['.png','.ico','.woff2'].includes(extname(p));assets['/'+relative(client,p)]={body:(await readFile(p)).toString(binary?'base64':'utf8'),type:mime[extname(p)]??'application/octet-stream',...(binary?{binary:true}:{})};}
const revision=JSON.parse(await readFile('data/dataset.json','utf8')).dataVersion+'-'+Date.now();
const precache=Object.keys(assets).filter(p=>p!=='/sw.js');
const sw=`const CACHE=${JSON.stringify('relief-'+revision)};const CORE=${JSON.stringify(precache)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('relief-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match('/index.html')));return;}
if(CORE.includes(url.pathname)){event.respondWith(caches.open(CACHE).then(async c=>(await c.match(url.pathname))||fetch(req)));}});`;
assets['/sw.js']={body:sw,type:'text/javascript; charset=utf-8'};
await writeFile('server/assets.generated.ts','export const assets:Record<string,{body:string;type:string;binary?:boolean}>='+JSON.stringify(assets)+';\n');
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
await build({entryPoints:['server/worker.ts'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
await writeFile('dist/client/sw.js',sw);
console.log('Built Worker ESM with',files.length,'embedded PWA assets.');
