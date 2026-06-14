// 소카테고리 단건 PATCH / DELETE

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
      area_code?: string | null;
      area_name?: string | null;
      icon?: string | null;
    };
    const updates: Record<string, unknown> = {};
    if (body.name_ko !== undefined) updates.name_ko = body.name_ko.trim();
    if (body.area_code !== undefined) updates.area_code = body.area_code;
    if (body.area_name !== undefined) updates.area_name = body.area_name;
    if (body.icon !== undefined) updates.icon = body.icon;

    const { data, error } = await supabase
      .from("sub_categories")
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
      detail: "소카테고리",
      target_id: id,
    });

    return Response.json({ sub: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    // 삭제 전 이름을 미리 읽어 히스토리 제목으로 사용
    const { data: existingSub } = await supabase
      .from("sub_categories")
      .select("name_ko")
      .eq("id", id)
      .maybeSingle();
    // 참조: decisions.sub_category_id, design_docs.category_sub_id
    // 둘 다 ON DELETE SET NULL이거나 미정의면 무사히 삭제. 안전을 위해 미리 detach.
    // detach되며 미분류로 떨어진 결정사항 id를 수집 → 프론트에서 AI 재분류 검토에 사용
    const { data: orphaned } = await supabase
      .from("decisions")
      .update({ sub_category_id: null })
      .eq("sub_category_id", id)
      .select("id");
    // 기획서도 detach하면서 미분류된 id 수집 → 프론트에서 기획서 AI 재분류 검토에 사용
    const { data: orphanedDocs } = await supabase
      .from("design_docs")
      .update({ category_sub_id: null })
      .eq("category_sub_id", id)
      .select("id");

    const { error } = await supabase
      .from("sub_categories")
      .delete()
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // 변경 히스토리 기록 (실패해도 무시)
    await logActivity({
      scope: "jordan",
      action: "delete",
      entity: "category",
      title: (existingSub?.name_ko as string | undefined) ?? id,
      detail: "소카테고리",
      target_id: id,
    });

    return Response.json({
      ok: true,
      orphaned_decision_ids: ((orphaned ?? []) as Array<{ id: string }>).map(d => d.id),
      orphaned_doc_ids: ((orphanedDocs ?? []) as Array<{ id: string }>).map(d => d.id),
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
