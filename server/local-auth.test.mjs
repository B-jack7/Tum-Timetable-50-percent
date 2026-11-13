import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createLocalAuth,hashPassword,verifyPassword,normalizeUsername,LOCAL_SESSION_COOKIE,SCRYPT_PARAMETERS} from './local-auth.mjs';
import {createSQLiteStore,createD1Store} from './d1-store.mjs';

const ORIGIN='https://app.example',PASSWORD='a private app password 2026';
const directory=new URL('../drizzle/',import.meta.url);
const migrations=await Promise.all((await fs.readdir(directory)).filter(name=>name.endsWith('.sql')).sort().map(name=>fs.readFile(new URL(name,directory),'utf8')));
assert.ok(migrations.length>0,'schema must come from a generated Drizzle migration');
function database(){const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const sql of migrations)db.exec(sql);return db;}
function fixture(options={}){const db=database(),store=createSQLiteStore(db);return{db,store,auth:createLocalAuth({store,expectedOrigin:ORIGIN,...options})};}
function request(path,{method='POST',body,username='student_1',password=PASSWORD,cookie,csrf,origin=ORIGIN,ip='203.0.113.8',type='application/json'}={}){
  const headers={'Origin':origin,'CF-Connecting-IP':ip,'Content-Type':type};if(cookie)headers.Cookie=cookie;if(csrf)headers['X-CSRF-Token']=csrf;
  return new Request(ORIGIN+path,{method,headers,...(['GET','HEAD'].includes(method)?{}:{body:typeof body==='string'?body:JSON.stringify(body??{username,password})})});
}
const cookieOf=response=>response.headers.get('Set-Cookie').split(';')[0];
const hash=value=>createHash('sha256').update(value).digest('hex');

