const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const esbuild = require('esbuild');

async function setup() {
  const state = {
    record: { email: 'member@example.com', name: 'Member', role: 'viewer', status: 'active', allowedScreens: ['overview'] },
    provider: 'google.com', verified: true, email: 'member@example.com', commits: 0,
  };
  const result = await esbuild.build({ stdin: {contents: `export * from './src/lib/authControl'; export * from './src/lib/kpiSettings';`, resolveDir: process.cwd(), loader: 'ts'}, bundle: true, write: false, format: 'cjs', platform: 'node', plugins: [{
    name: 'mock', setup(build) {
      build.onResolve({filter: /^\.\/firebase$/}, () => ({ path: 'firebase', namespace: 'mock' }));
      build.onResolve({filter: /^firebase\/firestore$/}, () => ({ path: 'firestore', namespace: 'mock' }));
      build.onLoad({filter: /.*/, namespace: 'mock'}, ({path}) => ({ contents: path === 'firebase' ? `
        const s=globalThis.state;
        export const db={};
        export const auth={get currentUser(){return {uid:'uid-1',email:s.email,emailVerified:s.verified,getIdTokenResult:async()=>({signInProvider:s.provider})}}};
      ` : `
        const s=globalThis.state;
        export const doc=(_,collection,id)=>({collection,id});
        export const getDocFromServer=async ref=>{if(s.offline)throw new Error('offline');return {exists:()=>!!s.record,data:()=>s.record,id:ref.id}};
        export const getDoc=getDocFromServer;
        export const collection=()=>({}),getDocs=async()=>({docs:[]}),deleteDoc=()=>{};
        export const onSnapshot=(ref,callback,error)=>{s.snapshot=callback;s.snapshotError=error;return ()=>{};};
        export const serverTimestamp=()=> 'server-time';
        export const setDoc=async(ref,data)=>{if(s.writeError)throw Error('write rejected');s.write={ref,data};};
        export const writeBatch=()=>({set:()=>{},delete:()=>{},commit:async()=>{s.commits++}});
      ` }));
    }
  }] });
  const storage = new Map();
  const context = { module: { exports: {} }, state, localStorage:{setItem:(key,value)=>storage.set(key,value),getItem:key=>storage.get(key)},window:{dispatchEvent:()=>{}},Event:class Event {} };
  vm.runInNewContext(result.outputFiles[0].text, context);
  return { api: context.module.exports, state, storage };
}
test('listed, verified Google identity is authorized', async()=>{
  const {api}=await setup(); assert.equal((await api.checkUserAuthorization('member@example.com')).isAuthorized,true);
});
test('unlisted, suspended, unverified and password identities are rejected',async()=>{
  for(const mutate of [s=>s.record=null,s=>s.record.status='inactive',s=>s.verified=false,s=>s.provider='password',s=>s.record.role='invalid',s=>s.record.email='other@example.com']) {
    const {api,state}=await setup(); mutate(state);
    assert.equal((await api.checkUserAuthorization('member@example.com')).isAuthorized,false);
  }
});
test('server failure does not authorize from cache',async()=>{
  const {api,state}=await setup(); state.offline=true;
  await assert.rejects(api.checkUserAuthorization('member@example.com'));
});
test('viewer cannot grant or remove access',async()=>{
  const {api,state}=await setup();
  await assert.rejects(api.saveAuthorizedUser(state.record));
  await assert.rejects(api.removeAuthorizedUser('other@example.com'));
  assert.equal(state.commits,0);
});
test('administrator adds and removes permission records without Functions',async()=>{
  const {api,state}=await setup();state.record.role='admin';
  await api.saveAuthorizedUser({...state.record,email:'new@example.com'});
  await api.removeAuthorizedUser('new@example.com');
  assert.equal(state.commits,2);
});
test('administrator cannot add synthetic usernames or remove own access',async()=>{
  const {api,state}=await setup();state.record.role='admin';
  await assert.rejects(api.saveAuthorizedUser({...state.record,email:'u-123@username.technicpet.invalid'}));
  await assert.rejects(api.removeAuthorizedUser('member@example.com'));
  await assert.rejects(api.toggleUserStatus('member@example.com'));
  await assert.rejects(api.saveAuthorizedUser({...state.record,role:'viewer'}));
  assert.equal(state.commits,0);
});

const targets = {warehouseCompletionTargetPercent:80,warehousePickingLeadTimeTarget:2,monthlySalesTarget:20,averageSalesPerBillTargetBaht:20000,deliveryCompletionTargetPercent:80,salesToLoadedLeadTimeTargetDays:5};
test('KPI save validates authoritative admin identity and values before writing',async()=>{
  const {api,state}=await setup();
  await assert.rejects(api.saveKpiTargets(targets));
  assert.equal(state.write,undefined);
  state.record.role='admin';
  for(const invalid of [{warehouseCompletionTargetPercent:101},{deliveryCompletionTargetPercent:-1},{salesToLoadedLeadTimeTargetDays:0},{averageSalesPerBillTargetBaht:0},{monthlySalesTarget:0},{warehousePickingLeadTimeTarget:NaN}]) await assert.rejects(api.saveKpiTargets({...targets,...invalid}));
  assert.equal(state.write,undefined);
  await api.saveKpiTargets({...targets,deliveryCompletionTargetPercent:0});
  assert.equal(state.write.ref.collection,'settings');
  assert.equal(state.write.ref.id,'kpiTargets');
  assert.equal(state.write.data.updatedBy,'uid-1');
  assert.equal(state.write.data.deliveryCompletionTargetPercent,0);
  assert.equal(Object.hasOwn(state.write.data,'slaTargetPercent'),false);
});
test('shared KPI snapshot replaces browser-specific targets and reports failures',async()=>{
  const {api,state,storage}=await setup();
  let error;
  api.subscribeToKpiTargets(value=>{error=value;});
  state.snapshot({exists:()=>true,data:()=>targets});
  assert.equal(JSON.parse(storage.get('technicpet_kpi_targets')).monthlySalesTarget,20);
  assert.equal(error,null);
  state.snapshot({exists:()=>true,data:()=>({...targets,salesToLoadedLeadTimeTargetDays:-1})});
  assert.ok(error);
  assert.equal(JSON.parse(storage.get('technicpet_kpi_targets')).salesToLoadedLeadTimeTargetDays,6);
  state.snapshotError(Error('permission-denied'));
  assert.ok(error.includes('Firestore Rules'));
});
test('legacy KPI document keeps monthly sales and picking targets without retaining old fields',async()=>{
  const {api,state,storage}=await setup();
  let error;
  api.subscribeToKpiTargets(value=>{error=value;});
  state.snapshot({exists:()=>true,data:()=>({kpiTargetDays:4,slaTargetPercent:95,utilizationTarget:85,warehousePickingLeadTimeTarget:2,monthlySalesTarget:20})});
  const migrated=JSON.parse(storage.get('technicpet_kpi_targets'));
  assert.equal(migrated.warehousePickingLeadTimeTarget,2);
  assert.equal(migrated.monthlySalesTarget,20);
  assert.equal(migrated.salesToLoadedLeadTimeTargetDays,6);
  assert.equal(migrated.averageSalesPerBillTargetBaht,20000);
  assert.equal(Object.hasOwn(migrated,'utilizationTarget'),false);
  assert.equal(error,null);
});
test('rejected KPI write cannot replace the last confirmed settings',async()=>{
  const {api,state,storage}=await setup();state.record.role='admin';state.writeError=true;
  await assert.rejects(api.saveKpiTargets(targets));
  assert.equal(storage.has('technicpet_kpi_targets'),false);
});
