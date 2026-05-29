// 메시지 자세한 답변 본문·표시 상태 저장·조회
// PATCH /api/messages/detail { pair_id, detail_content?, detail_shown? }
//   pair_id의 assistant row 업데이트

import { supabase } from "@/lib/supabase";

export async function PATCH(request: Request) {
  try {
    const { pair_id, detail_content, detail_shown } = (await request.json()) as {
      pair_id: string;
      detail_content?: string;
      detail_shown?: boolean;
    };
    if (!pair_id) return Response.json({ error: "pair_id 필수" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (detail_content !== undefined) updates.detail_content = detail_content;
    if (detail_shown !== undefined) updates.detail_shown = detail_shown;
    if (Object.keys(updates).length === 0) {
      return Response.json({ error: "갱신 필드 없음" }, { status: 400 });
    }

    const { error } = await supabase
      .from("messages")
      .update(updates)
      .eq("pair_id", pair_id)
      .eq("role", "assistant");

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
