import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';

// Self-contained release helper. Can be copied into authoring/ and run with --dist .
const args=process.argv.slice(2);
if(args.includes('--help')){console.log('node prepare-pwa-release.mjs [--dist <directory>] [--check]');process.exit(0);}
const argIndex=args.indexOf('--dist');
if(argIndex>=0&&!args[argIndex+1])throw Error('--dist requires a directory');
const dist=argIndex>=0?path.resolve(args[argIndex+1]):fileURLToPath(new URL('./tum-timetable/dist/',import.meta.url));
const check=args.includes('--check');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const HTML_SHELL_END='<!-- study-app-shell-end -->';

const SW_SOURCE=String.raw`'use strict';
const RELEASE = __RELEASE__;
const SCOPE = new URL('./',self.registration.scope).href;
const PREFIX = 'study-desk:'+SCOPE+':';
const CACHE = PREFIX+RELEASE.version;
const READY = new URL('.pwa-cache-ready',SCOPE).href;
const ASSETS = new Map(RELEASE.assets.map(a=>[new URL(a.path,SCOPE).href,a]));
const VERSION_URL = new URL('app-version.json',SCOPE).href;
const HTML_SHELL_END = '<!-- study-app-shell-end -->';

function contentTypeMatches(mime,value){
  const type=(value||'').split(';')[0].trim().toLowerCase();
  if(mime==='text/javascript')return ['text/javascript','application/javascript','application/x-javascript'].includes(type);
  if(mime==='application/manifest+json')return ['application/manifest+json','application/json'].includes(type);
  if(mime==='font/woff2')return ['font/woff2','application/font-woff','application/octet-stream'].includes(type);
  if(mime==='font/woff')return ['font/woff','application/font-woff','application/octet-stream'].includes(type);
  if(mime==='text/calendar')return ['text/calendar','application/octet-stream'].includes(type);
  return mime===type;
}
async function checkedFetch(asset){
  try{
  const assetUrl=new URL(asset.path,SCOPE);
  // Static hosts commonly canonicalize index.html to its directory with a redirect.
  // Request that known directory directly, while keeping redirect:error and the index.html cache key.
  const url=asset.mime==='text/html'&&/(^|\/)index\.html$/i.test(asset.path)?new URL('./',assetUrl):assetUrl;
  const response=await fetch(new Request(url,{cache:'no-store',credentials:'same-origin',redirect:'error'}));
  if(response.status!==200||!response.ok||response.redirected||!['basic','default'].includes(response.type))throw Error('Response rejected: status='+response.status+', type='+response.type+', redirected='+response.redirected);
  const finalUrl=new URL(response.url);
  if(finalUrl.href!==url.href)throw Error('Response location rejected: '+finalUrl.origin+finalUrl.pathname);
  if(!contentTypeMatches(asset.mime,response.headers.get('content-type')))throw Error('MIME rejected: expected='+asset.mime+', received='+(response.headers.get('content-type')||'(missing)'));
  const bytes=await response.clone().arrayBuffer();
  let expected=asset.sha256,checkedBytes=bytes;
  if(asset.mime==='text/html'){
    // The host may append its own dynamic security/analytics scripts immediately before </body>.
    // Authenticate every authored byte through the fixed marker; preserve and return the ENTIRE response.
    // This neither removes nor disables any host-injected script or challenge.
    if(!asset.shellSha256||!Number.isSafeInteger(asset.shellBytes)||asset.shellBytes<=0||bytes.byteLength<asset.shellBytes)throw Error('HTML shell size rejected: received='+bytes.byteLength+', expectedPrefix='+asset.shellBytes);
    checkedBytes=bytes.slice(0,asset.shellBytes);
    const decoder=new TextDecoder('utf-8',{fatal:true});
    const shell=decoder.decode(checkedBytes),tail=decoder.decode(bytes.slice(asset.shellBytes));
    if(!shell.endsWith(HTML_SHELL_END))throw Error('HTML shell marker missing at expected prefix boundary');
    if(!/<\/body\s*>\s*<\/html\s*>\s*$/i.test(tail))throw Error('HTML body/html ending rejected');
    expected=asset.shellSha256;
  }
  const digest=await crypto.subtle.digest('SHA-256',checkedBytes);
  const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(actual!==expected)throw Error('Content hash mismatch: expected='+expected+', received='+actual);
  return response;
  }catch(error){throw assetFailure(asset.path,error);}
}
function assetFailure(path,error){
  if(error?.assetPath)return error;
  const reason=(error?.name?error.name+': ':'')+(error?.message||String(error));
  const failure=Error(path+': '+reason);failure.assetPath=path;failure.reason=reason;return failure;
}
async function notifyPrepareFailure(error){
  const failure=assetFailure('[offline-cache]',error);
  try{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows)if(insideScope(new URL(client.url)))client.postMessage?.({type:'OFFLINE_PREPARE_FAILED',path:failure.assetPath,reason:failure.reason});
  }catch{/* Failure to report must not turn a failed cache installation into success. */}
}
async function offlineReady(){
  const cache=await caches.open(CACHE);
  const marker=await cache.match(READY);
  return marker?.ok===true;
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    let reported=false;
    try{
    // A new version writes a separate cache. It cannot replace the active release.
    await caches.delete(CACHE);
    const cache=await caches.open(CACHE);
    let position=0;
    const workers=Array.from({length:Math.min(6,RELEASE.assets.length)},async()=>{
      while(position<RELEASE.assets.length){const asset=RELEASE.assets[position++];try{await cache.put(new URL(asset.path,SCOPE).href,await checkedFetch(asset));}catch(error){throw assetFailure(asset.path,error);}}
    });
    const results=await Promise.allSettled(workers);
    const failures=results.filter(r=>r.status==='rejected');
    if(failures.length){for(const failure of failures)await notifyPrepareFailure(failure.reason);reported=true;throw Error('Complete offline release could not be prepared');}
    await cache.put(READY,new Response(JSON.stringify({version:RELEASE.version}),{headers:{'Content-Type':'application/json'}}));
    // Deliberately no skipWaiting(): an update waits for the user's button.
    }catch(error){await caches.delete(CACHE).catch(()=>{});if(!reported)await notifyPrepareFailure(error);throw error;}
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    if(!await offlineReady())throw Error('Incomplete release cannot activate');
    for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
    // No clients.claim(): first installation does not take over or reload an open page.
  })());
});
function insideScope(url){return url.origin===new URL(SCOPE).origin&&url.pathname.startsWith(new URL(SCOPE).pathname);}
function canonicalAsset(request){
  const url=new URL(request.url);
  if(!insideScope(url))return null;
  // Only version labels are ignored; auth codes, login callbacks and other queries bypass this worker.
  if([...url.searchParams.keys()].some(key=>key!=='v'))return null;
  url.search='';url.hash='';
  if(url.pathname.endsWith('/'))url.pathname+='index.html';
  return ASSETS.get(url.href)||null;
}
function missingResponse(request){
  if(request.mode==='navigate')return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>离线内容暂不可用</title><main style="font-family:system-ui;max-width:32rem;padding:3rem 1.5rem;margin:auto;line-height:1.8"><h1>离线内容暂不可用</h1><p>浏览器可能已回收缓存。请联网后关闭应用再打开，让应用完成更新。学习记录仍保存在本机。</p></main>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  return new Response('',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||request.headers.has('range'))return;
  const requestedUrl=new URL(request.url);
  if(!insideScope(requestedUrl))return;
  // Latest-version checks are a separate network operation, never the active cache's metadata.
  if(requestedUrl.origin===new URL(VERSION_URL).origin&&requestedUrl.pathname===new URL(VERSION_URL).pathname)return;
  const asset=canonicalAsset(request);
  if(!asset)return; // No runtime caching of external pages, login routes, PDFs or unknown files.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const key=new URL(asset.path,SCOPE).href;
    const cached=await cache.match(key);
    if(cached)return cached;
    // If storage was evicted, accept only bytes belonging to THIS release. Never mix new HTML/JS into it.
    try{const response=await checkedFetch(asset);await cache.put(key,response.clone());return response;}
    catch{return missingResponse(request);}
  })());
});
self.addEventListener('message',event=>{
  const reply=value=>event.ports?.[0]?.postMessage(value);
  if(event.data?.type==='GET_VERSION'){
    event.waitUntil((async()=>reply({version:RELEASE.version,assetCount:RELEASE.assets.length,bytes:RELEASE.bytes,offlineReady:await offlineReady()}))());return;
  }
  if(event.data?.type!=='ACTIVATE_UPDATE')return;
  event.waitUntil((async()=>{
    if(!event.source?.id||!insideScope(new URL(event.source.url))||!await offlineReady()){reply({status:'not-ready'});return;}
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const others=windows.filter(client=>client.id!==event.source.id&&insideScope(new URL(client.url)));
    if(others.length){reply({status:'other-windows',count:others.length});return;}
    reply({status:'accepted'});
    await self.skipWaiting();
  })());
});
`;

