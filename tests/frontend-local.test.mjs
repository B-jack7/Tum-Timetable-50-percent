import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLoginPage, requestLocalAuth, validateCredentials } from '../public/auth.js';
import { createAccountPage as createPage, groupWeek, installForegroundRefresh, normalizeSubscription, parseCalendarPayload, requestAccountJson, safeActivityUrl, upcomingDeadlines } from '../public/account.js';

const createAccountPage=(doc,locationRef,fetchImpl,now)=>createPage(doc,locationRef,fetchImpl,now,async data=>{doc.getElementById('calendar').textContent=JSON.stringify(data);});

const json = (value, status=200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type':'application/json' } });
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.listeners={};this.value='';this.type='password';this.hidden=false;this.disabled=false;this.dataset={};this._text='';}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
  set innerHTML(_value){throw Error('Untrusted data must not be rendered with innerHTML.');}
  append(...items){for(const item of items){item.parent=this;this.children.push(item);}}replaceChildren(...items){this._text='';this.children=[];this.append(...items);}
  setAttribute(key,value){this.attributes[key]=String(value);}addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}focus(){}click(){}remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
}
function documentFixture(file){const html=fs.readFileSync(new URL('../public/'+file,import.meta.url),'utf8');const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],new Element()]));const tabs=['schedule','deadlines','settings'].map(name=>{const button=new Element('button');button.dataset.accountTab=name;return button;});const doc={body:new Element('body'),visibilityState:'visible',listeners:{},getElementById(id){if(!elements.has(id))throw Error('Missing element '+id);return elements.get(id);},createElement:tag=>new Element(tag),querySelectorAll:selector=>selector==='[data-account-tab]'?tabs:[],addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}};return{doc,elements,text:()=>[...elements.values()].map(el=>el.textContent).join('\n')};}
const session={authenticated:true,user:{id:'opaque-test-account',username:'student'},csrfToken:'mock-csrf'};
const emptyCalendar={events:[],feeds:[{source:'tumonline',bound:false,lastSynced:null,eventCount:0,error:null},{source:'moodle',bound:false,lastSynced:null,eventCount:0,error:null}],timezone:'Europe/Berlin'};

test('local credentials are bounded and sent only to the same-origin application endpoint',async()=>{
  assert.ok(validateCredentials('ab','moss482q'));assert.ok(validateCredentials('abc','moss482'));assert.ok(validateCredentials('abc','x'.repeat(129)));assert.equal(validateCredentials('abc','moss482q'),'');assert.equal(validateCredentials('abc','birch482q9'),'');assert.ok(validateCredentials('.abc','moss482q'));assert.ok(validateCredentials('中文账号','moss482q'));assert.equal(validateCredentials('Student_01','moss482q'),'');
  assert.ok(validateCredentials('abc','😀'.repeat(7)));assert.equal(validateCredentials('abc','😀'.repeat(8)),'');assert.equal(validateCredentials('abc','😀'.repeat(128)),'');assert.ok(validateCredentials('abc','😀'.repeat(129)));assert.equal(validateCredentials('abc',' abc123 '),'','spaces are counted without trimming');
  const password='  independent password  ';let calls=0;
  await requestLocalAuth('register',' student ',password,async(url,options)=>{calls++;assert.equal(url,'/api/local/register');assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.deepEqual(JSON.parse(options.body),{username:'student',password});return json({authenticated:true});});assert.equal(calls,1);
});

test('login failure ignores server message content and clears the application password',async()=>{
  const fixture=documentFixture('login.html'),navigation=[];const page=createLoginPage(fixture.doc,{assign:url=>navigation.push(url)},async url=>url==='/api/auth/status'?json({mode:'local',configured:true}):url==='/api/auth/me'?json({authenticated:false}):json({error:'UNSAFE_PRIVATE_VALUE'},401));await page.refresh();fixture.doc.getElementById('app-username').value='student';fixture.doc.getElementById('app-password').value='independent password';await page.submit({preventDefault(){}});assert.equal(fixture.doc.getElementById('app-password').value,'');assert.match(fixture.doc.getElementById('auth-error').textContent,/用户名或本应用密码不正确/);assert.ok(!fixture.text().includes('UNSAFE_PRIVATE_VALUE'));assert.deepEqual(navigation,[]);
});

test('an unauthenticated account is redirected before any calendar request',async()=>{
  const fixture=documentFixture('account.html'),calls=[],navigation=[];fixture.doc.getElementById('account-main').hidden=true;const page=createAccountPage(fixture.doc,{assign:url=>navigation.push(url)},async url=>{calls.push(url);return json({authenticated:false});});await page.refresh();assert.deepEqual(calls,['/api/auth/me']);assert.deepEqual(navigation,['/login.html']);assert.equal(fixture.doc.getElementById('account-main').hidden,true);
});

