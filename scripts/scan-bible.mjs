// 기획 바이블 카테고리·분포 현황 스캔 (읽기 전용) — 정리 방향 잡기용
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(p){ try{ for(const l of readFileSync(p,"utf8").split(/\r?\n/)){ const m=l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); } }catch{} }
loadEnv(".env.local");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const [{data:mains},{data:subs},{data:decs}] = await Promise.all([
  sb.from("main_categories").select("id,name_ko,icon,display_order,is_active").order("display_order"),
  sb.from("sub_categories").select("id,main_category_id,area_code,area_name,name_ko,display_order,is_active"),
  sb.from("decisions").select("sub_category_id"),
]);

const cntBySub = {};
let uncategorized = 0;
for(const d of decs??[]){ if(d.sub_category_id) cntBySub[d.sub_category_id]=(cntBySub[d.sub_category_id]??0)+1; else uncategorized++; }

console.log(`\n총 결정사항: ${(decs??[]).length}개 (미분류 ${uncategorized}개)`);
console.log(`대카테고리: ${(mains??[]).length}개 / 소카테고리: ${(subs??[]).length}개\n`);

for(const m of mains??[]){
  const mySubs=(subs??[]).filter(s=>s.main_category_id===m.id);
  const mTotal=mySubs.reduce((a,s)=>a+(cntBySub[s.id]??0),0);
  const flag=m.is_active===false?" [비활성]":"";
  console.log(`\n■ ${m.icon??""} ${m.name_ko} (${m.id})${flag} — ${mTotal}개, 소카테고리 ${mySubs.length}개`);
  // area 그룹핑
  const areas={}; const flat=[];
  for(const s of mySubs){ if(s.area_code){ (areas[s.area_code] ??= {name:s.area_name||s.area_code, subs:[]}).subs.push(s); } else flat.push(s); }
  const printSub=(s)=>{ const c=cntBySub[s.id]??0; const inact=s.is_active===false?" [비활성]":""; console.log(`     - ${s.name_ko} (${s.id})${inact}: ${c}개`); };
  for(const code of Object.keys(areas).sort()){ const a=areas[code]; const at=a.subs.reduce((x,s)=>x+(cntBySub[s.id]??0),0); console.log(`   [${a.name}] — ${at}개`); a.subs.sort((x,y)=>(cntBySub[y.id]??0)-(cntBySub[x.id]??0)).forEach(printSub); }
  flat.sort((x,y)=>(cntBySub[y.id]??0)-(cntBySub[x.id]??0)).forEach(printSub);
}

// 비어있는 소카테고리 / 과적재 소카테고리 요약
const subCounts=(subs??[]).map(s=>({name:s.name_ko,id:s.id,c:cntBySub[s.id]??0}));
const empty=subCounts.filter(s=>s.c===0);
const heavy=subCounts.filter(s=>s.c>=20).sort((a,b)=>b.c-a.c);
console.log(`\n\n── 요약 ──`);
console.log(`빈 소카테고리(0개): ${empty.length}개`);
console.log(`과적재 소카테고리(20개 이상): ${heavy.length}개`);
heavy.slice(0,15).forEach(s=>console.log(`   · ${s.name} — ${s.c}개`));
