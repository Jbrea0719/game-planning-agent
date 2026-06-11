import { supabase } from "@/lib/supabase";

// 대화 기록 불러오기
// 최신 대화 우선 — 최근 500개 메시지(=250쌍)를 가져옴
// (기존 ascending+limit(100)은 "오래된 100개"만 불러와, 대화가 50쌍을 넘으면
//  최신 대화가 화면에서 누락됐음. 인터뷰 등 최근 대화가 안 보이던 원인.)
// ※ 무한 스크롤(점진 로딩)은 클라이언트 수정과 함께 한 세션에서 작업 예정.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const conversationId = searchParams.get("conversation_id");  // 있으면 해당 대화방만

  if (!sessionId) {
    return Response.json({ error: "session_id 필요" }, { status: 400 });
  }

  let query = supabase
    .from("messages")
    .select("role, content, pair_id, is_deleted, detail_content, detail_shown, image_id")
    .eq("session_id", sessionId);
  if (conversationId) query = query.eq("conversation_id", conversationId);  // 대화방 필터 (없으면 기존처럼 전체)
  const { data, error } = await query
    .order("created_at", { ascending: false })  // 내림차순(최신 먼저)으로 가져와서
    .limit(500);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // 화면 표시용으로 오래된→최신 순서로 뒤집어 반환 (대화 흐름 유지)
  const messages = (data ?? []).reverse();
  return Response.json({ messages });
}

// 메시지 직접 저장 (인터뷰 모드 등 외부에서 만든 페어 저장용)
export async function POST(request: Request) {
  const { messages } = (await request.json()) as {
    messages: Array<{
      session_id: string;
      pair_id: string;
      role: "user" | "assistant";
      content: string;
      universes?: string;
      conversation_id?: string | null;
    }>;
  };
  if (!messages || messages.length === 0) {
    return Response.json({ error: "messages 배열 필수" }, { status: 400 });
  }
  const rows = messages.map(m => ({
    session_id: m.session_id,
    pair_id: m.pair_id,
    role: m.role,
    content: m.content,
    universes: m.universes ?? "게임기획",
    is_deleted: false,
    conversation_id: m.conversation_id ?? null,
  }));
  const { error } = await supabase.from("messages").insert(rows);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

// 대화 쌍 영구 삭제 (pair_id 기준)
export async function DELETE(request: Request) {
  const { pair_id } = (await request.json()) as { pair_id: string };

  if (!pair_id) {
    return Response.json({ error: "pair_id 필요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("messages")
    .delete()
    .eq("pair_id", pair_id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}

// 대화 쌍 삭제/복원 (pair_id 기준)
export async function PATCH(request: Request) {
  const { pair_id, is_deleted } = (await request.json()) as {
    pair_id: string;
    is_deleted: boolean;
  };

  if (!pair_id) {
    return Response.json({ error: "pair_id 필요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("messages")
    .update({ is_deleted })
    .eq("pair_id", pair_id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
