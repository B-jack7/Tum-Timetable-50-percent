import {randomBytes,randomUUID,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';

export const LOCAL_SESSION_COOKIE='__Host-tt-local';
export const SCRYPT_PARAMETERS=Object.freeze({N:32768,r:8,p:3,maxmem:64*1024*1024});
const SESSION_TTL=14*24*60*60*1000;
const NO_STORE={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Vary':'Cookie, Origin','X-Content-Type-Options':'nosniff'};
export class LocalAuthError extends Error{
  constructor(status,code,message,retryAfter){super(message);this.name='LocalAuthError';this.status=status;this.code=code;this.retryAfter=retryAfter;}
}
const fail=(status,code,message,retryAfter)=>{throw new LocalAuthError(status,code,message,retryAfter);};
const sha=value=>createHash('sha256').update(String(value)).digest('hex');
const csrfFor=token=>createHash('sha256').update('tum-timetable-csrf-v1:'+token).digest('base64url');
const safeEqual=(a,b)=>timingSafeEqual(Buffer.from(sha(a)),Buffer.from(sha(b)));
export function normalizeUsername(value){
  if(typeof value!=='string')fail(400,'invalid_username','用户名须为 3–32 位字母、数字、点、下划线或连字符。');
  const trimmed=value.trim();
  if(!/^[\x00-\x7f]*$/.test(trimmed))fail(400,'invalid_username','用户名须使用 ASCII 字母、数字、点、下划线或连字符。');
  const normalized=trimmed.toLowerCase();
  if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalized))fail(400,'invalid_username','用户名须为 3–32 位 ASCII 字符，并以字母或数字开头。');
  return normalized;
}
function validatePassword(value){
  if(typeof value!=='string'||Array.from(value).length<8||Array.from(value).length>128)fail(400,'invalid_password','本应用密码须为 8–128 个字符。请勿填写学校密码。');
  return value;
}
// A single native scrypt operation uses ~32 MiB. Serialize per isolate and bound queued work.
let kdfRunning=false;const kdfQueue=[];
function derive(password,salt){
  if(kdfQueue.length>=8)return Promise.reject(new LocalAuthError(429,'authentication_busy','登录请求较多，请稍后再试。',3));
  return new Promise((resolve,reject)=>{kdfQueue.push({password,salt,resolve,reject});drainKdf();});
}
function drainKdf(){
  if(kdfRunning||!kdfQueue.length)return;kdfRunning=true;const job=kdfQueue.shift();
  try{scrypt(job.password,job.salt,32,SCRYPT_PARAMETERS,(error,result)=>{kdfRunning=false;if(error)job.reject(error);else job.resolve(result);drainKdf();});}
  catch(error){kdfRunning=false;job.reject(error);drainKdf();}
}
const HASH_PATTERN=/^\$scrypt\$N=32768,r=8,p=3\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;
// Not an account credential: equal-cost work for unknown usernames without generating a second KDF.
const DUMMY_HASH='$scrypt$N=32768,r=8,p=3$'+Buffer.from('dummy-account-v1').toString('base64url')+'$'+Buffer.alloc(32).toString('base64url');
export async function hashPassword(password){
  validatePassword(password);const salt=randomBytes(16),key=await derive(password,salt);
  return '$scrypt$N=32768,r=8,p=3$'+salt.toString('base64url')+'$'+key.toString('base64url');
}
export async function verifyPassword(password,encoded){
  const match=typeof encoded==='string'?encoded.match(HASH_PATTERN):null;
  const parts=match||DUMMY_HASH.match(HASH_PATTERN),salt=Buffer.from(parts[1],'base64url'),expected=Buffer.from(parts[2],'base64url');
  const key=await derive(password,salt);return Boolean(match)&&expected.length===32&&timingSafeEqual(key,expected);
}
export const localSessionCookie=(value,maxAge=SESSION_TTL/1000)=>`${LOCAL_SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
function readToken(request){
  const values=(request.headers.get('Cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(LOCAL_SESSION_COOKIE+'='));
  if(values.length!==1)return null;const token=values[0].slice(LOCAL_SESSION_COOKIE.length+1);return/^[A-Za-z0-9_-]{43}$/.test(token)?token:null;
}
export function localJson(value,status=200,headers={}){return new Response(JSON.stringify(value),{status,headers:{...NO_STORE,'Content-Type':'application/json; charset=utf-8',...headers}});}
export function localAuthErrorResponse(error){
  if(error instanceof LocalAuthError)return localJson({error:error.code,message:error.message},error.status,error.retryAfter?{'Retry-After':String(error.retryAfter)}:{});
  return localJson({error:'authentication_unavailable',message:'账户服务暂时不可用，请稍后再试。'},503);
}
async function readCredentials(request){
  if(request.method!=='POST')fail(405,'method_not_allowed','此操作需要 POST 请求。');
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail(415,'json_required','请使用 JSON 请求。');
  if(Number(request.headers.get('Content-Length')||0)>8192)fail(413,'request_too_large','请求内容过大。');
  const reader=request.body?.getReader();if(!reader)fail(400,'invalid_request','请输入用户名和本应用密码。');
  let size=0;const chunks=[];
  try{for(;;){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();fail(413,'request_too_large','请求内容过大。');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail(400,'invalid_request','请输入有效的用户名和本应用密码。');}
  if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'invalid_request','请输入用户名和本应用密码。');
  return{username:normalizeUsername(body.username),password:validatePassword(body.password)};
}
let lastCleanup=0;
export function createLocalAuth({store,expectedOrigin,now=()=>Date.now(),sessionTtlMs=SESSION_TTL,getClientAddress=request=>request.headers.get('CF-Connecting-IP')||'unavailable',rateLimits={}}){
  if(!store?.users||!store?.sessions||!store?.rates)throw Error('A persistent authentication store is required');
  let origin;try{origin=new URL(expectedOrigin);}catch{throw Error('expectedOrigin must be configured explicitly');}
  if(origin.origin!==expectedOrigin||origin.protocol!=='https:')throw Error('expectedOrigin must be an exact HTTPS origin');
  if(!Number.isSafeInteger(sessionTtlMs)||sessionTtlMs<60_000||sessionTtlMs>30*24*60*60*1000)throw Error('Invalid session lifetime');
  const limits={registerIp:8,registerUsername:3,loginIp:60,loginUsername:20,...rateLimits};
  const assertOrigin=request=>{if(request.headers.get('Origin')!==expectedOrigin||request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'origin_rejected','请求来源不匹配，请从本站页面重新操作。');};
  async function rate(request,username,operation){
    const time=now(),duration=operation==='register'?60*60*1000:15*60*1000,windowStart=Math.floor(time/duration)*duration,expiresAt=windowStart+duration;
    const address=String(getClientAddress(request)||'unavailable').slice(0,128),pairs=[[`${operation}:ip:${address}`,limits[operation+'Ip']],[`${operation}:username:${username}`,limits[operation+'Username']]];
    const counts=await Promise.all(pairs.map(async([key,limit])=>({count:await store.rates.hit({keyHash:sha(key),windowStart,expiresAt}),limit})));
    if(counts.some(row=>row.count>row.limit))fail(429,'rate_limited','尝试次数较多，请稍后再试。',Math.max(1,Math.ceil((expiresAt-time)/1000)));
    if(time-lastCleanup>60_000){lastCleanup=time;await store.cleanup?.(time);}
  }
  async function requireSession(request,{csrf=false}={}){
    const token=readToken(request);if(!token)fail(401,'authentication_required','请先登录本应用账户。');
    const session=await store.sessions.get(sha(token),now());if(!session)fail(401,'authentication_required','登录已过期，请重新登录。');
    const csrfToken=csrfFor(token);
    if(csrf){assertOrigin(request);if(!safeEqual(sha(request.headers.get('X-CSRF-Token')||''),session.csrfHash)||!safeEqual(csrfToken,request.headers.get('X-CSRF-Token')||''))fail(403,'csrf_rejected','操作验证已失效，请刷新页面后重试。');}
    return{user:{id:session.user.id,username:session.user.username},session,csrfToken};
  }
  async function issueSession(request,user,status){
    const time=now(),token=randomBytes(32).toString('base64url'),csrfToken=csrfFor(token),tokenHash=sha(token);
    await store.sessions.create({tokenHash,userId:user.id,csrfHash:sha(csrfToken),createdAt:time,expiresAt:time+sessionTtlMs});
    const previous=readToken(request);if(previous)await store.sessions.remove(sha(previous));
    return localJson({authenticated:true,user:{id:user.id,username:user.username},csrfToken},status,{'Set-Cookie':localSessionCookie(token,Math.floor(sessionTtlMs/1000))});
  }
  const handle=fn=>async request=>{try{return await fn(request);}catch(error){return localAuthErrorResponse(error);}};
  return{
    requireSession,
    register:handle(async request=>{
      assertOrigin(request);const{username,password}=await readCredentials(request);await rate(request,username,'register');
      const passwordHash=await hashPassword(password),user=await store.users.create({id:randomUUID(),username,passwordHash,createdAt:now()});
      if(!user)fail(409,'username_unavailable','这个用户名不可用，请换一个用户名。');return issueSession(request,user,201);
    }),
    login:handle(async request=>{
      assertOrigin(request);const{username,password}=await readCredentials(request);await rate(request,username,'login');
      const user=await store.users.getByUsername(username),valid=await verifyPassword(password,user?.passwordHash);
      if(!user||!valid)fail(401,'invalid_credentials','用户名或本应用密码不正确。');return issueSession(request,user,200);
    }),
    me:handle(async request=>{
      if(request.method!=='GET')fail(405,'method_not_allowed','此操作需要 GET 请求。');
      try{const context=await requireSession(request);return localJson({authenticated:true,user:context.user,csrfToken:context.csrfToken});}
      catch(error){if(error instanceof LocalAuthError&&error.status===401)return localJson({authenticated:false,user:null});throw error;}
    }),
    logout:handle(async request=>{
      if(request.method!=='POST')fail(405,'method_not_allowed','此操作需要 POST 请求。');
      const context=await requireSession(request,{csrf:true});await store.sessions.remove(context.session.tokenHash);
      return localJson({authenticated:false,user:null},200,{'Set-Cookie':localSessionCookie('',0)});
    }),
  };
}
