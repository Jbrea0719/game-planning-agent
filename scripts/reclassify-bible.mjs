// 3단계 — 미분류 + 잡탕('기타') 결정사항을 AI로 제자리 재분류
// 사용법: node scripts/reclassify-bible.mjs           → 미리보기(제안만 출력, DB 변경 없음)
//        node scripts/reclassify-bible.mjs --apply   → 제안대로 적용
// (서버가 localhost:3000 에 떠 있어야 함 — reclassify API 사용)

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
function loadEnv(p){ try{ for(const l of readFileSync(p,"utf8").split(/\r?\n/)){ const m=l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); } }catch{} }
loadEnv(".env.local");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const PROJECT_ID = "00000000-0000-0000-0000-000000000001";
const JUNK_SUB = "g_base.a06.1"; // 코어>기타 (잡탕)
const apply = process.argv.includes("--apply");
const BASE = "http://localhost:3000";

// 적용 모드에서만 '기타' 비활성화(AI가 다시 선택하도록). 미리보기에선 건드리지 않음.
if (apply) {
  await sb.from("sub_categories").update({ is_active: false }).eq("id", JUNK_SUB);
  console.log("· '기타' 카테고리 비활성화 (재분류 대상)");
}

// 대상: 미분류(null) + 기타
const { data: targets } = await sb
  .from("decisions")
  .select("id, sub_category_id")
  .eq("project_id", PROJECT_ID)
  .or(`sub_category_id.is.null,sub_category_id.eq.${JUNK_SUB}`);
const ids = (targets ?? []).map(t => t.id);
console.log(`재분류 대상: ${ids.length}개 (미분류 + 기타)`);
if (ids.length === 0) process.exit(0);

// 미리보기(제안)
const prev = await fetch(`${BASE}/api/decisions/reclassify`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "preview", project_id: PROJECT_ID, decision_ids: ids }),
}).then(r => r.json());
const proposals = prev.proposals ?? [];

// 집계
const byTarget = {};
let movable = 0, stayNull = 0;
for (const p of proposals) {
  const to = p.proposed_label || "(미분류 유지)";
  byTarget[to] = (byTarget[to] ?? 0) + 1;
  if (p.proposed_sub_category_id) movable++; else stayNull++;
}
console.log(`\n[제안 분포]`);
for (const [k, v] of Object.entries(byTarget).sort((a, b) => b[1] - a[1])) console.log(`   → ${k}: ${v}개`);
console.log(`\n분류됨 ${movable} / 미분류 유지 ${stayNull}`);

if (!apply) {
  console.log(`\nℹ️ 미리보기만. 적용하려면 --apply`);
  process.exit(0);
}

// 적용 — 제안된 카테고리로 이동(없으면 null=미분류로). 기타에서 전부 빠짐.
const assignments = proposals.map(p => ({ id: p.id, sub_category_id: p.proposed_sub_category_id ?? null }));
const res = await fetch(`${BASE}/api/decisions/reclassify`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "apply", assignments, nickname: "정민" }),
}).then(r => r.json());
console.log(`\n🎉 적용 완료 — ${res.applied}개 재배치`);
