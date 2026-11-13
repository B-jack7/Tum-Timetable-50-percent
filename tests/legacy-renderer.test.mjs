import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const NOW=Date.parse('2030-01-07T07:00:00Z');
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const tasks=fs.readFileSync(new URL('../public/tasks.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../public/account.html',import.meta.url),'utf8');
class Node{
  constructor(id=''){this.id=id;this.tagName='BUTTON';this.textContent='';this.innerHTML='';this.value='';this.checked=false;this.hidden=false;this.open=false;this.dataset={};this.attributes={};this.listeners={};this.style={setProperty(name,value){this[name]=value;}};this.classList={toggle(){},add(){},remove(){}};}
  setAttribute(name,value){this.attributes[name]=String(value);}
  addEventListener(name,listener){(this.listeners[name]||=[]).push(listener);}
  focus(){}showModal(){this.open=true;}close(){this.open=false;}append(){}remove(){}click(){}
  closest(){return null;}matches(selector){return selector==='[data-task-check]'&&this.dataset.taskCheck!==undefined;}
}
function course(id,extra={}){return{id,title:'Example '+id,type:'日历课程',status:'calendar',group:'',number:'',lecturers:[],assessment:'日历未提供考核方式，请查看课程官方信息',description:'Calendar description.',notes:[],studyLinks:[],appointments:[{date:'2030-01-07',start:'09:00',end:'10:30',location:'Example room',kind:'course'}],...extra};}
function data(courses,extra={}){return{term:'个人日历',timezone:'Europe/Berlin',updatedAt:'2030-01-07T07:00:00Z',storageScope:'opaque-account-a',courses,moodle:{checkedAt:null,tasks:[]},...extra};}
function fixture(initial){
  const elements=new Map([...html.matchAll(/id="([^"]+)"/g)].map(match=>[match[1],new Node(match[1])]));
  const tabs=['schedule','tasks','courses'].map(name=>{const node=new Node();node.dataset.mainTab=name;return node;}),stored=new Map(),listeners={};
  const document={baseURI:'https://app.example/account.html',body:new Node('body'),activeElement:new Node(),getElementById(id){assert.ok(elements.has(id),'actual account HTML needs #'+id);return elements.get(id);},querySelectorAll:selector=>selector==='[data-main-tab]'?tabs:[],addEventListener(name,fn){(listeners[name]||=[]).push(fn);},contains:()=>true,createElement:()=>new Node()};
  const media=new Node();media.matches=false;
  const window={TIMETABLE_DATA:initial,matchMedia:()=>media,scrollTo(){},print(){}};
  class Clock extends Date{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
  const localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(String(key),String(value))};
  const context=vm.createContext({window,document,localStorage,location:{protocol:'https:'},URL,Date:Clock,Intl,Blob,setTimeout,clearTimeout});
  vm.runInContext(tasks,context,{filename:'tasks.js'});vm.runInContext(source,context,{filename:'app.js'});
  const emit=(name,event)=>{for(const listener of listeners[name]||[])listener(event);};
  const counts=()=>({document:Object.fromEntries(Object.entries(listeners).map(([name,list])=>[name,list.length])),elements:Object.fromEntries([...elements].map(([id,node])=>[id,Object.fromEntries(Object.entries(node.listeners).map(([name,list])=>[name,list.length]))])),media:Object.fromEntries(Object.entries(media.listeners).map(([name,list])=>[name,list.length]))});
  return{window,elements,stored,emit,counts};
}

test('legacy renderer escapes course and appointment text in cards, calendar and details',()=>{
  const title='<img src=x onerror="attack()">',description='<script>attack()</script>',assessment='<svg onload="attack()">',location='<iframe src="unsafe">';
  const item=course('opaque-course',{title,description,assessment,number:'<b>number</b>',group:'<b>group</b>',lecturers:['<b>teacher</b>'],language:'<b>language</b>',notes:['<img src=x>'],appointments:[{date:'2030-01-07',start:'09:00',end:'10:30',location,note:'<script>note()</script>',kind:'course'}]});
  const page=fixture(data([item]));
  for(const id of ['courses-grid','calendar','mobile-agenda','next-class']){const markup=page.elements.get(id).innerHTML;assert.ok(markup.includes('&lt;img'),'escaped title in '+id);assert.ok(!markup.includes(title),'no executable title in '+id);assert.ok(!markup.includes(location),'no executable location in '+id);}
  page.emit('click',{target:{closest(selector){return selector==='[data-course]'?{dataset:{course:item.id,appointment:item.id+':0'}}:null;}}});
  const detail=page.elements.get('course-detail').innerHTML;
  assert.ok(detail.includes('&lt;script&gt;attack()&lt;/script&gt;'));assert.ok(detail.includes('&lt;svg onload=&quot;attack()&quot;&gt;'));assert.ok(detail.includes('&lt;b&gt;teacher&lt;/b&gt;'));assert.ok(detail.includes('&lt;script&gt;note()&lt;/script&gt;'));assert.ok(!detail.includes('<script>'));assert.ok(!detail.includes('<iframe'));assert.ok(!detail.includes(title));assert.equal(page.elements.get('course-dialog').open,true);
});

test('TimetableView updates replace data and course count without registering duplicate listeners',()=>{
  const page=fixture(data([course('first')])),before=page.counts();assert.equal(String(page.elements.get('course-count').textContent),'1');
  page.window.TimetableView.update(data([course('second'),course('third')]));assert.equal(String(page.elements.get('course-count').textContent),'2');assert.ok(page.elements.get('courses-grid').innerHTML.includes('Example second'));assert.ok(!page.elements.get('courses-grid').innerHTML.includes('Example first'));
  page.window.TimetableView.update(data([]));assert.equal(String(page.elements.get('course-count').textContent),'0');assert.ok(!page.elements.get('courses-grid').innerHTML.includes('Example second'));assert.deepEqual(page.counts(),before);
});

test('local handled task state switches account scopes and stores only the opaque task IDs',()=>{
  const task={id:'opaque-task-a',title:'Private task title',dueAt:'2030-01-08T10:00:00Z',kind:'calendar'};
  const page=fixture(data([],{moodle:{checkedAt:null,tasks:[task]}}));
  const input=new Node();input.dataset.taskCheck=task.id;input.checked=true;page.emit('change',{target:input});
  assert.equal(page.stored.get('tum-moodle-handled-v2:opaque-account-a'),'["opaque-task-a"]');assert.ok(![...page.stored.values()].join('').includes(task.title));
  page.window.TimetableView.update(data([],{storageScope:'opaque-account-b',moodle:{checkedAt:null,tasks:[{...task,id:'opaque-task-b'}]}}));
  assert.ok(page.elements.get('moodle-tasks').innerHTML.includes('opaque-task-b'));assert.ok(!page.elements.get('moodle-tasks').innerHTML.includes('opaque-task-a'));assert.equal(page.stored.has('tum-moodle-handled-v2:opaque-account-b'),false);
});
