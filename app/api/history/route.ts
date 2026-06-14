// 변경 히스토리 조회·수정·삭제 API
// GET    /api/history?scope=jordan|doc  → { entries: [...] } (최신순, 최대 300건)
// PATCH  /api/history { id, title?, detail? } → { ok: true }
// DELETE /api/history { id }  또는  { scope } → { ok: true }
//
// 회복력: activity_log 테이블이 아직 없어도 500을 내지 않고 빈 목록을 반환한다.

import { supabase } from "@/lib/supabase";

// 테이블 미존재(relation 없음) 에러인지 판별
function isMissingTable(msg: string | undefined): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes("activity_log") || m.includes("relation") || m.includes("does not exist");
}

// ─── GET: 히스토리 목록 ────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope"); // 'jordan' | 'doc' | null(둘 다)

    let query = supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);

    if (scope === "jordan" || scope === "doc") {
      query = query.eq("scope", scope);
    }

    const { data, error } = await query;

    if (error) {
      // 테이블이 아직 없으면 빈 목록으로 (마이그레이션 미적용 환경 대비)
      if (isMissingTable(error.message)) {
        return Response.json({ entries: [] });
      }
      console.error("[history] 조회 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ entries: data ?? [] });
  } catch (err) {
    console.error("[history] 오류:", err);
    // 예외도 빈 목록으로 — 히스토리는 부가 기능이라 화면을 막지 않음
    return Response.json({ entries: [] });
  }
}

// ─── PATCH: 히스토리 항목 텍스트 수정 ──────────────────────────────
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; title?: string; detail?: string };
    if (!body.id) return Response.json({ error: "id 필수" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.detail !== undefined) updates.detail = body.detail;
    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "수정할 내용이 없어요" }, { status: 400 });
    }

    const { error } = await supabase.from("activity_log").update(updates).eq("id", body.id);
    if (error) {
      console.error("[history] 수정 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[history] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ─── DELETE: 히스토리 항목 1건 삭제 (또는 scope 전체 비우기) ─────────
export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; scope?: string };

    if (body.id) {
      const { error } = await supabase.from("activity_log").delete().eq("id", body.id);
      if (error) {
        console.error("[history] 삭제 실패:", error.message);
        return Response.json({ error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true });
    }

    // scope 전체 비우기 (선택 기능)
    if (body.scope === "jordan" || body.scope === "doc") {
      const { error } = await supabase.from("activity_log").delete().eq("scope", body.scope);
      if (error) {
        console.error("[history] scope 삭제 실패:", error.message);
        return Response.json({ error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true });
    }

    return Response.json({ error: "id 또는 scope 필수" }, { status: 400 });
  } catch (err) {
    console.error("[history] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
