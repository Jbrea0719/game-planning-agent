// 기획서 family 단위 이름 변경
// PATCH /api/design-docs/family/rename { family_id, title }
// 같은 family에 속한 모든 버전의 title을 일괄 변경

import { supabase } from "@/lib/supabase";

export async function PATCH(request: Request) {
  try {
    const { family_id, title } = (await request.json()) as {
      family_id: string;
      title: string;
    };

    if (!family_id) return Response.json({ error: "family_id 필수" }, { status: 400 });
    if (!title || !title.trim()) {
      return Response.json({ error: "title 필수" }, { status: 400 });
    }

    const clean = title.trim().slice(0, 80);

    const { error, count } = await supabase
      .from("design_docs")
      .update({ title: clean }, { count: "exact" })
      .eq("doc_family_id", family_id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, updated: count ?? 0, title: clean });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
