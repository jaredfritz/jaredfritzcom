const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function frontend() {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector, {
      innerHTML: '', textContent: '', hidden: false, value: '',
      addEventListener() {}, close() {}, focus() {},
    });
    return elements.get(selector);
  };
  const storage = new Map();
  const context = vm.createContext({
    ...require('../workout/logging.mjs'),
    window: { WORKOUT_CONFIG: { supabaseUrl: 'https://example.test', supabasePublishableKey: 'public' } },
    document: { querySelector: element, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    crypto: require('node:crypto').webcrypto, setTimeout, clearTimeout,
  });
  const source = fs.readFileSync(path.join(root, 'workout/app.js'), 'utf8');
  vm.runInContext(source.replace(/^import .*;\n/, '').slice(0, source.replace(/^import .*;\n/, '').lastIndexOf('(async()=>{')), context);
  return { context, element, storage, run: code => vm.runInContext(code, context) };
}

test('locked page hides cached history and navigation, and lock clears the cache', () => {
  const app = frontend();
  app.run("booting=false; state.workouts=[{id:'sample',date:'2026-01-01',status:'completed',items:[]}]; tab='history'; render()");
  assert.match(app.element('#screen').innerHTML, /id="unlock-form"/);
  assert.doesNotMatch(app.element('#screen').innerHTML, /2026|Sessions/);
  assert.equal(app.element('.bottom-nav').hidden, true);
  app.run("session={user:{id:'owner'}};render()");
  assert.match(app.element('#screen').innerHTML, /Sessions/);
  assert.equal(app.element('.bottom-nav').hidden, false);
  app.storage.set('workout-v1', 'cached');
  app.run('clearLockedView()');
  assert.equal(app.storage.has('workout-v1'), false);
  assert.equal(app.run('session'), null);
  assert.match(app.element('#screen').innerHTML, /id="unlock-form"/);
});

test('unlock refuses server errors and accepts a server-issued session', async () => {
  const app = frontend();
  app.context.fetch = async () => ({ ok: false, json: async () => ({ error: 'Incorrect password' }) });
  await assert.rejects(app.run("unlock('incorrect')"), /Incorrect password/);
  assert.equal(app.run('session'), null);
  app.context.fetch = async (_url, request) => {
    assert.equal(request.method, 'POST');
    assert.equal(JSON.parse(request.body).password, 'example');
    return { ok: true, json: async () => ({ access_token: 'access', refresh_token: 'refresh' }) };
  };
  app.run("client={auth:{setSession:async tokens=>({data:{session:{user:{id:'owner'}}},error:null})}};sync=async()=>{}");
  await app.run("unlock('example')");
  assert.equal(app.run('session.user.id'), 'owner');
  assert.equal(app.element('.bottom-nav').hidden, false);
});

test('in-flight sync cannot restore cache after locking', async () => {
  const app = frontend();
  app.run("session={user:{id:'owner'}};client={from:()=>({select:()=>new Promise(resolve=>setTimeout(()=>resolve({data:[],error:null}),10))})}");
  const pending = app.run('sync()');
  app.run('clearLockedView()');
  await pending;
  assert.equal(app.storage.has('workout-v1'), false);
  assert.equal(app.run('session'), null);
});

