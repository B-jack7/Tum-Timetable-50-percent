import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {randomBytes} from 'node:crypto';
import {generate} from 'selfsigned';
import {SignedXml} from 'xml-crypto';
import {AuthService,readAuthConfig,samlOptions,SESSION_COOKIE,ATTEMPT_COOKIE,loginCookie,sessionCookie} from './auth.mjs';
import {createApplication} from './index.mjs';

// Test-only ephemeral keys/certificates. No key fixture, real credential or SAML response is persisted.
const certOptions={keySize:2048,algorithm:'sha256',notBeforeDate:new Date(Date.now()-60_000),notAfterDate:new Date(Date.now()+86400_000)};
const [sp,idp]=await Promise.all(['sp.test.invalid','idp.test.invalid'].map(value=>generate([{name:'commonName',value}],certOptions)));
const env={TUM_SSO_ENABLED:'true',TUM_SSO_REGISTRATION_CONFIRMED:'true',PUBLIC_ORIGIN:'https://timetable.example',SAML_SP_ENTITY_ID:'https://timetable.example/metadata',SAML_ACS_URL:'https://timetable.example/api/auth/callback',SAML_IDP_ENTRY_POINT:'https://login.tum.de/idp/profile/SAML2/Redirect/SSO',SAML_IDP_ISSUER:'https://tumidp.lrz.de/idp/shibboleth',SAML_IDP_CERT:idp.cert,SAML_SP_PRIVATE_KEY:sp.private,SAML_SP_CERT:sp.cert,SAML_SUBJECT_ATTRIBUTE:'urn:test:stable-subject',SESSION_SECRET:randomBytes(32).toString('base64url')};
const config=readAuthConfig(env);
assert.equal(config.configured,true,'fresh matching test certificates should enable the explicit test configuration');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const uid=()=> '_'+randomBytes(16).toString('hex');
function sign(xml,element){
  const xpath=`/*[local-name()='${element}']`;
  const signer=new SignedXml({privateKey:idp.private,publicCert:idp.cert,signatureAlgorithm:'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',canonicalizationAlgorithm:'http://www.w3.org/2001/10/xml-exc-c14n#'});
  signer.addReference({xpath,transforms:['http://www.w3.org/2000/09/xmldsig#enveloped-signature','http://www.w3.org/2001/10/xml-exc-c14n#'],digestAlgorithm:'http://www.w3.org/2001/04/xmlenc#sha256'});
  signer.computeSignature(xml,{location:{reference:xpath+"/*[local-name()='Issuer']",action:'after'}});return signer.getSignedXml();
}
function responseFor(requestId,{subject='subject-one',issuer=config.idpIssuer,audience=config.entityId,recipient=config.acs,destination=config.acs,inResponseTo=requestId,assertionId=uid(),expired=false,unsigned=false}={}){
  const now=Date.now(),instant=new Date(now-(expired?600_000:0)).toISOString(),before=new Date(now-(expired?660_000:30_000)).toISOString(),until=new Date(now+(expired?-300_000:120_000)).toISOString();
  let assertion=`<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${assertionId}" Version="2.0" IssueInstant="${instant}"><saml:Issuer>${esc(issuer)}</saml:Issuer><saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:persistent">test-pairwise-name</saml:NameID><saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><saml:SubjectConfirmationData Recipient="${esc(recipient)}" InResponseTo="${esc(inResponseTo)}" NotOnOrAfter="${until}"/></saml:SubjectConfirmation></saml:Subject><saml:Conditions NotBefore="${before}" NotOnOrAfter="${until}"><saml:AudienceRestriction><saml:Audience>${esc(audience)}</saml:Audience></saml:AudienceRestriction></saml:Conditions><saml:AuthnStatement AuthnInstant="${instant}" SessionIndex="${uid()}"><saml:AuthnContext><saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef></saml:AuthnContext></saml:AuthnStatement><saml:AttributeStatement><saml:Attribute Name="urn:test:stable-subject"><saml:AttributeValue>${esc(subject)}</saml:AttributeValue></saml:Attribute></saml:AttributeStatement></saml:Assertion>`;
  if(!unsigned)assertion=sign(assertion,'Assertion');
  let response=`<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="${uid()}" Version="2.0" IssueInstant="${instant}" InResponseTo="${esc(inResponseTo)}"${destination===null?'':` Destination="${esc(destination)}"`}><saml:Issuer>${esc(issuer)}</saml:Issuer><samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>${assertion}</samlp:Response>`;
  if(!unsigned)response=sign(response,'Response');return Buffer.from(response).toString('base64');
}
async function begin(auth){const start=await auth.begin();const relay=new URL(start.location).searchParams.get('RelayState');const attempt=[...auth.attempts.values()].at(-1);return{...start,relay,requestId:attempt.requestId};}
const complete=(auth,start,response)=>auth.complete({relay:start.relay,browserNonce:start.browserNonce,response});

