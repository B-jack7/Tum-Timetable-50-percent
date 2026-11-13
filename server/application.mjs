import {createLocalAuth,localJson,LocalAuthError,localAuthErrorResponse} from './local-auth.mjs';
import {createCalendarService} from './calendar-service.mjs';
import {CalendarError} from './calendars.mjs';
import {createHash} from 'node:crypto';

const SECURITY={'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; manifest-src 'self'"};
async function jsonBody(request){
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))throw new LocalAuthError(415,'json_required','请使用本站表单。');
  const reader=request.body?.getReader();if(!reader)throw new LocalAuthError(400,'invalid_request','请填写订阅链接。');
  const chunks=[];let size=0;
  try{for(;;){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new LocalAuthError(413,'request_too_large','请求内容过大。');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}
  catch{throw new LocalAuthError(400,'invalid_request','请使用有效的订阅链接。');}
}
const redirect=path=>new Response(null,{status:303,headers:{Location:path,'Cache-Control':'no-store'}});
export function createApplication({store,expectedOrigin,encryptionKey,assets,now,fetchImpl,getClientAddress}){
  const auth=createLocalAuth({store,expectedOrigin,now,getClientAddress});
  const calendar=createCalendarService({store,encryptionKey,now,fetchImpl});
  async function route(request){
    const path=new URL(request.url).pathname;
    if(path==='/api/auth/status'&&request.method==='GET')return localJson({mode:'local',configured:true});
    if(path==='/api/local/register')return auth.register(request);
    if(path==='/api/local/login')return auth.login(request);
    if(path==='/api/auth/me')return auth.me(request);
    if(path==='/api/auth/logout')return auth.logout(request);
    if(path.startsWith('/api/')){
      const mutating=!['GET','HEAD'].includes(request.method);
      const {user}=await auth.requireSession(request,{csrf:mutating});
      if(path==='/api/calendar'&&request.method==='GET')return localJson(await calendar.read(user.id));
      if(path==='/api/feeds'&&request.method==='POST'){
        const time=now?now():Date.now(),duration=60*60*1000,windowStart=Math.floor(time/duration)*duration;
        const count=await store.rates.hit({keyHash:createHash('sha256').update('bind:'+user.id).digest('hex'),windowStart,expiresAt:windowStart+duration});
        if(count>12)throw new LocalAuthError(429,'rate_limited','更换订阅链接较多，请稍后重试。',Math.ceil((windowStart+duration-time)/1000));
        return localJson(await calendar.bind(user.id,await jsonBody(request)));
      }
      if(path==='/api/sync'&&request.method==='POST')return localJson(await calendar.read(user.id,{force:true}));
      if(path.startsWith('/api/feeds/')&&request.method==='DELETE')return localJson(await calendar.unbind(user.id,path.slice('/api/feeds/'.length)));
      if(path==='/api/export.ics'&&request.method==='GET')return new Response(await calendar.export(user.id),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="Tum-Timetable.ics"','Cache-Control':'private, no-store'}});
      return localJson({error:'not_found'},404);
    }
    if(!['GET','HEAD'].includes(request.method))return localJson({error:'method_not_allowed'},405);
    let assetPath=path;
    if(['/', '/index.html','/login','/login.html'].includes(path)){
      try{await auth.requireSession(request);return redirect('/account.html');}catch(error){if(!(error instanceof LocalAuthError)||error.status!==401)throw error;}
      assetPath='/login.html';
    }
    if(path==='/account.html'||path==='/account'){
      try{await auth.requireSession(request);}catch(error){if(error instanceof LocalAuthError&&error.status===401)return redirect('/login.html');throw error;}
      assetPath='/account.html';
    }
    const asset=assets[assetPath];
    if(!asset)return new Response('Not found',{status:404});
    return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':asset.type.startsWith('text/html')?'private, no-store':'public, max-age=300'}});
  }
  return{
    async fetch(request){
      let response;
      try{response=await route(request);}
      catch(error){
        if(error instanceof CalendarError)response=localJson({error:error.code,message:'日历连接未完成，请检查官方订阅链接或稍后重试。'},400);
        else if(error instanceof LocalAuthError)response=localAuthErrorResponse(error);
        else response=localJson({error:'service_unavailable',message:'服务暂时不可用，请稍后重试。'},503);
      }
      const headers=new Headers(response.headers);for(const[k,v]of Object.entries(SECURITY))headers.set(k,v);
      return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    },
  };
}
