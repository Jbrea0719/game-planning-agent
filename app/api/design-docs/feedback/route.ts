// 기획서 피드백 — 선택한 검토자(들)의 시선으로 기획서를 읽고 항목화된 피드백 생성
// POST /api/design-docs/feedback { doc_id, personas: Persona[], nickname? }
//   → { success, results: [{ persona, items[], summary }] }   (검토자별)
//
// 핵심 방향: 사용자는 모든 스펙을 이상적으로 과하게 기획함.
//   → 우선순위 낮음 / 개발 대비 저효율(과잉설계) / 좋아보이지만 저효과 스펙을 걸러내는 게 주목적.
//   누락·리스크도 함께. 칭찬·요약은 제외하고 개선점만.

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import { MODEL } from "@/lib/models";
import { buildDecisionContext } from "@/lib/decision-context";
import { buildAbsoluteRulesContext } from "@/lib/absolute-rules-context";
import { REFERENCE_GAMES } from "@/lib/reference-games";
import type { Persona } from "@/lib/review-personas";

interface FeedbackItem {
  title: string;
  type: string;
  severity: string;
  rationale: string;
  suggestion: string;
  suggested_mode: string;
  section?: string;
}

function buildSystemPrompt(p: Persona): string {
  return `당신은 영웅수집형 모바일 게임 기획서를 검토하는 "${p.name}"입니다.

[정체성] ${p.identity || "(없음)"}
[당신의 시선 — 무엇을 중시하고 무엇을 걸러내는가] ${p.perspective || "(없음)"}
[말투] ${p.tone || "전문가 말투"}
[엄격도] ${p.strictness}/5 (높을수록 사소한 것도 깐깐하게 지적)
${p.knowledge?.expertise ? `[배경] ${p.knowledge.expertise}` : ""}

[이 검토의 큰 목적]
사용자는 모든 스펙을 '가장 이상적인 형태'로 과하게 기획하는 경향이 있습니다.
당신의 핵심 임무는 (1) 우선순위가 낮은 스펙, (2) 개발 사이즈 대비 효율이 떨어지는 스펙(오버엔지니어링), (3) 좋아 보이지만 실제 효과가 약한 스펙을 골라내어 제거·축소·후순위를 제안하는 것입니다. 더불어 (4) 빠진 부분·리스크도 함께 짚어, 기획서를 더 효율적이고 실행 가능하게 만드세요.
당신의 시선에 맞지 않는 영역은 억지로 지적하지 말고, 정말 중요한 것만 고르세요.

[항목 작성 규칙]
- 4~6개. 두루뭉술 금지 — 각 항목은 기획서 실제 내용을 근거로, 바로 실행 가능한 단위로.
- rationale와 suggestion은 각각 1~2문장으로 간결하게(장황하지 않게).
- 각 항목 필드:
  - title: 한 줄 요지
  - type: 과잉설계 | 후순위 | 효과의문 | 누락 | 리스크 | 개선  (솎아내기 계열을 우선 고려)
  - severity: 치명 | 중요 | 사소
  - rationale: 왜 그런지 근거 (기획서 내용을 구체적으로 인용)
  - suggestion: 구체적으로 어떻게 바꿀지 (제거/축소/후순위/보완을 명확히)
  - suggested_mode: 보완 | 축소 | 후순위 | 제거 | 직접지시  (이 항목을 반영한다면 권장 방식)
  - section: 영향받는 섹션·위치 (알 수 있으면)
- 칭찬·전체 요약 설명은 넣지 말고 개선점만.

[출력 — JSON만]
{ "items": [ { "title": "...", "type": "...", "severity": "...", "rationale": "...", "suggestion": "...", "suggested_mode": "...", "section": "..." } ], "summary": "한 줄 총평" }
JSON 외 다른 텍스트·코드블록 절대 금지.`;
}

