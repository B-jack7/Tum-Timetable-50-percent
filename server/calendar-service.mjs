import { webcrypto, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { CalendarError, validateCalendarUrl, fetchAndParseCalendar, mergeCalendars, exportCalendar } from './calendars.mjs';

const SOURCES=['tumonline','moodle'];
const TTL=15*60*1000;
const MAX_JSON_BYTES=1000000;
const utf8=new TextEncoder();
export function createCalendarService({store,encryptionKey,now=()=>Date.now(),fetchImpl=fetch}){
  const bytes=Buffer.from(encryptionKey||'','base64');
  if(bytes.byteLength!==32)throw Error('A 32-byte FEED_ENCRYPTION_KEY is required');
  const key=webcrypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
  const running=new Map();
  const aad=(userId,source)=>utf8.encode(JSON.stringify(['tum-timetable-v1',userId,source]));
  const sourceCheck=source=>{if(!SOURCES.includes(source))throw new CalendarError('invalid-source','Choose a supported calendar.');};
  async function seal(userId,source,url){
    const iv=randomBytes(12);
    const encrypted=await webcrypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad(userId,source)},await key,utf8.encode(url));
    return ['v1',iv.toString('base64url'),Buffer.from(encrypted).toString('base64url')].join('.');
  }
  async function open(row){
    const parts=row.encryptedUrl.split('.');
    if(parts.length!==3||parts[0]!=='v1')throw new CalendarError('feed-unavailable','Rebind this calendar.');
    try{
      const decoded=await webcrypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(parts[1],'base64url'),additionalData:aad(row.userId,row.source)},await key,Buffer.from(parts[2],'base64url'));
      return new TextDecoder('utf-8',{fatal:true}).decode(decoded);
    }catch{throw new CalendarError('feed-unavailable','Rebind this calendar.');}
  }
  async function refreshRow(row,{force=false}={}){
    // Preserve good data; a failed source can recover after a minute rather than waiting the full cache TTL.
    const retryInterval=row.lastError?60_000:TTL;
    if(!force&&row.updatedAt&&now()-row.updatedAt<retryInterval)return;
    const identity=JSON.stringify([row.userId,row.source,row.encryptedUrl]);
    if(running.has(identity))return running.get(identity);
    const task=(async()=>{
      const timestamp=now();
      try{
        const url=await open(row);
        const result=await fetchAndParseCalendar(row.source,url,{fetchImpl,now:new Date(timestamp)});
        const eventsJson=JSON.stringify(result.events);
        if(utf8.encode(eventsJson).byteLength>MAX_JSON_BYTES)throw new CalendarError('calendar-too-large','This calendar is too large.');
        await store.feeds.updateSync(row.userId,row.source,{eventsJson,lastSynced:timestamp,lastError:null,updatedAt:timestamp},row.encryptedUrl);
      }catch(error){
        // Never persist/log network messages: they may contain a bearer subscription URL.
        const code=error instanceof CalendarError?error.code:'feed-unavailable';
        await store.feeds.updateSync(row.userId,row.source,{lastError:code,updatedAt:timestamp},row.encryptedUrl);
      }
    })();
    running.set(identity,task);
    try{await task;}finally{running.delete(identity);}
  }
  async function snapshot(userId){
    const rows=await store.feeds.list(userId);
    const events=mergeCalendars(...rows.map(row=>{try{return JSON.parse(row.eventsJson);}catch{return[];}}));
    return{events,feeds:SOURCES.map(source=>{
      const row=rows.find(item=>item.source===source);
      let eventCount=0;try{eventCount=JSON.parse(row?.eventsJson||'[]').length;}catch{}
      return{source,bound:Boolean(row),lastSynced:row?.lastSynced||null,eventCount,error:row?.lastError||null};
    }),timezone:'Europe/Berlin'};
  }
  return{
    async bind(userId,{source,url}){
      sourceCheck(source);validateCalendarUrl(source,url);
      const timestamp=now(),encryptedUrl=await seal(userId,source,url);
      const row=await store.feeds.upsert(userId,source,{encryptedUrl,createdAt:timestamp,updatedAt:timestamp});
      await refreshRow(row,{force:true});
      return snapshot(userId);
    },
    async unbind(userId,source){sourceCheck(source);await store.feeds.remove(userId,source);return snapshot(userId);},
    async read(userId,{force=false}={}){
      const rows=await store.feeds.list(userId);
      // Automatic checks use a 15-minute TTL; manual refresh has a one-minute minimum interval.
      await Promise.all(rows.map(row=>refreshRow(row,{force:force&&now()-row.updatedAt>=60_000})));
      return snapshot(userId);
    },
    async export(userId){const {events}=await this.read(userId);return exportCalendar(events,{reminders:'deadlines',now:new Date(now()),name:'Tum Timetable'});},
  };
}
