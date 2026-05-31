// 기획서 AI 재분류 — 미리보기(제안) / 적용
// POST { action: "preview", doc_ids }      → 각 기획서에 대한 카테고리 제안 목록
// POST { action: "apply", assignments }     → 확정된 분류를 DB에 반영
//
// 결정사항 재분류(/api/decisions/reclassify)와 같은 원칙: AI는 제안만, 적용은 사용자가.
// 소카테고리 삭제로 미분류(category_sub_id=null)가 된 기획서를 검토 모달에서 재배치할 때 사용.

import { supabase } from "@/lib/supabase";
import { suggestDocumentCategory } from "@/lib/document-categorizer";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action: "preview" | "apply";
      doc_ids?: string[];
      assignments?: Array<{ id: string; main_id: string | null; area_code: string | null; sub_id: string | null }>;
    };

    if (body.action === "preview") {
      const ids = body.doc_ids ?? [];
      if (ids.length === 0) return Response.json({ proposals: [] });

      const { data: docs, error } = await supabase
        .from("design_docs")
        .select("id, title, content_markdown")
        .in("id", ids);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      const proposals = await Promise.all(
        (docs ?? []).map(async d => {
          const s = await suggestDocumentCategory(d.title ?? "", d.content_markdown ?? "");
          return {
            id: d.id,
            title: d.title,
            proposed_main_id: s.main_id,
            proposed_area_code: s.area_code,
            proposed_sub_id: s.sub_id,
            proposed_label: s.label,
            reasoning: s.reasoning,
          };
        })
      );
      return Response.json({ proposals });
    }

    if (body.action === "apply") {
      const assignments = body.assignments ?? [];
      for (const a of assignments) {
        await supabase
          .from("design_docs")
          .update({
            category_main_id: a.main_id ?? null,
            category_area_code: a.area_code ?? null,
            category_sub_id: a.sub_id ?? null,
          })
          .eq("id", a.id);
      }
      return Response.json({ ok: true, applied: assignments.length });
    }

    return Response.json({ error: "알 수 없는 action" }, { status: 400 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
