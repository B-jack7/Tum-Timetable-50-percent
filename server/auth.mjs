import {randomBytes,createHash,createHmac,timingSafeEqual,createPrivateKey,X509Certificate} from 'node:crypto';
import {SAML,InMemoryCacheProvider} from '@node-saml/node-saml';
import {DOMParser} from '@xmldom/xmldom';

export const AUTH_PATHS=Object.freeze({status:'/api/auth/status',me:'/api/auth/me',login:'/api/auth/login',callback:'/api/auth/callback',logout:'/api/auth/logout',metadata:'/api/auth/metadata'});
export const ATTEMPT_COOKIE='__Host-tt-saml';
export const SESSION_COOKIE='__Host-tt-session';
const REQUEST_TTL=5*60*1000,SESSION_TTL=8*60*60*1000;
const required=['PUBLIC_ORIGIN','SAML_SP_ENTITY_ID','SAML_ACS_URL','SAML_IDP_ENTRY_POINT','SAML_IDP_ISSUER','SAML_IDP_CERT','SAML_SP_PRIVATE_KEY','SAML_SP_CERT','SAML_SUBJECT_ATTRIBUTE','SESSION_SECRET'];
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const equal=(a,b)=>timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
const token=()=>randomBytes(32).toString('base64url');
const pem=value=>String(value||'').replace(/\\n/g,'\n').trim();

// No values, keys, certificates or metadata are guessed or downloaded at runtime.
export function readAuthConfig(env=process.env){
  if(env.TUM_SSO_ENABLED!=='true'||env.TUM_SSO_REGISTRATION_CONFIRMED!=='true')return{configured:false,reason:'not-configured'};
  if(required.some(name=>!env[name]?.trim()))return{configured:false,reason:'incomplete-config'};
  try{
    const origin=new URL(env.PUBLIC_ORIGIN);
    if(origin.protocol!=='https:'||origin.href!==origin.origin+'/')throw Error('origin');
    const acs=new URL(env.SAML_ACS_URL),entry=new URL(env.SAML_IDP_ENTRY_POINT),entity=new URL(env.SAML_SP_ENTITY_ID);
    if(acs.href!==origin.origin+AUTH_PATHS.callback||acs.search||acs.hash)throw Error('acs');
    if(entity.protocol!=='https:'||entity.hash||entity.username||entity.password)throw Error('entity');
    if(entry.protocol!=='https:'||entry.username||entry.password||entry.hash||!['login.tum.de','tumidp.lrz.de'].includes(entry.hostname))throw Error('entry');
    if(env.SAML_IDP_ISSUER!=='https://tumidp.lrz.de/idp/shibboleth')throw Error('issuer');
    if(!/^[A-Za-z0-9_-]{43,}$/.test(env.SESSION_SECRET)||Buffer.from(env.SESSION_SECRET,'base64url').length<32)throw Error('secret');
    const spKey=pem(env.SAML_SP_PRIVATE_KEY),spCert=pem(env.SAML_SP_CERT),idpCert=pem(env.SAML_IDP_CERT);
    const key=createPrivateKey(spKey),sp=new X509Certificate(spCert),idp=new X509Certificate(idpCert);
    if(!sp.checkPrivateKey(key)||key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails.modulusLength<2048)throw Error('sp-key');
    for(const cert of [sp,idp])if(Date.parse(cert.validFrom)>Date.now()||Date.parse(cert.validTo)<=Date.now())throw Error('certificate-validity');
    const subjectAttribute=env.SAML_SUBJECT_ATTRIBUTE.trim();
    if(subjectAttribute.length>256)throw Error('subject');
    const config={configured:true,origin:origin.origin,acs:acs.href,entityId:entity.href,idpEntryPoint:entry.href,idpIssuer:env.SAML_IDP_ISSUER,idpCert,spKey,spCert,subjectAttribute,secret:env.SESSION_SECRET};
    if(env.SAML_DECRYPTION_PRIVATE_KEY){
      config.decryptionKey=pem(env.SAML_DECRYPTION_PRIVATE_KEY);
      const decryptionKey=createPrivateKey(config.decryptionKey);
      if(!sp.checkPrivateKey(decryptionKey)||decryptionKey.asymmetricKeyType!=='rsa'||decryptionKey.asymmetricKeyDetails.modulusLength<2048)throw Error('decryption-key');
    }
    return config;
  }catch{return{configured:false,reason:'invalid-config'};}
}
export function samlOptions(config,cacheProvider,requestId){
  return{callbackUrl:config.acs,issuer:config.entityId,audience:config.entityId,entryPoint:config.idpEntryPoint,idpIssuer:config.idpIssuer,idpCert:config.idpCert,privateKey:config.spKey,publicCert:config.spCert,...(config.decryptionKey?{decryptionPvk:config.decryptionKey}:{}),signatureAlgorithm:'sha256',digestAlgorithm:'sha256',wantAssertionsSigned:true,wantAuthnResponseSigned:true,validateInResponseTo:'always',rejectReplayedAssertions:true,acceptedClockSkewMs:60_000,maxAssertionAgeMs:REQUEST_TTL,requestIdExpirationPeriodMs:REQUEST_TTL,cacheProvider,identifierFormat:config.subjectAttribute==='nameID'?'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent':null,disableRequestedAuthnContext:true,...(requestId?{generateUniqueId:()=>requestId}:{})};
}

