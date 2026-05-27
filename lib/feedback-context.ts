// 사용자 피드백 누적 컨텍스트
// 👍/👎 평가를 다음 답변에 반영해서 점진적으로 답변 품질 개선
//
// - 부정확(👎) 사유는 negative example로 강력하게 전달 (반복 금지)
// - 정확(👍)은 누적 카운트만 전달 (스타일·접근 유지 신호)

import { supabase } from "./supabase";

interface FeedbackRow {
  feedback_type: "accurate" | "inaccurate";
  reason: string | null;
  question_snapshot: string | null;
  created_at: string;
}

export async function buildFeedbackContext(
  sessionId: string | null,
  limit = 20
): Promise<string> {
  if (!sessionId) return "";

  try {
    const { data } = await supabase
      .from("message_feedback")
      .select("feedback_type, reason, question_snapshot, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(limit);

    const rows = (data ?? []) as FeedbackRow[];
    if (rows.length === 0) return "";

    const inaccurate = rows.filter(r => r.feedback_type === "inaccurate");
    const accurate = rows.filter(r => r.feedback_type === "accurate");

    const lines: string[] = [];
    lines.push("[사용자 피드백 누적 — 이전 답변 평가]");
    lines.push("※ 사용자가 본 세션에서 평가한 답변 이력. 다음 답변에 반드시 반영하세요.");
    lines.push("");

    // 👎 부정확 — 사유 있는 항목만 강조 전달 (없으면 사용자가 그냥 표시만 한 것)
    const withReason = inaccurate.filter(r => r.reason && r.reason.trim().length > 0);
    if (withReason.length > 0) {
      lines.push(`❌ 부정확하다고 표시한 답변 (${withReason.length}건) — 같은 실수 반복하지 마세요:`);
      for (const r of withReason.slice(0, 10)) {
        const q = (r.question_snapshot ?? "").slice(0, 70).replace(/\n/g, " ");
        lines.push(`  • 질문: "${q}${q.length >= 70 ? "..." : ""}"`);
        lines.push(`    사유: ${r.reason}`);
      }
      lines.push("");
    }

    // 👍 정확 — 카운트만 + 일반 가이드
    if (accurate.length > 0) {
      lines.push(`✅ 정확하다고 평가한 답변: ${accurate.length}건 — 현재 답변 스타일·접근 유지하세요.`);
      lines.push("");
    }

    // 사유 없는 부정확도 카운트만 알림 (참고 신호)
    const noReason = inaccurate.length - withReason.length;
    if (noReason > 0) {
      lines.push(`⚠️ 사유 없이 부정확 표시: ${noReason}건 — 무엇이 문제였는지 확실치 않으나, 비슷한 질문엔 더 신중하게.`);
    }

    return lines.join("\n").trim();
  } catch (err) {
    console.error("[feedback-context] 빌드 실패:", err);
    return "";
  }
}
