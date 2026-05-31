// 대본 단건 조회·수정·삭제
// GET    /api/scripts/[id]  → 본문 포함 단건 조회
// PATCH  /api/scripts/[id]  → 수정 (title·content·status)
// DELETE /api/scripts/[id]  → 삭제

import { supabase } from "@/lib/supabase";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { data, error } = await supabase
      .from("scripts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ script: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

interface UpdateBody {
  title?: string;
  content?: string;
  status?: "draft" | "final" | "archived";
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateBody;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.status !== undefined) updates.status = body.status;

    const { data, error } = await supabase
      .from("scripts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[scripts/id] 수정 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ script: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { error } = await supabase.from("scripts").delete().eq("id", id);
    if (error) {
      console.error("[scripts/id] 삭제 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
