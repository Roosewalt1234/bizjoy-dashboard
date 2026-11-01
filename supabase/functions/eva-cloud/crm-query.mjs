import { CATALOG } from './catalog-data.mjs';
import { SafeError } from './core.mjs';
export { CATALOG };
const own=(o,k)=>Object.hasOwn(o,k);
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const keys=(o,allowed)=>plain(o)&&Object.keys(o).every(k=>allowed.includes(k));
const numeric=t=>['numeric','integer','bigint','smallint','double precision','real'].includes(t);
const ops=new Set(['eq','neq','lt','lte','gt','gte','is','not_is','contains']);
export function isCrmQuestion(text,selected={}) {
 return Object.keys(selected).length>0 || /\b(crm|modules|fiz\s*fix|fizzfix|quotation\w*|quote\w*|customer\w*|client\w*|contract\w*|amc|fm|work orders?|jobs?|snags?|complaints?|ppm|maintenance|asset\w*|equipment|attendance|employees?|staff|cleaners?|technicians?|manpower|sla|kpi|invoice\w*|payment\w*|outstanding|receivable\w*|ledger|pemo|purchase\w*|vendors?|suppliers?|estimat\w*|sales|leads?|geofenc\w*|weekly report\w*|monthly report\w*|cleaning|projects?)\b/i.test(text);
}
export function validatePlan(plan, allowedTables=Object.keys(CATALOG.tables)) {
 if(!keys(plan,['steps','clarification'])||!Array.isArray(plan.steps)||plan.steps.length>4)throw new SafeError('crm_invalid_plan',422);
 if(plan.clarification!==undefined&&(typeof plan.clarification!=='string'||plan.clarification.length>300))throw new SafeError('crm_invalid_plan',422);
 if(!plan.steps.length){if(!plan.clarification?.trim())throw new SafeError('crm_invalid_plan',422);return plan;}
 if(plan.clarification)throw new SafeError('crm_invalid_plan',422);
 plan.steps.forEach((s,i)=>{
  if(!keys(s,['table','fields','filters','order','limit','mode','metric','unique'])||!allowedTables.includes(s.table)||!own(CATALOG.tables,s.table))throw new SafeError('crm_invalid_plan',422);
  const spec=CATALOG.tables[s.table];
  if(!['rows','count','sum','outstanding'].includes(s.mode)||!Array.isArray(s.fields)||!s.fields.length||s.fields.length>10||s.fields.some(f=>!own(spec.fields,f)))throw new SafeError('crm_invalid_plan',422);
  if(s.unique!==undefined&&typeof s.unique!=='boolean')throw new SafeError('crm_invalid_plan',422);
  if(s.limit!==undefined&&(!Number.isInteger(s.limit)||s.limit<1||s.limit>10))throw new SafeError('crm_invalid_plan',422);
  if(s.mode==='sum'&&(!own(spec.fields,s.metric)||!numeric(spec.fields[s.metric])))throw new SafeError('crm_invalid_plan',422);
  if(s.mode==='sum'&&own(spec.fields,'currency')&&!s.filters?.some(f=>f.field==='currency'&&f.op==='eq'&&typeof f.value==='string'&&/^[A-Z]{3}$/.test(f.value)))throw new SafeError('crm_currency_required',422);
  if(s.mode==='outstanding'&&!['contract_payments','fm_contract_payments'].includes(s.table))throw new SafeError('crm_invalid_plan',422);
  if(!Array.isArray(s.filters)||s.filters.length>8)throw new SafeError('crm_invalid_plan',422);
  const used=new Set();
  s.filters.forEach(f=>{
   if(!keys(f,['field','op','value'])||!own(spec.fields,f.field)||!ops.has(f.op))throw new SafeError('crm_invalid_plan',422);
   const key=f.field+':'+f.op;if(used.has(key))throw new SafeError('crm_invalid_plan',422);used.add(key);
   if(plain(f.value)){
    const r=f.value;
    if(!keys(r,['step','field'])||!Number.isInteger(r.step)||r.step<0||r.step>=i||f.op!=='eq')throw new SafeError('crm_invalid_plan',422);
    const source=plan.steps[r.step];
    if(source.mode!=='rows'||!source.unique||!source.fields.includes(r.field))throw new SafeError('crm_invalid_plan',422);
    if(!CATALOG.relationships.some(rel=>rel.table===s.table&&rel.column===f.field&&rel.target===source.table&&rel.targetColumn===r.field))throw new SafeError('crm_invalid_plan',422);
   }else{
    const type=spec.fields[f.field];
    if(['is','not_is'].includes(f.op)){if(f.value!==null)throw new SafeError('crm_invalid_plan',422);}
    else if(type==='uuid'){if(typeof f.value!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.value)||!['eq','neq'].includes(f.op))throw new SafeError('crm_invalid_plan',422);}
    else if(numeric(type)){if(typeof f.value!=='number'||!Number.isFinite(f.value)||f.op==='contains')throw new SafeError('crm_invalid_plan',422);}
    else if(type==='boolean'){if(typeof f.value!=='boolean'||!['eq','neq'].includes(f.op))throw new SafeError('crm_invalid_plan',422);}
    else if(typeof f.value!=='string'||f.value.length>200||/[\u0000-\u001f]/.test(f.value)||(['date','timestamp with time zone','timestamp without time zone'].includes(type)&&(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(f.value)||Number.isNaN(Date.parse(f.value))||f.op==='contains')))throw new SafeError('crm_invalid_plan',422);
   }
  });
  if(s.order!==undefined&&(!Array.isArray(s.order)||s.order.length>3||s.order.some(o=>!keys(o,['field','direction'])||!own(spec.fields,o.field)||!['asc','desc'].includes(o.direction))))throw new SafeError('crm_invalid_plan',422);
 });
 return plan;
}
export function queryParams(step,prior=[],offset=0,pageSize=10) {
 const fields=step.mode==='outstanding'?['id','payment_date','received_date','value']:step.mode==='sum'?['id',step.metric]:step.fields;
 const q=new URLSearchParams({select:[...new Set(['id',...fields])].join(','),limit:String(pageSize),offset:String(offset)});
 for(const f of step.filters){
  let value=f.value;if(plain(value)){const result=prior[value.step];if(result.total!==1||result.records.length!==1)throw new SafeError('crm_ambiguous',422);value=result.records[0][value.field];if(value==null)throw new SafeError('crm_unsupported',422);}
  const op=f.op==='contains'?'ilike':f.op==='not_is'?'not.is':f.op;
  const literal=f.op==='contains'?JSON.stringify('*'+value.replace(/[*%_]/g,'')+'*'):typeof value==='string'?JSON.stringify(value):String(value);
  q.append(f.field,op+'.'+literal);
 }
 const order=step.order?.map(o=>o.field+'.'+o.direction+'.nullslast')??[];
 if(!step.order?.some(o=>o.field==='id'))order.push('id.asc');
 q.set('order',order.join(','));return q;
}
export function dubaiToday(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function classifyPayment(paymentDate,receivedDate,today) {
 if(receivedDate)return 'Received';if(!paymentDate)return 'Not Yet Due';
 const days=(Date.parse(today)-Date.parse(paymentDate))/86400000;
 if(!Number.isFinite(days))throw new SafeError('crm_invalid_data',502);
 return days<=0?'Not Yet Due':days<=15?'Due':'Overdue';
}
export async function executePlan(plan,{read,permit,allowedTables,signal,now=new Date()}) {
 validatePlan(plan,allowedTables);
 if(!plan.steps.length)return {status:'ambiguous',clarification:plan.clarification,selected:{},choices:[]};
 // Authorize every step before fetching ANY business record.
 for(const permission of new Set(plan.steps.flatMap(s=>CATALOG.tables[s.table].permissions)))await permit(permission,signal);
 const results=[];
 for(const step of plan.steps){
  signal?.throwIfAborted();
  const aggregate=['sum','outstanding'].includes(step.mode),size=aggregate?100:step.mode==='count'?1:step.limit??10;
  let records=[],total=null;
  for(let offset=0;;offset+=size){
   const r=await read(step.table,queryParams(step,results,offset,size),signal);
   if(!Array.isArray(r.value)||!Number.isSafeInteger(r.total)||r.total<0)throw new SafeError('crm_unavailable',502);
   if(total!==null&&r.total!==total)throw new SafeError('crm_data_changed',409);total=r.total;
   records.push(...r.value);
   if(!aggregate||records.length>=total)break;
   if(!r.value.length||offset+size>=1000)throw new SafeError('crm_too_many_rows',422);
  }
  if(new Set(records.map(r=>r.id)).size!==records.length)throw new SafeError('crm_data_changed',409);
  if(step.unique&&total!==1)return {status:total?'ambiguous':'empty',selected:{},choices:records.slice(0,5).map(r=>({label:r.title??r.display_name??r.company_name??r.quote_number??r.full_name??r.id})),clarification:total?'Multiple records match. Please give the exact customer, contract, or record reference.':undefined};
  const result={table:step.table,mode:step.mode,total,truncated:!aggregate&&step.mode!=='count'&&total>records.length,records:step.mode==='rows'?records:[]};
  if(aggregate){
   if(records.length!==total)throw new SafeError('crm_unavailable',502);
   const money=v=>{if(v===null||v===undefined)return 0;if((typeof v!=='number'&&typeof v!=='string')||v===''||!Number.isFinite(Number(v)))throw new SafeError('crm_invalid_data',502);return Math.round(Number(v)*100);};
   if(step.mode==='sum'){result.metric=step.metric;result.sum=records.reduce((n,r)=>n+money(r[step.metric]),0)/100;}
   else {const totals={Due:0,Overdue:0,Received:0,'Not Yet Due':0};for(const r of records)totals[classifyPayment(r.payment_date,r.received_date,dubaiToday(now))]+=money(r.value);result.paymentTotals=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,v/100]));result.outstanding=(totals.Due+totals.Overdue)/100;result.asOf=dubaiToday(now);}
  }
  results.push(result);
 }
 const last=results.at(-1),selected={};
 const kind={quotes:['quotation','quotationId'],contracts:['contract','contractId'],fm_contracts:['contract','contractId'],invoice_packs:['invoice','invoiceId']}[last.table];
 if(kind&&last.mode==='rows'){selected.recordKind=kind[0];selected.recordIds=last.records.map(r=>r.id);if(last.total===1)selected[kind[1]]=last.records[0].id;if(['contracts','fm_contracts'].includes(last.table))selected.family=last.table==='contracts'?'amc':'fm';}
 if(last.table==='customers'&&last.mode==='rows'&&last.total===1)selected.customerId=last.records[0].id;
 return {status:'ok',source:'live_crm',fetchedAt:now.toISOString(),schemaVersion:CATALOG.version,timezone:'Asia/Dubai',selected,results,businessRules:CATALOG.businessRules};
}
