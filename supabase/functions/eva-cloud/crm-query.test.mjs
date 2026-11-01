import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG,validatePlan,queryParams,executePlan,classifyPayment,dubaiToday,isCrmQuestion } from './crm-query.mjs';
import { plannerCatalogue,planQuestion } from './crm-planner.mjs';
import { createHandler } from './core.mjs';
import { createAdapters } from './adapters.mjs';
const uid='00000000-0000-4000-8000-000000000001';
const step=(overrides={})=>({table:'quotes',fields:['id','quote_number','total'],filters:overrides.mode==='sum'?[{field:'currency',op:'eq',value:'AED'}]:[],mode:'rows',limit:10,...overrides});
const plan=s=>({steps:[s]});
const execute=(p,read,extra={})=>executePlan(p,{read,permit:async()=>{},...extra});
test('live catalogue accounts for all 73 tables, includes 28 modules',()=>{
 assert.equal(CATALOG.modules.length,28);assert.equal(Object.keys(CATALOG.tables).length+Object.keys(CATALOG.excluded).length,73);
 for(const t of Object.values(CATALOG.tables)){assert.ok(t.fields.id);assert.ok(t.permissions.length);}
 assert.ok(!('salary' in CATALOG.tables.employees.fields));assert.ok(!('auth_user_id' in CATALOG.tables.employees.fields));assert.ok(!('nfc_token' in CATALOG.tables.fm_contracts.fields));
});
for(const [label,value] of [
 ['unknown table',plan(step({table:'auth.users'}))],
 ['write SQL',{steps:[],sql:'delete from quotes'}],
 ['raw expression',plan(step({fields:['sum(total)']}))],
 ['secret column',plan(step({table:'employees',fields:['id','salary']}))],
 ['unknown filter',plan(step({filters:[{field:'customer_id',op:'eq',value:uid}]}))],
 ['logic injection',plan(step({filters:[{field:'or',op:'eq',value:'(id.not.is.null)'}]}))],
 ['unknown operator',plan(step({filters:[{field:'id',op:'in',value:[uid]}]}))],
 ['excess limit',plan(step({limit:100000}))],
 ['string amount',plan(step({filters:[{field:'total',op:'gte',value:'100'}]}))],
 ['uuid injection',plan(step({filters:[{field:'id',op:'eq',value:'x) or true'}]}))],
 ['date garbage',plan(step({filters:[{field:'quote_date',op:'eq',value:'tomorrow'}]}))],
 ['unknown plan field',{steps:[step()],url:'https://example.com'}],
 ['unsupported sum',plan(step({mode:'sum',metric:'customer_name'}))],
 ['outstanding wrong table',plan(step({mode:'outstanding'}))],
 ['future reference',plan(step({filters:[{field:'id',op:'eq',value:{step:1,field:'id'}}]}))],
 ['duplicate filter',plan(step({filters:[{field:'status',op:'eq',value:'Draft'},{field:'status',op:'eq',value:'Approved'}]}))],
 ])test('rejects '+label,()=>assert.throws(()=>validatePlan(value),/crm_invalid_plan/));
