// 결정사항 출처(전후 대화) 조회 — [상세] 팝업용
// GET /api/decisions/source?id=<decisionId>
//   결정이 추출된 원본 대화 페어 + 앞뒤 몇 턴을 함께 반환 (짧은 결정의 맥락 파악용)

import { supabase } from "@/lib/supabase";

interface MsgRow { role: string; content: string; pair_id: string | null; created_at: string; is_deleted: boolean | null; }

const WINDOW = 2; // 타깃 페어 기준 앞뒤 각 2턴

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id 필수" }, { status: 400 });

    const { data: dec } = await supabase
      .from("decisions")
      .select("content, context, confidence, created_at, source_message_pair_id, source_session_id, created_by_nickname")
      .eq("id", id)
      .maybeSingle();
    if (!dec) return Response.json({ error: "결정사항을 찾을 수 없어요" }, { status: 404 });

    const base = {
      content: dec.content as string,
      context: (dec.context as string | null) ?? null,
      confidence: dec.confidence as string,
      created_at: dec.created_at as string,
      nickname: (dec.created_by_nickname as string | null) ?? null,
    };

    const pairId = dec.source_message_pair_id as string | null;
    const sessionId = dec.source_session_id as string | null;
    if (!pairId || !sessionId) {
      return Response.json({ ...base, found: false, turns: [] });
    }

    // 세션 메시지(최신 500) → 페어 순서대로 정렬
    const { data: msgs } = await supabase
      .from("messages")
      .select("role, content, pair_id, created_at, is_deleted")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(800);
    const rows = ((msgs ?? []) as MsgRow[]).filter(m => !m.is_deleted && m.pair_id);

    // 페어 순서 목록(중복 제거, 등장 순)
    const order: string[] = [];
    const seen = new Set<string>();
    for (const m of rows) { if (m.pair_id && !seen.has(m.pair_id)) { seen.add(m.pair_id); order.push(m.pair_id); } }

    const idx = order.indexOf(pairId);
    if (idx < 0) return Response.json({ ...base, found: false, turns: [] });

    const from = Math.max(0, idx - WINDOW);
    const to = Math.min(order.length - 1, idx + WINDOW);
    const turns = [];
    for (let i = from; i <= to; i++) {
      const pid = order[i];
      const user = rows.find(m => m.pair_id === pid && m.role === "user")?.content ?? "";
      const assistant = rows.find(m => m.pair_id === pid && m.role === "assistant")?.content ?? "";
      turns.push({ pair_id: pid, user, assistant, is_target: pid === pairId });
    }

    return Response.json({ ...base, found: true, turns });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
