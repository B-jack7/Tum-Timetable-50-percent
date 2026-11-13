import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createSQLiteStore} from './d1-store.mjs';
import {createCalendarService} from './calendar-service.mjs';

const BASE_TIME=Date.parse('2026-11-14T00:00:00Z');
const url=token=>'https://campus.tum.de/tumonlinej/ws/termin/ical?token='+token;
const response=title=>new Response('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:fictional-'+title+'\r\nDTSTART:20261116T080000Z\r\nDTEND:20261116T090000Z\r\nSUMMARY:'+title+'\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n',{headers:{'Content-Type':'text/calendar'}});
async function fixture(fetchImpl){
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const store=createSQLiteStore(db);for(const username of ['alice','bob'])await store.users.create({id:username,username,passwordHash:'test-only-unused',createdAt:BASE_TIME});
  let time=BASE_TIME;
  return{db,store,advance:ms=>{time+=ms;},service:createCalendarService({store,encryptionKey:randomBytes(32).toString('base64'),now:()=>time,fetchImpl})};
}

test('ciphertext copied between accounts fails AAD verification without losing the last good events',async()=>{
  let calls=0;const{db,store,service,advance}=await fixture(async input=>{calls++;return response(new URL(input).searchParams.get('token')==='alice-secret'?'Alice':'Bob');});
  try{
    await service.bind('alice',{source:'tumonline',url:url('alice-secret')});await service.bind('bob',{source:'tumonline',url:url('bob-secret')});
    const bob=await store.feeds.get('bob','tumonline');db.prepare('UPDATE feeds SET encrypted_url=? WHERE user_id=?').run(bob.encryptedUrl,'alice');
    advance(16*60_000);const result=await service.read('alice');
    assert.equal(calls,2,'a ciphertext owned by another account must never be fetched');assert.deepEqual(result.events.map(event=>event.title),['Alice']);assert.equal(result.feeds[0].error,'feed-unavailable');
    assert.equal(JSON.stringify(result).includes('alice-secret'),false);assert.equal(JSON.stringify(result).includes('bob-secret'),false);assert.equal(JSON.stringify(result).includes(bob.encryptedUrl),false);
  }finally{db.close();}
});

test('a slow old refresh cannot overwrite a newer subscription binding',async()=>{
  let release,entered;const started=new Promise(resolve=>{entered=resolve;});
  const{db,store,service}=await fixture(async input=>{if(new URL(input).searchParams.get('token')==='old-secret'){entered();await new Promise(resolve=>{release=resolve;});return response('Old');}return response('New');});
  try{
    const old=service.bind('alice',{source:'tumonline',url:url('old-secret')});await started;
    const current=await service.bind('alice',{source:'tumonline',url:url('new-secret')}),newRow=await store.feeds.get('alice','tumonline');assert.deepEqual(current.events.map(event=>event.title),['New']);
    release();const late=await old,final=await store.feeds.get('alice','tumonline');
    assert.equal(final.encryptedUrl,newRow.encryptedUrl);assert.equal(final.eventsJson,newRow.eventsJson);assert.deepEqual(late.events.map(event=>event.title),['New']);
  }finally{db.close();}
});

test('removing a subscription while it refreshes cannot resurrect the deleted record',async()=>{
  let release,entered;const started=new Promise(resolve=>{entered=resolve;});
  const{db,store,service}=await fixture(async()=>{entered();await new Promise(resolve=>{release=resolve;});return response('Removed');});
  try{
    const binding=service.bind('alice',{source:'tumonline',url:url('removed-secret')});await started;
    await service.unbind('alice','tumonline');release();const result=await binding;
    assert.equal(await store.feeds.get('alice','tumonline'),null);assert.equal(result.events.length,0);assert.equal(result.feeds[0].bound,false);
  }finally{db.close();}
});

test('a failed source recovers after a minute, then successful data uses the normal cache',async()=>{
  let calls=0,available=false;
  const{db,service,advance}=await fixture(async()=>{calls++;if(!available)throw new TypeError('fictional source unavailable');return response('Recovered');});
  try{
    const failed=await service.bind('alice',{source:'tumonline',url:url('recovery-secret')});
    assert.equal(failed.feeds[0].error,'source-unavailable');assert.equal(calls,1);
    available=true;advance(59_999);await service.read('alice');assert.equal(calls,1);
    advance(1);const recovered=await service.read('alice');assert.equal(calls,2);assert.equal(recovered.feeds[0].error,null);assert.deepEqual(recovered.events.map(event=>event.title),['Recovered']);
    advance(14*60_000);await service.read('alice');assert.equal(calls,2);
    advance(60_000);await service.read('alice');assert.equal(calls,3);
  }finally{db.close();}
});
