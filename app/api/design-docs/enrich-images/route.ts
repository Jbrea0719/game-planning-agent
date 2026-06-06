// 기획서 자동 이미지 — 최종 적용 (백업 후 본문에 삽입·저장)
// POST { doc_id, items: DocImageItem[], nickname? }
//   1) 원본 백업 (7일 보관)
//   2) 기존 자동 이미지(마커) 제거 → 깨끗한 본문
//   3) 승인된 항목들을 각 헤딩 아래 삽입
//   4) content_markdown 저장 → { success, content_markdown }

import { supabase } from "@/lib/supabase";
import { createBackup } from "@/lib/doc-backup";
import { stripJordanImages, insertImages, type DocImageItem } from "@/lib/doc-images";

export async function POST(request: Request) {
  try {
    const { doc_id, items, nickname } = (await request.json()) as {
      doc_id: string;
      items: DocImageItem[];
      nickname?: string;
    };
    if (!doc_id) return Response.json({ error: "doc_id 필요" }, { status: 400 });

    const { data: doc, error: loadErr } = await supabase
      .from("design_docs")
      .select("id, project_id, title, content_markdown")
      .eq("id", doc_id)
      .maybeSingle();
    if (loadErr || !doc) return Response.json({ error: "기획서 없음" }, { status: 404 });

    // 수정 전 백업
    await createBackup({
      doc_id: doc.id,
      project_id: doc.project_id,
      title: doc.title,
      content_markdown: doc.content_markdown,
      reason: "이미지 자동 삽입 직전",
      nickname,
    });

    // 기존 자동 이미지 걷어내고 → 승인된 항목 삽입
    const clean = stripJordanImages(doc.content_markdown);
    const next = (items && items.length > 0) ? insertImages(clean, items) : clean;

    const { error: updErr } = await supabase
      .from("design_docs")
      .update({
        content_markdown: next,
        changes_summary: `이미지 자동 삽입 (${items?.length ?? 0}개)`,
        created_by_nickname: nickname ?? null,
      })
      .eq("id", doc_id);
    if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

    return Response.json({ success: true, content_markdown: next });
  } catch (error) {
    console.error("[enrich-images] 오류:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