async function runPersona(
  client: Anthropic,
  persona: Persona,
  docTitle: string,
  docMarkdown: string,
  contexts: { bible: string; rules: string; refGameNames: string },
): Promise<{ persona: Pick<Persona, "id" | "name" | "emoji">; items: FeedbackItem[]; summary: string; error?: string }> {
  const personaMeta = { id: persona.id, name: persona.name, emoji: persona.emoji };
  try {
    const know = persona.knowledge ?? { bible: true, rules: true, refgames: true, expertise: "" };
    const ctx =
      (know.rules && contexts.rules ? `=== 절대 규칙(반드시 준수) ===\n${contexts.rules}\n\n` : "") +
      (know.bible && contexts.bible ? `=== 기획 바이블(누적 결정, 교차검증) ===\n${contexts.bible}\n\n` : "") +
      (know.refgames && contexts.refGameNames ? `=== 참고 가능한 게임(인용해도 좋음) ===\n${contexts.refGameNames}\n\n` : "");

    const userContent =
      `${ctx}=== 검토 대상 기획서 (${docTitle}) ===\n${docMarkdown}\n\n` +
      `위 기획서를 당신의 시선으로 검토해 JSON으로만 항목화된 피드백을 주세요.`;

    const res = await client.messages.create({
      model: MODEL.FINAL_ANSWER, // Opus — 사용자에게 직접 보이는 검토 품질
      max_tokens: 6000,  // 한국어 4~6개 항목 JSON이 잘리지 않도록 충분히
      system: buildSystemPrompt(persona),
      messages: [{ role: "user", content: userContent }],
    });

    let text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    // 혹시 앞뒤 잡텍스트가 있으면 첫 { ~ 마지막 } 추출
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s > 0 || e < text.length - 1) text = text.slice(s, e + 1);

    let parsed: { items?: FeedbackItem[]; summary?: string };
    try {
      parsed = JSON.parse(text);
    } catch {
      // 혹시 잘렸으면 완전한 항목 객체까지만 살려서 배열을 닫음
      const arrStart = text.indexOf("[", text.indexOf('"items"'));
      let depth = 0, lastGood = -1;
      for (let i = arrStart; i >= 0 && i < text.length; i++) {
        const c = text[i];
        if (c === "{") depth++;
        else if (c === "}") { depth--; if (depth === 0) lastGood = i; }
      }
      if (arrStart >= 0 && lastGood > arrStart) {
        parsed = JSON.parse(`{"items":${text.slice(arrStart, lastGood + 1)}]}`);
      } else throw new Error("JSON 파싱 실패");
    }
    const items = (parsed.items ?? []).filter((it) => it && it.title);
    return { persona: personaMeta, items, summary: parsed.summary ?? "" };
  } catch (err) {
    return { persona: personaMeta, items: [], summary: "", error: String(err) };
  }
}

export async function POST(request: Request) {
  try {
    const { doc_id, personas } = (await request.json()) as { doc_id?: string; personas?: Persona[]; nickname?: string };
    if (!doc_id) return Response.json({ error: "doc_id 필수" }, { status: 400 });
    if (!personas || personas.length === 0) return Response.json({ error: "검토자를 선택하세요" }, { status: 400 });

    // 기획서 로드
    const { data: doc, error: loadErr } = await supabase
      .from("design_docs")
      .select("id, project_id, title, content_markdown")
      .eq("id", doc_id)
      .maybeSingle();
    if (loadErr || !doc) return Response.json({ error: "기획서를 찾을 수 없어요" }, { status: 404 });
    if (!doc.content_markdown?.trim()) return Response.json({ error: "내용이 비어 있는 기획서예요" }, { status: 400 });

    // 지식 컨텍스트는 한 번만 만들어 모든 검토자가 공유 (필요한 것만 각자 사용)
    const needBible = personas.some((p) => p.knowledge?.bible);
    const needRules = personas.some((p) => p.knowledge?.rules);
    const needRef = personas.some((p) => p.knowledge?.refgames);
    const [bible, rules] = await Promise.all([
      needBible ? buildDecisionContext(doc.project_id, 300, null).catch(() => "") : Promise.resolve(""),
      needRules ? buildAbsoluteRulesContext(doc.project_id).catch(() => "") : Promise.resolve(""),
    ]);
    const refGameNames = needRef ? REFERENCE_GAMES.map((g) => g.name).join(", ") : "";

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // 검토자별 병렬 실행 (패널)
    const results = await Promise.all(
      personas.map((p) => runPersona(client, p, doc.title, doc.content_markdown, { bible, rules, refGameNames })),
    );

    return Response.json({ success: true, results, doc_title: doc.title });
  } catch (err) {
    console.error("[design-docs/feedback] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
