import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'dist');
if(output!==root+'/dist'&&output!==root+'\\dist')throw Error('Unexpected output path');
await rm(output,{recursive:true,force:true});
const files=['index.html','login.html','auth.js','auth.css','account.html','account.js','account.css','style.css','app.js','tasks.js','calendar-adapter.js','icons/icon-192.png','icons/icon-512.png','icons/icon.svg'];
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
const assets={};
for(const path of files){
  const bytes=await readFile(resolve(root,'public',path));
  const ext=path.slice(path.lastIndexOf('.'));assets['/'+path]={base64:bytes.toString('base64'),type:types[ext]};
}
assets['/manifest.webmanifest']={base64:Buffer.from(JSON.stringify({id:'/',name:'Tum Timetable',short_name:'Tum Timetable',start_url:'/',scope:'/',display:'standalone',background_color:'#f7f9fc',theme_color:'#0f3565',lang:'zh-CN',icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]})).toString('base64'),type:'application/manifest+json'};
await mkdir(resolve(root,'worker'),{recursive:true});
await writeFile(resolve(root,'worker/generated-assets.mjs'),`import {Buffer} from 'node:buffer';\nconst source=${JSON.stringify(assets)};\nexport default Object.fromEntries(Object.entries(source).map(([path,value])=>[path,{type:value.type,body:Uint8Array.from(Buffer.from(value.base64,'base64'))}]));\n`);
await mkdir(resolve(root,'dist/server'),{recursive:true});
await build({entryPoints:[resolve(root,'worker/index.mjs')],outfile:resolve(root,'dist/server/index.js'),bundle:true,format:'esm',platform:'neutral',target:'es2022',conditions:['worker','browser','import','default'],external:['node:crypto','node:buffer'],minify:true,legalComments:'none'});
console.log('Built Worker with private account APIs and '+Object.keys(assets).length+' public UI assets.');
