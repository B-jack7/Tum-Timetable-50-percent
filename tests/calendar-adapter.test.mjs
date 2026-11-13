import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptCalendarToTimetable} from '../public/calendar-adapter.js';

const NOW='2030-01-07T07:00:00Z';
const courseUrl='https://campus.tum.de/tumonline/ee/ui/ca2/app/desktop/#/slc.tm.cp/student/courses/fictional-course';
const event=(id,extra={})=>({id,source:'tumonline',title:'Example course',location:'Example room',description:'Original course description.',url:courseUrl,kind:'class',allDay:false,start:'2030-01-07T08:00:00Z',end:'2030-01-07T09:30:00Z',...extra});
const payload=events=>({events,feeds:[{source:'tumonline',bound:true,lastSynced:Date.parse(NOW),eventCount:events.filter(e=>e.source==='tumonline').length,error:null},{source:'moodle',bound:false,lastSynced:null,eventCount:0,error:null}],timezone:'Europe/Berlin'});
const adapt=events=>adaptCalendarToTimetable(payload(events),{userId:'fictional-account-a',now:NOW});

test('adapts only the supplied personal events and retains honest course metadata',()=>{
  const input=payload([event('one',{description:'Original text: 90-minute written examination mentioned by the source.'})]),before=JSON.stringify(input),data=adaptCalendarToTimetable(input,{userId:'fictional-account-a',now:NOW});
  assert.equal(JSON.stringify(input),before);assert.equal(data.term,'个人日历');assert.equal(data.timezone,'Europe/Berlin');assert.equal(data.updatedAt,NOW.replace('Z','.000Z'));assert.equal(data.observedAt,NOW.replace('Z','.000Z'));
  const course=data.courses[0],appointment=course.appointments[0];assert.equal(course.title,'Example course');assert.equal(course.assessment,'日历未提供考核方式，请查看课程官方信息');assert.equal(course.sourceUrl,courseUrl);assert.equal(course.status,'calendar');assert.equal(course.sws,null);assert.deepEqual(course.lecturers,[]);assert.deepEqual(course.studyLinks,[]);assert.equal(course.number,'');assert.equal(course.assessmentUrl,null);assert.ok(course.description.includes('90-minute written examination'));assert.equal(course.details[0].description,course.description);
  assert.equal(appointment.date,'2030-01-07');assert.equal(appointment.start,'09:00');assert.equal(appointment.end,'10:30');assert.equal(appointment.location,'Example room');assert.equal(appointment.kind,'course');assert.equal(appointment.startAt,'2030-01-07T08:00:00.000Z');assert.equal(data.moodle.tasks.length,0);assert.equal(JSON.stringify(data).includes('fictional-account-a'),false);
});

test('course grouping and IDs are stable across ordering and dates, and isolated between accounts',()=>{
  const one=event('one'),two=event('two',{start:'2030-01-08T08:00:00Z',end:'2030-01-08T09:00:00Z'}),differentUrl=event('three',{url:courseUrl+'-other'}),differentTitle=event('four',{title:'Other course'});
  const data=adapt([one,two,differentUrl,differentTitle]),reordered=adapt([differentTitle,two,one,differentUrl]);assert.deepEqual(data,reordered);assert.equal(data.courses.length,3);assert.equal(data.courses.find(c=>c.sourceUrl===courseUrl&&c.title==='Example course').appointments.length,2);
  const base=adapt([one]),later=adapt([two]),another=adaptCalendarToTimetable(payload([one]),{userId:'fictional-account-b',now:NOW});assert.equal(base.courses[0].id,later.courses[0].id);assert.notEqual(base.storageScope,another.storageScope);assert.notEqual(base.courses[0].id,another.courses[0].id);assert.notEqual(base.courses[0].appointments[0].id,another.courses[0].appointments[0].id);
});

test('Berlin summer time, midnight boundaries and multi-day timed events keep exact instants',()=>{
  const data=adapt([event('summer',{start:'2030-07-01T08:00:00Z',end:'2030-07-01T09:00:00Z'}),event('midnight',{title:'Midnight',start:'2030-01-07T22:30:00Z',end:'2030-01-07T23:00:00Z'}),event('cross',{title:'Cross day',start:'2030-01-07T22:30:00Z',end:'2030-01-08T00:30:00Z'})]);
  assert.equal(data.courses.find(c=>c.title==='Example course').appointments[0].start,'10:00');
  const exact=data.courses.find(c=>c.title==='Midnight').appointments;assert.equal(exact.length,1);assert.equal(exact[0].date,'2030-01-07');assert.equal(exact[0].start,'23:30');assert.equal(exact[0].end,'24:00');
  const split=data.courses.find(c=>c.title==='Cross day').appointments;assert.deepEqual(split.map(a=>[a.date,a.start,a.end]),[['2030-01-07','23:30','24:00'],['2030-01-08','00:00','01:30']]);assert.equal(split[0].continuesAfter,true);assert.equal(split[1].continuesBefore,true);assert.equal(split[0].endAt,split[1].startAt);assert.equal(split.reduce((n,a)=>n+Date.parse(a.endAt)-Date.parse(a.startAt),0),2*60*60*1000);
});