test('saving a history change during an upload schedules another sync before reporting synced', async () => {
  const app=frontend();
  let beginUpload,finishUpload,count=0;
  const started=new Promise(resolve=>beginUpload=resolve);
  const held=new Promise(resolve=>finishUpload=resolve);
  const uploads=[];
  app.context.upload=async rows=>{
    uploads.push(JSON.parse(JSON.stringify(rows)));count++;
    if(count===1){beginUpload();await held}
    return {error:null};
  };
  app.run("session={user:{id:'owner'}};state.workouts=[{id:'history',date:'2026-01-01',status:'completed',items:[],bodyWeight:170,updatedAt:1}];client={from:name=>({select:async()=>({data:[],error:null}),upsert:async rows=>name==='workout_sessions'?upload(rows):({error:null})})}");
  const syncing=app.run('sync()');await started;
  app.run('state.workouts[0].bodyWeight=180;touch(state.workouts[0])');
  finishUpload();await syncing;
  assert.equal(app.run('online'),false);
  for(let i=0;i<50&&(count<2||!app.run('online'));i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(count,2);assert.equal(uploads[1][0].body_weight_lbs,180);assert.equal(app.run('online'),true);
});

test('treadmill alias cleanup waits for successful history upload and stays scoped to the owner', async () => {
  const app=frontend();
  let fail=true,removed=0,uploaded=[];
  app.context.uploadRows=async(table,rows)=>{
    if(table==='workout_sessions'){
      uploaded=JSON.parse(JSON.stringify(rows));
      if(fail)return {error:new Error('Upload failed')};
    }
    return {error:null};
  };
  app.context.removeRows=async(owner,ids)=>{
    assert.equal(owner,'owner');assert.deepEqual(Array.from(ids),['alias']);
    assert.equal(uploaded[0].payload.items[0].exerciseId,'ex-incline-treadmill');
    removed++;return {error:null};
  };
  app.run("session={user:{id:'owner'}};state.exercises=[{id:'ex-incline-treadmill',name:'Incline Treadmill',category:'Cardio'},{id:'alias',name:'Treadmill',category:'Cardio'}];state.workouts=[{id:'old',date:'2026-01-01',status:'completed',updatedAt:1,items:[{id:'interval',exerciseId:'alias',kind:'treadmill',miles:1,durationMinutes:20,inclinePercent:0}]}];client={from:table=>({select:async()=>({data:table==='workout_exercises'?[{id:'alias',name:'Treadmill',category:'Cardio'}]:[],error:null}),upsert:async rows=>uploadRows(table,rows),delete:()=>({eq:(_field,owner)=>({in:(_field,ids)=>removeRows(owner,ids)})})})}");
  await app.run('sync()');assert.equal(removed,0);assert.equal(app.run('online'),false);
  fail=false;
  await app.run('sync()');assert.equal(removed,1);assert.equal(app.run('online'),true);
  assert.equal(uploaded[0].payload.items[0].miles,1);
  app.run('clearTimeout(timer)');
});

function backend(status = 'ok') {
  let authCalls = 0;
  const client = {
    rpc: async () => ({ data: { status, owner_id: 'owner' }, error: null }),
    auth: {
      admin: {
        getUserById: async () => { authCalls++; return { data: { user: { email: 'owner@example.test' } } }; },
        generateLink: async () => ({ data: { properties: { hashed_token: 'one-time-token' } } }),
      },
      verifyOtp: async () => ({ data: { session: { user: { id: 'owner' }, access_token: 'access', refresh_token: 'refresh' } } }),
    },
  };
  const context = vm.createContext({
    createClient: () => client, Response, TextDecoder, TextEncoder,
    Deno: { env: { get: () => 'server-only-secret' }, serve() {} },
  });
  let source = fs.readFileSync(path.join(root, 'supabase/functions/workout-unlock/index.ts'), 'utf8');
  source = source.replace(/^import .*;\n/, '').replace('export async function', 'async function');
  vm.runInContext(stripTypeScriptTypes(source), context);
  return { handle: req => context.handleRequest(req), calls: () => authCalls };
}
const request = (body = { password: 'example' }, origin = 'https://jaredfritz.com') => new Request('https://example.test/unlock', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('endpoint rejects incorrect passwords, rate limits, and disallowed origins before issuing sessions', async () => {
  for (const [status, expected] of [['invalid', 401], ['limited', 429], ['unconfigured', 503]]) {
    const app = backend(status);
    const response = await app.handle(request());
    assert.equal(response.status, expected);
    assert.equal(app.calls(), 0);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  const app = backend();
  assert.equal((await app.handle(request({}, 'https://other.test'))).status, 403);
  assert.equal((await app.handle(request({}))).status, 400);
  assert.equal((await app.handle(request({ password: 'x'.repeat(2000) }))).status, 413);
  assert.equal(app.calls(), 0);
});

test('endpoint issues only owner session tokens and handles preflight', async () => {
  const app = backend();
  const response = await app.handle(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { access_token: 'access', refresh_token: 'refresh' });
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://jaredfritz.com');
  const preflight = await app.handle(new Request('https://example.test', { method: 'OPTIONS', headers: { Origin: 'https://jaredfritz.com' } }));
  assert.equal(preflight.status, 204);
});
