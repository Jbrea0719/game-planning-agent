// 기획서(design_docs)가 실제 어떤 대/소카테고리로 정리돼 있는지 — 읽기 전용
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
function loadEnv(p){ try{ for(const l of readFileSync(p,"utf8").split(/\r?\n/)){ const m=l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); } }catch{} }
loadEnv(".env.local");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const [{data:mains},{data:subs},{data:docs}] = await Promise.all([
  sb.from("main_categories").select("id,name_ko,icon,display_order,is_active").order("display_order"),
  sb.from("sub_categories").select("id,main_category_id,area_code,area_name,name_ko,is_active"),
  sb.from("design_docs").select("id,title,category_main_id,category_area_code,category_sub_id,status"),
]);
const mainName = Object.fromEntries((mains??[]).map(m=>[m.id,`${m.icon??""} ${m.name_ko}`]));
const subById = Object.fromEntries((subs??[]).map(s=>[s.id,s]));

const byMain = {};
let noMain=0;
for(const d of docs??[]){
  if(!d.category_main_id){ noMain++; continue; }
  (byMain[d.category_main_id] ??= {docs:[], areas:{}, subs:{}});
  byMain[d.category_main_id].docs.push(d);
}
console.log(`\n기획서 총 ${(docs??[]).length}개 (대분류 미지정 ${noMain}개)\n`);
for(const m of mains??[]){
  const g=byMain[m.id]; if(!g) { continue; }
  console.log(`■ ${mainName[m.id]} (${m.id})${m.is_active===false?" [비활성]":""} — 기획서 ${g.docs.length}개`);
  // area/sub 분포
  const areaCnt={}, subCnt={};
  for(const d of g.docs){
    const s = d.category_sub_id ? subById[d.category_sub_id] : null;
    const areaKey = (s?.area_name) || d.category_area_code || "(영역 없음)";
    areaCnt[areaKey]=(areaCnt[areaKey]??0)+1;
    const subKey = s ? s.name_ko : "(소분류 미지정)";
    subCnt[subKey]=(subCnt[subKey]??0)+1;
  }
  for(const [a,c] of Object.entries(areaCnt).sort((x,y)=>y[1]-x[1])) console.log(`     ▸ ${a}: ${c}개`);
}
// 대분류 목록(빈 것 포함)
console.log(`\n[전체 대카테고리 ${(mains??[]).length}개]`);
for(const m of mains??[]) console.log(`   ${m.display_order ?? "?"}. ${mainName[m.id]} ${m.is_active===false?"(비활성)":""} — 기획서 ${(byMain[m.id]?.docs.length)??0}개`);
