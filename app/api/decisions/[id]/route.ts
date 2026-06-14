// 결정사항 개별 조작 API
// GET    /api/decisions/[id]  → 단건 조회
// PATCH  /api/decisions/[id]  → 편집 (content·sub_category_id·confidence 등)
// DELETE /api/decisions/[id]  → 삭제

import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─── GET: 단건 조회 ─────────────────────────────────────────────────
export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { data, error } = await supabase
      .from("decisions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[decisions/id] 조회 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ decision: data });
  } catch (err) {
    console.error("[decisions/id] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ─── PATCH: 편집 ───────────────────────────────────────────────────
interface UpdateBody {
  content?: string;
  context?: string | null;
  sub_category_id?: string | null;
  confidence?: "decided" | "review" | "tentative";
  nickname?: string;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateBody;

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.content !== undefined) updates.content = body.content;
    if (body.context !== undefined) updates.context = body.context;
    if (body.sub_category_id !== undefined) updates.sub_category_id = body.sub_category_id;
    if (body.confidence !== undefined) updates.confidence = body.confidence;
    if (body.nickname !== undefined) updates.updated_by_nickname = body.nickname;

    const { data, error } = await supabase
      .from("decisions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[decisions/id] 편집 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // 변경 히스토리 기록 (실패해도 무시)
    await logActivity({
      scope: "jordan",
      action: "update",
      entity: "decision",
      title: (body.content ?? (data?.content as string | undefined) ?? id).slice(0, 80),
      target_id: id,
      nickname: body.nickname,
    });

    return Response.json({ decision: data });
  } catch (err) {
    console.error("[decisions/id] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ─── DELETE: 삭제 ───────────────────────────────────────────────────
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    // 삭제 전 content를 미리 읽어 히스토리 제목으로 사용
    const { data: existing } = await supabase
      .from("decisions")
      .select("content")
      .eq("id", id)
      .maybeSingle();

    const { error } = await supabase.from("decisions").delete().eq("id", id);

    if (error) {
      console.error("[decisions/id] 삭제 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // 변경 히스토리 기록 (실패해도 무시)
    await logActivity({
      scope: "jordan",
      action: "delete",
      entity: "decision",
      title: ((existing?.content as string | undefined) ?? id).slice(0, 80),
      target_id: id,
    });

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[decisions/id] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
