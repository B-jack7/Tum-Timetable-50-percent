import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createSQLiteStore} from './d1-store.mjs';
import {createApplication} from './application.mjs';

test('private app binding, encrypted persistence, source refresh, export and account isolation',async()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const origin='https://timetable.test';let time=Date.parse('2026-11-14T00:00:00Z'),calls=0,fail=false;
  const secret='fictional-test-token';
  const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test-private-id\r\nDTSTART:20261116T080000Z\r\nDTEND:20261116T093000Z\r\nSUMMARY:Example course\r\nLOCATION:Room 101\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
  const options={store:createSQLiteStore(db),expectedOrigin:origin,encryptionKey:randomBytes(32).toString('base64'),assets:{'/login.html':{type:'text/html',body:'Login'},'/account.html':{type:'text/html',body:'Account'}},now:()=>time,
    fetchImpl:async()=>{calls++;if(fail)throw Error('network '+secret);return new Response(ics,{headers:{'Content-Type':'text/calendar'}});}};
  const app=createApplication(options);
  async function call(path,{cookie,csrf,json,method='GET'}={}){return app.fetch(new Request(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(json?{'Content-Type':'application/json'}:{})},...(json?{body:JSON.stringify(json)}:{})}));}
  async function register(username){const res=await call('/api/local/register',{method:'POST',json:{username,password:'fictional test password'}});assert.equal(res.status,201);return{cookie:res.headers.get('Set-Cookie').split(';')[0],csrf:(await res.json()).csrfToken};}
  assert.equal((await call('/api/calendar')).status,401);
  assert.equal((await call('/account.html')).headers.get('Location'),'/login.html');
  const alice=await register('test.alice'),bob=await register('test.bob');
  assert.equal((await call('/api/feeds',{...alice,method:'POST',json:{source:'tumonline',url:'https://example.com/?token='+secret}})).status,400);assert.equal(calls,0);
  const bound=await call('/api/feeds',{...alice,method:'POST',json:{source:'tumonline',url:'https://campus.tum.de/tumonlinej/ws/termin/ical?token='+secret}});
  assert.equal(bound.status,200);const body=await bound.json();assert.equal(body.events[0].location,'Room 101');assert.equal(body.feeds.find(f=>f.source==='tumonline').bound,true);assert.equal(JSON.stringify(body).includes(secret),false);
  const row=db.prepare('SELECT * FROM feeds').get();assert.equal(row.encrypted_url.includes(secret),false);assert.equal(row.encrypted_url.startsWith('v1.'),true);
  assert.equal((await (await call('/api/calendar',bob)).json()).events.length,0);
  await call('/api/calendar',alice);assert.equal(calls,1);
  time+=16*60*1000;fail=true;const failed=await (await call('/api/calendar',alice)).json();assert.equal(failed.events.length,1);assert.equal(failed.feeds.find(f=>f.source==='tumonline').error,'source-unavailable');assert.equal(JSON.stringify(failed).includes(secret),false);
  const exported=await call('/api/export.ics',alice);assert.equal(exported.status,200);const text=await exported.text();assert.match(text,/LOCATION:Room 101/);assert.doesNotMatch(text,/BEGIN:VALARM/);assert.equal(text.includes(secret),false);
  const csrf=await call('/api/feeds/tumonline',{cookie:alice.cookie,csrf:bob.csrf,method:'DELETE'});assert.equal(csrf.status,403);
  assert.equal((await call('/api/feeds/tumonline',{...bob,method:'DELETE'})).status,200);assert.equal((await (await call('/api/calendar',alice)).json()).events.length,1);
  // A new app instance sees the same durable data and key without an in-memory user map.
  const restarted=createApplication(options);const again=await restarted.fetch(new Request(origin+'/api/calendar',{headers:{Cookie:alice.cookie}}));assert.equal((await again.json()).events.length,1);
  assert.equal((await call('/api/feeds/tumonline',{...alice,method:'DELETE'})).status,200);assert.equal((await (await call('/api/calendar',alice)).json()).events.length,0);
  fail=false;
  await call('/api/feeds',{...alice,method:'POST',json:{source:'moodle',url:'https://www.moodle.tum.de/calendar/export_execute.php?token='+secret}});
  assert.match(await (await call('/api/export.ics',alice)).text(),/BEGIN:VALARM/);
  await call('/api/auth/logout',{...alice,method:'POST'});assert.equal((await call('/api/calendar',alice)).status,401);
  db.close();
});
