import { supabase } from "@/lib/supabase";

// 대화 기록 불러오기
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return Response.json({ error: "session_id 필요" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("messages")
    .select("role, content, pair_id, is_deleted")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ messages: data });
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
