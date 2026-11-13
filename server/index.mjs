import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {AUTH_PATHS,ATTEMPT_COOKIE,SESSION_COOKIE,AuthService,readAuthConfig,parseCookies,loginCookie,sessionCookie} from './auth.mjs';
const PUBLIC=fileURLToPath(new URL('../public/',import.meta.url));
const noStore={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','Expires':'0','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const json=(res,status,value,extra={})=>{res.writeHead(status,{...noStore,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(value));};
const redirect=(res,location,status=303,extra={})=>{res.writeHead(status,{...noStore,Location:location,...extra});res.end();};
async function formBody(req){
  if(!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type']||''))throw Error('form-content-type');
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error('body-too-large');chunks.push(chunk);}
  const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  if(form.getAll('SAMLResponse').length!==1||form.getAll('RelayState').length!==1||!form.get('SAMLResponse')||form.has('SAMLRequest'))throw Error('ambiguous-saml-form');
  return{response:form.get('SAMLResponse'),relay:form.get('RelayState')};
}
export function createApplication({config=readAuthConfig(),publicDir=PUBLIC,auth=new AuthService(config)}={}){
  // Bound work globally and by browser/session. Never trust client-supplied X-Forwarded-For.
  // A loopback reverse proxy is shared by all users, so it must not become a campus-wide 20/minute IP bucket.
  const rates=new Map();let globalWindow={start:Date.now(),count:0};
  function allowed(req,cookies){
    const now=Date.now();if(now-globalWindow.start>60_000)globalWindow={start:now,count:0};if(++globalWindow.count>1200)return false;
    const browser=[cookies[SESSION_COOKIE],cookies[ATTEMPT_COOKIE]].find(value=>/^[A-Za-z0-9_-]{43}$/.test(value||'')),address=req.socket.remoteAddress||'unknown';
    const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(address),key=browser?'browser:'+browser:loopback?null:'direct-ip:'+address;
    if(!key)return true;let row=rates.get(key);if(!row||now-row.start>60_000){row={start:now,count:0};rates.set(key,row);}
    if(rates.size>2400)for(const[k,v]of rates)if(now-v.start>60_000)rates.delete(k);
    return ++row.count<=(browser?20:60);
  }
  return async(req,res)=>{
    try{
      const url=new URL(req.url,'http://local.invalid'),cookies=parseCookies(req.headers.cookie),session=auth.session(cookies[SESSION_COOKIE]);
      if(url.pathname.startsWith('/api/')){
        if(url.pathname===AUTH_PATHS.status&&req.method==='GET')return json(res,200,{configured:config.configured,state:config.configured?'ready':'not-configured',provider:'tum-saml',authenticated:Boolean(session),loginUrl:config.configured?AUTH_PATHS.login:null,courseAccess:false});
        if(url.pathname===AUTH_PATHS.me&&req.method==='GET')return json(res,200,{authenticated:Boolean(session),user:session?.user||null,...(session?{csrfToken:session.csrfToken}:{}),courses:[],courseSync:{connected:false,reason:'not-connected'}});
        if(url.pathname===AUTH_PATHS.logout&&req.method==='POST'){
          if(!session)return json(res,200,{authenticated:false});
          if(req.headers.origin!==config.origin||!auth.logout(cookies[SESSION_COOKIE],req.headers['x-csrf-token']))return json(res,403,{error:'csrf-rejected'});
          return json(res,200,{authenticated:false},{'Set-Cookie':sessionCookie('',0)});
        }
        if([AUTH_PATHS.login,AUTH_PATHS.callback,AUTH_PATHS.metadata].includes(url.pathname)&&!config.configured)return json(res,503,{error:'sso-not-configured',message:'TUM SSO 尚待学校接入 / Awaiting institutional setup'});
        if(url.pathname===AUTH_PATHS.login&&req.method==='GET'){
          if(!allowed(req,cookies))return json(res,429,{error:'too-many-attempts'});
          try{const start=await auth.begin(cookies[SESSION_COOKIE]);return redirect(res,start.location,302,{'Set-Cookie':loginCookie(start.browserNonce)});}catch{return json(res,503,{error:'login-unavailable'});}
        }
        if(url.pathname===AUTH_PATHS.callback&&req.method==='POST'){
          if(!allowed(req,cookies))return json(res,429,{error:'too-many-attempts'});
          try{const values=await formBody(req);const result=await auth.complete({...values,browserNonce:cookies[ATTEMPT_COOKIE]});return redirect(res,'/account.html',303,{'Set-Cookie':[loginCookie('',0),sessionCookie(result.cookie)]});}catch{return redirect(res,'/login.html?error=authentication-failed',303,{'Set-Cookie':loginCookie('',0)});}
        }
        if(url.pathname===AUTH_PATHS.metadata&&req.method==='GET'){res.writeHead(200,{...noStore,'Content-Type':'application/samlmetadata+xml; charset=utf-8'});res.end(auth.metadata());return;}
        if(!session)return json(res,401,{error:'authentication-required'});
        if(url.pathname==='/api/courses'&&req.method==='GET')return json(res,200,{courses:[],source:'not-connected',message:'Authentication does not grant course API access.'});
        return json(res,404,{error:'not-found'});
      }
      if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'method-not-allowed'});
      // This private BFF deliberately does not expose an offline worker or cache account pages.
      if(url.pathname==='/sw.js')return json(res,404,{error:'not-found'});
      const publicAsset=['/','/index.html','/login.html','/auth.js','/auth.css'].includes(url.pathname)||/^\/icons\/[a-z0-9_.-]+$/i.test(url.pathname);
      if(!publicAsset&&!session)return redirect(res,'/login.html');
      let route=['/','/index.html'].includes(url.pathname)?'/login.html':decodeURIComponent(url.pathname);
      if(route.includes('\\')||route.includes('\0')||route.split('/').some(part=>part.startsWith('.')))return json(res,404,{error:'not-found'});
      if(route.endsWith('/'))route+='index.html';
      const target=path.resolve(publicDir,'.'+route),root=path.resolve(publicDir)+path.sep;
      if(!target.startsWith(root))return json(res,404,{error:'not-found'});
      let bytes;try{bytes=await fs.readFile(target);}catch{return json(res,404,{error:'not-found'});}
      res.writeHead(200,{...noStore,'Content-Type':types[path.extname(target)]||'application/octet-stream','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{if(!res.headersSent)json(res,400,{error:'bad-request'});else res.end();}
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const config=readAuthConfig();
  if(!config.configured)console.info('TUM SSO not configured: serving login/setup state only.');
  const server=http.createServer(createApplication({config}));
  server.requestTimeout=15_000;server.headersTimeout=10_000;server.maxHeadersCount=60;
  server.listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.info('Tum Timetable BFF listening on http://127.0.0.1:'+(Number(process.env.PORT)||3000)));
}
