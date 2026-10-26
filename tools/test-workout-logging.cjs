const { test } = require('node:test');
const assert = require('node:assert/strict');
const { daysSince, recencyLabel, visibleExercises, newExerciseItem, resizeSets, commonSetValue, itemSummary, hasRecord } = require('../workout/logging.mjs');
let sequence=0;
const uuid=()=>`test-${++sequence}`;
const strength={id:'strength',name:'Example lift',category:'Push'};
const treadmill={id:'treadmill',name:'Incline Treadmill',category:'Cardio'};
const item=(id,weight=20,reps=8)=>({exerciseId:id,sets:[{id:uuid(),weight,reps}]});
const workout=(id,date,status,items)=>({id,date,status,items});

test('recency uses recorded completed sessions, calendar days, and ignores future/deleted/current entries',()=>{
  const history=[workout('old','2026-03-07','completed',[item('strength')]),
    workout('blank','2026-03-08','completed',[item('strength',null,null)]),
    workout('deleted','2026-03-08','deleted',[item('strength')]),
    workout('active','2026-03-09','in_progress',[item('strength')]),
    workout('future','2026-03-10','completed',[item('strength')])];
  assert.equal(daysSince(history,'strength','2026-03-09'),2);
  assert.equal(daysSince(history,'missing','2026-03-09'),null);
  assert.equal(recencyLabel(1),'1 day ago');
  assert.equal(recencyLabel(0),'Today · 0 days ago');
  assert.equal(daysSince([workout('same','2026-03-09','completed',[item('strength')])],'strength','2026-03-09'),0);
});

test('picker keeps treadmill and exercises with actual history, hiding unused defaults',()=>{
  const unused={id:'unused',name:'Unused lift'},blank={id:'blank',name:'Blank lift'};
  const history=[workout('logged','2026-01-01','completed',[item('strength'),item('blank',null,null)])];
  assert.deepEqual(visibleExercises([strength,treadmill,unused,blank],history).map(e=>e.id),['strength','treadmill']);
  history.push(workout('active','2026-01-02','in_progress',[item('unused',null,null)]));
  assert.ok(visibleExercises([strength,treadmill,unused,blank],history).some(e=>e.id==='unused'));
});

test('new strength entries always have three editable sets and previous values without modifying history',()=>{
  const previous=item('strength',35,10),copy=JSON.stringify(previous);
  const added=newExerciseItem(strength,previous,uuid);
  assert.equal(added.sets.length,3);
  assert.ok(added.sets.every(s=>s.weight===35&&s.reps===10&&!('done'in s)));
  assert.equal(new Set(added.sets.map(s=>s.id)).size,3);
  added.sets[0].weight=40;
  assert.equal(JSON.stringify(previous),copy);
  assert.equal(commonSetValue(added,'weight'),'');
  assert.equal(resizeSets(added,4,uuid),true);
  assert.equal(added.sets[3].weight,35);
  assert.equal(resizeSets(added,2,uuid),true);
  assert.equal(resizeSets(added,0,uuid),false);
  assert.equal(resizeSets(added,1.5,uuid),false);
  assert.equal(resizeSets(added,21,uuid),false);
  assert.equal(added.sets.length,2);
});

test('treadmill has miles, duration, and incline with no sets, preserves zero incline and round-trips through JSON',()=>{
  const added=newExerciseItem(treadmill,item('treadmill'),uuid);
  assert.equal(added.kind,'treadmill');
  assert.equal('sets'in added,false);
  assert.equal(hasRecord(added),false);
  added.inclinePercent=0;
  assert.equal(hasRecord(added),false);
  Object.assign(added,{miles:1.25,durationMinutes:20});
  assert.equal(hasRecord(added),true);
  assert.equal(itemSummary(JSON.parse(JSON.stringify(added)),treadmill),'1.25 mi · 20 min · 0% incline');
  assert.equal(resizeSets(added,3,uuid),false);
  assert.equal(daysSince([workout('cardio','2026-01-01','completed',[added])],'treadmill','2026-01-03'),2);
});