// Code-native calendar + T. Its opaque background and foreground fit the maskable safe circle.
function crc32(bytes){let c=0xffffffff;for(const byte of bytes){c^=byte;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function pngChunk(type,data){const t=Buffer.from(type),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([size,t,data,crc]);}
function rounded(x,y,x0,y0,x1,y1,r){const qx=Math.max(x0+r,Math.min(x,x1-r)),qy=Math.max(y0+r,Math.min(y,y1-r));return (x-qx)**2+(y-qy)**2<=r*r;}
function iconPNG(size){
  const background=[7,49,90],white=[248,251,255],teal=[69,188,178],raw=Buffer.alloc((size*4+1)*size);
  const sample=(x,y)=>{
    let c=background;
    if(rounded(x,y,.245,.295,.755,.755,.055))c=white;
    if(rounded(x,y,.245,.295,.755,.435,.055))c=teal;
    if(x>=.245&&x<=.755&&y>=.38&&y<=.435)c=teal;
    if(rounded(x,y,.335,.245,.385,.355,.024)||rounded(x,y,.615,.245,.665,.355,.024))c=white;
    if(rounded(x,y,.375,.485,.625,.535,.009)||rounded(x,y,.475,.505,.525,.685,.009))c=background;
    return c;
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const color=[0,0,0];for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++){const c=sample((x+(sx+.5)/2)/size,(y+(sy+.5)/2)/size);for(let k=0;k<3;k++)color[k]+=c[k]/4;}
    const o=y*(size*4+1)+1+x*4;raw[o]=Math.round(color[0]);raw[o+1]=Math.round(color[1]);raw[o+2]=Math.round(color[2]);raw[o+3]=255;
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),pngChunk('IHDR',ihdr),pngChunk('IDAT',deflateSync(raw,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
}
async function ensureIcons(){
  await fs.mkdir(path.join(dist,'icons'),{recursive:true});
  for(const size of [192,512])for(const label of ['icon','icon-maskable']){
    const target=path.join(dist,'icons',`${label}-${size}.png`);try{await fs.access(target);}catch{await fs.writeFile(target,iconPNG(size));}
  }
  const target=path.join(dist,'icons','icon.svg');
  try{await fs.access(target);}catch{await fs.writeFile(target,'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="104" fill="#07315a"/><rect x="125" y="151" width="262" height="236" rx="28" fill="#f8fbff"/><path d="M153 151h206a28 28 0 0 1 28 28v44H125v-44a28 28 0 0 1 28-28" fill="#45bcb2"/><path d="M184 138v31m144-31v31" stroke="#f8fbff" stroke-width="25" stroke-linecap="round"/><path d="M192 261h128m-64 0v90" fill="none" stroke="#07315a" stroke-width="26" stroke-linejoin="round"/></svg>\n');}
}
const mimeTypes={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.avif':'image/avif','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ics':'text/calendar'};
async function scan(directory,prefix=''){
  const result=[];
  for(const entry of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>compare(a.name,b.name))){
    if(entry.name.startsWith('.')||['node_modules','authoring'].includes(entry.name)||/^readme(?:\.|$)/i.test(entry.name))continue;
    const relative=prefix+entry.name;
    if(entry.isDirectory())result.push(...await scan(path.join(directory,entry.name),relative+'/'));
    else if(entry.isFile()&&!['sw.js','app-version.json','sw.js.tmp','app-version.json.tmp'].includes(relative)){
      const bytes=await fs.readFile(path.join(directory,entry.name)),ext=path.extname(relative).toLowerCase(),mime=mimeTypes[ext]||'application/octet-stream';
      const precache=Boolean(mimeTypes[ext])&&bytes.length<=2*1024*1024;
      const resource={path:relative,sha256:hash(bytes),bytes:bytes.length,mime,precache};
      if(mime==='text/html'){
        const marker=Buffer.from(HTML_SHELL_END,'utf8'),position=bytes.indexOf(marker);
        if(position<0||bytes.indexOf(marker,position+marker.length)>=0)throw Error('HTML needs exactly one author-shell end marker: '+relative);
        const shellBytes=position+marker.length;
        if(!/<body\b/i.test(bytes.subarray(0,position).toString('utf8'))||!/^\s*<\/body\s*>\s*<\/html\s*>\s*$/i.test(bytes.subarray(shellBytes).toString('utf8')))throw Error('HTML shell marker must follow all authored content before closing body/html: '+relative);
        resource.shellSha256=hash(bytes.subarray(0,shellBytes));resource.shellBytes=shellBytes;
      }
      result.push(resource);
    }
  }
  return result;
}
async function validate(resources){
  const paths=new Set(resources.map(r=>r.path));
  for(const required of ['index.html','pwa.js','pwa.css','manifest.webmanifest','courses/in2361/index.html','courses/in2361/app.js','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-192.png','icons/icon-maskable-512.png'])if(!paths.has(required))throw Error('Missing core resource: '+required);
  const manifest=JSON.parse(await fs.readFile(path.join(dist,'manifest.webmanifest'),'utf8'));
  // Per the manifest spec, a nonempty relative id resolves against the ORIGIN, not the manifest directory.
  // An empty id defaults to the resolved start_url, which gives each GitHub project a distinct stable identity.
  if(manifest.id!==''||manifest.scope!=='./'||manifest.start_url!=='./index.html'||manifest.display!=='standalone')throw Error('Manifest must use empty id (defaults to stable start_url) and relative app scope/start URL');
  const project=new URL('https://release.invalid/project-path/');
  for(const icon of manifest.icons||[]){const u=new URL(icon.src,project);if(!u.href.startsWith(project.href)||!paths.has(decodeURIComponent(u.pathname.slice(project.pathname.length))))throw Error('Manifest icon outside project or missing: '+icon.src);}
  // Ensure authored HTML/CSS asset paths remain valid under a GitHub project subdirectory.
  for(const asset of resources.filter(r=>['text/html','text/css'].includes(r.mime))){
    const text=await fs.readFile(path.join(dist,asset.path),'utf8');
    const matches=asset.mime==='text/html'?[...text.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]):[...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)].map(m=>m[1]);
    for(const reference of matches){
      if(/^(?:https?:|data:|blob:|#)/i.test(reference))continue;
      const u=new URL(reference,new URL(asset.path,project)),local=decodeURIComponent(u.pathname.slice(project.pathname.length));
      // KaTeX ships legacy woff/ttf fallback references; this Android/modern-Chrome bundle contains woff2.
      if(asset.mime==='text/css'&&/\.(woff|ttf)$/i.test(local)&&paths.has(local.replace(/\.(woff|ttf)$/i,'.woff2')))continue;
      if(!u.href.startsWith(project.href)||!paths.has(local))throw Error('Missing or nonportable local asset: '+asset.path+' → '+reference);
    }
  }
}
if(!check)await ensureIcons();
const resources=(await scan(dist)).sort((a,b)=>compare(a.path,b.path));
await validate(resources);
const version=hash(JSON.stringify(resources)+SW_SOURCE).slice(0,16);
const metadata={schema:1,version,assetCount:resources.length,offlineAssetCount:resources.filter(r=>r.precache).length,offlineBytes:resources.filter(r=>r.precache).reduce((s,r)=>s+r.bytes,0),resources};
const release={version,bytes:metadata.offlineBytes,assets:resources.filter(r=>r.precache).map(({path,sha256,mime,shellSha256,shellBytes})=>({path,sha256,mime,...(shellSha256?{shellSha256,shellBytes}:{})}))};
const sw=SW_SOURCE.replace('__RELEASE__',JSON.stringify(release));
const json=JSON.stringify(metadata,null,2)+'\n';
if(check){
  if(await fs.readFile(path.join(dist,'sw.js'),'utf8')!==sw||await fs.readFile(path.join(dist,'app-version.json'),'utf8')!==json)throw Error('Release manifest is stale. Run the helper again after all dist edits.');
}else{
  // Stage both generated files before replacing either. They are excluded from their own hash.
  await fs.writeFile(path.join(dist,'sw.js.tmp'),sw);await fs.writeFile(path.join(dist,'app-version.json.tmp'),json);
  await fs.rename(path.join(dist,'sw.js.tmp'),path.join(dist,'sw.js'));await fs.rename(path.join(dist,'app-version.json.tmp'),path.join(dist,'app-version.json'));
}
console.log(JSON.stringify({verified:check,version,assets:metadata.assetCount,offlineAssets:metadata.offlineAssetCount,offlineBytes:metadata.offlineBytes,dist},null,2));
