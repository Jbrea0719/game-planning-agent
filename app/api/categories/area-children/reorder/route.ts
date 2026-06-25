// 중(area) 하위 자식 통합 정렬 — 소(sub)와 단일 기획서(doc)를 한 순서로 저장.
// POST { items: [{ type: "sub" | "doc", id }] }
//   받은 순서대로 index 부여: sub → sub_categories.display_order, doc → design_docs.sort_order
//   (둘을 같은 index 공간에 써서 렌더 시 섞어 정렬할 수 있게 함. 다른 화면의 상대순서도 보존됨)

import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { items } = (await request.json()) as { items?: { type: "sub" | "doc"; id: string }[] };
    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: "items 필수" }, { status: 400 });
    }
    const results = await Promise.all(
      items.map((it, index) =>
        it.type === "sub"
          ? supabase.from("sub_categories").update({ display_order: index }).eq("id", it.id)
          : supabase.from("design_docs").update({ sort_order: index }).eq("id", it.id)
      )
    );
    const failed = results.find(r => r.error);
    if (failed?.error) return Response.json({ error: failed.error.message }, { status: 500 });
    return Response.json({ ok: true, count: items.length });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