test('private subscription input is cleared before POST, CSRF is supplied, and error payload is never displayed',async()=>{
  const fixture=documentFixture('account.html'),secret='https://www.moodle.tum.de/calendar/export_execute.php?authtoken=PRIVATE_TEST_VALUE';let posted=false;const fetchMock=async(url,options)=>{if(url==='/api/auth/me')return json(session);if(url==='/api/calendar')return json(emptyCalendar);if(url==='/api/feeds'){posted=true;assert.equal(fixture.doc.getElementById('feed-moodle-url').value,'');assert.equal(fixture.doc.getElementById('feed-moodle-url').type,'password');assert.equal(options.headers['x-csrf-token'],'mock-csrf');assert.deepEqual(JSON.parse(options.body),{source:'moodle',url:secret});return json({error:secret},422);}throw Error('Unexpected endpoint');};const page=createAccountPage(fixture.doc,{assign(){}},fetchMock);await page.refresh();fixture.doc.getElementById('feed-moodle-url').value=secret;fixture.doc.getElementById('feed-moodle-url').type='text';await page.bindFeed('moodle',{preventDefault(){}});assert.equal(posted,true);assert.ok(!fixture.text().includes('PRIVATE_TEST_VALUE'));assert.equal(fixture.doc.getElementById('feed-moodle-url').value,'');
});

test('untrusted calendar fields render as text and feed errors do not expose private URLs',async()=>{
  const fixture=documentFixture('account.html'),title='<img src=x onerror=alert(1)>',payload={events:[{id:'a',source:'tumonline',title,start:'2030-01-07T10:00:00Z',end:'2030-01-07T11:00:00Z',location:'<script>location</script>',description:'Link https://example.org/?token=PRIVATE_VALUE',url:'javascript:alert(1)',allDay:false}],feeds:[{source:'tumonline',bound:true,lastSynced:'2030-01-07T09:00:00Z',eventCount:1,error:'https://example.org/?token=PRIVATE_VALUE'}]};const page=createAccountPage(fixture.doc,{assign(){}},async url=>json(url==='/api/auth/me'?session:payload),()=>Date.parse('2030-01-07T09:00:00Z'));await page.refresh();assert.ok(fixture.text().includes(title));assert.ok(!fixture.text().includes('PRIVATE_VALUE'));assert.ok(!fixture.text().includes('javascript:'));assert.match(fixture.doc.getElementById('feed-tumonline-error').textContent,/最近同步未成功/);
});

test('calendar grouping respects Berlin dates and exclusive all-day end dates',()=>{
  const payload=parseCalendarPayload({events:[{id:'block',source:'tumonline',title:'Block',start:'2030-01-07',end:'2030-01-09',allDay:true},{id:'due',source:'moodle',title:'Due',start:'2030-01-08T22:59:00Z',end:null,allDay:false}],feeds:[]});assert.deepEqual(groupWeek(payload.events,'2030-01-07').map(day=>day.date),['2030-01-07','2030-01-08']);assert.equal(upcomingDeadlines(payload.events,Date.parse('2030-01-08T20:00:00Z')).length,1);assert.equal(upcomingDeadlines(payload.events,Date.parse('2030-01-09T00:00:00Z')).length,0);assert.ok(safeActivityUrl('https://www.moodle.tum.de/mod/assign/view.php?id=123'));assert.equal(safeActivityUrl('https://tum.de.example.org/activity'),'');assert.equal(safeActivityUrl('https://campus.tum.de/calendar?authtoken=PRIVATE'),'');assert.equal(normalizeSubscription('javascript:alert(1)'),'');assert.equal(normalizeSubscription('webcal://campus.tum.de/calendar.ics'),'https://campus.tum.de/calendar.ics');
});

test('mutating account endpoints require CSRF and cannot target another origin',async()=>{
  let calls=0;const fetchMock=async()=>{calls++;return json({});};await assert.rejects(()=>requestAccountJson('/api/sync',{method:'POST',json:{}},fetchMock),/missing-csrf/);await assert.rejects(()=>requestAccountJson('https://example.org/api/feeds',{method:'POST',csrfToken:'a'},fetchMock),/unsupported-endpoint/);assert.equal(calls,0);
});

test('automatic refresh runs only in the foreground and stops on page hide',async()=>{
  const callbacks={},listeners={},doc={visibilityState:'hidden',addEventListener(type,fn){listeners[type]=fn;}},win={setInterval(fn,delay){assert.equal(delay,900000);callbacks.tick=fn;return 1;},clearInterval(){callbacks.stopped=true;},addEventListener(type,fn){listeners[type]=fn;}};let calls=0;installForegroundRefresh({refreshIfStale(){calls++;}},doc,win);callbacks.tick();assert.equal(calls,0);doc.visibilityState='visible';listeners.visibilitychange();assert.equal(calls,1);callbacks.tick();assert.equal(calls,2);listeners.pagehide();assert.equal(callbacks.stopped,true);
});
