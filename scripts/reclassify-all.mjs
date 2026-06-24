// 전체 결정사항 정밀 재분류 — '로비' 등 잡탕에 섞인 항목을 제자리로.
// 사용법: node scripts/reclassify-all.mjs           → 미리보기(이동 규모·분포, DB 변경 없음*)
//        node scripts/reclassify-all.mjs --apply   → 백업 후 이동 적용
// * 단, 두 모드 모두 시작 시 타겟 카테고리를 활성화함(AI가 무한의탑·채팅·우편 등으로 보낼 수 있게).
//   서버가 localhost:3000 에 떠 있어야 함.

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
function loadEnv(p){ try{ for(const l of readFileSync(p,"utf8").split(/\r?\n/)){ const m=l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); } }catch{} }
loadEnv(".env.local");
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const PROJECT_ID="00000000-0000-0000-0000-000000000001";
const JUNK_SUB="g_base.a06.1"; // 코어>기타 (계속 비활성 유지)
const apply=process.argv.includes("--apply");
const BASE="http://localhost:3000";

// 1) 타겟 카테고리 활성화 — 기타만 제외하고 전부 활성(빈 카테고리는 트리에서 자동 숨김)
await sb.from("sub_categories").update({ is_active:true }).neq("id", JUNK_SUB);
await sb.from("sub_categories").update({ is_active:false }).eq("id", JUNK_SUB);

// 2) 전체 결정 조회
const { data: decs } = await sb.from("decisions").select("id, sub_category_id").eq("project_id", PROJECT_ID);
const ids=(decs??[]).map(d=>d.id);
console.log(`전체 결정 ${ids.length}개 재분류 검토`);

// 3) 미리보기 — 75개씩 나눠 호출(병렬 과부하 방지)
const proposals = [];
for (let i=0; i<ids.length; i+=75) {
  const chunk = ids.slice(i, i+75);
  const prev = await fetch(`${BASE}/api/decisions/reclassify`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ action:"preview", project_id:PROJECT_ID, decision_ids: chunk }),
  }).then(r=>r.json());
  proposals.push(...(prev.proposals ?? []));
  process.stdout.write(`  …${proposals.length}/${ids.length}\r`);
}
console.log("");

const changed = proposals.filter(p => p.changed && (p.proposed_sub_category_id || p.current_sub_category_id));
console.log(`\n이동 예정: ${changed.length}개 (전체 ${proposals.length}개 중)\n`);

// from → to 요약 (상위)
const flow={};
for(const p of changed){ const k=`${p.current_label||"미분류"}  →  ${p.proposed_label||"미분류"}`; flow[k]=(flow[k]??0)+1; }
console.log("[주요 이동 흐름 상위 20]");
for(const [k,v] of Object.entries(flow).sort((a,b)=>b[1]-a[1]).slice(0,20)) console.log(`   ${v}개  ${k}`);

if(!apply){ console.log(`\nℹ️ 미리보기만. 적용: node scripts/reclassify-all.mjs --apply`); process.exit(0); }

// 4) 적용 — 백업 후 변경분만 반영
const ts=new Date().toISOString().replace(/[:.]/g,"-");
const bpath=`scripts/.reclass-backup-${ts}.json`;
writeFileSync(bpath, JSON.stringify((decs??[]), null, 2), "utf8");
console.log(`\n💾 원본 분류 백업: ${bpath}`);
const assignments = changed.map(p => ({ id:p.id, sub_category_id:p.proposed_sub_category_id ?? null }));
const res = await fetch(`${BASE}/api/decisions/reclassify`, {
  method:"POST", headers:{"Content-Type":"application/json"},
  body: JSON.stringify({ action:"apply", assignments, nickname:"정민" }),
}).then(r=>r.json());
console.log(`\n🎉 적용 완료 — ${res.applied}개 이동`);