test('SSO fails closed unless registration and every explicit env setting are valid',()=>{
  assert.equal(readAuthConfig({}).configured,false);
  assert.equal(readAuthConfig({...env,TUM_SSO_ENABLED:'false'}).configured,false);
  assert.equal(readAuthConfig({...env,TUM_SSO_REGISTRATION_CONFIRMED:'false'}).configured,false);
  for(const name of ['SAML_IDP_CERT','SAML_SP_PRIVATE_KEY','SAML_SUBJECT_ATTRIBUTE','SESSION_SECRET'])assert.equal(readAuthConfig({...env,[name]:''}).configured,false,name);
  for(const overrides of [{PUBLIC_ORIGIN:'http://timetable.example'},{SAML_ACS_URL:'https://evil.example/callback'},{SAML_IDP_ENTRY_POINT:'https://evil.example/sso'},{SAML_IDP_ISSUER:'https://evil.example/idp'},{SAML_SP_CERT:idp.cert},{SESSION_SECRET:'weak'}])assert.equal(readAuthConfig({...env,...overrides}).configured,false);
  assert.equal(readAuthConfig({...env,SAML_DECRYPTION_PRIVATE_KEY:idp.private}).configured,false,'decryption key must match published SP certificate');assert.equal(readAuthConfig({...env,SAML_DECRYPTION_PRIVATE_KEY:sp.private}).configured,true);
  assert.equal(samlOptions(config,{}).validateInResponseTo,'always');assert.equal(samlOptions(config,{}).wantAuthnResponseSigned,true);assert.equal(samlOptions(config,{}).wantAssertionsSigned,true);assert.equal(samlOptions(config,{}).audience,config.entityId);
});
test('real signed response creates an opaque session only after library validation',async()=>{
  const auth=new AuthService(config),start=await begin(auth);assert.equal(auth.sessions.size,0);
  const result=await complete(auth,start,responseFor(start.requestId));assert.equal(result.session.user.id.length,43);assert.notEqual(result.session.user.id,'subject-one');assert.equal(auth.session(result.cookie).user.id,result.session.user.id);
  assert.match(start.location,/Signature=/);assert.match(auth.metadata(),/AssertionConsumerService/);assert.ok(!auth.metadata().includes(sp.private));
  await assert.rejects(complete(auth,start,responseFor(start.requestId)));assert.equal(auth.sessions.size,1,'replayed RelayState cannot create a session');
});
test('unsigned, tampered, issuer, audience, request, recipient and expiry violations all reject',async()=>{
  for(const failure of ['unsigned','tampered','issuer','audience','request','recipient','expired']){
    const auth=new AuthService(config),start=await begin(auth);
    const options={unsigned:failure==='unsigned',issuer:failure==='issuer'?'https://wrong.example/idp':config.idpIssuer,audience:failure==='audience'?'https://wrong.example/sp':config.entityId,recipient:failure==='recipient'?'https://wrong.example/acs':config.acs,inResponseTo:failure==='request'?uid():start.requestId,expired:failure==='expired'};
    let response=responseFor(start.requestId,options);if(failure==='tampered')response=Buffer.from(Buffer.from(response,'base64').toString().replace('subject-one','subject-tampered')).toString('base64');
    await assert.rejects(complete(auth,start,response),failure);assert.equal(auth.sessions.size,0,failure+' must never create a session');
  }
});
test('validly signed responses with a wrong or missing Destination are rejected after signature validation',async()=>{
  for(const destination of ['https://wrong.example/callback',null]){const auth=new AuthService(config),start=await begin(auth);await assert.rejects(complete(auth,start,responseFor(start.requestId,{destination})),/destination-binding/);assert.equal(auth.sessions.size,0);}
});
test('browser binding, atomic callback consumption, expiry and assertion replay remain enforced',async()=>{
  const auth=new AuthService(config),start=await begin(auth),response=responseFor(start.requestId);
  await assert.rejects(auth.complete({...start,response,browserNonce:randomBytes(32).toString('base64url')}));assert.equal(auth.sessions.size,0);
  const results=await Promise.allSettled([complete(auth,start,response),complete(auth,start,response)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(auth.sessions.size,1);
  const reused=uid(),one=await begin(auth);await complete(auth,one,responseFor(one.requestId,{assertionId:reused}));const two=await begin(auth);await assert.rejects(complete(auth,two,responseFor(two.requestId,{assertionId:reused})));
  let clock=Date.now();const expiry=new AuthService(config,{now:()=>clock}),pending=await begin(expiry);clock+=6*60_000;await assert.rejects(complete(expiry,pending,responseFor(pending.requestId)));
});
test('users and CSRF tokens are isolated; cookies are host-only, secure and httpOnly',async()=>{
  const auth=new AuthService(config),a=await begin(auth),alice=await complete(auth,a,responseFor(a.requestId,{subject:'alice'})),b=await begin(auth),bob=await complete(auth,b,responseFor(b.requestId,{subject:'bob'}));
  assert.notEqual(alice.cookie,bob.cookie);assert.notEqual(alice.session.user.id,bob.session.user.id);assert.equal(auth.logout(alice.cookie,bob.session.csrfToken),false);assert.equal(auth.session(alice.cookie).user.id,alice.session.user.id);assert.equal(auth.logout(alice.cookie,alice.session.csrfToken),true);assert.ok(auth.session(bob.cookie));
  for(const cookie of [loginCookie('test'),sessionCookie('test')]){assert.match(cookie,/^__Host-/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/Path=\//);assert.ok(!cookie.includes('Domain='));}
});
async function withServer(application,fn){const server=http.createServer(application);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}}
test('unconfigured HTTP API and private static paths do not bypass authentication',async()=>{
  await withServer(createApplication({config:readAuthConfig({})}),async base=>{
    const status=await fetch(base+'/api/auth/status');assert.match(status.headers.get('cache-control'),/no-store/);assert.equal((await status.json()).configured,false);
    assert.equal((await fetch(base+'/api/auth/login',{redirect:'manual'})).status,503);assert.equal((await fetch(base+'/api/courses')).status,401);assert.equal((await fetch(base+'/sw.js')).status,404);
    const account=await fetch(base+'/account.html',{redirect:'manual'});assert.equal(account.status,303);assert.equal(account.headers.get('location'),'/login.html');assert.match(account.headers.get('cache-control'),/no-store/);
    const shell=await fetch(base+'/');assert.match(await shell.text(),/id="tum-signin"[^>]*disabled/);
  });
});
test('HTTP callback sets no session on rejection; verified callback and CSRF logout work',async()=>{
  const auth=new AuthService(config);
  await withServer(createApplication({config,auth}),async base=>{
    const rejected=await fetch(base+'/api/auth/callback',{method:'POST',redirect:'manual',body:new URLSearchParams({SAMLResponse:'forged',RelayState:'bad'})});assert.equal(rejected.status,303);assert.equal(auth.sessions.size,0);assert.ok(!rejected.headers.getSetCookie().some(c=>c.startsWith(SESSION_COOKIE+'=')));
    const startResponse=await fetch(base+'/api/auth/login',{redirect:'manual'}),location=new URL(startResponse.headers.get('location')),relay=location.searchParams.get('RelayState'),nonce=startResponse.headers.getSetCookie().find(c=>c.startsWith(ATTEMPT_COOKIE+'=')).split(';')[0];const request=[...auth.attempts.values()].at(-1);
    const callback=await fetch(base+'/api/auth/callback',{method:'POST',redirect:'manual',headers:{cookie:nonce},body:new URLSearchParams({SAMLResponse:responseFor(request.requestId),RelayState:relay})});assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/account.html');
    const cookie=callback.headers.getSetCookie().find(c=>c.startsWith(SESSION_COOKIE+'=')).split(';')[0];const meResponse=await fetch(base+'/api/auth/me',{headers:{cookie}}),me=await meResponse.json();assert.equal(me.authenticated,true);assert.deepEqual(me.courses,[]);assert.equal(me.courseSync.connected,false);assert.ok(!JSON.stringify(me).includes('subject-one'));
    const wrongOrigin=await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie,origin:'https://evil.example','x-csrf-token':me.csrfToken}});assert.equal(wrongOrigin.status,403);
    assert.equal((await fetch(base+'/api/auth/logout',{method:'POST',headers:{cookie,origin:config.origin,'x-csrf-token':me.csrfToken}})).status,200);assert.equal((await(await fetch(base+'/api/auth/me',{headers:{cookie}})).json()).authenticated,false);
  });
});
test('loopback reverse-proxy users do not share a 20-request bucket; browser-bound retries are limited',async()=>{
  await withServer(createApplication({config}),async base=>{
    for(let i=0;i<25;i++)assert.equal((await fetch(base+'/api/auth/login',{redirect:'manual'})).status,302,'separate anonymous users behind a proxy');
    const cookie=ATTEMPT_COOKIE+'='+randomBytes(32).toString('base64url');
    for(let i=0;i<20;i++)assert.equal((await fetch(base+'/api/auth/login',{redirect:'manual',headers:{cookie}})).status,302);
    assert.equal((await fetch(base+'/api/auth/login',{redirect:'manual',headers:{cookie}})).status,429);
  });
});
test('login UI resets stale authenticated state and fails closed on malformed providers/sessions',async()=>{
  const script=await fs.readFile(new URL('../public/auth.js',import.meta.url),'utf8'),elements=new Map(),events=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,disabled:false,textContent:'',classList:{add(){},remove(){}},addEventListener(name,fn){events.set(id+':'+name,fn);}});return elements.get(id);};
  let reply={configured:true,state:'ready',provider:'tum-saml',authenticated:true,loginUrl:'/api/auth/login'},me={authenticated:true,user:{id:'a'.repeat(43)}};
  vm.runInNewContext(script,{document:{getElementById:element},location:{search:'',assign(){}},URLSearchParams,fetch:async url=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>url.endsWith('/me')?me:reply})});await new Promise(setImmediate);
  assert.equal(element('open-account').hidden,false);reply={...reply,authenticated:false};await events.get('check-auth:click')();assert.equal(element('open-account').hidden,true);assert.equal(element('tum-signin').hidden,false);assert.equal(element('tum-signin').disabled,false);
  reply={...reply,provider:'fake-provider',authenticated:true};await events.get('check-auth:click')();assert.equal(element('open-account').hidden,true);assert.equal(element('tum-signin').disabled,true);
  reply={...reply,provider:'tum-saml'};me={authenticated:false,user:null};await events.get('check-auth:click')();assert.equal(element('open-account').hidden,true);assert.equal(element('tum-signin').disabled,true);
});
