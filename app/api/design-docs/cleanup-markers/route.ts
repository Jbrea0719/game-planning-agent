// 일회성 정리 — 기존 기획서 본문에 남은 <!--J_IMG--> 마커 글자 제거 (다이어그램/이미지 내용은 유지)
// POST → { fixed: 정리된 기획서 수 }
// (사용 후 제거 예정)

import { supabase } from "@/lib/supabase";
import { removeMarkers } from "@/lib/doc-images";

export async function POST() {
  const { data, error } = await supabase.from("design_docs").select("id, content_markdown");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let fixed = 0;
  for (const d of data ?? []) {
    const md = d.content_markdown;
    if (typeof md !== "string" || !md.includes("J_IMG")) continue;
    const cleaned = removeMarkers(md);
    if (cleaned !== md) {
      await supabase.from("design_docs").update({ content_markdown: cleaned }).eq("id", d.id);
      fixed++;
    }
  }
  return Response.json({ fixed });
}
