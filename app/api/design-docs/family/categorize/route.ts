// 기획서 family 단위 카테고리 변경 (인게임 > 영웅 같은 분류 적용)
// PATCH /api/design-docs/family/categorize
//   { family_id, main_id?: string|null, area_code?: string|null }

import { supabase } from "@/lib/supabase";

export async function PATCH(request: Request) {
  try {
    const { family_id, main_id, area_code } = (await request.json()) as {
      family_id: string;
      main_id?: string | null;
      area_code?: string | null;
    };

    if (!family_id) return Response.json({ error: "family_id 필수" }, { status: 400 });

    const { error, count } = await supabase
      .from("design_docs")
      .update(
        {
          category_main_id: main_id ?? null,
          category_area_code: area_code ?? null,
        },
        { count: "exact" }
      )
      .eq("doc_family_id", family_id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true, updated: count ?? 0 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