test('real OWASP scrypt hashes use random salts and verify without plaintext storage',async()=>{
  const before=performance.now(),one=await hashPassword(PASSWORD),two=await hashPassword(PASSWORD);
  assert.notEqual(one,two);assert.match(one,/^\$scrypt\$N=32768,r=8,p=3\$/);assert.ok(!one.includes(PASSWORD));assert.equal(await verifyPassword(PASSWORD,one),true);assert.equal(await verifyPassword('a different password!',one),false);assert.equal(await verifyPassword(PASSWORD,'invalid-hash'),false);
  assert.equal(SCRYPT_PARAMETERS.N*SCRYPT_PARAMETERS.r*128,32*1024*1024);assert.equal(normalizeUsername(' Student_1 '),'student_1');assert.throws(()=>normalizeUsername('ＴＵＭ-user'));assert.throws(()=>normalizeUsername('Ken'));assert.throws(()=>normalizeUsername('x\' OR 1=1 --'));
  console.log('scrypt real KDF checks, total milliseconds: '+Math.round(performance.now()-before));
});
test('register/login/me persist hashed sessions across service instances and rotate credentials',async()=>{
  const{db,store,auth}=fixture();try{
    const registered=await auth.register(request('/api/local/register',{username:' Student_1 '}));assert.equal(registered.status,201);const firstCookie=cookieOf(registered),registeredBody=await registered.json();
    assert.equal(registeredBody.user.username,'student_1');assert.equal(registeredBody.authenticated,true);assert.match(registered.headers.get('Cache-Control'),/no-store/);assert.match(registered.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax/);assert.ok(!registered.headers.get('Set-Cookie').includes('Domain='));
    const stored=db.prepare('SELECT password_hash FROM users').get().password_hash;assert.ok(!stored.includes(PASSWORD));const session=db.prepare('SELECT token_hash,csrf_hash FROM sessions').get();assert.equal(session.token_hash,hash(firstCookie.split('=')[1]));assert.notEqual(session.csrf_hash,registeredBody.csrfToken);
    const restarted=createLocalAuth({store,expectedOrigin:ORIGIN}),me=await(await restarted.me(request('/api/auth/me',{method:'GET',cookie:firstCookie}))).json();assert.equal(me.authenticated,true);assert.deepEqual(me.user,registeredBody.user);assert.equal(me.csrfToken,registeredBody.csrfToken);assert.ok(!JSON.stringify(me).includes('password'));
    const signedIn=await restarted.login(request('/api/local/login',{username:'STUDENT_1',cookie:firstCookie}));assert.equal(signedIn.status,200);const secondCookie=cookieOf(signedIn);assert.notEqual(firstCookie,secondCookie);assert.equal((await(await restarted.me(request('/api/auth/me',{method:'GET',cookie:firstCookie}))).json()).authenticated,false);assert.equal((await(await restarted.me(request('/api/auth/me',{method:'GET',cookie:secondCookie}))).json()).authenticated,true);
  }finally{db.close();}
});
test('registration is unique under concurrent requests and login failure is generic',async()=>{
  const{db,auth}=fixture();try{
    const responses=await Promise.all([auth.register(request('/api/local/register',{ip:'203.0.113.1'})),auth.register(request('/api/local/register',{username:'STUDENT_1',ip:'203.0.113.2'}))]);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,1);
    const bad=await auth.login(request('/api/local/login',{password:'a wrong app password'})),unknown=await auth.login(request('/api/local/login',{username:'unknown_user'}));assert.equal(bad.status,401);assert.equal(unknown.status,401);assert.deepEqual(await bad.json(),await unknown.json());assert.equal(bad.headers.get('Set-Cookie'),null);
  }finally{db.close();}
});
test('origin, JSON boundaries and credentials are validated before account/session changes',async()=>{
  const{db,auth}=fixture();try{
    for(const input of [{origin:'https://evil.example'},{origin:'null'},{type:'text/plain'},{username:'x'},{password:'too short'},{password:'x'.repeat(129)},{body:'not json'},{body:'x'.repeat(9000)}]){const response=await auth.register(request('/api/local/register',input));assert.ok(response.status>=400);assert.equal(response.headers.get('Set-Cookie'),null);}
    assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n,0);assert.equal(db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
    assert.throws(()=>createLocalAuth({store:createSQLiteStore(db),expectedOrigin:'http://app.example'}));assert.throws(()=>createLocalAuth({store:createSQLiteStore(db)}));
  }finally{db.close();}
});
test('CSRF/Origin checks isolate users, and logout and session expiry revoke access',async()=>{
  let time=Date.now();const{db,auth}=fixture({now:()=>time,sessionTtlMs:60_000});try{
    const a=await auth.register(request('/api/local/register',{username:'alice'})),alice=await a.json(),aliceCookie=cookieOf(a),b=await auth.register(request('/api/local/register',{username:'bob'})),bob=await b.json(),bobCookie=cookieOf(b);assert.notEqual(alice.user.id,bob.user.id);
    await assert.rejects(auth.requireSession(request('/api/feeds',{cookie:bobCookie,csrf:alice.csrfToken}),{csrf:true}),error=>error.status===403);
    assert.equal((await auth.logout(request('/api/auth/logout',{cookie:aliceCookie,csrf:alice.csrfToken,origin:'https://evil.example'}))).status,403);assert.equal((await auth.logout(request('/api/auth/logout',{cookie:aliceCookie}))).status,403);
    assert.equal((await auth.logout(request('/api/auth/logout',{cookie:aliceCookie,csrf:alice.csrfToken}))).status,200);assert.equal((await(await auth.me(request('/api/auth/me',{method:'GET',cookie:aliceCookie}))).json()).authenticated,false);assert.equal((await(await auth.me(request('/api/auth/me',{method:'GET',cookie:bobCookie}))).json()).authenticated,true);
    const duplicate=bobCookie+'; '+bobCookie;assert.equal((await(await auth.me(request('/api/auth/me',{method:'GET',cookie:duplicate}))).json()).authenticated,false);
    time+=60_001;assert.equal((await(await auth.me(request('/api/auth/me',{method:'GET',cookie:bobCookie}))).json()).authenticated,false);await assert.rejects(auth.requireSession(request('/api/events',{method:'GET',cookie:bobCookie})),error=>error.status===401);
  }finally{db.close();}
});
test('persisted atomic rate buckets apply across service instances without retaining raw addresses',async()=>{
  const{db,store}=fixture();try{
    const create=()=>createLocalAuth({store,expectedOrigin:ORIGIN,rateLimits:{loginIp:2,loginUsername:100}});
    assert.equal((await create().login(request('/api/local/login',{username:'unknown_user'}))).status,401);assert.equal((await create().login(request('/api/local/login',{username:'unknown_user'}))).status,401);const limited=await create().login(request('/api/local/login',{username:'unknown_user'}));assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('Retry-After'))>0);
    const rows=db.prepare('SELECT * FROM rate_buckets').all();assert.ok(rows.every(row=>/^[a-f0-9]{64}$/.test(row.key_hash)));assert.ok(!JSON.stringify(rows).includes('203.0.113.8'));const keyHash=hash('atomic-test'),counts=await Promise.all(Array.from({length:20},()=>store.rates.hit({keyHash,windowStart:1,expiresAt:1000})));assert.deepEqual(counts.sort((a,b)=>a-b),Array.from({length:20},(_,i)=>i+1));
  }finally{db.close();}
});
test('feed persistence is user scoped and stale refreshes cannot overwrite a re-bound feed',async()=>{
  const{db,store,auth}=fixture();try{
    const a=await(await auth.register(request('/api/local/register',{username:'alice'}))).json(),b=await(await auth.register(request('/api/local/register',{username:'bob'}))).json();
    await store.feeds.upsert(a.user.id,'tumonline',{encryptedUrl:'encrypted-a',eventsJson:'[{"id":"alice-event"}]',lastSynced:1});await store.feeds.upsert(b.user.id,'tumonline',{encryptedUrl:'encrypted-b',eventsJson:'[{"id":"bob-event"}]',lastSynced:2});
    assert.equal((await store.feeds.list(a.user.id)).length,1);assert.ok((await store.feeds.get(a.user.id,'tumonline')).eventsJson.includes('alice-event'));assert.equal(await store.feeds.get(a.user.id,"' OR 1=1 --"),null);
    await store.feeds.upsert(a.user.id,'tumonline',{encryptedUrl:'encrypted-a-new',eventsJson:'[{"id":"new-event"}]',lastSynced:3});await store.feeds.updateSync(a.user.id,'tumonline',{eventsJson:'[{"id":"stale-event"}]',lastSynced:4},'encrypted-a');assert.ok((await store.feeds.get(a.user.id,'tumonline')).eventsJson.includes('new-event'));
    await store.feeds.updateSync(a.user.id,'tumonline',{lastError:'fetch_failed'},'encrypted-a-new');assert.equal((await store.feeds.get(a.user.id,'tumonline')).lastSynced,3);assert.ok((await store.feeds.get(a.user.id,'tumonline')).eventsJson.includes('new-event'));assert.ok((await store.feeds.get(b.user.id,'tumonline')).eventsJson.includes('bob-event'));
    await assert.rejects(store.feeds.upsert(a.user.id,'other',{encryptedUrl:'x'}));await store.feeds.remove(a.user.id,'tumonline');assert.equal(await store.feeds.get(a.user.id,'tumonline'),null);assert.ok(await store.feeds.get(b.user.id,'tumonline'));
  }finally{db.close();}
});
test('D1 prepared-statement adapter uses the same real SQLite SQL and never creates schema in handlers',async()=>{
  const db=database(),statements=[];try{
    const binding={prepare(sql){statements.push(sql);return{bind(...args){return{async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};}};}};
    const store=createD1Store(binding),auth=createLocalAuth({store,expectedOrigin:ORIGIN}),registered=await auth.register(request('/api/local/register'));assert.equal(registered.status,201);assert.equal((await(await auth.me(request('/api/auth/me',{method:'GET',cookie:cookieOf(registered)}))).json()).authenticated,true);assert.ok(statements.every(sql=>!/^\s*(CREATE|ALTER|DROP)\b/i.test(sql)));assert.equal(await store.users.getByUsername("' OR 1=1 --"),null);
  }finally{db.close();}
});
