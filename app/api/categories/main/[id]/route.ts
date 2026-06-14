// 대카테고리 단건 PATCH / DELETE

import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      name_ko?: string;
      icon?: string | null;
      description?: string | null;
    };
    const updates: Record<string, unknown> = {};
    if (body.name_ko !== undefined) updates.name_ko = body.name_ko.trim();
    if (body.icon !== undefined) updates.icon = body.icon;
    if (body.description !== undefined) updates.description = body.description;

    const { data, error } = await supabase
      .from("main_categories")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // 변경 히스토리 기록 (실패해도 무시)
    await logActivity({
      scope: "jordan",
      action: "update",
      entity: "category",
      title: (data?.name_ko as string | undefined) ?? id,
      detail: "대카테고리",
      target_id: id,
    });

    return Response.json({ main: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // 하위 sub_categories 존재 시 차단
    const { count } = await supabase
      .from("sub_categories")
      .select("id", { count: "exact", head: true })
      .eq("main_category_id", id);

    if ((count ?? 0) > 0) {
      return Response.json(
        { error: `하위 소카테고리 ${count}개가 있어 삭제할 수 없어요. 먼저 모두 삭제하세요.` },
        { status: 400 }
      );
    }

    // 삭제 전 이름을 미리 읽어 히스토리 제목으로 사용
    const { data: existing } = await supabase
      .from("main_categories")
      .select("name_ko")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase
      .from("main_categories")
      .delete()
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // 변경 히스토리 기록 (실패해도 무시)
    await logActivity({
      scope: "jordan",
      action: "delete",
      entity: "category",
      title: (existing?.name_ko as string | undefined) ?? id,
      detail: "대카테고리",
      target_id: id,
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
