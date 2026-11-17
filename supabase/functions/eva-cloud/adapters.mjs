import { CATALOG,executePlan } from './crm-query.mjs';
import { planQuestion } from './crm-planner.mjs';
import {SafeError,LIMITS,readSse} from './core.mjs';
const TABLES={
 customers:{module:'customers',fields:'id,company_name,display_name'},
 quotations:{module:'sales',table:'quotes',fields:'id,quote_number,quote_date,status,currency,subtotal,vat_amount,total,customer_name'},
 quotation:{module:'sales',table:'quotes',fields:'id,quote_number,quote_date,status,currency,subtotal,vat_amount,total,customer_name'},
 invoice:{module:'accounts',table:'invoice_packs',fields:'id,invoice_no,invoice_number,status,total_amount,net_payable,contract_id'},
 projects:{module:'projects',fields:'id,name,customer_id'},
 contracts:{module:'contracts',table:'contracts',fields:'id,customer_id,status,end_date'},
 contract:{module:'contracts',table:'contracts',fields:'id,customer_id,status,end_date'},
 work_orders:{module:'service',table:'work_orders',fields:'id,contract_id,status'}
};
export function createAdapters(config,fetchImpl=fetch) {
 const base=new URL(config.supabaseUrl);
 if(base.protocol!=='https:' || base.hostname!=='evcaehadjzoxtdlnmehk.supabase.co')throw new Error('Unexpected cloud project');
 let halted=false;
 const stopPilot=async()=>{halted=true;try{await fetchImpl(new URL('/rest/v1/rpc/eva_cloud_stop',base),{method:'POST',headers:{apikey:config.serviceKey,authorization:`Bearer ${config.serviceKey}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});}catch{} };
 const request=async(path,token,{method='GET',body,signal,admin=false}={})=>{
   if(halted)throw new SafeError('pilot_stopped',503);
   // Destinations and verbs are supplied only by these fixed implementations, never by a model/client URL.
   const headers={apikey:admin?config.serviceKey:config.publishableKey,authorization:admin?`Bearer ${config.serviceKey}`:token,accept:'application/json'};
   if(body!==undefined)headers['content-type']='application/json';
   if(method==='GET')headers.Prefer='count=exact';
   let response;try{response=await fetchImpl(new URL(path,base),{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal});}catch(e){if(signal?.aborted)throw e;throw new SafeError('crm_unavailable',503);}
   if([402,429,509].includes(response.status)){await response.body?.cancel();await stopPilot();throw new SafeError('pilot_quota_stopped',503);}
   if(!response.ok)throw new SafeError(response.status===401||response.status===403?'crm_denied':'crm_unavailable',response.status===401||response.status===403?403:503);
   const size=Number(response.headers.get('content-length'));if(size>30000)throw new SafeError('crm_result_too_large',502);
   const text=await response.text();if(new TextEncoder().encode(text).length>30000)throw new SafeError('crm_result_too_large',502);
   let value;try{value=JSON.parse(text);}catch{throw new SafeError('crm_unavailable',502);}
   return {value,total:Number(response.headers.get('content-range')?.split('/')[1])};
 };
 const permit=async(module,token,signal)=>{
   const r=await request('/rest/v1/rpc/eva_cloud_can_read',token,{method:'POST',body:{module_name:module},signal});
   if(r.value!==true)throw new SafeError('crm_denied',403);
 };
 const select=(table,fields,filters,token,signal)=>{const q=new URLSearchParams({select:fields,limit:'10',...filters});return request(`/rest/v1/${table}?${q}`,token,{signal});};
 const adapters = {
   async verifyUser(token,signal){
     try{return (await request('/auth/v1/user',token,{signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])})).value;}catch{throw new SafeError('authentication_required',401);}
   },
   async permittedTables(token,signal){
     const modules=[...new Set(Object.values(CATALOG.tables).flatMap(t=>t.permissions))];
     const permissions=new Map(await Promise.all(modules.map(async module=>{const r=await request('/rest/v1/rpc/eva_crm_can_read',token,{method:'POST',body:{module_name:module},signal});return [module,r.value===true];})));
     return Object.keys(CATALOG.tables).filter(t=>CATALOG.tables[t].permissions.every(p=>permissions.get(p)));
   },
   async planCrm({input,allowedTables,signal}){return planQuestion({input,allowedTables,startModel:(p,s)=>adapters.startModel(p,s),signal});},
   async executeCrmPlan({plan,allowedTables,token,signal}){
     return executePlan(plan,{allowedTables,signal,permit:async module=>{const r=await request('/rest/v1/rpc/eva_crm_can_read',token,{method:'POST',body:{module_name:module},signal});if(r.value!==true)throw new SafeError('crm_denied',403);},read:(table,params,s)=>request(`/rest/v1/${table}?${params}`,token,{signal:s}),aggregate:async(step,prior,s)=>{
       const filters=step.filters.map(f=>({...f,value:f.value&&typeof f.value==='object'?prior[f.value.step]?.records?.[0]?.[f.value.field]:f.value}));
       return (await request('/rest/v1/rpc/eva_crm_aggregate',token,{method:'POST',body:{query_spec:{table:step.table,mode:step.mode,metric:step.metric??null,filters}},signal:s})).value;
     }});
   },
   async readCrm({token,input,intent,signal}){
     const spec=TABLES[intent.kind];if(!spec)throw new SafeError('unsupported_read');
     const selection={...input.selected};await permit(spec.module,token,signal);
     if(intent.recordId){const field={quotation:'quotationId',invoice:'invoiceId',contract:'contractId'}[intent.kind];if(!field)throw new SafeError('unsupported_read');selection[field]=intent.recordId;}
     // A requested new customer invalidates old quotation/invoice/contract context.
     if(intent.query){delete selection.customerId;delete selection.quotationId;delete selection.invoiceId;delete selection.contractId;delete selection.recordIds;delete selection.recordKind;}
     let customer=null;
     if(selection.customerId || intent.query || ['quotations','contracts','projects'].includes(intent.kind)){
       await permit('customers',token,signal);
       const term=(intent.query??'').replace(/[^\p{L}\p{N} '&.-]/gu,'').trim().slice(0,120);
       if(!selection.customerId && !term)return {status:'ambiguous',selected:{},choices:[]};
       const filters=selection.customerId?{id:`eq.${selection.customerId}`}:{or:`(company_name.ilike.*${term}*,display_name.ilike.*${term}*)`};
       const c=await select('customers',TABLES.customers.fields,filters,token,signal);
       if(!Array.isArray(c.value))throw new SafeError('crm_unavailable',502);
       if(c.value.length===0)return {status:'empty',selected:{}};
       if(c.value.length!==1)return {status:'ambiguous',selected:{},choices:c.value.map(r=>({customerId:r.id,label:r.display_name||r.company_name})).slice(0,5)};
       customer=c.value[0];selection.customerId=customer.id;
     }
     if(intent.kind==='customers' && !intent.query && !selection.customerId){const r=await select('customers',spec.fields,{},token,signal);if(!Array.isArray(r.value)||!Number.isSafeInteger(r.total))throw new SafeError('crm_unavailable',502);return {status:r.value.length?'ok':'empty',selected:{},records:intent.count?[]:r.value,total:r.total};}
     if(intent.kind==='customers')return {status:'ok',selected:selection,records:customer?[customer]:[],total:customer?1:0};
     const filters={};let table=spec.table??intent.kind;
     if(['contract','contracts','work_orders'].includes(intent.kind)){
       // Never silently merge or choose AMC/FM families.
       const family=/\bfm\b/i.test(input.text)?'fm':/\bamc\b/i.test(input.text)?'amc':selection.family;
       if(!family)return {status:'ambiguous',selected:selection,choices:[{family:'amc',label:'AMC'},{family:'fm',label:'FM'}]};
       selection.family=family;if(family==='fm')table=intent.kind==='work_orders'?'fm_work_orders':'fm_contracts';
     }
     if(intent.kind==='quotation')filters.id=`eq.${selection.quotationId}`;
     else if(intent.kind==='invoice')filters.id=`eq.${selection.invoiceId}`;
     else if(intent.kind==='contract')filters.id=`eq.${selection.contractId}`;
     else if(intent.kind==='work_orders'){
       if(!selection.contractId)return {status:'ambiguous',selected:selection,choices:[]};filters.contract_id=`eq.${selection.contractId}`;
     }else if(intent.kind==='quotations'){
       const name=customer?.company_name||customer?.display_name;if(!name)return {status:'empty',selected:selection};
       filters.customer_name=`eq.${JSON.stringify(name)}`;
     }else filters.customer_id=`eq.${selection.customerId}`;
     const r=await select(table,spec.fields,filters,token,signal);if(!Array.isArray(r.value))throw new SafeError('crm_unavailable',502);
     if(intent.count&&!Number.isSafeInteger(r.total))throw new SafeError('crm_unavailable',502);
     if(customer&&intent.kind==='quotation'&&r.value.some(x=>![customer.company_name,customer.display_name].includes(x.customer_name)))throw new SafeError('crm_unsupported',422);
     if(customer&&intent.kind==='contract'&&r.value.some(x=>x.customer_id!==customer.id))throw new SafeError('crm_unsupported',422);
     const result={status:r.value.length?'ok':'empty',selected:selection,records:intent.count?[]:r.value,total:Number.isFinite(r.total)?r.total:r.value.length,truncated:Number.isFinite(r.total)&&r.total>10};
     if(['quotation','quotations','contract','contracts','invoice'].includes(intent.kind)){
       const kind=intent.kind.replace(/s$/,'');selection.recordKind=kind;selection.recordIds=r.value.map(x=>x.id);
       if(r.value.length===1)selection[{quotation:'quotationId',contract:'contractId',invoice:'invoiceId'}[kind]]=r.value[0].id;
     }
     if(intent.kind==='quotation' && r.value.length){const q=await select('quote_items','quote_id,description,quantity,unit_price,amount',{quote_id:`eq.${selection.quotationId}`},token,signal);result.lineItems=q.value;result.lineItemsTruncated=q.total>10;}
     if(intent.kind==='invoice' && r.value.length){const q=await select('invoice_pack_items','invoice_pack_id,item_type,description,quantity,unit_rate,amount',{invoice_pack_id:`eq.${selection.invoiceId}`},token,signal);result.lineItems=q.value;result.lineItemsTruncated=q.total>10;}
     // A short first version fails closed on unsupported date/ordinal filters.
     if(/\b(today|yesterday|this month|last month|this week|last week)\b/i.test(input.text))throw new SafeError('crm_unsupported',422);
     return result;
   },
   async reserve({id,userId,microUsd,signal}){
     try{const r=await request('/rest/v1/rpc/eva_cloud_reserve','',{admin:true,method:'POST',body:{request_id:id,owner_id:userId,amount:microUsd},signal});if(r.value!==true)throw new Error();}catch{throw new SafeError('budget_exhausted',429);}
   },
   async admit({id,userId,signal}){try{const r=await request('/rest/v1/rpc/eva_cloud_admit','',{admin:true,method:'POST',body:{request_id:id,owner_id:userId},signal});if(r.value!==true)throw new Error();}catch{throw new SafeError('budget_exhausted',429);}},
   async release({id}){await request('/rest/v1/rpc/eva_cloud_release','',{admin:true,method:'POST',body:{request_id:id},signal:AbortSignal.timeout(5000)});},
   async settle({id,safeMicroUsd,inputTokens,outputTokens,signal}){await request('/rest/v1/rpc/eva_cloud_settle','',{admin:true,method:'POST',body:{request_id:id,charged:safeMicroUsd,input_tokens:inputTokens,output_tokens:outputTokens},signal});},
   async *startModel(payload,signal){
     const r=await fetchImpl('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${config.openaiKey}`,'content-type':'application/json'},body:JSON.stringify(payload),signal});
     if([402,429,509].includes(r.status)){await r.body?.cancel();await stopPilot();throw new SafeError('pilot_quota_stopped',503);}
     if(!r.ok || !r.headers.get('content-type')?.includes('text/event-stream')){await r.body?.cancel();throw new SafeError('model_unavailable',502);}
     yield* readSse(r.body,signal);
   },
   log:record=>console.info(JSON.stringify(record))
 };
 return adapters;
}

