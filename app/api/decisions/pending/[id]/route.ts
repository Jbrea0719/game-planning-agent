// 결정 대기 개별 조작 API
// PATCH  /api/decisions/pending/[id]  → 대기 항목 수정 (content·sub_category_id·confidence)
// DELETE /api/decisions/pending/[id]  → 대기 항목 버림 (등록하지 않고 폐기)

import { supabase } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface UpdateBody {
  content?: string;
  sub_category_id?: string | null;
  confidence?: "decided" | "review" | "tentative";
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateBody;
    const updates: Record<string, unknown> = {};
    if (body.content !== undefined) updates.content = body.content;
    if (body.sub_category_id !== undefined) updates.sub_category_id = body.sub_category_id;
    if (body.confidence !== undefined) updates.confidence = body.confidence;
    if (Object.keys(updates).length === 0) return Response.json({ ok: true });

    const { data, error } = await supabase
      .from("pending_decisions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ pending: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { error } = await supabase.from("pending_decisions").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
