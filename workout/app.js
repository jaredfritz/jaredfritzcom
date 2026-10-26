import { isTreadmill, exerciseName, hasRecord, latestEntry, daysSince, recencyLabel, visibleExercises, newExerciseItem, resizeSets, commonSetValue, itemSummary } from './logging.mjs';

const config=window.WORKOUT_CONFIG||{},KEY='workout-v1',OWNER_KEY='workout-last-owner-v1';
const $=s=>document.querySelector(s),uuid=()=>crypto.randomUUID(),today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')},esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initial=()=>({exercises:[{id:'ex-incline-treadmill',name:'Incline Treadmill',category:'Cardio'}],workouts:[],activeId:null});
const editingItems=new Set();
let state;try{state=JSON.parse(localStorage.getItem(KEY))||initial()}catch{state=initial()}if(!Array.isArray(state.exercises)||!Array.isArray(state.workouts))state=initial();
let booting=true,unlockError='';
let tab='today',filter='All',query='',client=null,session=null,online=false,timer;
const byDate=()=>[...state.workouts].filter(w=>w.status!=='deleted').sort((a,b)=>b.date.localeCompare(a.date));
const getActive=()=>state.workouts.find(w=>w.id===state.activeId&&w.status==='in_progress');
const ex=id=>state.exercises.find(e=>e.id===id)||{name:id,category:'Other'};
function notify(s){const t=$('#toast');t.textContent=s;t.hidden=false;clearTimeout(timer);timer=setTimeout(()=>t.hidden=true,3500)}
function save(){online=false;banner();localStorage.setItem(KEY,JSON.stringify(state));clearTimeout(timerSync);timerSync=setTimeout(sync,1000)}
let timerSync;
function last(id,exclude){return latestEntry(state.workouts,id,exclude,today())?.item||null}
function lastText(id,exclude){const item=last(id,exclude);return item?itemSummary(item,ex(id)):'No previous entry'}
function recency(id){return recencyLabel(daysSince(state.workouts,id,today(),getActive()?.id))}
function touch(workout){workout.updatedAt=Date.now();save()}
function start(){
  if(getActive())return;
  const w={id:uuid(),date:today(),status:'in_progress',source_key:null,bodyWeight:null,updatedAt:Date.now(),items:[]};
  state.workouts.unshift(w);state.activeId=w.id;save();render();
}
function add(id){
  const exercise=state.exercises.find(e=>e.id===id);if(!exercise)return;
  if(!getActive())start();
  const w=getActive();
  if(w.items.some(i=>i.exerciseId===id)){notify('Exercise already added');return}
  w.items.push(newExerciseItem(exercise,last(id,w.id),uuid));touch(w);render();$('#exercise-dialog').close();
}
function fmt(d){return new Date(d+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}
function numberField(label,value,attributes){
  return '<label class="log-field"><span>'+label+'</span><input class="field" type="number" inputmode="decimal" min="0" value="'+(value??'')+'" '+attributes+'></label>';
}
function card(item){
  const exercise=ex(item.exerciseId), treadmill=isTreadmill(exercise,item);
  const heading='<div class="exercise-head"><div><span class="kicker">'+esc(treadmill?'Cardio':exercise.category)+'</span><h3>'+esc(exerciseName(exercise))+'</h3><div class="exercise-meta">'+esc(recency(exercise.id))+'</div><div class="exercise-meta">Last: '+esc(lastText(exercise.id,getActive()?.id))+'</div></div><button class="text-button danger" data-act="remove" data-item="'+item.id+'">Remove</button></div>';
  let content;
  if(treadmill){
    content='<div class="logging-fields treadmill-fields">'+numberField('Miles',item.miles,'step="0.01" data-cardio="miles" data-item="'+item.id+'"')+numberField('Duration (min)',item.durationMinutes,'step="0.1" data-cardio="durationMinutes" data-item="'+item.id+'"')+numberField('Incline (%)',item.inclinePercent,'step="0.5" max="100" data-cardio="inclinePercent" data-item="'+item.id+'"')+'</div>';
  }else{
    const sets=item.sets||[],editing=editingItems.has(item.id);
    content='<div class="row"><span class="pill">'+sets.length+' sets</span><button class="text-button" data-act="editsets" data-item="'+item.id+'" aria-expanded="'+editing+'">'+(editing?'Done editing sets':'Edit sets')+'</button></div>';
    if(editing){
      content+='<div class="set-count">'+numberField('Number of sets',sets.length,'step="1" max="20" data-set-count="'+item.id+'"')+'</div><div class="individual-sets"><div class="individual-set set-labels"><span>Set</span><span>Weight (lb)</span><span>Reps</span></div>'+sets.map((set,index)=>'<div class="individual-set"><span class="set-number">'+(index+1)+'</span><input class="field" aria-label="Weight set '+(index+1)+'" type="number" inputmode="decimal" min="0" step="0.5" data-val="weight" data-item="'+item.id+'" data-set="'+set.id+'" value="'+(set.weight??'')+'"><input class="field" aria-label="Reps set '+(index+1)+'" type="number" inputmode="numeric" min="0" step="1" data-val="reps" data-item="'+item.id+'" data-set="'+set.id+'" value="'+(set.reps??'')+'"></div>').join('')+'</div>';
    }else{
      const mixed=field=>sets.some(set=>set[field]!==sets[0]?.[field]);
      content+='<div class="logging-fields">'+numberField('Weight (lb)',commonSetValue(item,'weight'),'step="0.5" data-all="weight" data-item="'+item.id+'" placeholder="'+(mixed('weight')?'Varies':'—')+'"')+numberField('Reps per set',commonSetValue(item,'reps'),'step="1" inputmode="numeric" data-all="reps" data-item="'+item.id+'" placeholder="'+(mixed('reps')?'Varies':'—')+'"')+'</div><p class="hint">'+(mixed('weight')||mixed('reps')?'Individual set values are saved. Edit sets to see them.':'Applies to all '+sets.length+' sets.')+'</p>';
    }
  }
  return '<article class="card exercise-card">'+heading+content+'</article>';
}
function exerciseRows(){
  return visibleExercises(state.exercises,state.workouts).filter(e=>(filter==='All'||e.category===filter)&&exerciseName(e).toLowerCase().includes(query.toLowerCase())).map(e=>'<div class="picker-row"><div><b>'+esc(exerciseName(e))+'</b><div class="recency">'+esc(recency(e.id))+'</div><div class="hint">'+esc(lastText(e.id,getActive()?.id))+'</div></div><button class="btn light sm" data-act="choose" data-id="'+esc(e.id)+'" '+(getActive()?.items.some(item=>item.exerciseId===e.id)?'disabled':'')+'>'+(getActive()?.items.some(item=>item.exerciseId===e.id)?'Added':'Add')+'</button></div>').join('')||'<p class="muted">No matches; create an exercise below.</p>';
}
function viewToday(){
  const w=getActive();
  if(!w){
    filter='All';query='';
    return '<section class="hero"><span class="eyebrow">READY WHEN YOU ARE</span><h2>Make today count.</h2><p>Choose an exercise to start. See how long it has been since each movement.</p><button class="btn" data-act="start">+ Start workout</button></section><section class="card"><div class="card-title"><h2>Your exercises</h2><button class="text-button" data-act="picker">Search / add new</button></div>'+exerciseRows()+'</section>';
  }
  const strengthSets=w.items.reduce((total,item)=>total+(isTreadmill(ex(item.exerciseId),item)?0:(item.sets||[]).length),0);
  return '<section class="hero"><div class="row"><div><span class="eyebrow">IN PROGRESS</span><h2>'+fmt(w.date)+'</h2></div><span class="pill">Active</span></div><p>'+w.items.length+' exercises · '+strengthSets+' strength sets</p><button class="btn" data-act="finish">Finish workout</button></section><section class="stack"><div class="section-head"><h2>Your exercises</h2><span class="hint">'+w.items.length+' added</span></div>'+(w.items.map(card).join('')||'<div class="empty"><h3>Add your first exercise</h3><p>Use the days since your last session to decide what to train.</p></div>')+'<button class="btn light full" data-act="picker">+ Add exercise</button></section><section class="card"><div class="row"><label for="bw">Body weight (lb)</label><input id="bw" class="field" style="max-width:110px" type="number" min="0" step="0.1" value="'+(w.bodyWeight??'')+'"></div><p style="text-align:right"><button class="text-button danger" data-act="discard">Discard workout</button></p></section>';
}
function viewHistory(){
  const ws=byDate();
  return '<div class="section-head"><h2>Workout history</h2><button class="btn light sm" data-act="import">Import</button></div><section class="metrics"><div class="metric"><b>'+ws.length+'</b><span>Dated entries</span></div><div class="metric"><b>'+ws.filter(w=>w.items.length).length+'</b><span>With exercise</span></div><div class="metric"><b>'+ws.reduce((n,w)=>n+w.items.reduce((m,i)=>m+(isTreadmill(ex(i.exerciseId),i)?0:(i.sets||[]).length),0),0)+'</b><span>Strength sets</span></div></section><section class="card"><div class="card-title"><h2>Sessions</h2><button class="btn ghost sm" data-act="export">Export JSON</button></div>'+(ws.map(w=>'<div class="workout-row"><button data-act="detail" data-id="'+w.id+'"><div class="date">'+fmt(w.date)+'</div><div class="summary">'+w.items.length+' exercises · '+esc(w.items.map(i=>exerciseName(ex(i.exerciseId))).join(', ')||'No exercises recorded')+'</div></button><span>›</span></div>').join('')||'<p class="muted">No recorded sessions yet.</p>')+'</section>';
}
function viewProgress(){
  const ws=byDate().filter(w=>w.status==='completed'&&w.items.length),cats={};
  for(const w of ws)for(const i of w.items){if(!hasRecord(i))continue;const c=ex(i.exerciseId).category;cats[c]=(cats[c]||0)+1}
  const peak=Math.max(1,...Object.values(cats));
  return '<div class="section-head"><h2>Progress</h2></div><section class="metrics"><div class="metric"><b>'+ws.length+'</b><span>Workouts</span></div><div class="metric"><b>'+ws.reduce((n,w)=>n+w.items.filter(hasRecord).length,0)+'</b><span>Exercises</span></div><div class="metric"><b>'+new Set(ws.map(w=>w.date)).size+'</b><span>Active days</span></div></section><section class="card"><h2>Movement coverage</h2><div class="category-grid">'+(Object.entries(cats).map(([name,n])=>'<div class="bar-row"><span>'+esc(name)+'</span><div class="bar"><span style="width:'+Math.round(100*n/peak)+'%"></span></div><b>'+n+'</b></div>').join('')||'<p class="muted">Log workouts to see patterns.</p>')+'</div></section><section class="card"><h2>Exercise progression</h2>'+visibleExercises(state.exercises,ws).map(x=>{
    const entries=ws.flatMap(w=>w.items.filter(i=>i.exerciseId===x.id&&hasRecord(i)));if(!entries.length)return '';
    let summary;
    if(isTreadmill(x)){
      const miles=entries.reduce((total,i)=>total+(i.miles||0),0),minutes=entries.reduce((total,i)=>total+(i.durationMinutes||0),0);
      summary=Number(miles.toFixed(2))+' mi · '+Number(minutes.toFixed(1))+' min total';
    }else{
      const weights=entries.flatMap(i=>(i.sets||[]).map(set=>set.weight).filter(n=>n!=null));
      summary='highest weight '+(weights.length?Math.max(...weights)+' lb':'—');
    }
    return '<div class="workout-row"><div><div class="date">'+esc(exerciseName(x))+'</div><div class="summary">'+entries.length+' workouts · '+esc(summary)+'</div></div></div>';
  }).join('')+'</section>';
}
function render(){
  const locked=!session;
  document.querySelector('.bottom-nav').hidden=locked;
  $('#account-button').hidden=locked;
  if(locked){
    $('#sync-banner').textContent='';
    $('#screen').innerHTML='<section class="hero"><span class="eyebrow">PERSONAL TRACKER</span><h2>Workout log</h2><p>Enter your password to open your tracker.</p></section><section class="card">'+(booting?'<p role="status">Opening tracker…</p>':'<form id="unlock-form" class="form-stack"><label for="workout-password">Password</label><input id="workout-password" class="account-input" type="password" autocomplete="current-password" required maxlength="72"><button class="btn full" type="submit" '+(!client?'disabled':'')+'>Unlock</button><p id="unlock-error" role="alert" class="muted">'+esc(unlockError)+'</p></form>')+'</section>';
    return;
  }
  document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===tab));
  $('#screen').innerHTML=tab==='today'?viewToday():tab==='history'?viewHistory():viewProgress();banner();
}
function banner(){
  if(!session){$('#sync-banner').textContent='';return}
  $('#sync-banner').textContent=online?'Cloud synced':'Sync pending · Saved on this device';
}
function picker(){filter='All';query='';$('#exercise-search').value='';drawPicker();$('#exercise-dialog').showModal()}
function drawPicker(){
  const available=visibleExercises(state.exercises,state.workouts),categories=['All',...new Set(available.map(e=>e.category))];
  $('#exercise-filters').innerHTML=categories.map(c=>'<button class="chip '+(filter===c?'selected':'')+'" data-filter="'+esc(c)+'">'+esc(c)+'</button>').join('');
  $('#exercise-list').innerHTML=exerciseRows();
}
function settings(){
  $('#account-content').innerHTML='<div class="account-status">Tracker unlocked</div><button class="btn ghost full" data-act="signout">Lock tracker</button><button class="btn light full" data-act="sync">Sync now</button><hr><div class="stack"><button class="btn light full" data-act="export">Export backup</button><button class="btn ghost full" data-act="import">Import backup</button></div><p class="readonly">Workouts sync across your devices. Locking clears the workout copy in this browser; export a backup first if sync is pending.</p>';
  $('#account-dialog').showModal();
}
function clearLockedView(){
  clearTimeout(timerSync);editingItems.clear();session=null;online=false;state=initial();
  localStorage.removeItem(KEY);
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  render();
}
async function unlock(password){
  const response=await fetch(config.supabaseUrl+'/functions/v1/workout-unlock',{
    method:'POST',headers:{'Content-Type':'application/json',apikey:config.supabasePublishableKey},
    body:JSON.stringify({password})
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'Unable to unlock. Please try again.');
  const {data,error}=await client.auth.setSession(result);
  if(error||!data.session)throw Error('Unable to open your session. Please try again.');
  session=data.session;unlockError='';render();await sync();
}
function exportData(){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({format:'workout-v1',exercises:state.exercises,workouts:state.workouts},null,2)],{type:'application/json'}));a.download='workouts-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function importData(file){if(!file||file.size>5000000)return notify('Invalid or oversized backup');try{const d=JSON.parse(await file.text());let es=[],ws=[];if(d.format==='workout-v1'){es=d.exercises;ws=d.workouts}else if(d.format==='workout-tracker-legacy-v1'){const index=new Map(state.exercises.map(e=>[e.name,e.id]));for(const r of d.records){const items=[];for(const i of r.items||[]){if(!index.has(i.exercise)){const eid=uuid();es.push({id:eid,name:i.exercise,category:'Other'});index.set(i.exercise,eid)}items.push({id:uuid(),exerciseId:index.get(i.exercise),sets:i.sets.map(s=>({id:uuid(),weight:s.weight,reps:s.reps,done:true}))})}ws.push({id:uuid(),date:r.date,source_key:r.source_key,status:'completed',bodyWeight:r.body_weight,items,updatedAt:Date.now()})}}else throw Error('Unsupported format');if(!Array.isArray(es)||!Array.isArray(ws))throw Error('Invalid records');for(const e of es)if(typeof e.id==='string'&&typeof e.name==='string'&&!state.exercises.some(x=>x.id===e.id||x.name===e.name))state.exercises.push(e);let n=0;for(const w of ws)if(/^\d{4}-\d{2}-\d{2}$/.test(w.date)&&Array.isArray(w.items)&&!state.workouts.some(x=>x.id===w.id||w.source_key&&x.source_key===w.source_key)){state.workouts.push(w);n++}save();render();notify(n+' records imported')}catch(e){notify('Import failed: '+e.message)}}
async function sync(){if(!client||!session||sync.busy)return;const owner=session.user.id;const previousOwner=localStorage.getItem(OWNER_KEY);if(previousOwner&&previousOwner!==owner){online=false;notify('Different account detected. Export local data and use the original account.');return}sync.busy=true;try{const [er,wr]=await Promise.all([client.from('workout_exercises').select('*'),client.from('workout_sessions').select('*')]);if(er.error)throw er.error;if(wr.error)throw wr.error;if(session?.user?.id!==owner)return;for(const e of er.data)if(!state.exercises.some(x=>x.id===e.id))state.exercises.push({id:e.id,name:e.name,category:e.category});for(const r of wr.data){const w=state.workouts.find(w=>w.id===r.id),remote={...r.payload,id:r.id,date:r.performed_on,status:r.status,source_key:r.source_key,bodyWeight:r.body_weight_lbs,updatedAt:Date.parse(r.updated_at)};if(!w)state.workouts.push(remote);else if(remote.updatedAt>w.updatedAt)Object.assign(w,remote)}const eRows=state.exercises.map(e=>({id:e.id,user_id:owner,name:e.name,category:e.category})),wRows=state.workouts.map(w=>({id:w.id,user_id:owner,performed_on:w.date,status:w.status,source_key:w.source_key||null,body_weight_lbs:w.bodyWeight??null,payload:{items:w.items},updated_at:new Date(w.updatedAt||Date.now()).toISOString()}));for(let n=0;n<eRows.length;n+=100){const r=await client.from('workout_exercises').upsert(eRows.slice(n,n+100),{onConflict:'user_id,id'});if(r.error)throw r.error}for(let n=0;n<wRows.length;n+=100){const r=await client.from('workout_sessions').upsert(wRows.slice(n,n+100),{onConflict:'id'});if(r.error)throw r.error}if(session?.user?.id!==owner)return;localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem(OWNER_KEY,owner);online=true;if(!document.activeElement?.matches('input,select,textarea'))render()}catch(e){online=false;notify('Cloud sync failed; local copy kept: '+e.message)}finally{sync.busy=false;banner()}}
document.addEventListener('click',async event=>{
  if(!session)return;
  const button=event.target.closest('[data-act],[data-nav],[data-filter]');if(!button)return;
  if(button.dataset.nav){tab=button.dataset.nav;render();return}
  if(button.dataset.filter){filter=button.dataset.filter;drawPicker();return}
  const action=button.dataset.act,w=getActive(),item=w?.items.find(i=>i.id===button.dataset.item);
  if(action==='start'){start();picker()}
  if(action==='picker')picker();
  if(action==='close-exercises')$('#exercise-dialog').close();
  if(action==='account')settings();
  if(action==='close-account')$('#account-dialog').close();
  if(action==='choose')add(button.dataset.id);
  if(action==='export')exportData();
  if(action==='import'){$('#import-file').value='';$('#import-file').click()}
  if(action==='editsets'&&item){editingItems.has(item.id)?editingItems.delete(item.id):editingItems.add(item.id);render()}
  if(action==='remove'&&item&&confirm('Remove this exercise?')){w.items=w.items.filter(i=>i!==item);touch(w);render()}
  if(action==='finish'&&w){
    const invalid=$('#screen').querySelector('input:invalid');
    if(invalid){invalid.reportValidity();return}
    if(!w.items.some(hasRecord)&&w.bodyWeight===null){notify('Record an exercise or body weight first');return}
    if(w.items.some(i=>!hasRecord(i))){notify('Enter details for each exercise, or remove unused exercises');return}
    w.status='completed';state.activeId=null;editingItems.clear();touch(w);render();notify('Workout saved');
  }
  if(action==='discard'&&w&&confirm('Discard current workout?')){w.status='deleted';state.activeId=null;editingItems.clear();touch(w);render()}
  if(action==='detail'){
    const workout=state.workouts.find(w=>w.id===button.dataset.id);if(!workout)return;
    $('#account-content').innerHTML='<h3>'+fmt(workout.date)+'</h3>'+workout.items.map(i=>'<p><b>'+esc(exerciseName(ex(i.exerciseId)))+'</b><br>'+esc(itemSummary(i,ex(i.exerciseId)))+'</p>').join('')+'<p class="muted">Body weight: '+(workout.bodyWeight??'—')+'</p>';
    $('#account-dialog').showModal();
  }
  if(action==='signout'){
    if(!online&&!confirm('Sync is pending. Export a backup before locking, or continue and clear this browser copy?'))return;
    const {error}=await client.auth.signOut({scope:'local'});
    if(error){notify('Unable to lock. Please try again.');return}
    clearLockedView();
  }
  if(action==='sync')await sync();
});
document.addEventListener('input',event=>{
  if(!session)return;
  const input=event.target;
  if(input.id==='exercise-search'){query=input.value;drawPicker();return}
  if(input.dataset.setCount)return;
  const w=getActive();if(!w)return;
  const value=input.value===''?null:input.valueAsNumber;
  if(value!==null&&(!Number.isFinite(value)||value<0))return;
  const item=w.items.find(i=>i.id===input.dataset.item);
  if(item&&input.dataset.all){
    if(input.dataset.all==='reps'&&value!==null&&!Number.isInteger(value))return;
    for(const set of item.sets||[])set[input.dataset.all]=value;
    touch(w);
  }
  if(item&&input.dataset.val){
    if(input.dataset.val==='reps'&&value!==null&&!Number.isInteger(value))return;
    const set=item.sets?.find(s=>s.id===input.dataset.set);
    if(set){set[input.dataset.val]=value;touch(w)}
  }
  if(item&&input.dataset.cardio){
    if(input.dataset.cardio==='inclinePercent'&&value>100)return;
    item.kind='treadmill';item[input.dataset.cardio]=value;touch(w);
  }
  if(input.id==='bw'){w.bodyWeight=value;touch(w)}
});
document.addEventListener('change',event=>{
  if(!session||!event.target.dataset.setCount)return;
  const w=getActive(),item=w?.items.find(i=>i.id===event.target.dataset.setCount);
  if(item&&resizeSets(item,event.target.valueAsNumber,uuid)){touch(w);render()}
  else{notify('Choose between 1 and 20 sets');render()}
});
document.addEventListener('submit',async e=>{if(e.target.id==='unlock-form'){e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;button.textContent='Unlocking…';try{await unlock($('#workout-password').value)}catch(error){unlockError=error.message;$('#unlock-error').textContent=unlockError;button.disabled=false;button.textContent='Unlock';$('#workout-password').focus()}return}if(!session)return;if(e.target.id==='custom-exercise-form'){e.preventDefault();const name=$('#custom-name').value.trim();if(!name)return;let x=state.exercises.find(x=>x.name.toLowerCase()===name.toLowerCase());if(!x){x={id:uuid(),name:name.slice(0,80),category:$('#custom-category').value};state.exercises.push(x)}save();add(x.id);$('#custom-name').value=''}});
$('#import-file').addEventListener('change',e=>importData(e.target.files[0]));
if(state.activeId&&!getActive())state.activeId=null;render();
(async()=>{
  try{
    if(!config.supabaseUrl||!config.supabasePublishableKey)throw Error('Tracker is not configured.');
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.57.0');
    client=createClient(config.supabaseUrl,config.supabasePublishableKey);
    session=(await client.auth.getSession()).data.session;
    client.auth.onAuthStateChange((event,next)=>{
      const changed=session?.user?.id!==next?.user?.id;
      session=next;if(changed)online=false;
      if(event==='SIGNED_OUT'){clearLockedView();return}
      if(next&&changed)setTimeout(()=>{render();sync()},0);
      banner();
    });
    booting=false;render();
    if(session)await sync();
  }catch(error){
    booting=false;unlockError='Unable to connect. Reload to try again.';render();
  }
})();
