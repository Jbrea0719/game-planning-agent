// 카테고리 순서 저장 (드래그앤드롭)
// POST /api/categories/reorder { type: "main" | "sub" | "area", ordered_ids: string[] }
//   → 받은 id 순서대로 display_order = index 로 저장 (작을수록 위).
//   main_categories / sub_categories / areas 모두 display_order 컬럼이 있어 마이그레이션 불필요.
//   area 의 id 는 `${main_id}:${code}`.

import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { type, ordered_ids } = (await request.json()) as {
      type: "main" | "sub" | "area";
      ordered_ids: string[];
    };
    if (!["main", "sub", "area"].includes(type) || !Array.isArray(ordered_ids) || ordered_ids.length === 0) {
      return Response.json({ error: "type(main|sub|area)·ordered_ids 필수" }, { status: 400 });
    }

    const table = type === "main" ? "main_categories" : type === "area" ? "areas" : "sub_categories";
    const results = await Promise.all(
      ordered_ids.map((id, index) =>
        supabase.from(table).update({ display_order: index }).eq("id", id)
      )
    );
    const failed = results.find(r => r.error);
    if (failed?.error) return Response.json({ error: failed.error.message }, { status: 500 });

    return Response.json({ ok: true, count: ordered_ids.length });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