test('disallowed module cannot appear in plan',()=>assert.throws(()=>validatePlan(plan(step()),['customers']),/crm_invalid_plan/));
test('literal injection stays one encoded column filter',()=>{
 const s=step({filters:[{field:'customer_name',op:'eq',value:'A & Co, (x).or.*"'}]});validatePlan(plan(s));
 const q=queryParams(s);assert.deepEqual([...q.keys()],['select','limit','offset','customer_name','order']);assert.equal(q.get('customer_name'),'eq.'+JSON.stringify(s.filters[0].value));
});
test('unknown foreign-key relationship rejected, not guessed by model',()=>{
 const p={steps:[step({table:'customers',fields:['id'],unique:true}),step({filters:[{field:'id',op:'eq',value:{step:0,field:'id'}}]})]};assert.throws(()=>validatePlan(p),/crm_invalid_plan/);
});
test('unique foreign-key lookup works and rereads under permission',async()=>{
 const p={steps:[step({table:'fm_contracts',fields:['id','title'],unique:true}),step({table:'fm_work_orders',fields:['id','status'],filters:[{field:'contract_id',op:'eq',value:{step:0,field:'id'}}]})]};
 let calls=0;const r=await execute(p,async(table,q)=>{calls++;if(table==='fm_work_orders')assert.equal(q.get('contract_id'),'eq.'+JSON.stringify(uid));return {value:[{id:uid}],total:1};});assert.equal(calls,2);assert.equal(r.results.length,2);
});
test('ambiguous site stops before dependent query',async()=>{
 const p={steps:[step({table:'fm_contracts',fields:['id','title'],unique:true}),step({table:'fm_work_orders',fields:['id'],filters:[{field:'contract_id',op:'eq',value:{step:0,field:'id'}}]})]};
 let calls=0;const r=await execute(p,async()=>{calls++;return {value:[{id:uid,title:'Parkside'},{id:'other',title:'Parkside 2'}],total:2};});assert.equal(r.status,'ambiguous');assert.equal(calls,1);
});
test('permission denial occurs before all business reads',async()=>{
 let calls=0;await assert.rejects(()=>execute(plan(step()),async()=>{calls++;},{permit:async()=>{throw new Error('denied');}}),/denied/);assert.equal(calls,0);
});
test('exact counts are not limited to row sample',async()=>{
 const r=await execute(plan(step({mode:'count'})),async()=>({value:[{id:uid}],total:238}));assert.equal(r.results[0].total,238);assert.deepEqual(r.results[0].records,[]);
});
test('row sample is labelled truncated',async()=>{
 const r=await execute(plan(step()),async()=>({value:[{id:uid}],total:238}));assert.equal(r.results[0].truncated,true);
});
test('mixed-currency sums require an explicit currency',()=>assert.throws(()=>validatePlan(plan(step({mode:'sum',metric:'total',filters:[]}))),/crm_currency_required/));
test('aggregate scans all pages and uses cents',async()=>{
 let calls=0;const r=await execute(plan(step({mode:'sum',metric:'total'})),async(_t,q)=>{calls++;const offset=Number(q.get('offset'));return {value:Array.from({length:offset?1:100},(_,i)=>({id:String(offset+i),total:0.1})),total:101};});assert.equal(calls,2);assert.equal(r.results[0].sum,10.1);
});
test('aggregate over hard cap fails rather than returning partial total',async()=>{
 await assert.rejects(()=>execute(plan(step({mode:'sum',metric:'total'})),async(_t,q)=>({value:Array.from({length:100},(_,i)=>({id:String(Number(q.get('offset'))+i),total:1})),total:1001})),/crm_too_many_rows/);
});
test('changed result counts stop aggregate',async()=>{
 await assert.rejects(()=>execute(plan(step({mode:'sum',metric:'total'})),async(_t,q)=>({value:Array.from({length:100},(_,i)=>({id:String(Number(q.get('offset'))+i),total:1})),total:Number(q.get('offset'))?201:200})),/crm_data_changed/);
});
test('missing exact count fails closed',async()=>await assert.rejects(()=>execute(plan(step({mode:'count'})),async()=>({value:[],total:NaN})),/crm_unavailable/));
test('Dubai date changes at 20:00 UTC',()=>assert.equal(dubaiToday(new Date('2026-10-31T20:30:00Z')),'2026-11-01'));
for(const [date,received,expected] of [['2026-11-01',null,'Not Yet Due'],['2026-10-31',null,'Due'],['2026-10-17',null,'Due'],['2026-10-16',null,'Overdue'],['2026-10-01','2026-10-31','Received'],[null,null,'Not Yet Due']])test('payment classification '+date+' '+expected,()=>assert.equal(classifyPayment(date,received,'2026-11-01'),expected));
test('outstanding uses schedule rule, not invoice balance',async()=>{
 const r=await execute(plan(step({table:'fm_contract_payments',fields:['id'],mode:'outstanding'})),async()=>({value:[{id:'1',payment_date:'2026-10-31',value:10},{id:'2',payment_date:'2026-10-16',value:20},{id:'3',payment_date:'2026-11-01',value:30},{id:'4',payment_date:'2026-10-01',received_date:'2026-10-31',value:40}],total:4}),{now:new Date('2026-11-01T05:00:00Z')});assert.equal(r.results[0].outstanding,30);assert.equal(r.results[0].paymentTotals.Overdue,20);
});
test('catalogue retrieval fits planner byte budget for representative modules',()=>{
 for(const q of ['latest quotation','FM cleaning schedule','employee attendance today','purchase bills for vendor','outstanding payments for FM contract','PPM maintenance assets']){
  const cat=plannerCatalogue(q,Object.keys(CATALOG.tables));assert.ok(Buffer.byteLength(JSON.stringify(cat))<19000,q);
 }
});
test('planner JSON and usage are verified before execution',async()=>{
 const out=await planQuestion({input:{text:'latest quotation',selected:{}},allowedTables:Object.keys(CATALOG.tables),startModel:async function*(){yield {type:'response.output_text.delta',delta:JSON.stringify(plan(step({limit:1})))};yield {type:'response.completed',response:{usage:{input_tokens:1,output_tokens:1}}};}});assert.equal(out.plan.steps[0].table,'quotes');
});
test('CRM route recognises operational modules',()=>{for(const q of ['staff attendance','purchase order','PEMO cards','cleaning schedules','SLA breaches','latest quotation'])assert.equal(isCrmQuestion(q),true);assert.equal(isCrmQuestion('hello'),false);});
const usage={input_tokens:10,output_tokens:10};
function mockDeps(extra={}){return {crmCatalogueEnabled:true,verifyUser:async()=>({id:uid}),admit:async()=>{},reserve:async()=>{},release:async()=>{},settle:async()=>{},permittedTables:async()=>['quotes'],planCrm:async()=>({plan:plan(step()),allowedTables:['quotes'],usage}),executeCrmPlan:async()=>({status:'ok',selected:{},results:[{table:'quotes',records:[]}]}),startModel:async function*(){yield {type:'response.output_text.delta',delta:'The answer.'};yield {type:'response.completed',response:{usage}};},...extra};}
const request=text=>new Request('https://example.test',{method:'POST',headers:{authorization:'Bearer user-token'},body:JSON.stringify({text})});
test('handler reserves once, settles planner and answer usage together',async()=>{
 let reserves=0,settled;const r=await createHandler(mockDeps({reserve:async()=>{reserves++;},settle:async x=>{settled=x;}}))(request('latest quotation'));const body=await r.text();assert.match(body,/event: done/);assert.equal(reserves,1);assert.equal(settled.inputTokens,20);assert.equal(settled.outputTokens,20);
});
test('clarification settles planner cost without final model',async()=>{
 let settled,models=0;const r=await createHandler(mockDeps({executeCrmPlan:async()=>({status:'ambiguous',clarification:'AMC or FM?'}),settle:async x=>{settled=x;},startModel:async function*(){models++;}}))(request('PPM visits'));const body=await r.text();assert.match(body,/AMC or FM/);assert.equal(models,0);assert.equal(settled.inputTokens,10);
});
test('flag off preserves existing unsupported payment route',async()=>{
 let called=0;const r=await createHandler(mockDeps({crmCatalogueEnabled:false,permittedTables:async()=>{called++;return [];}}))(request('outstanding payments'));assert.match(await r.text(),/not supported by this first cloud version/);assert.equal(called,0);
});
test('unauthenticated request is rejected before data or model',async()=>{
 const r=await createHandler(mockDeps())(new Request('https://example.test',{method:'POST',body:'{}'}));assert.equal(r.status,401);
});
test('adapter business reads always carry user token, never service key',async()=>{
 const calls=[];const a=createAdapters({supabaseUrl:'https://evcaehadjzoxtdlnmehk.supabase.co',publishableKey:'public-key',serviceKey:'service-secret',openaiKey:'model-secret'},async(url,options)=>{calls.push({url:new URL(url),options});return Response.json(String(url).includes('/rpc/')?true:[{id:uid}],{headers:{'content-range':'0-0/1'}});});
 await a.executeCrmPlan({plan:plan(step()),allowedTables:['quotes'],token:'Bearer signed-user'});
 assert.ok(calls.length>=2);for(const c of calls){assert.equal(c.options.headers.authorization,'Bearer signed-user');assert.equal(c.options.headers.apikey,'public-key');assert.ok(!JSON.stringify(c.options).includes('service-secret'));assert.ok(!c.url.pathname.includes('execute_sql'));}
});
