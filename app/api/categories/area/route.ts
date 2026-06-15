// 중카테고리(area) — 1급 객체(areas 테이블) CRUD
// POST   { main_id, name }                 → 빈 중 생성(소 없이도 OK)
// PATCH  { main_id, area_code, new_name }   → 이름 변경(areas.name + 하위 소의 area_name 동기화)
// DELETE { main_id, area_code, hard? }      → 중 제거(areas 행 삭제 + 소/기획서 detach)

import { supabase } from "@/lib/supabase";

// 이름 → area_code 슬러그 (CategoryManager 와 동일 규칙)
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9가-힣]/g, "_").slice(0, 30) || `area_${Date.now()}`;
}

export async function POST(request: Request) {
  try {
    const { main_id, name } = (await request.json()) as { main_id: string; name: string };
    if (!main_id || !name?.trim()) {
      return Response.json({ error: "main_id, name 필수" }, { status: 400 });
    }
    const baseCode = slugify(name.trim());

    // code 충돌 회피 — 같은 대 안에서 유니크하게
    const { data: existing } = await supabase
      .from("areas")
      .select("code")
      .eq("main_category_id", main_id);
    const taken = new Set((existing ?? []).map(r => r.code as string));
    let code = baseCode;
    let n = 2;
    while (taken.has(code)) { code = `${baseCode}_${n++}`; }

    // display_order = 끝
    const { data: maxRow } = await supabase
      .from("areas")
      .select("display_order")
      .eq("main_category_id", main_id)
      .order("display_order", { ascending: false })
      .limit(1);
    const nextOrder = ((maxRow?.[0]?.display_order as number | undefined) ?? -1) + 1;

    const { data, error } = await supabase
      .from("areas")
      .insert({
        id: `${main_id}:${code}`,
        main_category_id: main_id,
        code,
        name: name.trim(),
        display_order: nextOrder,
        is_active: true,
      })
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, area: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

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
    const name = new_name.trim();

    // 1급 테이블 이름 변경
    await supabase
      .from("areas")
      .update({ name })
      .eq("main_category_id", main_id)
      .eq("code", area_code);

    // 호환: 하위 소의 area_name 도 동기화(테이블 폴백 경로 대비)
    const { count } = await supabase
      .from("sub_categories")
      .update({ area_name: name }, { count: "exact" })
      .eq("main_category_id", main_id)
      .eq("area_code", area_code);

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
      // 1급 테이블에서 중 제거
      await supabase.from("areas").delete().eq("main_category_id", main_id).eq("code", area_code);
      return Response.json({ ok: true, deleted: subIds.length });
    } else {
      // soft — sub들의 area만 비움(소는 대 직속으로) + 기획서도 중에서 떼어 대 직속으로
      const { count } = await supabase
        .from("sub_categories")
        .update({ area_code: null, area_name: null }, { count: "exact" })
        .eq("main_category_id", main_id)
        .eq("area_code", area_code);
      await supabase
        .from("design_docs")
        .update({ category_area_code: null })
        .eq("category_main_id", main_id)
        .eq("category_area_code", area_code);
      // 1급 테이블에서 중 제거(빈 중도 사라지도록)
      await supabase.from("areas").delete().eq("main_category_id", main_id).eq("code", area_code);
      return Response.json({ ok: true, detached: count ?? 0 });
    }
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
