import { CATALOG, validatePlan, executePlan } from '../../supabase/functions/eva-cloud/crm-query.mjs';
import { SafeError } from '../../supabase/functions/eva-cloud/core.mjs';

const BASE = 'https://evcaehadjzoxtdlnmehk.supabase.co';
const TOOLS = new Set(['crm_catalogue', 'crm_query', 'crm_select']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isCatalogueTool = name => TOOLS.has(name);

// One caller-bound read service, no model or parallel conversation backend.
export function createCatalogueTools({ publishableKey, enabled = false, fetchImpl = fetch, clock = () => Date.now() }) {
  const selections = new Map();
  return async function catalogueTool(body, token, outerSignal) {
    if (!enabled) return { success:false, error:'crm_catalogue_disabled' };
    if (!isCatalogueTool(body?.tool)) return { success:false, error:'tool_not_allowed' };
    if (typeof token !== 'string' || token.length > 8192 || !token.startsWith('eyJ')) return { success:false, error:'crm_sign_in_required' };
    const signal = outerSignal ? AbortSignal.any([outerSignal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000);
    const started=clock();
    try {
      const request = async (path, payload) => {
        signal.throwIfAborted();
        const response = await fetchImpl(BASE + path, {
          method:payload === undefined ? 'GET' : 'POST', signal,
          headers:{apikey:publishableKey, authorization:'Bearer ' + token, 'content-type':'application/json', Prefer:'count=exact', 'Cache-Control':'no-store'},
          body:payload === undefined ? undefined : JSON.stringify(payload)
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new SafeError([401,403].includes(response.status) ? 'crm_denied' : [402,429,509].includes(response.status) ? 'crm_quota_unavailable' : 'crm_unavailable', response.status);
        }
        const reader=response.body.getReader();let size=0,chunks=[];
        try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>100000)throw new SafeError('crm_result_too_large',502);chunks.push(value);}} finally {await reader.cancel().catch(()=>{});}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const value=JSON.parse(new TextDecoder().decode(bytes));
        const range=response.headers.get('content-range')?.split('/')[1];
        return {value,total:range && /^\d+$/.test(range) ? Number(range) : null};
      };
      const user=(await request('/auth/v1/user')).value;
      if (!UUID.test(user?.id)) throw new SafeError('crm_sign_in_required',401);
      const permit=async module => {if((await request('/rest/v1/rpc/eva_crm_can_read',{module_name:module})).value!==true)throw new SafeError('crm_denied',403);};
      // Recompute module access each tool invocation; never cache permissions.
      const permissions = {};
      await Promise.all([...new Set(Object.values(CATALOG.tables).flatMap(t=>t.permissions))].map(async module => {
        permissions[module]=(await request('/rest/v1/rpc/eva_crm_can_read',{module_name:module})).value===true;
      }));
      const allowedTables=Object.keys(CATALOG.tables).filter(t=>CATALOG.tables[t].permissions.every(p=>permissions[p]));
      const args=body.arguments;
      if (!args || typeof args!=='object' || Array.isArray(args))throw new SafeError('crm_invalid_arguments',422);
      const read=(table,params)=>request('/rest/v1/'+table+'?'+params);
      let result;
      if(body.tool==='crm_catalogue') {
        if(Object.keys(args).some(k=>k!=='module') || typeof args.module!=='string')throw new SafeError('crm_invalid_arguments',422);
        if(!args.module) result={modules:CATALOG.modules.map(m=>({id:m.id,title:m.title,tables:m.tables.filter(t=>allowedTables.includes(t)),available:m.tables.some(t=>allowedTables.includes(t))})),excluded:CATALOG.excluded,businessRules:CATALOG.businessRules};
        else {
          const module=CATALOG.modules.find(m=>m.id===args.module) || CATALOG.modules.find(m=>m.tables.includes(args.module));
          if(!module)throw new SafeError('crm_unknown_module',422);
          const tables=module.tables.filter(t=>allowedTables.includes(t));
          if(!tables.length)throw new SafeError('crm_denied',403);
          const table=tables[0];
          result={module:module.id,tables:Object.fromEntries(tables.map(t=>[t,CATALOG.tables[t]])),relationships:CATALOG.relationships.filter(r=>tables.includes(r.table)),businessRules:CATALOG.businessRules,
            query_contract:{required_step_fields:['table','fields','filters','mode'],filters:'Always include filters: [] for intentionally unfiltered requests. Directions must be lowercase asc or desc.',example:{steps:[{table,fields:Object.keys(CATALOG.tables[table].fields).slice(0,3),filters:[],mode:'rows',limit:3,...(table==='quotes'?{order:[{field:'quote_date',direction:'desc'},{field:'created_at',direction:'desc'},{field:'id',direction:'desc'}]}:{})}]}}};
        }
      } else {
        if(typeof body.sessionId!=='string'||!/^crm-[a-zA-Z0-9-]{20,80}$/.test(body.sessionId))throw new SafeError('crm_invalid_session',422);
        for(const [key,value] of selections)if(clock()-value.time>1800000)selections.delete(key);
        const key=user.id+':'+body.sessionId;
        let plan;
        if(body.tool==='crm_select') {
          if(Object.keys(args).some(k=>!['ordinal','table'].includes(k))||!Number.isInteger(args.ordinal)||args.ordinal<1||args.ordinal>10||typeof args.table!=='string')throw new SafeError('crm_invalid_arguments',422);
          const context=selections.get(key);
          const aliases={quotations:'quotes',quotation:'quotes',amc:'contracts',fm:'fm_contracts',invoices:'invoice_packs'};
          const selection=context?.lists[aliases[args.table] || args.table || context.active];
          if(!selection || !selection.ids[args.ordinal-1])throw new SafeError('crm_selection_expired',422);
          plan={steps:[{table:selection.table,fields:selection.fields,filters:[{field:'id',op:'eq',value:selection.ids[args.ordinal-1]}],mode:'rows',limit:1,unique:true}]};
        } else {
          if(Object.keys(args).some(k=>k!=='plan_json')||typeof args.plan_json!=='string'||args.plan_json.length>10000)throw new SafeError('crm_invalid_arguments',422);
          try{plan=JSON.parse(args.plan_json);}catch{throw new SafeError('crm_invalid_plan',422);}
        }
        if(Array.isArray(plan?.steps))for(let i=0;i<plan.steps.length;i++){
          if(!Array.isArray(plan.steps[i]?.filters)){
            const error=new SafeError('crm_invalid_plan',422);error.hint=`steps[${i}].filters is required: use [] only if no filter was requested.`;throw error;
          }
        }
        validatePlan(plan,allowedTables);
        for(const s of plan.steps)if(s.mode==='sum' && !('currency' in CATALOG.tables[s.table].fields)
          && !(['contract_payments','fm_contract_payments'].includes(s.table)&&s.metric==='value')
          && !(s.table==='invoice_packs'&&['net_payable','vat_amount','total_amount'].includes(s.metric)))throw new SafeError('crm_currency_not_defined',422);
        // Financial totals are always calculated in one permission-checked DB snapshot.
        result=await executePlan(plan,{read,permit,allowedTables,signal,aggregate:async(step,prior)=>{
          const filters=step.filters.map(f=>({...f,value:f.value && typeof f.value==='object' ? prior[f.value.step]?.records?.[0]?.[f.value.field] : f.value}));
          return (await request('/rest/v1/rpc/eva_crm_aggregate',{query_spec:{table:step.table,mode:step.mode,metric:step.metric??null,filters}})).value;
        }});
        if(body.tool==='crm_select'&&result.status==='ok'){
          const parent=plan.steps[0].table;
          const tables=[parent,...new Set(CATALOG.relationships.filter(r=>r.target===parent&&allowedTables.includes(r.table)).map(r=>r.table))].slice(0,7);
          result.schema={tables:Object.fromEntries(tables.map(t=>[t,CATALOG.tables[t]])),relationships:CATALOG.relationships.filter(r=>tables.includes(r.table)&&tables.includes(r.target))};
        }
        if(result.status==='ok' && body.tool==='crm_query') {
          // Keep the displayed ordered IDs only, never cached business facts.
          const rows=result.results.filter(r=>r.mode==='rows' && r.records.length>0).at(-1);
          if(rows){
            if(!selections.has(key)&&selections.size>=200)selections.delete(selections.keys().next().value);
            const old=selections.get(key),s=plan.steps.find(s=>s.table===rows.table);
            const lists={...(old?.lists??{}),[rows.table]:{table:rows.table,ids:rows.records.map(r=>r.id),fields:s.fields}};
            const childOfSelected=old && CATALOG.relationships.some(r=>r.table===rows.table&&r.target===old.active);
            selections.set(key,{lists,active:childOfSelected?old.active:rows.table,time:clock()});
          }
        }
      }
      return {success:true,source:'live_crm',schemaVersion:CATALOG.version,elapsedMs:clock()-started,...result};
    } catch(error) {
      if(outerSignal?.aborted)throw error;
      return {success:false,error:error instanceof SafeError ? error.code || error.message : signal.aborted ? 'crm_timeout' : 'crm_unavailable',
        ...(error.hint?{hint:error.hint}:error.code==='crm_invalid_plan'?{hint:'Use only retrieved table fields; filters must be an array, order must be [{field,direction:"asc" or "desc"}] with lowercase directions. Required step fields: table, fields, filters, mode. Limit 1..10; max 10 fields. No extra keys.'}:{}),elapsedMs:clock()-started};
    }
  };
}
