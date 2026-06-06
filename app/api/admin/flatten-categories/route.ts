// 일회성 — 지정 대분류를 대>중>소 에서 대>소(=중 이름)로 평탄화 (사용 후 제거)
// 각 중(area)에서 대표 소 1개만 남겨 중 이름으로 바꾸고, 나머지 세부 소는 삭제.
// 삭제 전, 그 세부에 붙은 기획서·결정사항은 대표 소로 이동(유실 방지).
// POST {} → 요약

import { supabase } from "@/lib/supabase";

const TARGET_MAINS = ["g_base", "g_growth", "g_system", "g_content"];

export async function POST() {
  try {
    const summary: Array<{ main: string; areas: number; kept: number; deleted: number; movedDocs: number; movedDecisions: number }> = [];

    for (const mainId of TARGET_MAINS) {
      const { data: subs } = await supabase
        .from("sub_categories")
        .select("id, name_ko, area_code, area_name, display_order")
        .eq("main_category_id", mainId)
        .eq("is_active", true)
        .order("display_order", { ascending: true });

      const rows = subs ?? [];
      // 중(area_code) 기준 그룹핑 — 순서 보존
      const groups = new Map<string, typeof rows>();
      for (const s of rows) {
        const code = s.area_code ?? "_none";
        if (!groups.has(code)) groups.set(code, []);
        groups.get(code)!.push(s);
      }

      let kept = 0, deleted = 0, movedDocs = 0, movedDecisions = 0;
      for (const [, group] of groups) {
        if (group.length === 0) continue;
        const keeper = group[0];
        const areaName = keeper.area_name ?? keeper.name_ko;
        // 대표 소: 중 이름으로 바꾸고 평면화
        await supabase.from("sub_categories")
          .update({ name_ko: areaName, area_code: null, area_name: null })
          .eq("id", keeper.id);
        kept += 1;

        for (const other of group.slice(1)) {
          // 기획서 이동
          const { data: movedD } = await supabase.from("design_docs")
            .update({ category_sub_id: keeper.id, category_area_code: null })
            .eq("category_sub_id", other.id).select("id");
          movedDocs += (movedD ?? []).length;
          // 결정사항(바이블) 이동
          const { data: movedX } = await supabase.from("decisions")
            .update({ sub_category_id: keeper.id })
            .eq("sub_category_id", other.id).select("id");
          movedDecisions += (movedX ?? []).length;
          // 세부 소 삭제
          await supabase.from("sub_categories").delete().eq("id", other.id);
          deleted += 1;
        }
      }

      // 이 대분류의 모든 기획서 area 필드 정리 (평면이므로 null)
      await supabase.from("design_docs").update({ category_area_code: null }).eq("category_main_id", mainId);

      summary.push({ main: mainId, areas: groups.size, kept, deleted, movedDocs, movedDecisions });
    }

    return Response.json({ ok: true, summary });
  } catch (err) {
    console.error("[flatten-categories] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
