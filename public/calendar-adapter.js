const ZONE='Europe/Berlin';
const DAY=86400000;
const ASSESSMENT='日历未提供考核方式，请查看课程官方信息';
const PRIVATE_KEY=/token|secret|password|signature|session|sesskey|jsession|ticket|(?:^|_)auth|(?:^|_)key|^sig$|cf_chl/i;
const PARTS=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});

// Stable opaque UI identifiers, not an authentication or cryptographic primitive.
function stableId(value){
  let a=0x811c9dc5,b=0x9e3779b9,c=0x243f6a88,d=0xb7e15162;
  for(const byte of new TextEncoder().encode(value)){a=Math.imul(a^byte,16777619);b=Math.imul(b^byte,2246822519);c=Math.imul(c^byte,3266489917);d=Math.imul(d^byte,668265263);}
  return[a,b,c,d].map(n=>(n>>>0).toString(16).padStart(8,'0')).join('');
}
function safeOfficialUrl(value){
  if(typeof value!=='string'||!value||/[\s\\\u0000-\u001f\u007f]/u.test(value))return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port||!(url.hostname==='tum.de'||url.hostname.endsWith('.tum.de')))return null;
    let decodedPath;try{decodedPath=decodeURIComponent(url.pathname);}catch{return null;}
    if(/export_execute\.php|\/ws\/termin\/ical|ical\.cal\.ical/i.test(decodedPath)||[...url.searchParams.keys()].some(key=>PRIVATE_KEY.test(key)))return null;
    let hash;try{hash=decodeURIComponent(url.hash);}catch{return null;}
    if(PRIVATE_KEY.test(hash))return null;
    return url.href;
  }catch{return null;}
}
function text(value,limit=8000){
  return Array.from(typeof value==='string'?value:'').slice(0,limit).join('').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu,'')
    .replace(/(?:https?|webcal):\/\/[^\s<>"']+/giu,url=>safeOfficialUrl(url)||'[私密或外部链接已隐藏]')
    .replace(/\b((?:auth)?token|password|secret|sesskey|session|api[_-]?key)\s*=\s*[^\s&]+/gi,'$1=[隐藏]').trim();
}
function validDate(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const time=Date.parse(value+'T00:00:00Z');return Number(value.slice(0,4))>=1970&&Number(value.slice(0,4))<=2100&&Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
function timestamp(value){
  if(typeof value!=='string')return null;
  const match=value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-](\d{2}):(\d{2}))$/i);
  if(!match||!validDate(match[1])||Number(match[2])>23||Number(match[3])>59||Number(match[4]||0)>59||Number(match[6]||0)>23||Number(match[7]||0)>59)return null;
  const result=Date.parse(value);return Number.isFinite(result)?result:null;
}
function parts(time){return Object.fromEntries(PARTS.formatToParts(new Date(time)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));}
function dayOf(time){const p=parts(time);return`${p.year}-${p.month}-${p.day}`;}
function clock(time){const p=parts(time);return`${p.hour}:${p.minute}`;}
function addDays(date,count){return new Date(Date.parse(date+'T12:00:00Z')+count*DAY).toISOString().slice(0,10);}
function midnight(date){
  const [year,month,day]=date.split('-').map(Number),target=Date.UTC(year,month-1,day);
  let guess=target;
  // Berlin midnight is unambiguous; resolve its offset without assuming CET or 24-hour days.
  for(let i=0;i<3;i++){const p=parts(guess),represented=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);guess+=target-represented;}
  return guess;
}
function syncTime(value){
  const time=typeof value==='number'?value:timestamp(value);
  return Number.isFinite(time)&&time>0&&Number.isFinite(new Date(time).getTime())?time:null;
}
function normalizedEvent(event,scope){
  if(!event||!['tumonline','moodle'].includes(event.source))return null;
  const allDay=event.allDay===true;
  if(allDay?!validDate(event.start):timestamp(event.start)===null)return null;
  const start=allDay?event.start:new Date(timestamp(event.start)).toISOString();
  let end=null;
  if(event.end!==null&&event.end!==undefined&&event.end!==''){
    if(allDay?!validDate(event.end):timestamp(event.end)===null)return null;
    end=allDay?event.end:new Date(timestamp(event.end)).toISOString();
    if(end<start)return null;
  }
  const title=text(event.title,1000)||'日历安排',url=safeOfficialUrl(event.url),description=text(event.description),location=text(event.location,1500);
  const identity=typeof event.id==='string'&&event.id?event.id:JSON.stringify([event.source,title,start,end,url]);
  return{id:stableId(JSON.stringify([scope,event.source,identity])),source:event.source,title,url,description,location,allDay,start,end};
}
function appointments(event){
  const common={sourceEventId:event.id,location:event.location||'地点尚未公布',note:event.description,kind:'course',allDay:event.allDay,sourceUrl:event.url};
  if(event.allDay){
    const last=event.end&&event.end>event.start?event.end:addDays(event.start,1),length=(Date.parse(last)-Date.parse(event.start))/DAY;
    if(length>366)return[];
    const result=[];
    for(let date=event.start;date<last;date=addDays(date,1))result.push({...common,id:'appointment-'+stableId(event.id+':'+date),date,start:null,end:null,startAt:null,endAt:null,originalStart:event.start,originalEnd:event.end,continuesBefore:date>event.start,continuesAfter:addDays(date,1)<last});
    return result;
  }
  const begin=Date.parse(event.start),finish=event.end?Date.parse(event.end):begin;
  if(finish-begin>366*DAY)return[];
  if(finish===begin){const date=dayOf(begin);return[{...common,id:'appointment-'+stableId(event.id+':'+date),date,start:clock(begin),end:null,startAt:event.start,endAt:event.end,originalStart:event.start,originalEnd:event.end,continuesBefore:false,continuesAfter:false}];}
  const result=[];
  for(let date=dayOf(begin);midnight(date)<finish;date=addDays(date,1)){
    const dayStart=midnight(date),nextStart=midnight(addDays(date,1)),segmentStart=Math.max(begin,dayStart),segmentEnd=Math.min(finish,nextStart);
    if(segmentStart>=segmentEnd)continue;
    result.push({...common,id:'appointment-'+stableId(event.id+':'+date),date,start:clock(segmentStart),end:segmentEnd===nextStart?'24:00':clock(segmentEnd),startAt:new Date(segmentStart).toISOString(),endAt:new Date(segmentEnd).toISOString(),originalStart:event.start,originalEnd:event.end,continuesBefore:segmentStart>begin,continuesAfter:segmentEnd<finish});
  }
  return result;
}

