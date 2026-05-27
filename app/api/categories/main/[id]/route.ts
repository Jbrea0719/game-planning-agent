// 대카테고리 단건 PATCH / DELETE

import { supabase } from "@/lib/supabase";

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

    const { error } = await supabase
      .from("main_categories")
      .delete()
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
