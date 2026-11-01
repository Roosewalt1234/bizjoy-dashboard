import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '../supabase/functions/eva-cloud');
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'schema-snapshot.json')));
const relationships = JSON.parse(fs.readFileSync(path.join(root, 'relationships.json')));
// Permissions follow the CRM navigation and table policies. Extra HR/account checks
// on cross-module tables are deliberate; model-selected joins never grant access.
const modules = [
 ['customers','Customers','customers','customers customer_contacts customer_documents','customer contact phone email client'],
 ['sales','Sales funnel','sales','sales_leads lead_items followup_remarks sales_orders','sales funnel lead leads follow-up enquiry enquiry'],
 ['quotations','Quotations','sales','quotes quote_items','quotation quotations quote quotes scope variation'],
 ['estimates','Estimates','sales','estimates estimate_items','estimate estimates estimation costing'],
 ['amc','AMC contracts','contracts','contracts contract_payments handyman_hours_log','amc annual contract handyman renewal renew expiry'],
 ['amc_ppm','AMC scheduling','contracts','amc_ppm_schedules amc_ppm_visits','amc scheduling ppm preventive visit'],
 ['amc_work','AMC work orders','service','work_orders','amc work order job jobs complaint technician'],
 ['amc_reports','AMC completion reports','service','service_reports service_report_photos','amc service completion report'],
 ['fm','FM contracts','contracts','fm_contracts fm_contract_payments','fm facility building site contract parkside parkview'],
 ['assets','FM asset register','contracts','contract_assets','asset assets pump pumps ac equipment register'],
 ['line_items','FM contract line items','contracts','contract_line_items contract_billing_lines contract_consumables','line item billing consumable consumables scope'],
 ['categories','Service categories','contracts','service_categories','category categories service'],
 ['fm_ppm','FM PPM planner','contracts','ppm_schedules ppm_visits','fm ppm preventive schedule scheduled overdue maintenance visit'],
 ['fm_work','FM work orders','service','fm_work_orders','fm work order snag snags job complaint technician'],
 ['fm_reports','FM service reports','service','fm_service_reports fm_service_report_photos','fm service completion report'],
 ['sla','SLA and KPI','contracts','sla_policies sla_events','sla kpi response breach resolution'],
 ['manpower','Manpower planning','contracts','contract_manpower_plans contract_manpower_assignments','manpower assignment cleaner cleaners deployment staffing'],
 ['employees','Employees','hr','employees','employee employees staff technician cleaner hr personnel'],
 ['attendance','Attendance','contracts','attendance_logs','attendance absent present late leave check-in shift'],
 ['accounts','Accounts ledger','accounts','accounts_transactions','accounts ledger income expense receipt transaction finance'],
 ['payments','Contract outstanding payments','accounts','contract_payments fm_contract_payments','payment payments outstanding overdue owed balance due receivable collection'],
 ['pemo','PEMO management','accounts','pemo_cards pemo_deposits pemo_transactions','pemo card deposit petty cash'],
 ['purchase','Purchases and vendor payments','purchase','purchase_orders purchase_bills purchase_line_items vendor_payments vendors','purchase purchases vendor supplier bill bills procurement'],
 ['cleaning','Cleaning areas and scheduler','projects','fm_cleaning_towers fm_cleaning_floors fm_cleaning_areas fm_cleaning_area_catalog fm_cleaning_task_catalog fm_cleaning_checklist_templates fm_cleaning_schedules fm_cleaning_task_completions fm_cleaning_visits fm_cleaning_visit_items fm_daily_cleaning_checks','cleaning corridor floor floors tower checklist scan nfc task completion'],
 ['reports','Weekly and monthly reports','contracts','weekly_reports monthly_reports reporting_periods','weekly monthly report reports reporting period'],
 ['invoices','FM invoice packs','contracts','invoice_packs invoice_pack_items','invoice invoices pack packs billing retention deduction vat'],
 ['projects','Projects','projects','projects','project projects'],
 ['geofencing','Geofencing','settings','geofence_locations','geofence geofencing radius location locations'],
];
const excluded = {
 audit_log:'Admin audit payloads may contain sensitive before/after records; awareness only.',
 profiles:'Authentication profile; not an operational query source.',
 user_permissions:'Access-control configuration; never selectable by the model.',
 user_roles:'Access-control configuration; never selectable by the model.',
 snag_notifications:'Internal delivery queue; not the source of snag/work-order status.',
 snag_notification_settings:'Internal notification configuration.',
 wo_assignment_notifications:'Internal delivery queue.',
 wo_assignment_notification_settings:'Internal notification configuration.',
 zoho_sync_log:'Internal integration log; may contain raw payloads.',
};
const staffFields=new Set('id first_name last_name full_name designation department status employee_code created_at updated_at joining_date'.split(' '));
const blocked=/(?:token|secret|password|auth_|bank|iban|salary|passport|emirates|visa|card_number|cvv|pin_code|photo_path|file_path|file_url|storage_path|document_url)/i;
const tables={};
for(const [id,title,permission,names,aliases] of modules){
 for(const name of names.split(' ')){
  const columns=snapshot.columns.filter(c=>c.table_name===name);
  if(!columns.length)throw new Error('Missing live table: '+name);
  const columnsSafe=columns.filter(c=>!blocked.test(c.column_name)&&!['json','jsonb','ARRAY','USER-DEFINED'].includes(c.data_type)&&(name!=='employees'||staffFields.has(c.column_name)));
  const table=tables[name]??={name,permissions:[],fields:Object.fromEntries(columnsSafe.map(c=>[c.column_name,c.data_type])),modules:[]};
  table.permissions=[...new Set([...table.permissions,permission])];table.modules.push(id);
 }
}
// Payment data requires finance and contract access, consistent with the ledger screens.
for(const n of ['contract_payments','fm_contract_payments','invoice_packs','invoice_pack_items'])tables[n].permissions=['accounts','contracts'];
const catalogue={version:1,capturedAt:snapshot.capturedAt,project:snapshot.project,modules:modules.map(([id,title,permission,names,aliases])=>({id,title,permission,tables:names.split(' '),aliases:aliases.split(' ')})),tables,relationships:relationships.filter(r=>tables[r.table]&&tables[r.target]&&tables[r.table].fields[r.column]&&tables[r.target].fields[r.targetColumn]),excluded,businessRules:{
 paymentStatus:'received_date present => Received; missing payment_date or date >= today => Not Yet Due; 1–15 calendar days late => Due; 16+ => Overdue. Outstanding = Due + Overdue schedule values, NOT invoice total minus ledger entries.',
 invoiceTotals:'Use stored invoice_packs.net_payable. This is an FM invoice pack, not evidence of an unpaid invoice. Do not derive outstanding from invoice status.',
 families:'AMC: contracts/work_orders/amc_ppm_visits/service_reports. FM: fm_contracts/fm_work_orders/ppm_visits/fm_service_reports. Keep families distinct; clarify when ambiguous.',
 quotations:'quotes has customer_name and zoho_customer_id, not customer_id. Never invent a customer UUID join or infer identity from similar names. Latest quotation: quote_date desc, created_at desc, id desc; disclose that definition.',
 attendance:'Active staff count is not availability or attendance. attendance_logs.contract_id refers to FM; amc_contract_id refers to AMC. Use attendance records for presence.',
 dates:'Resolve relative dates in Asia/Dubai; date fields use YYYY-MM-DD, timestamp filters use explicit UTC offsets. Clarify unspecified year/month when it changes the result.',
 evidence:'Only report facts from this request. Empty means no permitted records, not necessarily no records in the company. Never total a truncated sample. No full transcript, storage download, write, SQL, or access-control tools.',
 }};
const accounted=new Set([...Object.keys(tables),...Object.keys(excluded)]);
const missing=[...new Set(snapshot.columns.map(c=>c.table_name))].filter(n=>!accounted.has(n));
if(missing.length)throw new Error('Unclassified live tables: '+missing.join(', '));
const out='// Generated by scripts/build-eva-catalog.mjs; do not edit by hand.\nexport const CATALOG = '+JSON.stringify(catalogue,null,2)+';\n';
const destination=path.join(root,'catalog-data.mjs');
if(process.argv.includes('--check')){if(fs.readFileSync(destination,'utf8').replace(/\r\n/g,'\n')!==out)throw new Error('Catalogue drift: regenerate and review');}
else fs.writeFileSync(destination,out);
console.log(`${modules.length} modules, ${Object.keys(tables).length} query tables, ${Object.keys(excluded).length} explicitly excluded tables`);