// These are additional browser/request bindings, applied only AFTER node-saml validates signatures.
// v5.2 does not yet enforce Recipient against callbackUrl, so inspect the verified assertion accessor.
export function verifiedSubject(profile,requestId,config,now=Date.now()){
  if(!profile||profile.issuer!==config.idpIssuer||profile.inResponseTo!==requestId||typeof profile.getAssertion!=='function')throw Error('profile-binding');
  const assertion=profile.getAssertion()?.Assertion;
  const confirmations=assertion?.Subject?.[0]?.SubjectConfirmation||[];
  const recipientOk=confirmations.some(c=>{
    const data=c.SubjectConfirmationData?.[0]?.$;
    const until=Date.parse(data?.NotOnOrAfter),before=data?.NotBefore?Date.parse(data.NotBefore):-Infinity;
    return c.$?.Method==='urn:oasis:names:tc:SAML:2.0:cm:bearer'&&data?.Recipient===config.acs&&data?.InResponseTo===requestId&&Number.isFinite(until)&&until>now-60_000&&before<=now+60_000;
  });
  if(!recipientOk)throw Error('recipient-binding');
  let subject=config.subjectAttribute==='nameID'?profile.nameID:profile.attributes?.[config.subjectAttribute];
  if(config.subjectAttribute==='nameID'&&profile.nameIDFormat!=='urn:oasis:names:tc:SAML:2.0:nameid-format:persistent')throw Error('nonpersistent-subject');
  if(Array.isArray(subject))subject=subject.length===1?subject[0]:null;
  if(typeof subject!=='string'||!subject.trim()||subject.length>4096)throw Error('missing-approved-subject');
  return subject;
}
function verifiedResponseDestination(profile,config){
  // Called only after node-saml has required and verified BOTH the top-level Response and Assertion signatures.
  // Its legacy raw-response accessor is not generally trustworthy: the strict response-signature gate below is essential.
  const xml=profile.getSamlResponseXml?.();
  if(typeof xml!=='string'||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('response-xml-rejected');
  const reject=()=>{throw Error('response-xml-rejected');};
  const doc=new DOMParser({errorHandler:{warning:reject,error:reject,fatalError:reject}}).parseFromString(xml,'text/xml');
  const root=doc.documentElement;
  if(!root||root.localName!=='Response'||root.namespaceURI!=='urn:oasis:names:tc:SAML:2.0:protocol'||root.getAttribute('Destination')!==config.acs)throw Error('response-destination-binding');
}

export class AuthService{
  constructor(config,{now=()=>Date.now()}={}){this.config=config;this.now=now;this.attempts=new Map();this.sessions=new Map();this.cache=new InMemoryCacheProvider({keyExpirationPeriodMs:REQUEST_TTL});}
  prune(){const now=this.now();for(const[k,v]of this.attempts)if(v.expires<=now)this.attempts.delete(k);for(const[k,v]of this.sessions)if(v.expires<=now)this.sessions.delete(k);}
  session(cookie){this.prune();return cookie?this.sessions.get(digest(cookie))||null:null;}
  async begin(previousSession){
    if(!this.config.configured)throw Error('sso-not-configured');this.prune();
    if(this.attempts.size>=1000)throw Error('too-many-attempts');
    const relay=token(),browserNonce=token(),requestId='_'+randomBytes(24).toString('hex');
    const saml=new SAML(samlOptions(this.config,this.cache,requestId));
    const location=await saml.getAuthorizeUrlAsync(relay,{});
    if(new URL(location).origin!==new URL(this.config.idpEntryPoint).origin)throw Error('unexpected-idp-origin');
    this.attempts.set(digest(relay),{nonceHash:digest(browserNonce),requestId,saml,previousSession:previousSession?digest(previousSession):null,expires:this.now()+REQUEST_TTL});
    return{location,browserNonce};
  }
  async complete({relay,response,browserNonce}){
    if(!this.config.configured)throw Error('sso-not-configured');this.prune();
    if(!/^[A-Za-z0-9_-]{43}$/.test(relay||'')||!/^[A-Za-z0-9_-]{43}$/.test(browserNonce||''))throw Error('missing-login-state');
    const key=digest(relay),attempt=this.attempts.get(key);
    if(!attempt||!equal(attempt.nonceHash,digest(browserNonce)))throw Error('login-state-mismatch');
    // Consume synchronously before any await: even simultaneous callbacks get a single attempt.
    this.attempts.delete(key);
    if(attempt.saml.options.wantAuthnResponseSigned!==true||attempt.saml.options.wantAssertionsSigned!==true)throw Error('response-signature-policy');
    const result=await attempt.saml.validatePostResponseAsync({SAMLResponse:response});
    if(result.loggedOut||!result.profile)throw Error('not-an-authentication-response');
    verifiedResponseDestination(result.profile,this.config);
    const subject=verifiedSubject(result.profile,attempt.requestId,this.config,this.now());
    const id=createHmac('sha256',this.config.secret).update(JSON.stringify([this.config.idpIssuer,this.config.entityId,subject])).digest('base64url');
    if(this.sessions.size>=10000)throw Error('too-many-sessions');
    const value=token(),session={user:{id},csrfToken:token(),expires:this.now()+SESSION_TTL};
    if(attempt.previousSession)this.sessions.delete(attempt.previousSession);
    this.sessions.set(digest(value),session);return{cookie:value,session};
  }
  logout(cookie,csrf){const session=this.session(cookie);if(!session||!equal(session.csrfToken,csrf||''))return false;this.sessions.delete(digest(cookie));return true;}
  metadata(){if(!this.config.configured)throw Error('sso-not-configured');return new SAML(samlOptions(this.config,this.cache)).generateServiceProviderMetadata(this.config.decryptionKey?this.config.spCert:null,this.config.spCert);}
}

export function parseCookies(header=''){const values=Object.create(null);for(const pair of header.split(';')){const i=pair.indexOf('=');if(i>0){const name=pair.slice(0,i).trim();if(!(name in values))values[name]=pair.slice(i+1).trim();else values[name]='';}}return values;}
export const loginCookie=(value,maxAge=300)=>`${ATTEMPT_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`;
export const sessionCookie=(value,maxAge=SESSION_TTL/1000)=>`${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
