// 대카테고리(main_categories) CRUD
// POST: 신규 생성

import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

export async function POST(request: Request) {
  try {
    const { id, name_ko, icon, description } = (await request.json()) as {
      id?: string;
      name_ko: string;
      icon?: string;
      description?: string;
    };

    if (!name_ko || !name_ko.trim()) {
      return Response.json({ error: "name_ko 필수" }, { status: 400 });
    }

    // id가 없으면 자동 생성 (간단한 영문 슬러그 + 랜덤)
    const safeId = (id?.trim() || `main_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_");

    // 마지막 display_order + 1
    const { data: maxRow } = await supabase
      .from("main_categories")
      .select("display_order")
      .order("display_order", { ascending: false })
      .limit(1);
    const nextOrder = ((maxRow?.[0]?.display_order as number | undefined) ?? 0) + 1;

    const { data, error } = await supabase
      .from("main_categories")
      .insert({
        id: safeId,
        name_ko: name_ko.trim(),
        icon: icon ?? null,
        description: description ?? null,
        display_order: nextOrder,
        is_active: true,
      })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // 변경 히스토리 기록 (실패해도 무시)
    await logActivity({
      scope: "jordan",
      action: "create",
      entity: "category",
      title: name_ko.trim(),
      detail: "대카테고리",
      target_id: safeId,
    });

    return Response.json({ main: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
