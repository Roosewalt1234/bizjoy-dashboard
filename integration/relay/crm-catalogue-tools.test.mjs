import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalogueTools} from './crm-catalogue-tools.mjs';
const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const token='eyJ.unit-user-token', sessionId='crm-00000000-0000-4000-8000-000000000001';
function setup(overrides={}) {
 const requests=[];let denied=overrides.denied??[],owner=uid;
 const tool=createCatalogueTools({publishableKey:'publishable-test',enabled:true,...overrides,fetchImpl:async(url,options)=>{
  requests.push({url:new URL(url),options});
  if(options.signal.aborted)throw options.signal.reason;
  if(url.endsWith('/auth/v1/user'))return Response.json({id:owner});
  if(url.includes('eva_crm_can_read'))return Response.json(!denied.includes(JSON.parse(options.body).module_name));
  if(url.includes('eva_crm_aggregate'))return Response.json({table:'fm_contract_payments',mode:'outstanding',snapshot:true,total:1500,outstanding:42,currency:'AED'});
  if(overrides.read)return overrides.read(url,options);
  return Response.json([{id:uid,quote_number:'Q-1'},{id:other,quote_number:'Q-2'}],{headers:{'content-range':'0-1/2'}});
 }});
 const call=(name,args,extra={})=>tool({tool:name,arguments:args,sessionId},token,extra.signal);
 return {tool,call,requests,deny:v=>denied=v,owner:v=>owner=v};
}
const plan=(extra={})=>({steps:[{table:'quotes',fields:['id','quote_number'],mode:'rows',filters:[],limit:3,...extra}]});
test('disabled tool does no authentication, model or business reads',async()=>{let calls=0;const tool=createCatalogueTools({enabled:false,fetchImpl:()=>{calls++;}});assert.equal((await tool({tool:'crm_catalogue'},token)).error,'crm_catalogue_disabled');assert.equal(calls,0);});
test('missing caller token denied even when device has access',async()=>{const {tool,requests}=setup();assert.equal((await tool({tool:'crm_catalogue'},'')).error,'crm_sign_in_required');assert.equal(requests.length,0);});
test('catalogue enumerates 28 modules with caller permissions',async()=>{const {call}=setup({denied:['hr']});const r=await call('crm_catalogue',{module:''});assert.equal(r.modules.length,28);assert.equal(r.modules.find(m=>m.id==='employees').available,false);});
test('schema does not reveal excluded employee fields',async()=>{const {call}=setup();const r=await call('crm_catalogue',{module:'employees'});assert.equal(r.success,true);assert.ok(!('salary' in r.tables.employees.fields));assert.ok(!('auth_user_id' in r.tables.employees.fields));});
test('all business calls use original caller token and publishable key',async()=>{const {call,requests}=setup();assert.equal((await call('crm_query',{plan_json:JSON.stringify(plan())})).success,true);for(const {options} of requests){assert.equal(options.headers.authorization,'Bearer '+token);assert.equal(options.headers.apikey,'publishable-test');}assert.equal(requests.at(-1).options.method,'GET');});
test('SQL and unknown columns fail before business read',async()=>{const {call,requests}=setup();const r=await call('crm_query',{plan_json:JSON.stringify(plan({fields:['salary']}))});assert.equal(r.success,false);assert.equal(requests.filter(r=>r.url.pathname==='/rest/v1/quotes').length,0);});
test('revoked module permission denied on next tool invocation',async()=>{const {call,deny}=setup();assert.equal((await call('crm_catalogue',{module:'quotations'})).success,true);deny(['sales']);assert.equal((await call('crm_catalogue',{module:'quotations'})).error,'crm_denied');});
test('second quotation rechecks exact selected ID and permissions',async()=>{const {call,requests}=setup({read:(url)=>{const u=new URL(url);const id=u.searchParams.get('id');return Response.json(id?[{id:other,quote_number:'Q-2'}]:[{id:uid},{id:other}],{headers:{'content-range':id?'0-0/1':'0-1/2'}});}});await call('crm_query',{plan_json:JSON.stringify(plan())});const r=await call('crm_select',{ordinal:2,table:'quotes'});assert.equal(r.results[0].records[0].id,other);assert.equal(requests.at(-1).url.searchParams.get('id'),'eq.'+other);});
test('selection does not cross user identities',async()=>{const {call,owner}=setup();await call('crm_query',{plan_json:JSON.stringify(plan())});owner(other);assert.equal((await call('crm_select',{ordinal:2,table:'quotes'})).error,'crm_selection_expired');});
test('selection TTL expires without returning old facts',async()=>{let now=0;const {call}=setup({clock:()=>now});await call('crm_query',{plan_json:JSON.stringify(plan())});now=1800001;assert.equal((await call('crm_select',{ordinal:1,table:'quotes'})).error,'crm_selection_expired');});
test('snapshot RPC used for >1000 rows without REST sample sums',async()=>{const {call,requests}=setup();const r=await call('crm_query',{plan_json:JSON.stringify(plan({table:'fm_contract_payments',fields:['id'],mode:'outstanding'}))});assert.equal(r.results[0].outstanding,42);assert.equal(r.results[0].snapshot,true);assert.equal(requests.filter(r=>r.url.pathname==='/rest/v1/fm_contract_payments').length,0);});
test('pre-aborted cancellation stops before any network request',async()=>{const {tool,requests}=setup();const abort=new AbortController();abort.abort();await assert.rejects(tool({tool:'crm_catalogue',arguments:{module:''}},token,abort.signal));assert.equal(requests.length,0);});
test('backend failures produce no plausible business answer',async()=>{const {call}=setup({read:()=>new Response('',{status:503})});const r=await call('crm_query',{plan_json:JSON.stringify(plan())});assert.equal(r.success,false);assert.equal(r.error,'crm_unavailable');assert.equal(r.results,undefined);});
test('empty records are explicit and not fabricated',async()=>{const {call}=setup({read:()=>Response.json([],{headers:{'content-range':'*/0'}})});const r=await call('crm_query',{plan_json:JSON.stringify(plan())});assert.equal(r.results[0].total,0);assert.deepEqual(r.results[0].records,[]);});
test('ambiguous resolver stops before dependent query',async()=>{const {call,requests}=setup();const r=await call('crm_query',{plan_json:JSON.stringify(plan({unique:true}))});assert.equal(r.status,'ambiguous');assert.equal(requests.filter(r=>r.url.pathname==='/rest/v1/quotes').length,1);});