/** Convert only this response's normalized personal events; never reads global snapshot data. */
export function adaptCalendarToTimetable(payload,{userId,now=Date.now()}={}){
  if(!payload||!Array.isArray(payload.events)||!Array.isArray(payload.feeds))throw new TypeError('A normalized calendar payload is required');
  const observed=new Date(typeof now==='function'?now():now);if(!Number.isFinite(observed.getTime()))throw new TypeError('A valid current date is required');
  const storageScope='calendar-'+stableId(typeof userId==='string'&&userId?userId:'session');
  const feeds=['tumonline','moodle'].map(source=>{
    const feed=payload.feeds.find(item=>item?.source===source),lastSynced=syncTime(feed?.lastSynced);
    return{source,bound:feed?.bound===true,lastSynced,eventCount:Number.isSafeInteger(feed?.eventCount)&&feed.eventCount>=0?feed.eventCount:0,error:Boolean(feed?.error)};
  });
  const events=new Map();for(const raw of payload.events){const event=normalizedEvent(raw,storageScope);if(event)events.set(event.id,event);}
  const ordered=[...events.values()].sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id)),groups=new Map(),tasks=[];
  for(const event of ordered){
    if(event.source==='moodle'){
      tasks.push({id:'moodle-'+event.id,sourceEventId:event.id,source:'moodle',title:event.title,url:event.url,dueAt:event.allDay?null:event.start,dueDate:event.allDay?event.start:dayOf(Date.parse(event.start)),allDay:event.allDay,endAt:event.end,kind:'calendar',note:[event.description,event.allDay?'全天日历活动；源日历未提供具体截止时刻。':'Moodle 日历活动。','不代表作业提交状态；请在官方活动页面核对。'].filter(Boolean).join('\n')});
      continue;
    }
    const key=JSON.stringify([event.title,event.url]),entries=appointments(event);if(!entries.length)continue;
    if(!groups.has(key))groups.set(key,{id:'course-'+stableId(storageScope+':'+key),title:event.title,number:'',type:'日历课程',status:'calendar',group:'',lecturers:[],language:'',sws:null,source:'tumonline',sourceUrl:event.url,assessment:ASSESSMENT,assessmentOriginal:null,assessmentUrl:null,description:'',details:[],notes:['信息来自你绑定的 TUMonline 日历；日历未提供课程注册状态、学分或考核规则。'],studyLinks:[],appointments:[],unscheduled:false});
    const course=groups.get(key);course.appointments.push(...entries);
    if(event.description)course.details.push({eventId:event.id,date:entries[0].date,description:event.description});
  }
  const courses=[...groups.values()].sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  for(const course of courses){course.description=[...new Set(course.details.map(detail=>detail.description))].join('\n\n');course.appointments.sort((a,b)=>a.date.localeCompare(b.date)||(a.start||'').localeCompare(b.start||'')||a.id.localeCompare(b.id));}
  const latest=feeds.map(feed=>feed.lastSynced).filter(value=>value!==null).sort((a,b)=>b-a)[0],moodleSynced=feeds.find(feed=>feed.source==='moodle').lastSynced;
  return{term:'个人日历',timezone:ZONE,updatedAt:latest?new Date(latest).toISOString():null,observedAt:observed.toISOString(),storageScope,courses,coursesListUrl:null,feeds,moodle:{checkedAt:moodleSynced?new Date(moodleSynced).toISOString():null,dashboardUrl:null,calendarUrl:null,tasks}};
}
