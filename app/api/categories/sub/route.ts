// 소카테고리(sub_categories) 신규 생성
// area_code/area_name이 있으면 그 영역(중카테고리) 아래로 들어감

import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { id, main_category_id, area_code, area_name, name_ko } = (await request.json()) as {
      id?: string;
      main_category_id: string;
      area_code?: string | null;
      area_name?: string | null;
      name_ko: string;
    };

    if (!main_category_id) return Response.json({ error: "main_category_id 필수" }, { status: 400 });
    if (!name_ko || !name_ko.trim()) return Response.json({ error: "name_ko 필수" }, { status: 400 });

    const safeId = (id?.trim() || `${main_category_id}.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`)
      .toLowerCase()
      .replace(/[^a-z0-9_.]/g, "_");

    // 같은 main 안에서 마지막 display_order + 1
    const { data: maxRow } = await supabase
      .from("sub_categories")
      .select("display_order")
      .eq("main_category_id", main_category_id)
      .order("display_order", { ascending: false })
      .limit(1);
    const nextOrder = ((maxRow?.[0]?.display_order as number | undefined) ?? 0) + 1;

    const { data, error } = await supabase
      .from("sub_categories")
      .insert({
        id: safeId,
        main_category_id,
        area_code: area_code ?? null,
        area_name: area_name ?? null,
        name_ko: name_ko.trim(),
        display_order: nextOrder,
        is_active: true,
      })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ sub: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
