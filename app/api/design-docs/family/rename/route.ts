// 기획서 이름 변경 (버전 개념 제거 후엔 단일 doc 업데이트)
// PATCH /api/design-docs/family/rename { family_id, title }
//   family_id는 호환성을 위해 유지하지만 실제로는 doc_id로 사용

import { supabase } from "@/lib/supabase";

export async function PATCH(request: Request) {
  try {
    const { family_id, title } = (await request.json()) as {
      family_id: string;
      title: string;
    };
    if (!family_id) return Response.json({ error: "doc_id 필수" }, { status: 400 });
    if (!title || !title.trim()) return Response.json({ error: "title 필수" }, { status: 400 });

    const clean = title.trim().slice(0, 80);
    const { error } = await supabase
      .from("design_docs")
      .update({ title: clean })
      .eq("id", family_id);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true, title: clean });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
