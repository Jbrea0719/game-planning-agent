// 기존 기획서에서 '기획 바이블 교차 검증(결과)'·'다음 단계(TODO)' 섹션 일괄 제거
// 사용법: node scripts/strip-review-sections.mjs           → 미리보기(대상·제거량, DB 변경 없음)
//        node scripts/strip-review-sections.mjs --apply   → 백업 후 적용
// (lib/normalize-text.ts 의 stripReviewSections 와 동일 규칙)

import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
function loadEnv(p){ try{ for(const l of readFileSync(p,"utf8").split(/\r?\n/)){ const m=l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); } }catch{} }
loadEnv(".env.local");
const sb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const apply=process.argv.includes("--apply");

const RE=/교차\s*검증|다음\s*단계/;
function stripReviewSections(md){
  if(!md) return md;
  const lines=md.split("\n"); const out=[]; let skip=0, fence=false;
  for(const line of lines){
    const t=line.trimStart();
    if(t.startsWith("```")){ fence=!fence; if(skip===0) out.push(line); continue; }
    if(fence){ if(skip===0) out.push(line); continue; }
    const h=line.match(/^(#{1,6})\s+(.*)$/);
    if(h){
      const lv=h[1].length;
      if(skip>0){ if(lv<=skip) skip=0; else continue; }
      const text=h[2].replace(/[*_`~]/g,"");
      if(RE.test(text)){ skip=lv; continue; }
      out.push(line); continue;
    }
    if(skip>0) continue;
    out.push(line);
  }
  let res=out.join("\n").replace(/\n{3,}/g,"\n\n").trimEnd();
  res=res.replace(/(?:\n\s*(?:-{3,}|━{2,}|={3,}|\*{3,})\s*)+$/g,"").trimEnd();
  return res ? res+"\n" : res;
}

const {data}=await sb.from("design_docs").select("id,title,content_markdown").not("content_markdown","is",null).limit(2000);
const changed=[];
for(const d of (data??[])){
  const before=d.content_markdown||"";
  const after=stripReviewSections(before);
  // 실제 섹션이 빠진 것만 (끝 공백/줄바꿈만 다른 무의미 변경은 제외)
  if(after.trimEnd()!==before.trimEnd()) changed.push({id:d.id,title:d.title,before,after,removed:before.length-after.length});
}
console.log(`\n전체 ${(data??[]).length}개 중 변경 대상: ${changed.length}개`);
for(const c of changed.sort((a,b)=>b.removed-a.removed)) console.log(`  - ${c.title}  (-${c.removed}자)`);

if(!apply){ console.log(`\nℹ️ 미리보기만. 적용: node scripts/strip-review-sections.mjs --apply`); process.exit(0); }
if(changed.length===0){ console.log("변경할 게 없습니다."); process.exit(0); }

const ts=new Date().toISOString().replace(/[:.]/g,"-");
const bpath=`scripts/.strip-backup-${ts}.json`;
writeFileSync(bpath, JSON.stringify(changed.map(c=>({id:c.id,title:c.title,content_markdown:c.before})),null,2), "utf8");
console.log(`\n💾 원본 백업: ${bpath}`);
let ok=0,fail=0;
for(const c of changed){
  const {error}=await sb.from("design_docs").update({content_markdown:c.after}).eq("id",c.id);
  if(error){ fail++; console.error(`  ❌ ${c.title}: ${error.message}`); } else ok++;
}
console.log(`\n🎉 적용 완료 — 성공 ${ok}${fail?`, 실패 ${fail}`:""}`);
