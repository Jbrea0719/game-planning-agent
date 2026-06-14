// 기획서 단건 조회·편집·삭제
// GET    /api/design-docs/[id]  → 본문 포함 단건 조회
// PATCH  /api/design-docs/[id]  → 수동 편집 (title·content_markdown·status)
// DELETE /api/design-docs/[id]  → 삭제

import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { data, error } = await supabase
      .from("design_docs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!data) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ doc: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

interface UpdateBody {
  title?: string;
  content_markdown?: string;
  status?: "draft" | "final" | "archived";
  changes_summary?: string;
  nickname?: string;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateBody;

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.content_markdown !== undefined) updates.content_markdown = body.content_markdown;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "archived") {
        updates.archived_at = new Date().toISOString();
      }
    }
    if (body.changes_summary !== undefined) updates.changes_summary = body.changes_summary;

    const { data, error } = await supabase
      .from("design_docs")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[design-docs/id] 편집 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // 변경 히스토리 기록 (실패해도 무시)
    await logActivity({
      scope: "doc",
      action: "update",
      entity: "doc",
      title: (data?.title as string | undefined) ?? id,
      detail: "직접 편집",
      target_id: id,
      nickname: body.nickname,
    });

    return Response.json({ doc: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // 삭제 전 제목을 미리 읽어 히스토리 제목으로 사용
    const { data: existing } = await supabase
      .from("design_docs")
      .select("title")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase.from("design_docs").delete().eq("id", id);
    if (error) {
      console.error("[design-docs/id] 삭제 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // 변경 히스토리 기록 (실패해도 무시)
    await logActivity({
      scope: "doc",
      action: "delete",
      entity: "doc",
      title: (existing?.title as string | undefined) ?? id,
      target_id: id,
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
