const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

(async()=>{
  const server=http.createServer((request,response)=>{
    const pathname=new URL(request.url,'http://localhost').pathname;
    const file=path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);
    if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return}
    try{
      const type=file.endsWith('.css')?'text/css':/\.(js|mjs)$/.test(file)?'text/javascript':'text/html';
      response.writeHead(200,{'Content-Type':type});response.end(fs.readFileSync(file));
    }catch{response.writeHead(404).end()}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.setFixedTime(new Date('2026-10-26T12:00:00Z'));
    await page.route('https://esm.sh/**',route=>route.fulfill({contentType:'text/javascript',body:`
      export function createClient(){return {
        auth:{getSession:async()=>({data:{session:{user:{id:'test-owner'}}}}),onAuthStateChange(){},signOut:async()=>({error:null})},
        from(table){return {select:async()=>({data:[],error:null}),upsert:async rows=>{if(table==='workout_sessions')window.cloudWorkouts=structuredClone(rows);return {error:null}}}}
      }}
    `}));
    await page.addInitScript(()=>localStorage.setItem('workout-v1',JSON.stringify({
      exercises:[{id:'lift',name:'Example lift',category:'Push'},{id:'unused',name:'Unused exercise',category:'Other'},
        {id:'ex-incline-treadmill',name:'Incline Treadmill',category:'Cardio'}],
      workouts:[{id:'previous',date:'2026-10-20',status:'completed',updatedAt:1,items:[{id:'previous-item',exerciseId:'lift',sets:[{id:'previous-set',weight:50,reps:8}]}]}],activeId:null
    })));
    await page.goto(`http://127.0.0.1:${server.address().port}/workout/`);
    await page.getByText('6 days ago',{exact:true}).waitFor();
    assert.equal(await page.getByText('Unused exercise',{exact:true}).count(),0);
    await page.locator('.picker-row').filter({hasText:'Example lift'}).getByRole('button',{name:'Add',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:/Quick|suggest/i}).count(),0);
    assert.equal(await page.locator('.check-btn').count(),0);
    const lift=page.locator('.exercise-card').filter({hasText:'Example lift'});
    assert.equal(await lift.getByText('3 sets',{exact:true}).count(),1);
    assert.equal(await lift.getByLabel('Weight (lb)',{exact:true}).inputValue(),'50');
    await lift.getByLabel('Weight (lb)',{exact:true}).fill('55');
    await lift.getByLabel('Reps per set',{exact:true}).fill('12');
    await lift.getByRole('button',{name:'Edit sets',exact:true}).click();
    await lift.getByLabel('Number of sets').fill('4');
    await lift.getByLabel('Number of sets').press('Tab');
    await lift.getByLabel('Weight set 4',{exact:true}).fill('60');
    await lift.getByRole('button',{name:'Done editing sets'}).click();
    await page.getByRole('button',{name:'+ Add exercise',exact:true}).click();
    await page.locator('#exercise-list .picker-row').filter({hasText:'Treadmill'}).getByRole('button',{name:'Add',exact:true}).click();
    const cardio=page.locator('.exercise-card').filter({hasText:'Treadmill'});
    await cardio.getByLabel('Miles',{exact:true}).fill('1.25');
    await cardio.getByLabel('Duration (min)',{exact:true}).fill('20');
    await cardio.getByLabel('Incline (%)',{exact:true}).fill('0');
    assert.equal(await cardio.getByRole('button',{name:'Edit sets'}).count(),0);
    assert.equal(await cardio.getByLabel('Weight (lb)').count(),0);
    await cardio.getByLabel('Incline (%)',{exact:true}).fill('101');
    await page.getByRole('button',{name:'Finish workout',exact:true}).click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('workout-v1')).activeId!==null),true);
    await cardio.getByLabel('Incline (%)',{exact:true}).fill('0');
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('workout-v1')));
    const active=state.workouts.find(w=>w.id===state.activeId);
    assert.deepEqual(active.items.find(i=>i.exerciseId==='lift').sets.map(s=>s.weight),[55,55,55,60]);
    assert.equal(active.items.find(i=>i.exerciseId==='ex-incline-treadmill').inclinePercent,0);
    assert.equal('sets'in active.items.find(i=>i.exerciseId==='ex-incline-treadmill'),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:'/tmp/workout-simple-logging.png',fullPage:true});
    await page.getByRole('button',{name:'Finish workout',exact:true}).click();
    await page.locator('[data-nav="history"]').click();
    await page.locator('[data-act="detail"][data-id="'+active.id+'"]').click();
    await page.getByRole('heading',{name:'Edit workout',exact:true}).waitFor();
    const beforeEdit=await page.evaluate(id=>JSON.parse(localStorage.getItem('workout-v1')).workouts.find(w=>w.id===id),active.id);
    await page.getByLabel('Workout date',{exact:true}).fill('2026-10-25');
    await page.getByLabel('Body weight (lb)',{exact:true}).fill('180');
    await lift.getByRole('button',{name:'Edit sets',exact:true}).click();
    await lift.getByLabel('Number of sets').fill('3');
    await lift.getByLabel('Number of sets').press('Tab');
    await lift.getByLabel('Weight set 1',{exact:true}).fill('57.5');
    await lift.getByLabel('Reps set 3',{exact:true}).fill('10');
    await cardio.getByLabel('Miles',{exact:true}).fill('1.5');
    await cardio.getByLabel('Duration (min)',{exact:true}).fill('25');
    await cardio.getByLabel('Incline (%)',{exact:true}).fill('4');
    assert.deepEqual(await page.evaluate(id=>JSON.parse(localStorage.getItem('workout-v1')).workouts.find(w=>w.id===id),active.id),beforeEdit);
    await page.getByLabel('Workout date',{exact:true}).fill('');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    assert.equal(await page.getByRole('heading',{name:'Edit workout',exact:true}).count(),1);
    await page.getByLabel('Workout date',{exact:true}).fill('2026-10-25');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem('workout-v1')).workouts.find(w=>w.id===id),active.id);
    assert.equal(saved.date,'2026-10-25');assert.equal(saved.bodyWeight,180);assert.equal(saved.status,'completed');
    assert.deepEqual(saved.items.find(i=>i.exerciseId==='lift').sets.map(s=>s.weight),[57.5,55,55]);
    assert.equal(saved.items.find(i=>i.exerciseId==='ex-incline-treadmill').miles,1.5);
    assert.ok(saved.updatedAt>beforeEdit.updatedAt);
    await page.waitForFunction(id=>window.cloudWorkouts?.some(row=>row.id===id&&row.performed_on==='2026-10-25'&&row.payload.items.some(i=>i.miles===1.5)),active.id);
    await page.locator('[data-nav="today"]').click();
    await page.locator('.picker-row').filter({hasText:'Example lift'}).getByRole('button',{name:'Add',exact:true}).click();
    const currentId=await page.evaluate(()=>JSON.parse(localStorage.getItem('workout-v1')).activeId);
    await page.locator('[data-nav="history"]').click();
    await page.locator('[data-act="detail"][data-id="'+active.id+'"]').click();
    await cardio.getByLabel('Miles',{exact:true}).fill('99');
    await page.getByRole('button',{name:'+ Add exercise',exact:true}).click();
    await page.getByLabel('New exercise',{exact:true}).fill('Canceled custom lift');
    await page.getByRole('button',{name:'Create and add',exact:true}).click();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();
    const canceled=await page.evaluate(()=>JSON.parse(localStorage.getItem('workout-v1')));
    assert.equal(canceled.activeId,currentId);assert.deepEqual(canceled.workouts.find(w=>w.id===active.id),saved);
    assert.equal(canceled.exercises.some(e=>e.name==='Canceled custom lift'),false);
    await page.locator('[data-act="detail"][data-id="'+active.id+'"]').click();
    await page.getByLabel('Body weight (lb)',{exact:true}).fill('181');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('workout-v1')).activeId),currentId);
    await page.locator('[data-nav="progress"]').click();
    await page.getByText(/1.5 mi · 25 min total/).waitFor();
    assert.deepEqual(errors,[]);
    console.log('Browser checks passed: workout logging, history editing, date/sets/treadmill changes, save/sync, cancel, active-session preservation, and progress.');
  }finally{
    await browser?.close();server.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1});
