// 기획서 카테고리 변경 (버전 개념 제거 후엔 단일 doc 업데이트)
// PATCH /api/design-docs/family/categorize
//   { family_id, main_id?, area_code?, sub_id? }
//   family_id는 호환성을 위해 유지하지만 실제로는 doc_id로 사용

import { supabase } from "@/lib/supabase";

export async function PATCH(request: Request) {
  try {
    const { family_id, main_id, area_code, sub_id } = (await request.json()) as {
      family_id: string;
      main_id?: string | null;
      area_code?: string | null;
      sub_id?: string | null;
    };
    if (!family_id) return Response.json({ error: "doc_id 필수" }, { status: 400 });

    const { error } = await supabase
      .from("design_docs")
      .update({
        category_main_id: main_id ?? null,
        category_area_code: area_code ?? null,
        category_sub_id: sub_id ?? null,
      })
      .eq("id", family_id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