test('table names resolve only to existing permission-filtered module schema',async()=>{const {call}=setup();const r=await call('crm_catalogue',{module:'quote_items'});assert.equal(r.module,'quotations');assert.ok(r.tables.quote_items);});
test('unknown currency sums fail before RPC',async()=>{const {call,requests}=setup();const r=await call('crm_query',{plan_json:JSON.stringify(plan({table:'quote_items',fields:['id'],mode:'sum',metric:'amount'}))});assert.equal(r.error,'crm_currency_not_defined');assert.equal(requests.filter(r=>r.url.pathname.includes('eva_crm_aggregate')).length,0);});
test('missing filters yields actionable bounded feedback',async()=>{const {call}=setup();const p=plan();delete p.steps[0].filters;const r=await call('crm_query',{plan_json:JSON.stringify(p)});assert.equal(r.error,'crm_invalid_plan');assert.match(r.hint,/filters is required/);});
test('selection aliases reread the same verified record and expose safe child schema',async()=>{const {call}=setup({read:url=>Response.json([{id:uid}],{headers:{'content-range':'0-0/1'}})});await call('crm_query',{plan_json:JSON.stringify(plan())});const r=await call('crm_select',{ordinal:1,table:'quotations'});assert.equal(r.success,true);assert.ok(r.schema.tables.quote_items);assert.ok(!r.schema.tables.user_roles);});
test('child lookup preserves parent list position for a later follow-up',async()=>{const {call}=setup({read:url=>{const u=new URL(url);return Response.json(u.searchParams.has('id')?[{id:other}]:[{id:uid},{id:other}],{headers:{'content-range':u.searchParams.has('id')?'0-0/1':'0-1/2'}});}});await call('crm_query',{plan_json:JSON.stringify(plan())});await call('crm_query',{plan_json:JSON.stringify(plan({table:'quote_items',fields:['id'],filters:[{field:'quote_id',op:'eq',value:other}]}))});const r=await call('crm_select',{ordinal:2,table:''});assert.equal(r.results[0].table,'quotes');assert.equal(r.results[0].records[0].id,other);});
