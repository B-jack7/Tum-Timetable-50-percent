import {adaptCalendarToTimetable} from './calendar-adapter.js';
const SOURCES=['tumonline','moodle'];
const SOURCE_LABELS={tumonline:'TUMonline',moodle:'Moodle'};
const API_PATH=/^\/api\/(?:auth\/(?:me|logout)|calendar|sync|feeds(?:\/(?:tumonline|moodle))?)$/;
export class AccountApiError extends Error{constructor(code='unavailable',status=0){super(code);this.name='AccountApiError';this.code=code;this.status=status;}}
export function safeDisplayText(value,limit=4000){return String(value??'').slice(0,limit).replace(/(?:https?:|webcal:)\/\/[^\s<>]+/gi,'[链接]').replace(/((?:auth)?token|password|secret|key)=[^\s&]+/gi,'$1=[隐藏]');}
export function safeActivityUrl(value){
  try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||!(url.hostname==='tum.de'||url.hostname.endsWith('.tum.de'))||/(?:token|password|secret|authkey|calendar_key|userid)=/i.test(url.search+url.hash))return '';return url.href;}catch{return '';}
}
function validDateKey(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
function timestamp(value){if(typeof value==='number')return Number.isFinite(value)&&value>1000000000000?value:null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)||!validDateKey(value.slice(0,10))||Number(value.slice(11,13))>23)return null;const result=Date.parse(value);return Number.isFinite(result)?result:null;}
function dateParts(value){return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));}
export function berlinDateKey(value){const p=dateParts(value);return `${p.year}-${p.month}-${p.day}`;}
function dateTime(value){const ms=timestamp(value);if(ms===null)return '';const p=dateParts(ms);return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;}
function clockTime(value){const p=dateParts(timestamp(value));return `${p.hour}:${p.minute}`;}
function addDays(key,count){const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);}
export function startOfWeek(key){const day=new Date(key+'T12:00:00Z').getUTCDay();return addDays(key,-((day+6)%7));}
function dateLabel(key){const d=new Date(key+'T12:00:00Z');return `${d.getUTCMonth()+1} 月 ${d.getUTCDate()} 日`;}
const weekday=key=>['周日','周一','周二','周三','周四','周五','周六'][new Date(key+'T12:00:00Z').getUTCDay()];
function firstDay(event){return event.allDay?event.start.slice(0,10):berlinDateKey(timestamp(event.start));}
function lastDay(event){const first=firstDay(event);if(event.allDay){const end=typeof event.end==='string'?event.end.slice(0,10):'';return validDateKey(end)&&end>first?addDays(end,-1):first;}const end=timestamp(event.end),start=timestamp(event.start);return end!==null&&end>start?berlinDateKey(end-1):first;}
export function parseSession(payload){if(!payload||typeof payload.authenticated!=='boolean')throw new AccountApiError('invalid-response');if(!payload.authenticated)return{authenticated:false,csrfToken:null};if(typeof payload.user?.id!=='string'||!payload.user.id)throw new AccountApiError('invalid-response');return{authenticated:true,userId:payload.user.id,username:safeDisplayText(typeof payload.user.username==='string'?payload.user.username:'我的账号',64),csrfToken:typeof payload.csrfToken==='string'&&payload.csrfToken?payload.csrfToken:null};}
export function parseCalendarPayload(payload){
  if(!payload||!Array.isArray(payload.events)||!Array.isArray(payload.feeds))throw new AccountApiError('invalid-response');
  const events=payload.events.flatMap((event,index)=>{if(!event||!SOURCES.includes(event.source))return[];const allDay=event.allDay===true,start=typeof event.start==='string'?event.start:'';if(allDay?!validDateKey(start.slice(0,10)):timestamp(start)===null)return[];return[{id:String(event.id??index),source:event.source,title:safeDisplayText(event.title||'日历安排',1000),start,end:typeof event.end==='string'?event.end:null,allDay,location:safeDisplayText(event.location,1500),description:safeDisplayText(event.description),url:safeActivityUrl(event.url)}];});
  const feeds=SOURCES.map(source=>{const feed=payload.feeds.find(f=>f?.source===source)||{};return{source,bound:feed.bound===true,lastSynced:timestamp(feed.lastSynced),eventCount:Number.isSafeInteger(feed.eventCount)&&feed.eventCount>=0?feed.eventCount:0,error:Boolean(feed.error)};});
  return{events,feeds,timezone:'Europe/Berlin'};
}
export function groupWeek(events,week){return Array.from({length:7},(_,index)=>addDays(week,index)).map(date=>({date,events:events.filter(e=>e.source==='tumonline'&&firstDay(e)<=date&&lastDay(e)>=date).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||(timestamp(a.start)??0)-(timestamp(b.start)??0))})).filter(day=>day.events.length);}
export function upcomingDeadlines(events,now=Date.now()){const today=berlinDateKey(now);return events.filter(e=>e.source==='moodle'&&(e.allDay?firstDay(e)>=today:timestamp(e.start)>=now)).sort((a,b)=>(a.allDay?Date.parse(firstDay(a)+'T00:00:00Z'):timestamp(a.start))-(b.allDay?Date.parse(firstDay(b)+'T00:00:00Z'):timestamp(b.start)));}
export async function requestAccountJson(path,options={},fetchImpl=globalThis.fetch){
  if(!API_PATH.test(path))throw new AccountApiError('unsupported-endpoint');const method=options.method||'GET';if(!['GET','POST','DELETE'].includes(method))throw new AccountApiError('unsupported-method');if(method!=='GET'&&!options.csrfToken)throw new AccountApiError('missing-csrf');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{const response=await fetchImpl(path,{method,credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'application/json',...(method!=='GET'?{'Content-Type':'application/json','x-csrf-token':options.csrfToken}:{})},...(method!=='GET'?{body:JSON.stringify(options.json||{})}:{})});if(!response.ok)throw new AccountApiError('request-failed',response.status);if(response.status===204)return{};if(!/application\/json/i.test(response.headers.get('content-type')||''))throw new AccountApiError('invalid-response');return await response.json();}catch(error){if(error instanceof AccountApiError)throw error;throw new AccountApiError('unavailable');}finally{clearTimeout(timeout);}
}
export async function loadCalendar(fetchImpl=globalThis.fetch){return parseCalendarPayload(await requestAccountJson('/api/calendar',{},fetchImpl));}
export async function logoutAccount(csrfToken,fetchImpl=globalThis.fetch){return requestAccountJson('/api/auth/logout',{method:'POST',json:{},csrfToken},fetchImpl);}
export function normalizeSubscription(value){if(typeof value!=='string'||!value.trim()||value.length>8192)return '';try{const url=new URL(value.trim().replace(/^webcal:/i,'https:'));return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
async function renderOriginalTimetable(data){
  if(window.TimetableView){window.TimetableView.update(data);return;}
  window.TIMETABLE_DATA=data;
  await import('./tasks.js?v=20261114-original');
  await import('./app.js?v=20261114-original');
  delete window.TIMETABLE_DATA;
}
export function createAccountPage(doc,locationRef,fetchImpl=globalThis.fetch,now=()=>Date.now(),renderTimetable=renderOriginalTimetable){
  const $=id=>doc.getElementById(id);
  let session=null,calendar={events:[],feeds:SOURCES.map(source=>({source,bound:false,lastSynced:null,eventCount:0,error:false}))},busy=false,lastLoaded=0;
  function message(text='',error=false){
    for(const id of ['action-message','account-settings-message']){const element=$(id);if(!element)continue;element.textContent=text;element.hidden=!text;element.className='action-message'+(error?' is-error':'');}
  }
  function fail(error,text){if(error?.status===401){locationRef.assign('/login.html');return;}message(error?.status===403?'登录会话已更新，请刷新页面后重试。':error?.status===429?'操作较多，请稍后再试。':text,true);}
  function setBusy(value){
    busy=value;$('sync-calendar').disabled=value||!session?.csrfToken;$('sync-calendar').textContent=value?'正在同步…':'同步';$('logout-button').disabled=value||!session?.csrfToken;$('export-calendar').disabled=value||!calendar.events.length;
    for(const source of SOURCES)for(const suffix of ['url','reveal','bind','remove'])$('feed-'+source+'-'+suffix).disabled=value||!session?.csrfToken;
  }
  function openSettings(){const dialog=$('account-settings-dialog');if(!dialog.open)dialog.showModal();}
  function renderFeeds(){
    for(const feed of calendar.feeds){
      const prefix='feed-'+feed.source+'-';
      $(prefix+'status').textContent=feed.bound?(feed.lastSynced?'已绑定':'已保存，待同步'):'未绑定';
      $(prefix+'status').className='feed-status'+(feed.bound?' is-bound':'');
      $(prefix+'meta').textContent=feed.bound?(feed.lastSynced?'最近同步 '+dateTime(feed.lastSynced)+' · 德国时间':'尚未成功同步')+' · '+feed.eventCount+' 条安排':'绑定后显示最近同步状态';
      $(prefix+'error').hidden=!feed.error;$(prefix+'error').textContent=feed.error?'最近同步未成功，请稍后点击同步重试；若仍失败，可检查订阅是否有效。':'';
      $(prefix+'remove').hidden=!feed.bound;$(prefix+'bind').textContent=feed.bound?'更新并同步':'绑定并同步';
    }
  }
  async function updateCalendar(){
    calendar=await loadCalendar(fetchImpl);
    await renderTimetable(adaptCalendarToTimetable(calendar,{userId:session.userId,now:now()}));
    lastLoaded=now();renderFeeds();setBusy(busy);
  }
  async function refresh(){
    if(busy)return;setBusy(true);message();
    try{
      session=parseSession(await requestAccountJson('/api/auth/me',{},fetchImpl));
      if(!session.authenticated){locationRef.assign('/login.html');return;}
      $('account-identity').textContent='账号与绑定';$('account-identity').title=session.username;$('settings-username').textContent=session.username+' · 本应用账号';
      if(!session.csrfToken){message('会话信息不完整，请重新登录。',true);return;}
      await updateCalendar();$('account-main').hidden=false;$('page-loading').hidden=true;
    }catch(error){fail(error,'暂时无法读取日历，请稍后点击同步重试。');$('page-loading').textContent='暂时无法打开课表，请刷新页面或点击同步重试。';}
    finally{setBusy(false);}
  }
  async function refreshIfStale(){if(!busy&&now()-lastLoaded>=15*60*1000)await refresh();}
  async function bindFeed(source,event){
    event?.preventDefault();if(!SOURCES.includes(source)||busy)return;
    const input=$('feed-'+source+'-url'),value=input.value;input.value='';input.type='password';$('feed-'+source+'-reveal').textContent='显示';$('feed-'+source+'-reveal').setAttribute('aria-pressed','false');
    const url=normalizeSubscription(value);if(!url){message('请粘贴有效的 HTTPS 私人日历订阅链接；输入框已清空。',true);return;}
    setBusy(true);message();
    try{await requestAccountJson('/api/feeds',{method:'POST',json:{source,url},csrfToken:session?.csrfToken},fetchImpl);await updateCalendar();message(SOURCE_LABELS[source]+' 日历已保存并检查同步状态。');}
    catch(error){fail(error,'暂时无法完成绑定，请检查链接是否为有效的日历订阅，或稍后重试。输入框已清空。');}
    finally{setBusy(false);}
  }
  async function unbindFeed(source){
    if(!SOURCES.includes(source)||busy)return;setBusy(true);message();
    try{await requestAccountJson('/api/feeds/'+source,{method:'DELETE',json:{},csrfToken:session?.csrfToken},fetchImpl);await updateCalendar();message(SOURCE_LABELS[source]+' 已解除绑定。');}
    catch(error){fail(error,'暂时无法解除绑定，请稍后重试。');}finally{setBusy(false);}
  }
  async function sync(){
    if(busy)return;setBusy(true);message();
    try{await requestAccountJson('/api/sync',{method:'POST',json:{},csrfToken:session?.csrfToken},fetchImpl);await updateCalendar();message(calendar.feeds.some(f=>f.error)?'有来源暂未同步成功，请在账号与绑定中查看。':'日历已同步。',calendar.feeds.some(f=>f.error));}
    catch(error){fail(error,'暂时无法完成同步，请稍后重试。');}finally{setBusy(false);}
  }
  async function signOut(){
    if(busy)return;setBusy(true);message();
    try{await logoutAccount(session?.csrfToken,fetchImpl);session=null;locationRef.assign('/login.html');}
    catch(error){fail(error,'暂时无法退出，请重试。');}finally{setBusy(false);}
  }
  async function exportCalendar(){
    if(busy||!calendar.events.length)return;setBusy(true);message();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
    try{const response=await fetchImpl('/api/export.ics',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal,headers:{Accept:'text/calendar'}});if(!response.ok)throw new AccountApiError('export-failed',response.status);if(!/text\/calendar/i.test(response.headers.get('content-type')||''))throw new AccountApiError('invalid-response');const blob=await response.blob(),url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download='tum-timetable-'+berlinDateKey(now())+'.ics';doc.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('日历文件已下载，可导入你使用的日历应用。');}
    catch(error){fail(error,'暂时无法导出日历，请稍后重试。');}finally{clearTimeout(timeout);setBusy(false);}
  }
  $('account-identity').addEventListener('click',openSettings);
  $('close-account-settings').addEventListener('click',()=>$('account-settings-dialog').close());
  $('sync-calendar').addEventListener('click',sync);$('logout-button').addEventListener('click',signOut);$('export-calendar').addEventListener('click',exportCalendar);
  for(const source of SOURCES){
    $('feed-'+source+'-form').addEventListener('submit',event=>{void bindFeed(source,event);});
    $('feed-'+source+'-remove').addEventListener('click',()=>{void unbindFeed(source);});
    $('feed-'+source+'-reveal').addEventListener('click',()=>{const input=$('feed-'+source+'-url'),show=input.type==='password';input.type=show?'text':'password';$('feed-'+source+'-reveal').textContent=show?'隐藏':'显示';$('feed-'+source+'-reveal').setAttribute('aria-pressed',String(show));});
  }
  return{refresh,refreshIfStale,openSettings,selectTab:openSettings,bindFeed,unbindFeed,sync,signOut,exportCalendar};
}
export function installForegroundRefresh(page,doc,win){
  let timer=null;
  const check=()=>{if(doc.visibilityState==='visible')void page.refreshIfStale();};
  const start=()=>{if(timer===null)timer=win.setInterval(check,15*60*1000);check();};
  const stop=()=>{if(timer!==null){win.clearInterval(timer);timer=null;}};
  doc.addEventListener('visibilitychange',check);win.addEventListener('pagehide',stop);win.addEventListener('pageshow',start);start();return stop;
}
if(typeof document!=='undefined'){const page=createAccountPage(document,globalThis.location);void page.refresh();installForegroundRefresh(page,document,globalThis.window);}
