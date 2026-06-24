// 기존 기획서 일괄 줄표 정규화 — 긴 줄표(— U+2014, ― U+2015) → 일반 하이픈(-)
//
// 사용법:
//   node scripts/normalize-dashes.mjs           → 스캔만 (읽기 전용, 현황 보고)
//   node scripts/normalize-dashes.mjs --apply   → 변환 적용 (적용 전 원본 JSON 백업)
//
// 환경변수(.env.local): NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
// 안전장치: --apply 시 변경 대상 원본을 scripts/.dash-backup-<ts>.json 으로 먼저 저장.

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env.local 직접 파싱 (node 단독 실행 시 자동 로드 안 됨)
function loadEnvFile(path) {
  try {
    const txt = readFileSync(path, "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* 무시 */ }
}
loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 없음 (.env.local 확인)");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const supabase = createClient(url, key);

// 줄표별 카운트
const RE_EM = /—/g;   // U+2014
const RE_BAR = /―/g;  // U+2015
const RE_EN = /–/g;   // U+2013 (참고용 — 변환 안 함)
const count = (s, re) => ((s ?? "").match(re) ?? []).length;

// 변환: 긴 줄표(— ―)만 하이픈으로. en dash(–)는 보존.
const normalize = (s) => (s ?? "").replace(/[—―]/g, "-");

const { data, error } = await supabase
  .from("design_docs")
  .select("id, title, content_markdown")
  .limit(2000);

if (error) {
  console.error("❌ 조회 실패:", error.message);
  process.exit(1);
}

const docs = data ?? [];
let totalEm = 0, totalBar = 0, totalEn = 0;
const affected = [];

for (const d of docs) {
  const t = d.title ?? "";
  const c = d.content_markdown ?? "";
  const em = count(t, RE_EM) + count(c, RE_EM);
  const bar = count(t, RE_BAR) + count(c, RE_BAR);
  const en = count(t, RE_EN) + count(c, RE_EN);
  totalEm += em; totalBar += bar; totalEn += en;
  if (em + bar > 0) affected.push({ id: d.id, title: t || "(제목 없음)", em, bar, title_raw: t, content_raw: c });
}

console.log(`\n📊 전체 기획서 ${docs.length}개 스캔 결과`);
console.log(`   — (em dash U+2014) : ${totalEm}개`);
console.log(`   ― (bar    U+2015) : ${totalBar}개`);
console.log(`   변환 대상 기획서   : ${affected.length}개 (총 ${totalEm + totalBar}개 치환 예정)`);
console.log(`   (참고) – (en dash U+2013, 변환 안 함) : ${totalEn}개`);

if (affected.length > 0) {
  console.log(`\n[변환 대상 목록]`);
  for (const a of affected.sort((x, y) => (y.em + y.bar) - (x.em + x.bar))) {
    console.log(`   - ${a.title}  (— ${a.em}, ― ${a.bar})`);
  }
}

if (!apply) {
  console.log(`\nℹ️  스캔만 완료 (DB 변경 없음). 실제 변환하려면: node scripts/normalize-dashes.mjs --apply`);
  process.exit(0);
}

if (affected.length === 0) {
  console.log(`\n✅ 변환할 줄표가 없습니다.`);
  process.exit(0);
}

// ── 적용 모드 ──
// 1) 원본 백업 (id/title/content 그대로) — 되돌리기용
const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `scripts/.dash-backup-${ts}.json`;
writeFileSync(
  backupPath,
  JSON.stringify(affected.map((a) => ({ id: a.id, title: a.title_raw, content_markdown: a.content_raw })), null, 2),
  "utf8",
);
console.log(`\n💾 원본 백업 저장: ${backupPath}`);

// 2) 변환 후 UPDATE
let updated = 0, failed = 0;
for (const a of affected) {
  const newTitle = normalize(a.title_raw);
  const newContent = normalize(a.content_raw);
  const { error: uErr } = await supabase
    .from("design_docs")
    .update({ title: newTitle, content_markdown: newContent })
    .eq("id", a.id);
  if (uErr) { failed++; console.error(`   ❌ ${a.title}: ${uErr.message}`); }
  else updated++;
}

console.log(`\n🎉 변환 완료 — 성공 ${updated}개${failed ? `, 실패 ${failed}개` : ""}`);
console.log(`   되돌리려면 백업 파일(${backupPath})의 내용으로 복원하세요.`);
