// Supabase 마이그레이션 실행기 — 자리비움/자동 진행 시 SQL을 직접 적용하기 위한 도구
//
// 사용법:
//   node scripts/run-migration.mjs supabase/migrations/017_*.sql supabase/migrations/018_*.sql
//   (인자로 준 .sql 파일들을 순서대로 Supabase Management API로 실행)
//
// 필요한 환경변수 (.env.local 에 저장 — 깃에 올라가지 않음):
//   SUPABASE_ACCESS_TOKEN = Supabase 계정 Personal Access Token (Account → Access Tokens)
//   NEXT_PUBLIC_SUPABASE_URL = 프로젝트 URL (여기서 project ref 자동 추출)
//   (선택) SUPABASE_PROJECT_REF = ref 직접 지정 시
//
// 안전장치:
//   - 인자로 명시한 파일만 실행 (전체 자동 실행 안 함).
//   - 마이그레이션은 'if not exists' 류라 재실행해도 안전(멱등).
//   - 토큰은 이 스크립트가 런타임에 .env.local에서 읽음 (코드/로그에 노출 안 함).

import { readFileSync, readdirSync } from "node:fs";

// .env.local 로드 (Next 규약 — node 단독 실행 시 자동 로드 안 되므로 직접 파싱)
function loadEnvLocal() {
  try {
    const txt = readFileSync(".env.local", "utf8");
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* .env.local 없으면 무시 */ }
}
loadEnvLocal();

const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ref = process.env.SUPABASE_PROJECT_REF || (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1]);

if (!token) {
  console.error("❌ SUPABASE_ACCESS_TOKEN 없음 — .env.local 에 추가하세요 (Supabase Account → Access Tokens).");
  process.exit(1);
}
if (!ref) {
  console.error("❌ 프로젝트 ref를 못 찾음 — NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_PROJECT_REF 확인.");
  process.exit(1);
}

let files = process.argv.slice(2);
if (files.length === 0) {
  console.error("사용법: node scripts/run-migration.mjs <sql파일> [추가...]");
  console.error("예: node scripts/run-migration.mjs supabase/migrations/017_sub_category_icon.sql");
  // 참고용: 사용 가능한 마이그레이션 목록 출력
  try {
    const list = readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort();
    console.error("\n[supabase/migrations 목록]\n" + list.map(f => "  - supabase/migrations/" + f).join("\n"));
  } catch { /* 무시 */ }
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${ref}/database/query`;

for (const f of files) {
  let sql;
  try { sql = readFileSync(f, "utf8"); }
  catch { console.error(`❌ 파일 읽기 실패: ${f}`); process.exit(1); }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`❌ ${f} 실패 (${res.status}): ${body.slice(0, 500)}`);
    process.exit(1);
  }
  console.log(`✅ ${f} 적용 완료`);
}
console.log(`\n🎉 전체 완료 (project: ${ref})`);
