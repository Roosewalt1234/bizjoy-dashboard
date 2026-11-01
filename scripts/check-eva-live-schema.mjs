import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../supabase/functions/eva-cloud');
const [columnsFile,relationshipsFile]=process.argv.slice(2);
if(!columnsFile||!relationshipsFile)throw new Error('Pass metadata JSON exports: columns [{table_name,column_name,data_type}], relationships [{table,column,target,targetColumn}]. No credentials or business records.');
const old=JSON.parse(fs.readFileSync(path.join(root,'schema-snapshot.json'))).columns;
const compare=(a,b,fields)=>{
 const keys=rows=>new Set(rows.map(r=>JSON.stringify(fields.map(k=>r[k]))));const x=keys(a),y=keys(b);
 return {added:[...y].filter(k=>!x.has(k)),removed:[...x].filter(k=>!y.has(k))};
};
const columns=compare(old,JSON.parse(fs.readFileSync(columnsFile)),['table_name','column_name','data_type']);
const relationships=compare(JSON.parse(fs.readFileSync(path.join(root,'relationships.json'))),JSON.parse(fs.readFileSync(relationshipsFile)),['table','column','target','targetColumn']);
console.log(JSON.stringify({columns,relationships},null,2));
if([...columns.added,...columns.removed,...relationships.added,...relationships.removed].length)process.exitCode=1;
