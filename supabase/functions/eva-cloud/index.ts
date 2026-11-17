import {createHandler} from './core.mjs';
import {createAdapters} from './adapters.mjs';
// Missing configuration is a startup failure; no alternative host or provider.
const required=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error(`Missing ${name}`);return value;};
const config={supabaseUrl:required('SUPABASE_URL'),publishableKey:required('SUPABASE_ANON_KEY'),serviceKey:required('SUPABASE_SERVICE_ROLE_KEY'),openaiKey:required('EVA_CLOUD_OPENAI_KEY')};
// User authorized a bounded pilot with unverified remaining Supabase capacity.
if(Deno.env.get('EVA_CLOUD_PILOT_AUTHORIZED')!=='2026-10-25')throw new Error('Limited pilot not authorized');
const adapters=createAdapters(config);
// Roll out only after schema/permission and signed-in integration checks pass.
Deno.serve(createHandler({...adapters,crmCatalogueEnabled:Deno.env.get('EVA_CRM_CATALOG_ENABLED')==='true'}));

