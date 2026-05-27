// 답변 피드백 저장 API
// POST: { session_id, pair_id, feedback_type, reason?, target_games?, question?, answer? }
// 같은 pair_id에 대해 upsert (동일 답변에 피드백 변경 시 덮어쓰기)

import { supabase } from "@/lib/supabase";

interface FeedbackBody {
  session_id: string;
  pair_id: string;
  feedback_type: "accurate" | "inaccurate";
  reason?: string;
  target_games?: string[];
  question?: string;
  answer?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FeedbackBody;
    const { session_id, pair_id, feedback_type, reason, target_games, question, answer } = body;

    if (!session_id || !pair_id || !feedback_type) {
      return Response.json({ error: "session_id, pair_id, feedback_type 필수" }, { status: 400 });
    }
    if (!["accurate", "inaccurate"].includes(feedback_type)) {
      return Response.json({ error: "feedback_type은 'accurate' 또는 'inaccurate'" }, { status: 400 });
    }

    // 같은 pair_id 기존 피드백 삭제 후 새로 저장 (피드백 변경 가능)
    await supabase.from("message_feedback").delete().eq("pair_id", pair_id);

    const { error } = await supabase.from("message_feedback").insert({
      session_id,
      pair_id,
      feedback_type,
      reason: reason ?? null,
      target_games: target_games ?? [],
      question_snapshot: question?.slice(0, 1000) ?? null,
      answer_snapshot: answer?.slice(0, 1000) ?? null,
    });

    if (error) {
      console.error("[feedback] 저장 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[feedback] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// GET: ?pair_id=... 특정 답변의 피드백 조회
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pairId = url.searchParams.get("pair_id");
  if (!pairId) return Response.json({ feedback: null });

  const { data, error } = await supabase
    .from("message_feedback")
    .select("feedback_type, reason")
    .eq("pair_id", pairId)
    .maybeSingle();

  if (error) {
    console.error("[feedback] 조회 실패:", error.message);
    return Response.json({ feedback: null });
  }

  return Response.json({ feedback: data });
}