test('DST transition days are not assumed to be 24 hours, including repeated local clock times',()=>{
  const spring=adapt([event('spring',{start:'2030-03-30T22:00:00Z',end:'2030-04-01T00:00:00Z'})]).courses[0].appointments;
  const transition=spring.find(a=>a.date==='2030-03-31');assert.equal(transition.start,'00:00');assert.equal(transition.end,'24:00');assert.equal(Date.parse(transition.endAt)-Date.parse(transition.startAt),23*60*60*1000);
  const autumn=adapt([event('autumn',{start:'2030-10-27T00:30:00Z',end:'2030-10-27T01:30:00Z'})]).courses[0].appointments[0];assert.equal(autumn.start,'02:30');assert.equal(autumn.end,'02:30');assert.equal(Date.parse(autumn.endAt)-Date.parse(autumn.startAt),60*60*1000);
});

test('all-day course dates use exclusive end dates and never invent clock times',()=>{
  const appointments=adapt([event('block',{allDay:true,start:'2030-01-07',end:'2030-01-09'})]).courses[0].appointments;assert.deepEqual(appointments.map(a=>a.date),['2030-01-07','2030-01-08']);assert.ok(appointments.every(a=>a.allDay&&a.start===null&&a.end===null&&a.startAt===null));
  const single=adapt([event('single',{allDay:true,start:'2030-01-07',end:null})]).courses[0].appointments;assert.equal(single.length,1);assert.equal(single[0].date,'2030-01-07');
});

test('Moodle tasks preserve real calendar dates without inventing course, submission or assessment claims',()=>{
  const input=payload([event('timed',{source:'moodle',title:'Example calendar activity',url:'https://www.moodle.tum.de/mod/assign/view.php?id=fictional',description:'Calendar information only.'}),event('all-day',{source:'moodle',allDay:true,start:'2030-01-08',end:'2030-01-09',url:null})]);input.feeds[1]={source:'moodle',bound:true,lastSynced:Date.parse('2030-01-07T06:00:00Z'),eventCount:2,error:null};
  const data=adaptCalendarToTimetable(input,{userId:'fictional-account-a',now:NOW});assert.equal(data.courses.length,0);assert.equal(data.moodle.tasks.length,2);assert.equal(data.moodle.checkedAt,'2030-01-07T06:00:00.000Z');
  const timed=data.moodle.tasks.find(t=>!t.allDay),allDay=data.moodle.tasks.find(t=>t.allDay);assert.equal(timed.dueAt,'2030-01-07T08:00:00.000Z');assert.equal(timed.kind,'calendar');assert.equal(timed.courseId,undefined);assert.equal(timed.optional,undefined);assert.equal(timed.submitted,undefined);assert.equal(timed.dueEstimated,undefined);assert.ok(timed.note.includes('Calendar information only.'));assert.equal(allDay.dueAt,null);assert.equal(allDay.dueDate,'2030-01-08');assert.equal(allDay.url,null);assert.ok(allDay.note.includes('未提供具体截止时刻'));
  assert.notEqual(timed.id,adaptCalendarToTimetable(input,{userId:'fictional-account-b',now:NOW}).moodle.tasks.find(t=>!t.allDay).id);
});

test('only safe official event URLs survive, with feed secrets removed from all output text',()=>{
  const secret='fictional-private-token',feed='https://www.moodle.tum.de/calendar/export_execute.php?authtoken='+secret;
  const data=adapt([event('unsafe',{url:feed,title:'Unsafe '+feed,location:'Room '+feed,description:'Source '+feed+' token='+secret}),event('external',{title:'External',url:'https://tum.de.example.org/course'}),event('credential',{title:'Credentials',url:'https://user:pass@campus.tum.de/course'}),event('query',{title:'Query',url:'https://campus.tum.de/course?%74oken='+secret}),event('hash',{title:'Hash',url:'https://campus.tum.de/course#authkey='+secret}),event('safe',{title:'Safe',url:courseUrl})]);
  assert.equal(JSON.stringify(data).includes(secret),false);assert.equal(JSON.stringify(data).includes('export_execute.php'),false);for(const course of data.courses)assert.equal(course.sourceUrl,course.title==='Safe'?courseUrl:null);
});

test('empty and invalid source records never load another snapshot or pretend an unsynced calendar was updated',()=>{
  const data=adaptCalendarToTimetable({events:[],feeds:[]},{now:NOW});assert.deepEqual(data.courses,[]);assert.deepEqual(data.moodle.tasks,[]);assert.equal(data.updatedAt,null);assert.equal(data.moodle.checkedAt,null);
  const invalid=adapt([event('bad-date',{start:'2030-02-30T08:00:00Z'}),event('floating',{start:'2030-01-07T08:00:00'}),event('backwards',{end:'2030-01-06T08:00:00Z'}),event('foreign',{source:'other'}),event('bad-all-day',{allDay:true,start:'2030-02-30',end:null})]);assert.equal(invalid.courses.length,0);assert.equal(invalid.moodle.tasks.length,0);
  assert.throws(()=>adaptCalendarToTimetable(null),TypeError);assert.throws(()=>adaptCalendarToTimetable({events:[],feeds:[]},{now:'invalid'}),TypeError);
});
