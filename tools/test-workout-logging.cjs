const { test } = require('node:test');
const assert = require('node:assert/strict');
const { daysSince, recencyLabel, visibleExercises, newExerciseItem, resizeSets, commonSetValue, itemSummary, hasRecord } = require('../workout/logging.mjs');
const { createWorkoutEdit, commitWorkoutEdit } = require('../workout/logging.mjs');
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

test('history edits are isolated until committed and preserve identity, legacy set counts, and the current workout',()=>{
  const old={...workout('legacy','2026-01-01','completed',[item('strength')]),source_key:'legacy-fixture',updatedAt:100,bodyWeight:170};
  const state={exercises:[strength,treadmill],workouts:[old,workout('current','2026-01-02','in_progress',[])],activeId:'current'};
  const draft=createWorkoutEdit(old,state.exercises);
  draft.workout.date='2025-12-31';draft.workout.bodyWeight=175;draft.workout.items[0].sets[0].weight=25;
  assert.equal(old.date,'2026-01-01');
  assert.equal(old.items[0].sets[0].weight,20);
  assert.equal(commitWorkoutEdit(state,draft,200),true);
  assert.equal(old.date,'2025-12-31');assert.equal(old.bodyWeight,175);
  assert.equal(old.items[0].sets.length,1);assert.equal(old.items[0].sets[0].weight,25);
  assert.equal(old.id,'legacy');assert.equal(old.source_key,'legacy-fixture');assert.equal(old.status,'completed');
  assert.equal(old.updatedAt,200);assert.equal(state.activeId,'current');assert.equal(state.workouts.length,2);
});

test('history save refuses newer cloud versions and reconciles matching custom exercises',()=>{
  const old={...workout('old','2026-01-01','completed',[item('strength')]),updatedAt:1};
  const state={exercises:[strength],workouts:[old]};
  const stale=createWorkoutEdit(old,state.exercises);
  stale.workout.bodyWeight=190;old.updatedAt=2;
  assert.equal(commitWorkoutEdit(state,stale,3),false);assert.equal(old.bodyWeight,undefined);
  const edit=createWorkoutEdit(old,state.exercises);
  edit.exercises.push({id:'local-custom',name:'Custom lift'});
  edit.workout.items.push(item('local-custom'));
  state.exercises.push({id:'remote-custom',name:'Custom lift'});
  assert.equal(commitWorkoutEdit(state,edit,4),true);
  assert.equal(old.items[1].exerciseId,'remote-custom');assert.equal(state.exercises.length,2);
});
