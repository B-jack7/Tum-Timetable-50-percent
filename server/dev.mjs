import {createServer} from 'node:https';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import selfsigned from 'selfsigned';
import {createSQLiteStore} from './d1-store.mjs';
import {createApplication} from './application.mjs';

const root=resolve(import.meta.dirname,'..'),privateDir=resolve(root,'.local');
await mkdir(privateDir,{recursive:true});
const keyPath=resolve(privateDir,'feed-encryption.key');
if(!existsSync(keyPath))await writeFile(keyPath,randomBytes(32).toString('base64'),{mode:0o600,flag:'wx'});
const db=new DatabaseSync(resolve(privateDir,'timetable.sqlite'));db.exec('PRAGMA foreign_keys=ON');
db.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
for(const file of (await readdir(resolve(root,'drizzle'))).filter(f=>f.endsWith('.sql')).sort()){
  if(db.prepare('SELECT name FROM _local_migrations WHERE name=?').get(file))continue;
  db.exec('BEGIN');try{db.exec(await readFile(resolve(root,'drizzle',file),'utf8'));db.prepare('INSERT INTO _local_migrations (name) VALUES (?)').run(file);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}
const port=Number(process.env.PORT||8781),origin='https://localhost:'+port;
const assetsModule=await import('../worker/generated-assets.mjs');
const app=createApplication({store:createSQLiteStore(db),expectedOrigin:origin,encryptionKey:(await readFile(keyPath,'utf8')).trim(),assets:assetsModule.default,getClientAddress:()=> 'local-preview'});
const certificate=await selfsigned.generate([{name:'commonName',value:'localhost'}],{days:30,keySize:2048,extensions:[{name:'subjectAltName',altNames:[{type:2,value:'localhost'},{type:7,ip:'127.0.0.1'}]}]});
const server=createServer({key:certificate.private,cert:certificate.cert},async(req,res)=>{
  try{const method=req.method||'GET',request=new Request(origin+(req.url||'/'),{method,headers:req.headers,...(!['GET','HEAD'].includes(method)?{body:req,duplex:'half'}:{})});const response=await app.fetch(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
  catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"service_unavailable"}');}
});
server.listen(port,'127.0.0.1',()=>console.log('Local development: '+origin+' (temporary self-signed certificate; data in ignored .local/)'));
