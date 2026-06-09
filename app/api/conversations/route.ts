// 대화방(conversations) CRUD — 병렬 작업용 다중 대화방
// GET    ?session_id=        → 대화방 목록 (최근 활동순)
// POST   {session_id,title?,adopt_orphans?} → 새 방 (adopt_orphans면 미배정 기존 메시지 흡수)
// PATCH  {id,title}          → 이름 변경
// DELETE {id}               → 방 + 그 방 메시지 삭제

import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) return Response.json({ error: "session_id 필요" }, { status: 400 });

  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, created_at, updated_at")
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ conversations: data ?? [] });
}

export async function POST(request: Request) {
  const { session_id, title, adopt_orphans, adopt_into } = (await request.json()) as {
    session_id: string;
    title?: string;
    adopt_orphans?: boolean;  // 기존(대화방 미배정) 메시지를 새로 만드는 이 방으로 흡수
    adopt_into?: string;      // 새로 만들지 않고, 미배정 메시지를 이 기존 방 id로 흡수 (복구용)
  };
  if (!session_id) return Response.json({ error: "session_id 필요" }, { status: 400 });

  // 복구 모드: 미배정(conversation_id NULL) 메시지를 지정 방으로 흡수 (생성 X)
  if (adopt_into) {
    const { data: adopted, error: adErr } = await supabase
      .from("messages")
      .update({ conversation_id: adopt_into })
      .eq("session_id", session_id)
      .is("conversation_id", null)
      .select("id");
    if (adErr) return Response.json({ error: adErr.message }, { status: 500 });
    return Response.json({ adopted: (adopted ?? []).length });
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ session_id, title: title || "새 대화" })
    .select("id, title, created_at, updated_at")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (adopt_orphans) {
    // 이 세션의 conversation_id 없는(기존) 메시지를 새 방으로 편입 → 기존 대화 보존
    await supabase
      .from("messages")
      .update({ conversation_id: data.id })
      .eq("session_id", session_id)
      .is("conversation_id", null);
  }

  return Response.json({ conversation: data });
}

export async function PATCH(request: Request) {
  const { id, title } = (await request.json()) as { id: string; title: string };
  if (!id) return Response.json({ error: "id 필요" }, { status: 400 });
  const { error } = await supabase
    .from("conversations")
    .update({ title: (title ?? "").trim() || "새 대화", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id: string };
  if (!id) return Response.json({ error: "id 필요" }, { status: 400 });
  // 방의 메시지 먼저 삭제 후 방 삭제
  await supabase.from("messages").delete().eq("conversation_id", id);
  const { error } = await supabase.from("conversations").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
