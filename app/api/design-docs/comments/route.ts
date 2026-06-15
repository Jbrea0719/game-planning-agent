// 기획서 댓글 API (유튜브식: 의견 + 답글)
// GET  ?doc_family_id=...   → 해당 기획서의 모든 댓글(최상위+답글) 시간순
// POST { doc_family_id, parent_id?, content, nickname }
// DELETE { id, nickname }   → 본인 댓글 또는 관리자('정민')만. 최상위 삭제 시 답글도 함께 삭제.
//
// 테이블 미생성 시에도 앱이 죽지 않게 GET은 빈 배열 폴백(마이그레이션 021 적용 전 안전).

import { supabase } from "@/lib/supabase";

const ADMIN = "정민";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const famId = searchParams.get("doc_family_id");
    if (!famId) return Response.json({ comments: [] });
    const { data, error } = await supabase
      .from("doc_comments")
      .select("id, doc_family_id, parent_id, content, nickname, created_at")
      .eq("doc_family_id", famId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[doc-comments] 목록 실패(테이블 미생성?):", error.message);
      return Response.json({ comments: [] });
    }
    return Response.json({ comments: data ?? [] });
  } catch (err) {
    return Response.json({ comments: [], error: String(err) });
  }
}

export async function POST(request: Request) {
  try {
    const { doc_family_id, parent_id, content, nickname } = (await request.json()) as {
      doc_family_id?: string; parent_id?: string | null; content?: string; nickname?: string;
    };
    if (!doc_family_id) return Response.json({ error: "doc_family_id 필수" }, { status: 400 });
    const c = content?.trim();
    if (!c) return Response.json({ error: "내용 필수" }, { status: 400 });
    if (c.length > 6000) return Response.json({ error: "댓글이 너무 길어요" }, { status: 400 });

    const { data, error } = await supabase
      .from("doc_comments")
      .insert({ doc_family_id, parent_id: parent_id ?? null, content: c, nickname: nickname ?? null })
      .select("id, doc_family_id, parent_id, content, nickname, created_at")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // ── 알림 생성 (fire-and-forget) ──
    // 기획서 작성자에게 "댓글 달림", 답글이면 부모 댓글 작성자에게 "답글 달림".
    try {
      const recipients = new Map<string, "comment" | "reply">();
      const { data: docRow } = await supabase
        .from("design_docs")
        .select("id, title, created_by_nickname")
        .eq("doc_family_id", doc_family_id)
        .order("version_no", { ascending: false })
        .limit(1)
        .maybeSingle();
      const docAuthor = (docRow?.created_by_nickname as string | null) ?? null;
      if (docAuthor && docAuthor !== nickname) recipients.set(docAuthor, "comment");
      if (parent_id) {
        const { data: parentRow } = await supabase.from("doc_comments").select("nickname").eq("id", parent_id).maybeSingle();
        const parentAuthor = (parentRow?.nickname as string | null) ?? null;
        if (parentAuthor && parentAuthor !== nickname) recipients.set(parentAuthor, "reply");  // 답글이 더 구체적 → 우선
      }
      if (recipients.size > 0) {
        const preview = c.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
        const rows = [...recipients.entries()].map(([recipient, type]) => ({
          recipient_nickname: recipient,
          actor_nickname: nickname ?? null,
          type,
          doc_family_id,
          doc_id: (docRow?.id as string | null) ?? null,
          doc_title: (docRow?.title as string | null) ?? "기획서",
          comment_id: data.id,
          preview,
        }));
        await supabase.from("notifications").insert(rows);
      }
    } catch (e) {
      console.error("[comments] 알림 생성 실패:", e);
    }

    return Response.json({ comment: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { id, nickname } = (await request.json()) as { id?: string; nickname?: string };
    if (!id) return Response.json({ error: "id 필수" }, { status: 400 });

    // 본인 또는 관리자만 삭제
    const { data: row } = await supabase.from("doc_comments").select("nickname, doc_family_id").eq("id", id).maybeSingle();
    if (!row) return Response.json({ ok: true });  // 이미 없음
    const owner = (row.nickname as string | null) ?? null;
    if (nickname !== ADMIN && owner !== nickname) {
      return Response.json({ error: "본인 댓글만 삭제할 수 있어요" }, { status: 403 });
    }

    // 하위 답글 '전체'(서브트리)를 함께 삭제 — 깊은 체인에서 고아 댓글 방지
    const fam = row.doc_family_id as string | null;
    const ids: string[] = [id];
    if (fam) {
      const { data: all } = await supabase.from("doc_comments").select("id, parent_id").eq("doc_family_id", fam);
      const childMap = new Map<string, string[]>();
      for (const c of (all ?? []) as { id: string; parent_id: string | null }[]) {
        const p = c.parent_id ?? "__root__";
        if (!childMap.has(p)) childMap.set(p, []);
        childMap.get(p)!.push(c.id);
      }
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const ch of childMap.get(cur) ?? []) { ids.push(ch); stack.push(ch); }
      }
    }
    const { error } = await supabase.from("doc_comments").delete().in("id", ids);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, deleted: ids.length });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
