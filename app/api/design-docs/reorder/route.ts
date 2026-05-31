// 기획서 수동 정렬 순서 저장 (드래그앤드롭)
// POST /api/design-docs/reorder { ordered_ids: string[] }
//   → 같은 카테고리 그룹의 기획서 id를 위→아래 순서대로 받아 sort_order = index 로 저장.
//   ※ 마이그레이션 014(design_docs.sort_order) 적용 필요.

import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { ordered_ids } = (await request.json()) as { ordered_ids: string[] };
    if (!Array.isArray(ordered_ids) || ordered_ids.length === 0) {
      return Response.json({ error: "ordered_ids 필수" }, { status: 400 });
    }

    // 순서대로 sort_order 부여 (작을수록 위)
    const results = await Promise.all(
      ordered_ids.map((id, index) =>
        supabase.from("design_docs").update({ sort_order: index }).eq("id", id)
      )
    );
    const failed = results.find(r => r.error);
    if (failed?.error) {
      // sort_order 컬럼이 없으면(마이그레이션 미적용) 안내
      const msg = /sort_order/i.test(failed.error.message)
        ? "sort_order 컬럼이 없어요. 마이그레이션 014를 먼저 적용해 주세요."
        : failed.error.message;
      return Response.json({ error: msg }, { status: 500 });
    }

    return Response.json({ ok: true, count: ordered_ids.length });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
