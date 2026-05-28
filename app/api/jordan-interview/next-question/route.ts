// 조던 인터뷰 모드 — 다음 질문 생성
// POST /api/jordan-interview/next-question { project_id, recent_topics? }
//
// 흐름:
//   1. 바이블 + 카테고리 트리 로드
//   2. "빈 곳" 분석 — 결정 없는 카테고리·tentative만 있는 영역
//   3. 등록된 웹툰 IP·참고 게임 컨텍스트 포함
//   4. Claude(Opus 4.7)에 "다음에 결정할 만한 질문 1개" 요청
//   5. 질문 + 추천 카테고리 반환

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { MODEL } from "@/lib/models";

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

interface DecisionRow {
  id: string;
  sub_category_id: string | null;
  content: string;
  confidence: string;
}
interface SubCat {
  id: string;
  main_category_id: string;
  area_code: string | null;
  area_name: string | null;
  name_ko: string;
}
interface MainCat {
  id: string;
  name_ko: string;
  icon: string | null;
}

const SYSTEM_PROMPT = `당신은 영웅수집형 모바일 게임 시니어 디렉터예요.
지금 기획자(사용자)와 인터뷰 세션을 하고 있어요. 사용자의 게임 기획에서 아직 결정 안 된 영역을 찾아 한 번에 하나씩 물어봐서 결정을 유도하는 역할이에요.

[현재 상황]
- 사용자 메시지에 다음 정보가 들어 있어요:
  1. 누적 결정 (기획 바이블) — 이미 정해진 것들
  2. 빈 카테고리 — 아직 결정 0건인 영역
  3. 검토 필요 영역 — 잠정·검토 중 상태인 결정만 있는 영역
  4. 참고 가능한 웹툰 IP·게임 사례 (있다면)

[당신의 역할]
- 위 정보를 보고, **지금 가장 중요한 결정 1개**를 골라 사용자에게 물어보세요.
- 질문은 짧고 명확하게 (2~3문장 이내).
- **선택지를 함께 제공** — 사용자가 0초 안에 고를 수 있게.
  - 예: "(5단계 / 7단계 / 무한 진화 — 직접 의견)"
- 참고 게임이나 웹툰 IP가 도움 된다면 짧게 인용. (예: "원신은 5단계, 에픽세븐은 6단계로 가요.")
- 친근한 디렉터 말투. "~이에요", "~인데요" 같은.

[질문 선정 기준 — 우선순위]
1. 사용자가 본 게임 핵심 정체성에 영향 큰 영역 (영웅 등급·전투 시스템 등) > 부수 영역
2. 결정 0건 영역 > 검토 중 영역
3. 다른 결정의 전제가 되는 기초 결정 (등급 체계 → 강화·진화 의존)
4. 같은 영역에서 이미 한 번 물어본 건 가급적 피하기 (recent_topics 참고)

[출력 형식 — JSON만]
{
  "question": "여기에 한국어 질문 (선택지 포함)",
  "category_hint": "예: 인게임 > 영웅 > 등급 체계",
  "reasoning": "왜 이 질문을 골랐는지 한 줄"
}

JSON 외 다른 텍스트·코드블록 절대 출력 금지.`;

export async function POST(request: Request) {
  try {
    const { project_id = DEFAULT_PROJECT_ID, recent_topics = [] } = (await request.json()) as {
      project_id?: string;
      recent_topics?: string[];
    };

    // 1. 데이터 로드
    const [decRes, subRes, mainRes] = await Promise.all([
      supabase.from("decisions").select("id, sub_category_id, content, confidence").eq("project_id", project_id),
      supabase.from("sub_categories").select("id, main_category_id, area_code, area_name, name_ko").eq("is_active", true),
      supabase.from("main_categories").select("id, name_ko, icon").eq("is_active", true),
    ]);

    const decisions = (decRes.data ?? []) as DecisionRow[];
    const subs = (subRes.data ?? []) as SubCat[];
    const mains = (mainRes.data ?? []) as MainCat[];

    // 2. 빈 카테고리 분석
    const subIdToDecisions = new Map<string, DecisionRow[]>();
    for (const d of decisions) {
      const k = d.sub_category_id ?? "_uncategorized";
      if (!subIdToDecisions.has(k)) subIdToDecisions.set(k, []);
      subIdToDecisions.get(k)!.push(d);
    }

    const mainMap = new Map(mains.map(m => [m.id, m]));

    const emptyAreas: string[] = [];
    const tentativeAreas: string[] = [];
    for (const s of subs) {
      const list = subIdToDecisions.get(s.id) ?? [];
      const main = mainMap.get(s.main_category_id);
      const label = main
        ? (s.area_name ? `${main.name_ko} > ${s.area_name} > ${s.name_ko}` : `${main.name_ko} > ${s.name_ko}`)
        : s.name_ko;
      if (list.length === 0) {
        emptyAreas.push(label);
      } else if (list.every(d => d.confidence === "tentative" || d.confidence === "review")) {
        tentativeAreas.push(label);
      }
    }

    // 3. 누적 결정 요약 (최근 20개)
    const recentDecisions = decisions.slice(0, 20).map(d => `- ${d.content} (${d.confidence})`);

    // 4. 사용자 메시지 빌드
    const userContent =
      `[누적 결정 (최근 ${Math.min(20, decisions.length)}개)]\n${recentDecisions.join("\n") || "(아직 결정 없음)"}\n\n` +
      `[결정 0건 영역 (총 ${emptyAreas.length}개)]\n${emptyAreas.slice(0, 30).join("\n") || "(없음)"}\n\n` +
      `[검토·잠정만 있는 영역 (총 ${tentativeAreas.length}개)]\n${tentativeAreas.slice(0, 15).join("\n") || "(없음)"}\n\n` +
      `[최근 인터뷰에서 다룬 주제 — 가급적 피하기]\n${recent_topics.slice(0, 10).join(", ") || "(없음)"}\n\n` +
      `위 정보를 바탕으로, 사용자가 지금 결정하면 좋을 한 가지를 골라 질문해주세요. JSON 형식으로만.`;

    // 5. Claude 호출
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL.FINAL_ANSWER,  // Opus — 사용자 직접 노출되는 질문이라 품질 ↑
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const text = res.content
      .filter(b => b.type === "text")
      .map(b => (b as Anthropic.TextBlock).text)
      .join("")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/, "")
      .trim();

    let parsed: { question: string; category_hint: string; reasoning: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ error: "응답 파싱 실패", raw: text }, { status: 500 });
    }

    return Response.json({
      success: true,
      question: parsed.question,
      category_hint: parsed.category_hint,
      reasoning: parsed.reasoning,
      empty_areas_count: emptyAreas.length,
      total_decisions: decisions.length,
    });
  } catch (err) {
    console.error("[interview/next-question] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
