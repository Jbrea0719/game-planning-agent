// 중카테고리(area) 일괄 작업
// PATCH: 영역 이름 일괄 변경 (같은 main_id + area_code의 모든 sub_categories.area_name 갱신)
// DELETE: 영역 자체 제거 — 같은 main_id + area_code의 sub들을 area_code/area_name 비움
//          (소카테고리는 유지되고 단지 영역에서만 떨어져 나옴)
// POST는 별도 없음 — 첫 sub 추가 시 area_code/area_name 같이 넣으면 자동 생성

import { supabase } from "@/lib/supabase";

export async function PATCH(request: Request) {
  try {
    const { main_id, area_code, new_name } = (await request.json()) as {
      main_id: string;
      area_code: string;
      new_name: string;
    };
    if (!main_id || !area_code || !new_name?.trim()) {
      return Response.json({ error: "main_id, area_code, new_name 모두 필수" }, { status: 400 });
    }

    const { count, error } = await supabase
      .from("sub_categories")
      .update({ area_name: new_name.trim() }, { count: "exact" })
      .eq("main_category_id", main_id)
      .eq("area_code", area_code);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, updated: count ?? 0 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { main_id, area_code, hard } = (await request.json()) as {
      main_id: string;
      area_code: string;
      hard?: boolean;   // true면 해당 영역의 sub들 전부 삭제
    };
    if (!main_id || !area_code) {
      return Response.json({ error: "main_id, area_code 필수" }, { status: 400 });
    }

    if (hard) {
      // 영역의 모든 sub_categories 삭제 (참조 detach 후)
      const { data: subs } = await supabase
        .from("sub_categories")
        .select("id")
        .eq("main_category_id", main_id)
        .eq("area_code", area_code);
      const subIds = (subs ?? []).map(s => s.id);
      if (subIds.length > 0) {
        await supabase.from("decisions").update({ sub_category_id: null }).in("sub_category_id", subIds);
        await supabase.from("design_docs").update({ category_sub_id: null }).in("category_sub_id", subIds);
        await supabase.from("sub_categories").delete().in("id", subIds);
      }
      // design_docs.category_area_code도 비우기
      await supabase
        .from("design_docs")
        .update({ category_area_code: null })
        .eq("category_main_id", main_id)
        .eq("category_area_code", area_code);
      return Response.json({ ok: true, deleted: subIds.length });
    } else {
      // soft — sub들의 area만 비움
      const { count } = await supabase
        .from("sub_categories")
        .update({ area_code: null, area_name: null }, { count: "exact" })
        .eq("main_category_id", main_id)
        .eq("area_code", area_code);
      // design_docs도 area_code 비움
      await supabase
        .from("design_docs")
        .update({ category_area_code: null })
        .eq("category_main_id", main_id)
        .eq("category_area_code", area_code);
      return Response.json({ ok: true, detached: count ?? 0 });
    }
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
