// 카테고리·결정 원본 백업 (되돌리기용) — 구조 변경/재분류 전에 실행
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
function loadEnv(p){ try{ for(const l of readFileSync(p,"utf8").split(/\r?\n/)){ const m=l.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&process.env[m[1]]===undefined) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); } }catch{} }
loadEnv(".env.local");
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const stamp = process.argv[2] || "manual";

const [{data:mains},{data:subs},{data:decs}] = await Promise.all([
  sb.from("main_categories").select("*"),
  sb.from("sub_categories").select("*"),
  sb.from("decisions").select("id, sub_category_id, content, confidence"),
]);
const path = `scripts/.bible-backup-${stamp}.json`;
writeFileSync(path, JSON.stringify({ at: stamp, main_categories: mains, sub_categories: subs, decisions: decs }, null, 2), "utf8");
console.log(`💾 백업: ${path} (대 ${mains?.length} / 소 ${subs?.length} / 결정 ${decs?.length})`);
