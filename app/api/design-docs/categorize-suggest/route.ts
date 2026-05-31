// 기획서 카테고리 AI 제안
// POST /api/design-docs/categorize-suggest { doc_id }
//   → 해당 기획서 제목·내용을 읽고 AI(Haiku)가 적합한 대/중/소 카테고리를 제안.
//   ※ 제안만 반환 — DB 적용은 사용자가 검토 후 /api/design-docs/family/categorize 로 진행.

import { supabase } from "@/lib/supabase";
import { suggestDocumentCategory } from "@/lib/document-categorizer";

export async function POST(request: Request) {
  try {
    const { doc_id } = (await request.json()) as { doc_id: string };
    if (!doc_id) return Response.json({ error: "doc_id 필수" }, { status: 400 });

    // 기획서 제목 + 내용 조회
    const { data: doc, error } = await supabase
      .from("design_docs")
      .select("title, content_markdown")
      .eq("id", doc_id)
      .single();

    if (error || !doc) {
      return Response.json({ error: error?.message ?? "기획서를 찾을 수 없음" }, { status: 404 });
    }

    const suggestion = await suggestDocumentCategory(doc.title ?? "", doc.content_markdown ?? "");
    return Response.json({ suggestion });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
