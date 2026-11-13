(() => {
  'use strict';
  let data = window.TIMETABLE_DATA || { courses: [] };
  let courses = Array.isArray(data.courses) ? data.courses.map((c, i) => ({ ...c, id: String(c.id ?? i), appointments: Array.isArray(c.appointments) ? c.appointments : [], color: i % 8 })) : [];
  const palette = [ ['#2276a9','#eaf3fa'], ['#42877d','#eaf4ef'], ['#8d6ca7','#f2edf6'], ['#b78937','#faf4e6'], ['#6586aa','#eef1f8'], ['#a66c71','#f8edef'], ['#527d56','#edf3e9'], ['#4c8c9c','#eaf4f5'] ];
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeUrl = value => { if(typeof value!=='string'||!value.trim())return ''; try { const url = new URL(value,document.baseURI); return /^https?:$/.test(url.protocol) ? url.href : location.protocol==='file:'&&/^courses\//.test(value) ? value : ''; } catch { return ''; } };
  const studyLinks = c => (Array.isArray(c.studyLinks) ? c.studyLinks : []).filter(link => link && safeUrl(link.url));
  let moodle = data.moodle && typeof data.moodle === 'object' ? data.moodle : null;
  const moodleTaskMap = new Map();
  for (const task of Array.isArray(moodle?.tasks) ? moodle.tasks : []) if(task && task.id !== undefined && task.id !== null && !moodleTaskMap.has(String(task.id))) moodleTaskMap.set(String(task.id), { ...task, id: String(task.id) });
  let moodleTasks = [...moodleTaskMap.values()], handledKey = 'tum-moodle-handled-v2:'+String(data.storageScope||'session');
  let handledTasks = new Set(), showHandledTasks = false, expandTasks = false, handledStorageOK = true;
  try { const saved=JSON.parse(localStorage.getItem(handledKey)||'[]'); if(Array.isArray(saved)) handledTasks=new Set(saved.filter(id=>moodleTaskMap.has(String(id))).map(String)); } catch { handledStorageOK=false; }
  const taskDeadline = task => window.MOODLE_TASKS?.validDueAt(task.dueAt) ?? null;
  const taskCourse = task => courses.find(c=>c.id===String(task.courseId ?? ''));
  const taskKind = task => ({ submission:'提交任务', form:'表单', choice:'选择活动', external:'外部活动' }[task.kind] || 'Moodle 活动');
  const berlinDateTime = value => { const date=new Date(value); if(!Number.isFinite(date.getTime()))return ''; const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value])); return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`; };
  function upcomingTasks(includeHandled=false, courseId=null) {
    return moodleTasks.filter(task=>(includeHandled||!handledTasks.has(task.id))&&(courseId===null||String(task.courseId ?? '')===String(courseId))&&(taskDeadline(task)!==null?taskDeadline(task)>=Date.now():!task.dueDate||task.dueDate>=todayDate)).sort((a,b)=>(taskDeadline(a)??Date.parse((a.dueDate||'9999-01-01')+'T12:00:00Z'))-(taskDeadline(b)??Date.parse((b.dueDate||'9999-01-01')+'T12:00:00Z'))||String(a.title||'').localeCompare(String(b.title||'')));
  }
  function taskRow(task, compact=false) {
    const course=taskCourse(task), url=safeUrl(task.url), due=taskDeadline(task), handled=handledTasks.has(task.id);
    return `<div class="moodle-task-row ${handled?'is-handled':''}" data-task-row="${esc(task.id)}"><label class="task-check"><input type="checkbox" data-task-check="${esc(task.id)}" ${handled?'checked':''} aria-label="${esc(task.title || 'Moodle 活动')}：已处理（仅本地标记）"><span>已处理</span></label><div class="task-main">${url?`<a class="task-title" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(task.title || 'Moodle 活动')} <span aria-hidden="true">↗</span></a>`:`<span class="task-title">${esc(task.title || 'Moodle 活动')}</span>`}<div class="task-meta">${course&&!compact?`<button type="button" class="task-course" data-course="${esc(course.id)}">${esc(course.title)}</button><span class="task-meta-separator">·</span>`:''}<span>${esc(taskKind(task))}</span>${task.optional?'<span class="task-optional">可选</span>':''}</div>${(compact||task.dueEstimated)&&task.note?`<p class="task-note ${compact?'':'task-note-preview'}">${esc(task.note)}${task.dueEstimated&&safeUrl(task.sourceUrl)?` <a href="${esc(safeUrl(task.sourceUrl))}" target="_blank" rel="noopener noreferrer">截止依据 ↗</a>`:''}</p>`:''}</div><div class="task-deadline">${due===null?`<span class="deadline-unknown">${task.dueDate?esc(task.dueDate)+' · 全天日历活动':'截止时间未公布'}</span>`:`<span class="task-deadline-label">${due<=Date.now()?'已过截止，请核对':task.dueEstimated?'预计截止':'截止'} · 德国时间</span><time datetime="${esc(new Date(due).toISOString())}">${esc(berlinDateTime(due))}</time>`}</div></div>`;
  }
  function renderTaskPanel() {
    const panel=$('moodle-tasks'); if(!panel)return;
    panel.hidden=!moodle; if(!moodle)return;
    const tasks=upcomingTasks(showHandledTasks), unhandled=upcomingTasks(false), shown=expandTasks?tasks:tasks.slice(0,3), exportable=unhandled.filter(task=>taskDeadline(task)!==null&&taskDeadline(task)>Date.now()), dashboard=safeUrl(moodle.dashboardUrl), checked=berlinDateTime(moodle.checkedAt);
    panel.innerHTML=`<div class="tasks-heading"><div class="tasks-heading-title"><h2 id="tasks-title">待办与截止</h2><span class="tasks-count">${unhandled.length}</span></div><div class="tasks-actions"><label class="handled-toggle"><input type="checkbox" id="show-handled-tasks" ${showHandledTasks?'checked':''}>查看已处理</label>${dashboard?`<a class="tasks-dashboard" href="${esc(dashboard)}" target="_blank" rel="noopener noreferrer">Moodle 总览 ↗</a>`:''}<button type="button" id="download-task-calendar" class="calendar-download" ${!exportable.length?'disabled':''} title="下载未处理的未来截止，提醒为截止前 1 天和 2 小时">导入日历 <span aria-hidden="true">↓</span></button></div></div><div class="tasks-list">${shown.length?shown.map(task=>taskRow(task)).join(''):`<p class="tasks-empty">${moodleTasks.length&&!unhandled.length?'当前快照中没有未标记处理的后续任务。':'当前快照中暂无后续任务。'}</p>`}</div><div class="tasks-footer"><p>处理标记仅保存在此浏览器，不代表 Moodle 已提交。${handledStorageOK?'':' 当前浏览器无法保存标记。'}<span>${checked?`Moodle 日历同步于 ${esc(checked)} · 德国时间`:'尚未同步 Moodle 日历'}</span></p>${tasks.length>3?`<button type="button" id="expand-moodle-tasks" aria-expanded="${expandTasks}">${expandTasks?'收起':`展开全部（${tasks.length}）`} ${expandTasks?'↑':'↓'}</button>`:''}</div><p id="task-calendar-status" class="task-calendar-status" role="status"></p>`;
    syncMainLayout();
  }
  function renderCourseMoodle(c) {
    const url=safeUrl(c.moodleUrl), tasks=upcomingTasks(true,c.id);
    if(!url&&!tasks.length)return '';
    return `<section class="course-moodle-section"><div class="course-moodle-heading"><h3 class="detail-section-title">Moodle 与待办</h3>${url?`<a class="course-moodle-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">进入 Moodle 课程 ↗</a>`:''}</div>${tasks.length?`<div class="course-task-list">${tasks.slice(0,3).map(task=>taskRow(task,true)).join('')}</div>${tasks.length>3?`<details class="course-task-more"><summary>其余 ${tasks.length-3} 条待办</summary>${tasks.slice(3).map(task=>taskRow(task,true)).join('')}</details>`:''}<p class="course-task-helper">已处理仅为此浏览器的标记，不代表 Moodle 已提交。</p>`:'<p class="course-task-helper">当前快照中暂无该课程的后续待办。</p>'}</section>`;
  }
  function markTaskHandled(id, handled) {
    if(!moodleTaskMap.has(id))return;
    if(handled)handledTasks.add(id);else handledTasks.delete(id);
    try{localStorage.setItem(handledKey,JSON.stringify([...handledTasks]));handledStorageOK=true;}catch{handledStorageOK=false;}
    for(const input of document.querySelectorAll('[data-task-check]'))if(input.dataset.taskCheck===id){input.checked=handled;input.closest('.moodle-task-row')?.classList.toggle('is-handled',handled);}
    renderTaskPanel();
  }
  function downloadTaskCalendar() {
    if(!window.MOODLE_TASKS)return;
    const now=Date.now(), selected=upcomingTasks(false).filter(task=>taskDeadline(task)!==null&&taskDeadline(task)>now);
    if(!selected.length)return;
    const calendar=window.MOODLE_TASKS.buildCalendar(moodleTasks,{courses,processedIds:[...handledTasks],now,stamp:now});
    const blob=new Blob([calendar],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=`tum-moodle-deadlines-${berlinDateTime(now).slice(0,10)}.ics`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    const status=$('task-calendar-status');if(status)status.textContent=`已下载 ${selected.length} 条截止；导入日历后，将在截止前 1 天和 2 小时提醒。`;
  }
  const labels = { VO:'讲座 · VO', UE:'习题课 · UE', VI:'讲授与练习 · VI', SE:'研讨课 · SE', PR:'实践课 · PR' };
  const weekdays = ['周日','周一','周二','周三','周四','周五','周六'];
  const dateObj = value => new Date(`${String(value).slice(0,10)}T12:00:00Z`);
  const isoDate = date => date.toISOString().slice(0,10);
  const addDays = (date, days) => { const d = dateObj(date); d.setUTCDate(d.getUTCDate() + days); return isoDate(d); };
  const monday = date => addDays(date, -(dateObj(date).getUTCDay() + 6) % 7);
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !isNaN(dateObj(value));
  const dateParts = (date = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:data.timezone || 'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  const nowParts = dateParts();
  const todayDate = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  const minutes = time => { const m=String(time ?? '').match(/^(\d{1,2}):(\d{2})/); return m && (Number(m[1])<24&&Number(m[2])<60||Number(m[1])===24&&Number(m[2])===0) ? Number(m[1])*60+Number(m[2]) : null; };
  const timeLabel = value => { const n=minutes(value); return n === null ? '时间待定' : `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; };
  const formatDate = (date, year = false) => { if (!validDate(date)) return '日期待定'; const d=dateObj(date); return `${year?`${d.getUTCFullYear()} 年 `:''}${d.getUTCMonth()+1} 月 ${d.getUTCDate()} 日`; };
  const shortDate = date => validDate(date) ? `${Number(date.slice(5,7))}/${Number(date.slice(8,10))}` : '日期待定';
  const dayLabel = date => validDate(date) ? weekdays[dateObj(date).getUTCDay()] : '';
  const colorStyle = course => `--event-color:${palette[course.color][0]};--event-bg:${palette[course.color][1]}`;
  const location = a => String(a.location || '地点尚未公布');
  const kindLabels = { course: '上课', exam: '考试', 'tutorial recording': '预录教程发布' };
  const kindLabel = kind => kindLabels[kind] || String(kind || '');
  const isRecording = a => a.kind === 'tutorial recording';
  const cancelled = a => a.cancelled === true || /cancelled|canceled|abgesagt/i.test(String(a.kind || ''));
  let allEvents = courses.flatMap(c=>c.appointments.map((a,i)=>({...a,course:c,key:`${c.id}:${i}`,date:String(a.date || '').slice(0,10),startMinute:minutes(a.start),endMinute:minutes(a.end)})));
  let currentWeek = monday(todayDate), currentView = 'week', query = '', includeWaiting = true, lastFocus = null;
  const mobileScreen = window.matchMedia('(max-width: 600px)');
  let mobileMainTab = 'schedule';

  function syncMainLayout() {
    const compact=mobileScreen.matches;
    document.body.dataset.mobileTab=mobileMainTab;
    $('schedule').hidden=compact&&mobileMainTab==='tasks';
    $('moodle-tasks').hidden=!moodle||(compact&&mobileMainTab!=='tasks');
    for(const button of document.querySelectorAll('[data-main-tab]')) button.setAttribute('aria-pressed',String(button.dataset.mainTab===mobileMainTab));
    const title=$('app-section-title');
    if(title)title.innerHTML=(compact?{schedule:'我的课表',tasks:'待办与截止',courses:'全部课程'}[mobileMainTab]:'我的课表')+'<span class="hero-period">.</span>';
  }
  function selectMainTab(tab) {
    if(!['schedule','tasks','courses'].includes(tab))return;
    mobileMainTab=tab;
    if(tab==='schedule')currentView='week';
    if(tab==='courses')currentView='courses';
    render();renderTaskPanel();
    window.scrollTo({top:0,behavior:'auto'});
  }
  function visibleCourse(c) {
    if (!includeWaiting && c.status==='waiting') return false;
    if (!query) return true;
    return [c.title,c.number,c.group,...(c.lecturers||[]),c.assessment,...c.appointments.map(a=>a.location)].join(' ').toLocaleLowerCase().includes(query);
  }
  function validTimed(a) { return validDate(a.date) && a.startMinute!==null && a.endMinute!==null && a.endMinute>a.startMinute; }
  function inWeek(a) { return validDate(a.date) && a.date>=currentWeek && a.date<addDays(currentWeek,7); }
  function activeWeekEvents() { return allEvents.filter(a=>inWeek(a) && !cancelled(a) && visibleCourse(a.course)); }
  function sortEvents(a,b) { return a.date.localeCompare(b.date) || (a.startMinute??1440)-(b.startMinute??1440) || a.course.title.localeCompare(b.course.title); }
  function conflictPairs(events) {
    const pairs=[]; const timed=events.filter(a=>validTimed(a)&&!isRecording(a)).sort(sortEvents);
    for(let i=0;i<timed.length;i++) for(let j=i+1;j<timed.length;j++) {
      if(timed[i].date!==timed[j].date) continue;
      if(timed[i].startMinute<timed[j].endMinute && timed[j].startMinute<timed[i].endMinute) pairs.push([timed[i],timed[j]]);
    }
    return pairs;
  }
  function layoutDay(events) {
    const sorted=[...events].sort((a,b)=>a.startMinute-b.startMinute || b.endMinute-a.endMinute), result=[];
    let group=[], groupEnd=-1;
    function flush(){
      if(!group.length) return;
      const lanes=[];
      group.forEach(a=>{ let lane=lanes.findIndex(end=>end<=a.startMinute); if(lane===-1) lane=lanes.length; lanes[lane]=a.endMinute; a._lane=lane; });
      group.forEach(a=>result.push({...a,_columns:lanes.length})); group=[];
    }
    sorted.forEach(a=>{ if(group.length && a.startMinute>=groupEnd){flush();groupEnd=-1;} group.push({...a});groupEnd=Math.max(groupEnd,a.endMinute); });flush();return result;
  }
  function statusTag(c) { return c.status==='waiting' ? '<span class="tag waiting">候补 / 等待审核</span>' : c.status==='confirmed' ? '<span class="tag">已获确认名额</span>' : c.status==='calendar' ? '<span class="tag">日历安排</span>' : '<span class="tag">注册状态未记录</span>'; }
  function assessment(c) { return String(c.assessment || c.assessmentOriginal || '课程页面暂未公布考核方式，请查看 TUMonline 或课程通知。'); }
  function renderStudyLinks(c) {
    const links=studyLinks(c);
    if(!links.length) return '<section class="study-section" aria-label="复习与刷题"><h3 class="detail-section-title">复习与刷题</h3><p class="detail-text">日历未提供复习网站链接。</p></section>';
    const studyTarget = link => {
      try {
        const base=new URL(document.baseURI),url=new URL(safeUrl(link.url),base),coursePath=new URL('courses/',base).pathname;
        if(/^https?:$/.test(url.protocol)&&url.origin===base.origin&&url.pathname.startsWith(coursePath))return '';
      } catch {}
      return ' target="_blank" rel="noopener noreferrer"';
    };
    return `<section class="study-section" aria-label="复习与刷题"><h3 class="detail-section-title">复习与刷题</h3><div class="study-links">${links.map(link=>`<a class="study-link" href="${esc(safeUrl(link.url))}"${studyTarget(link)}><span><strong>${esc(link.title || '课程复习与刷题')}</strong>${link.description?`<span class="study-link-description">${esc(link.description)}</span>`:''}</span><span class="study-link-arrow" aria-hidden="true">↗</span></a>`).join('')}</div></section>`;
  }
  function courseButton(c, body, className, extra='') { return `<button type="button" class="${className}" data-course="${esc(c.id)}" style="${colorStyle(c)}" ${extra}>${body}</button>`; }
  function dateRangeLabel(){ const end=addDays(currentWeek,6), start=dateObj(currentWeek), finish=dateObj(end); return start.getUTCMonth()===finish.getUTCMonth() ? `${start.getUTCFullYear()} 年 ${start.getUTCMonth()+1} 月 ${start.getUTCDate()}—${finish.getUTCDate()} 日` : `${formatDate(currentWeek,true)} — ${formatDate(end, start.getUTCFullYear()!==finish.getUTCFullYear())}`; }

  function renderHeader() {
    const term=String(data.term || '');
    $('term-label').textContent = /^(\d{4})\s*W$/i.test(term) ? `${term.slice(0,4)} / ${Number(term.slice(0,4))+1} 冬季学期 · WINTER SEMESTER` : term ? `${term} · MEIN STUNDENPLAN` : 'MEIN STUNDENPLAN';
    $('course-count').textContent=courses.length;
    $('snapshot-note').textContent=data.updatedAt?`最近同步 ${berlinDateTime(data.updatedAt)} · 德国时间`:'绑定你的 TUMonline 日历后自动同步';
    if(safeUrl(data.coursesListUrl)) $('official-list').href=safeUrl(data.coursesListUrl);
    const currentMinutes=Number(nowParts.hour)*60+Number(nowParts.minute);
    const next=allEvents.filter(a=>!cancelled(a)&&!isRecording(a)&&validTimed(a)&&a.course.status!=='waiting'&&(a.date>todayDate || a.date===todayDate&&a.endMinute>currentMinutes)).sort(sortEvents)[0];
    if(next) {
      const when=next.date===todayDate ? (next.startMinute<=currentMinutes ? '正在进行' : '今天') : `${formatDate(next.date)} ${dayLabel(next.date)}`;
      $('next-class').innerHTML=courseButton(next.course,`<p class="next-label">${next.date===todayDate&&next.startMinute<=currentMinutes?'NOW · 正在上课':'UP NEXT · 下一堂课'}</p><p class="next-time">${esc(when)} &nbsp; ${esc(timeLabel(next.start))}—${esc(timeLabel(next.end))}</p><p class="next-title">${esc(next.course.title)}</p><p class="next-location">⌖ &nbsp;${esc(location(next))}</p>`,'next-open',`data-appointment="${esc(next.key)}"`);
    } else $('next-class').innerHTML='<p class="next-label">YOUR STUDY SPACE</p><p class="next-time">我的学习安排</p><p class="next-location">按周浏览课程，点击查看上课地点和课程详情。</p>';
  }
  function renderCalendar(events, conflicts) {
    const timed=events.filter(validTimed), conflictKeys=new Set(conflicts.flatMap(pair=>pair.map(a=>a.key)));
    const showWeekend=events.some(a=>[0,6].includes(dateObj(a.date).getUTCDay()));
    const count=showWeekend?7:5, days=Array.from({length:count},(_,i)=>addDays(currentWeek,i));
    const minHour=timed.length?Math.max(0,Math.min(8,Math.floor(Math.min(...timed.map(a=>a.startMinute))/60))):8;
    const maxHour=timed.length?Math.min(24,Math.max(18,Math.ceil(Math.max(...timed.map(a=>a.endMinute))/60))):18;
    const hourHeight=92, height=(maxHour-minHour)*hourHeight;
    $('calendar').style.setProperty('--days',count);
    $('calendar').innerHTML=`<div class="calendar-head"><div class="time-zone-cell">CET / CEST</div>${days.map(date=>`<div class="day-heading ${date===todayDate?'is-today':''}"><span class="day-name">${dayLabel(date)}</span><span class="day-number">${dateObj(date).getUTCDate()}</span></div>`).join('')}</div><div class="calendar-body" style="height:${height}px"><div class="time-axis">${Array.from({length:maxHour-minHour},(_,i)=>`<span class="time-tick" style="top:${i*hourHeight}px">${String(minHour+i).padStart(2,'0')}:00</span>`).join('')}</div>${days.map(date=>{
      const daily=layoutDay(timed.filter(a=>a.date===date));
      const lines=Array.from({length:maxHour-minHour},(_,i)=>`<div class="half-hour" style="top:${(i+.5)*hourHeight}px"></div>`).join('');
      const currentMinutes=Number(nowParts.hour)*60+Number(nowParts.minute);
      const nowLine=date===todayDate&&currentMinutes>=minHour*60&&currentMinutes<maxHour*60?`<div class="now-line" style="top:${(currentMinutes-minHour*60)/60*hourHeight}px"></div>`:'';
      return `<div class="calendar-day ${date===todayDate?'is-today':''}">${lines}${daily.map(a=>{
        const top=(a.startMinute-minHour*60)/60*hourHeight, boxHeight=(a.endMinute-a.startMinute)/60*hourHeight-3;
        const flags=[conflictKeys.has(a.key)?'时间冲突':'',a.course.status==='waiting'?'候补课程':'',a.kind==='exam'?'考试':isRecording(a)?kindLabel(a.kind):''].filter(Boolean).join(' · ');
        const body=`<span class="event-time">${esc(timeLabel(a.start))}–${esc(timeLabel(a.end))}</span><span class="event-title">${esc(a.course.title)}</span><span class="event-location">⌖ ${esc(location(a))}</span>${flags?`<span class="event-flags">${flags}</span>`:''}`;
        return courseButton(a.course,body,`event ${boxHeight<70?'is-short':''} ${a.course.status==='waiting'?'is-waiting':''}`,`data-appointment="${esc(a.key)}" title="${esc(`${a.course.title}\n${a.date} ${timeLabel(a.start)}–${timeLabel(a.end)}\n${location(a)}${flags?'\n'+flags:''}`)}" aria-label="${esc(`${a.course.title}，${timeLabel(a.start)}至${timeLabel(a.end)}，${location(a)}${flags?'，'+flags:''}`)}"`).replace('style="',`style="top:${top}px;height:${boxHeight}px;left:calc(${a._lane/a._columns*100}% + 4px);width:calc(${100/a._columns}% - 8px);`);
      }).join('')}${nowLine}</div>`;
    }).join('')}</div>`;
    $('mobile-agenda').innerHTML=days.map(date=>{
      const daily=events.filter(a=>a.date===date).sort(sortEvents);
      return `<section class="agenda-day"><div class="agenda-day-heading ${date===todayDate?'is-today':''}"><h3>${dayLabel(date)} · ${formatDate(date)}${date===todayDate?' · 今天':''}</h3><span class="day-number">${dateObj(date).getUTCDate()}</span></div><div class="agenda-events">${daily.length?daily.map(a=>courseButton(a.course,`<span class="agenda-time">${a.allDay?'全天':a.startMinute===null?'时间待定':`${esc(timeLabel(a.start))}<br>${esc(timeLabel(a.end))}`}</span><span><span class="agenda-course">${esc(a.course.title)}</span><span class="agenda-location" style="display:block">⌖ ${esc(location(a))}</span>${isRecording(a)?'<span class="event-flags">预录教程发布 · 日程提醒</span>':''}${conflictKeys.has(a.key)?'<span class="event-flags">时间冲突</span>':''}${a.course.status==='waiting'?'<span class="event-flags">候补 / 等待审核</span>':''}</span>`,`agenda-event ${a.course.status==='waiting'?'is-waiting':''}`,`data-appointment="${esc(a.key)}"`)).join(''):'<p class="agenda-empty">没有课程安排</p>'}</div></section>`;
    }).join('');
    const untimed=events.filter(a=>!validTimed(a));
    $('untimed-events').innerHTML=untimed.length?`<div class="untimed-block"><h3>本周全天与其他安排</h3>${untimed.map(a=>courseButton(a.course,`<span>${formatDate(a.date)} ${dayLabel(a.date)}</span>${esc(a.course.title)}<span>${esc(location(a))}</span>`,'untimed-item',`data-appointment="${esc(a.key)}"`)).join('')}</div>`:'';
    if(!events.length) {
      const upcoming=allEvents.filter(a=>!cancelled(a)&&visibleCourse(a.course)&&validDate(a.date)&&a.date>=addDays(currentWeek,7)).sort(sortEvents)[0];
      const empty=`<div class="empty-week"><span class="empty-icon" aria-hidden="true">▦</span><h3>${query?'本周没有匹配的课程':'这一周没有已公布的课程安排'}</h3><p>${query?'试试其他课程名称或教室。':'你可以切换周次，或在「全部课程」里查看课程详情。'}</p>${upcoming?`<button class="primary-button" type="button" data-jump="${esc(upcoming.date)}">查看下一次安排 · ${shortDate(upcoming.date)}</button>`:''}</div>`;
      $('calendar').innerHTML=empty; $('mobile-agenda').innerHTML=empty;
    }
  }
  function renderCourses() {
    const filtered=courses.filter(visibleCourse);
    $('courses-grid').innerHTML=filtered.length?filtered.map(c=>{
      const upcoming=allEvents.filter(a=>a.course.id===c.id&&!cancelled(a)&&validDate(a.date)&&(a.date>todayDate || a.date===todayDate&&(a.endMinute===null || a.endMinute>Number(nowParts.hour)*60+Number(nowParts.minute)))).sort(sortEvents)[0];
      const first=upcoming || allEvents.filter(a=>a.course.id===c.id&&!cancelled(a)&&validDate(a.date)).sort(sortEvents)[0];
      const body=`<div class="card-meta"><span>${esc(labels[c.type]||c.type||'课程')}</span>${c.status==='waiting'?'<span class="tag waiting">候补 / 待审核</span>':`<span>${esc(c.group||'')}</span>`}</div><h3>${esc(c.title||'未命名课程')}</h3>${studyLinks(c).length?'<span class="study-badge">↗ 含复习刷题</span>':''}<p class="card-appointment">${first?`${upcoming?'下一次':'已公布安排'} · ${formatDate(first.date)} ${esc(timeLabel(first.start))}<br>⌖ ${esc(location(first))}`:'尚无已公布的上课安排'}</p><p class="card-assessment">考核 · ${esc(assessment(c))}</p>`;
      return courseButton(c,body,'course-card');
    }).join(''):'<div class="empty-week"><h3>没有匹配的课程</h3><p>试试更短的课程名称，或清空搜索。</p></div>';
  }
  function renderUnscheduled() {
    const filtered=courses.filter(c=>visibleCourse(c)&&!allEvents.some(a=>a.course.id===c.id&&validTimed(a)&&!cancelled(a)));
    $('unscheduled').hidden=currentView!=='week'||!filtered.length;
    $('unscheduled').innerHTML=filtered.length?`<div class="section-heading"><h2>尚无具体课次</h2><span>${filtered.length} 条课程记录</span></div><p class="unscheduled-note">这些课程尚无可直接排入周历的具体时段，点开可查看课程备注和考核信息。</p><div class="unscheduled-list">${filtered.map(c=>courseButton(c,`<span class="unscheduled-icon" aria-hidden="true">▤</span><span><span class="unscheduled-title">${esc(c.title)}</span><span class="unscheduled-meta" style="display:block">${esc(labels[c.type]||c.type||'课程')}${c.status==='waiting'?' · 候补 / 待审核':''}</span></span><span class="unscheduled-arrow" aria-hidden="true">↗</span>`,'unscheduled-card')).join('')}</div>`:'';
  }
  function render() {
    const events=activeWeekEvents(), pairs=conflictPairs(events), uniqueCancelled=allEvents.filter(a=>inWeek(a)&&cancelled(a)&&visibleCourse(a.course));
    $('date-range').textContent=currentView==='week'?dateRangeLabel():'全部课程';
    $('week-caption').textContent=currentView==='week'?'WEEKLY SCHEDULE':`${courses.filter(visibleCourse).length} COURSES · 课程资料`;
    $('date-picker').value=currentWeek;
    $('week-count').textContent=events.length;
    $('conflict-count').textContent=pairs.length;
    $('conflict-count').style.color=pairs.length?'#ad6c35':'';
    $('week-notice').textContent=[pairs.length?`本周有 ${pairs.length} 组时间重叠，已在课表标出。`:null,uniqueCancelled.length?`${uniqueCancelled.length} 次已取消的安排未计入课表，可在课程详情查看。`:null].filter(Boolean).join(' ');
    $('week-notice').hidden=currentView!=='week';
    $('calendar-view').hidden=currentView!=='week'; $('courses-view').hidden=currentView!=='courses';
    $('view-week').setAttribute('aria-pressed',currentView==='week'); $('view-courses').setAttribute('aria-pressed',currentView==='courses');
    renderCalendar(events,pairs);renderCourses();renderUnscheduled();syncMainLayout();
  }
  function appointmentRow(a) {
    const url=safeUrl(a.roomUrl), isCancelled=cancelled(a);
    return `<li class="appointment-row ${isCancelled?'cancelled':''}"><span class="appointment-date">${formatDate(a.date)}<br><span style="font-weight:400;color:#94a0aa">${dayLabel(a.date)}</span></span><span class="appointment-time">${esc(timeLabel(a.start))}${minutes(a.end)!==null?`–${esc(timeLabel(a.end))}`:''}${isCancelled?'<br><span class="tag cancelled">已取消</span>':''}</span><span class="appointment-place">${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(location(a))} ↗</a>`:esc(location(a))}${a.kind?`<span class="appointment-note">${esc(kindLabel(a.kind))}</span>`:''}${a.note?`<span class="appointment-note">${esc(a.note)}</span>`:''}</span></li>`;
  }
  function openDetail(id, key) {
    const c=courses.find(course=>course.id===id);if(!c)return;
    const selected=allEvents.find(a=>a.key===key), list=allEvents.filter(a=>a.course.id===c.id).sort(sortEvents), source=safeUrl(c.sourceUrl);
    const details=[['课程编号',c.number],['注册小组',c.group],['授课教师',(c.lecturers||[]).join(' · ')],['授课语言',c.language]].filter(row=>row[1]);
    $('course-detail').innerHTML=`<div class="detail-heading"><h2 id="detail-title">${esc(c.title)}</h2><div class="detail-tags"><span class="tag">${esc(labels[c.type]||c.type||'课程')}</span>${c.sws?`<span class="tag">${esc(c.sws)} SWS</span>`:''}${statusTag(c)}</div></div><dl class="detail-meta">${details.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${renderCourseMoodle(c)}${renderStudyLinks(c)}${selected?`<section class="selected-appointment"><h3 class="detail-section-title">${selected.kind?esc(kindLabel(selected.kind)):'这一次课'} · ${formatDate(selected.date)} ${dayLabel(selected.date)}</h3><p class="detail-text">${selected.allDay?'全天':`${esc(timeLabel(selected.start))}—${esc(timeLabel(selected.end))}`}<br>⌖ ${esc(location(selected))}${selected.note?`<br>${esc(selected.note)}`:''}</p>${safeUrl(selected.roomUrl)?`<a class="text-button" style="display:inline-block;margin-top:8px;color:var(--blue)" href="${esc(safeUrl(selected.roomUrl))}" target="_blank" rel="noopener noreferrer">查看教室详情 ↗</a>`:''}</section>`:''}<section class="assessment-box"><h3 class="detail-section-title">考核方式</h3><p class="detail-text">${esc(assessment(c))}</p>${safeUrl(c.assessmentUrl)?`<a href="${esc(safeUrl(c.assessmentUrl))}" target="_blank" rel="noopener noreferrer" class="assessment-source">查看考核信息官方出处 ↗</a>`:''}${c.assessment&&c.assessmentOriginal&&c.assessment!==c.assessmentOriginal?`<details class="original-assessment"><summary>查看原文</summary><p>${esc(c.assessmentOriginal)}</p></details>`:''}</section>${c.description?`<section class="detail-section"><h3 class="detail-section-title">课程信息</h3><p class="detail-text">${esc(c.description)}</p></section>`:''}<section class="detail-section"><h3 class="detail-section-title">上课安排 <span style="color:#9aa7b0;font-size:11px;font-weight:400">${list.length?`${list.length} 次已公布安排`:''}</span></h3>${list.length?`<details class="all-appointments" ${list.length<=8?'open':''}><summary>查看全部日期、时间和地点</summary><ul class="appointment-list">${list.map(appointmentRow).join('')}</ul></details>`:'<p class="detail-text">暂无可排入周历的具体时段，请查看补充说明或课程通知。</p>'}</section>${Array.isArray(c.notes)&&c.notes.length?`<section class="detail-section"><h3 class="detail-section-title">补充说明</h3><ul class="detail-notes">${c.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul></section>`:''}<div class="detail-footer">${source?`<a class="official-link" href="${esc(source)}" target="_blank" rel="noopener noreferrer">在 TUMonline 查看原始课程 ↗</a>`:''}<p>课程信息整理于 ${esc(String(data.updatedAt||'未记录').slice(0,10))}<br>后续变更以官方课程页面为准。</p></div>`;
    lastFocus=document.activeElement; if(!$('course-dialog').open)$('course-dialog').showModal();
    $('course-dialog').scrollTop=0;$('close-dialog').focus();
  }
  $('prev-week').addEventListener('click',()=>{currentWeek=addDays(currentWeek,-7);render();});
  $('next-week').addEventListener('click',()=>{currentWeek=addDays(currentWeek,7);render();});
  $('today').addEventListener('click',()=>{currentWeek=monday(todayDate);currentView='week';render();});
  $('date-picker').addEventListener('change',event=>{if(validDate(event.target.value)){currentWeek=monday(event.target.value);currentView='week';render();}});
  $('view-week').addEventListener('click',()=>{mobileMainTab='schedule';currentView='week';render();});
  $('view-courses').addEventListener('click',()=>{mobileMainTab='courses';currentView='courses';render();});
  $('search').addEventListener('input',event=>{query=event.target.value.trim().toLocaleLowerCase();render();});
  $('include-waiting').addEventListener('change',event=>{includeWaiting=event.target.checked;render();});
  $('print').addEventListener('click',()=>window.print());
  $('close-dialog').addEventListener('click',()=>$('course-dialog').close());
  $('course-dialog').addEventListener('close',()=>{if(lastFocus&&document.contains(lastFocus))lastFocus.focus();});
  $('course-dialog').addEventListener('click',event=>{if(event.target===$('course-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-course]');if(button)openDetail(button.dataset.course,button.dataset.appointment);const jump=event.target.closest('[data-jump]');if(jump){currentWeek=monday(jump.dataset.jump);render();}});
  document.addEventListener('keydown',event=>{if(event.key==='/'&&!$('course-dialog').open&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){event.preventDefault();$('search').focus();}});
  document.addEventListener('change',event=>{if(event.target.matches('[data-task-check]'))markTaskHandled(event.target.dataset.taskCheck,event.target.checked);if(event.target.id==='show-handled-tasks'){showHandledTasks=event.target.checked;renderTaskPanel();}});
  document.addEventListener('click',event=>{if(event.target.closest('#expand-moodle-tasks')){expandTasks=!expandTasks;renderTaskPanel();}if(event.target.closest('#download-task-calendar'))downloadTaskCalendar();});
  document.addEventListener('click',event=>{const tab=event.target.closest('[data-main-tab]');if(tab)selectMainTab(tab.dataset.mainTab);});
  mobileScreen.addEventListener('change',()=>{if(mobileScreen.matches)mobileMainTab=currentView==='courses'?'courses':'schedule';render();renderTaskPanel();});
  window.TimetableView={
    update(nextData){
      const previousScope=data.storageScope;
      data=nextData||{courses:[]};
      courses=Array.isArray(data.courses)?data.courses.map((c,i)=>({...c,id:String(c.id??i),appointments:Array.isArray(c.appointments)?c.appointments:[],color:i%8})):[];
      moodle=data.moodle&&typeof data.moodle==='object'?data.moodle:null;
      moodleTaskMap.clear();
      for(const task of Array.isArray(moodle?.tasks)?moodle.tasks:[])if(task&&task.id!==undefined&&!moodleTaskMap.has(String(task.id)))moodleTaskMap.set(String(task.id),{...task,id:String(task.id)});
      moodleTasks=[...moodleTaskMap.values()];
      handledKey='tum-moodle-handled-v2:'+String(data.storageScope||'session');
      if(previousScope!==data.storageScope){handledTasks=new Set();query='';$('search').value='';if($('course-dialog').open)$('course-dialog').close();}
      try{const saved=JSON.parse(localStorage.getItem(handledKey)||'[]');if(Array.isArray(saved))handledTasks=new Set(saved.filter(id=>moodleTaskMap.has(String(id))).map(String));}catch{handledStorageOK=false;}
      allEvents=courses.flatMap(c=>c.appointments.map((a,i)=>({...a,course:c,key:`${c.id}:${i}`,date:String(a.date||'').slice(0,10),startMinute:minutes(a.start),endMinute:minutes(a.end)})));
      renderHeader();render();renderTaskPanel();
    },
  };
  renderHeader();render();renderTaskPanel();
})();
