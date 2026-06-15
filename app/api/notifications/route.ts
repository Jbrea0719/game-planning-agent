// 알림 API — 기획서 댓글/답글 알림 조회·읽음 처리
// GET ?nickname=...   → { notifications: [...], unread: n }
// PATCH { nickname, id? }  → id 있으면 그 알림, 없으면 전체 읽음 처리
// 테이블 미생성 시에도 안전(빈 배열 폴백).

import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nickname = searchParams.get("nickname");
    if (!nickname) return Response.json({ notifications: [], unread: 0 });
    const { data, error } = await supabase
      .from("notifications")
      .select("id, actor_nickname, type, doc_family_id, doc_id, doc_title, comment_id, preview, is_read, created_at")
      .eq("recipient_nickname", nickname)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("[notifications] 목록 실패(테이블 미생성?):", error.message);
      return Response.json({ notifications: [], unread: 0 });
    }
    const list = data ?? [];
    const unread = list.filter(n => !n.is_read).length;
    return Response.json({ notifications: list, unread });
  } catch (err) {
    return Response.json({ notifications: [], unread: 0, error: String(err) });
  }
}

export async function PATCH(request: Request) {
  try {
    const { nickname, id } = (await request.json()) as { nickname?: string; id?: string };
    if (id) {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    } else if (nickname) {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("recipient_nickname", nickname).eq("is_read", false);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    } else {
      return Response.json({ error: "nickname 또는 id 필요" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
