(function(root){
 'use strict';
 const DAY=86400000;
 function schedule(previous,grade,now=Date.now()){
  const p=previous||{repetitions:0,interval:0,ease:2.5};
  const quality={again:1,hard:3,good:4,easy:5}[grade];
  if(quality===undefined)throw new Error('Unknown grade');
  const ease=Math.max(1.3,(p.ease||2.5)+.1-(5-quality)*(.08+(5-quality)*.02));
  if(quality<3)return {repetitions:0,interval:0,ease,due:now+60000,last:now};
  const repetitions=(p.repetitions||0)+1;
  let interval=repetitions===1?1:repetitions===2?6:Math.max(1,Math.round((p.interval||1)*(p.ease||2.5)));
  if(grade==='hard')interval=Math.max(1,Math.round(interval*.65));
  if(grade==='easy')interval=Math.max(3,Math.round(interval*1.3));
  return {repetitions,interval,ease,due:now+interval*DAY,last:now};
 }
 function cleanEntry(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {};
  const item={reviewed:value.reviewed===true,wrong:value.wrong===true,note:typeof value.note==='string'?value.note.slice(0,30000):'',draft:typeof value.draft==='string'?value.draft.slice(0,30000):''};
  const s=value.schedule;
  if(s&&['repetitions','interval','ease','due','last'].every(k=>Number.isFinite(s[k]))&&s.repetitions>=0&&s.interval>=0&&s.ease>=1.3&&s.due>=0&&s.due<=8640000000000000&&s.last>=0){
   item.schedule={repetitions:Math.floor(s.repetitions),interval:Math.min(s.interval,36500),ease:Math.min(5,s.ease),due:s.due,last:s.last};
  }
  return item;
 }
 function sanitize(input,ids){
  if(!input||input.format!=='nlp-study-backup'||input.version!==1||input.course!=='IN2361'||typeof input.items!=='object'||!input.items||Array.isArray(input.items))throw new Error('请选择本站导出的 IN2361 学习备份。');
  const items={};
  for(const id of ids)if(Object.prototype.hasOwnProperty.call(input.items,id))items[id]=cleanEntry(input.items[id]);
  return items;
 }
 root.NLP_CORE={DAY,schedule,cleanEntry,sanitize};
})(typeof window==='undefined'?globalThis:window);
