// 대화 선택 기반 기획서 생성 (백그라운드)
// POST /api/document { messages, project_id, nickname? }
//
// 흐름:
//   1. 선택된 대화 + 기획 바이블 전체 로드
//   2. Claude로 기획서 마크다운 생성 (non-streaming, 완성까지 대기)
//   3. design_docs 테이블에 새 버전(v1, v2, ...) INSERT
//   4. 저장된 doc 반환 → 클라이언트는 알림·레드닷 처리

import Anthropic from "@anthropic-ai/sdk";
import { buildDecisionContext } from "@/lib/decision-context";
import { supabase } from "@/lib/supabase";

const DOC_SYSTEM_PROMPT = `당신은 영웅수집형 모바일 게임 기획서 작성 전문가입니다.

[입력 구성]
1. **본문 대화** — 사용자가 선택한 대화 구간. 이번 기획서의 주제·세부 결정의 1차 근거.
2. **기획 바이블** — 이 프로젝트에서 지금까지 누적된 전체 결정·검토 사항. 모든 기획에 일관되게 적용돼야 하는 기준 자산.

[작성 절차]
1단계 — 본문 대화에서 이번 기획서에 들어갈 핵심 결정·세부 사양을 추출한다.
2단계 — 추출한 내용을 **기획 바이블 전체와 반드시 교차 검증**한다.
  • 일치하는 항목 → 본문에 자연스럽게 통합한다.
  • 충돌하는 항목 → 본문 대화를 우선하되, "⚠️ 기획 바이블과 차이: [원래 결정] → [이번 변경]"으로 명시한다.
  • 본문 대화에 없지만 기획 바이블에 명시된 관련 기준 → "참고: 기획 바이블 기준 [내용]"으로 보강한다.
3단계 — 위 결과를 토대로 실무 기획서를 작성한다.

[작성 원칙]
- 본문 대화에서 논의된 내용을 빠짐없이 반영.
- 구체적인 수치·예시는 그대로 포함.
- 불분명한 부분은 "추후 논의 필요" 또는 "TBD"로 표시.
- 실무에서 바로 사용 가능한 수준.
- 마크다운 형식.

[기획서 구조]
# [주제]
(주의: H1 제목 뒤에 "기획서" 같은 단어를 붙이지 마세요. 주제만 간결하게.)

## 1. 개요
- 목적 및 배경
- 핵심 컨셉 한 줄 요약

## 2. 핵심 메커니즘
- 주요 시스템 설명
- 동작 방식

## 3. 상세 설계
- 세부 규칙 및 조건
- 수치/확률 (논의된 경우)

## 4. 밸런스 및 유저 경험
- 밸런스 기준
- 유저 관점에서의 경험

## 5. 수익화 연계
- BM 연결 포인트
- 과금 유도 구조

## 6. 리스크 및 고려사항
- 잠재적 문제점
- 대안 방안

## 7. 기획 바이블 교차 검증 결과
- 본 기획서와 일치하는 바이블 항목
- 충돌하여 이번에 갱신된 항목 (⚠️ 표시)
- 바이블에서 추가로 보강된 기준

## 8. 다음 단계 (TODO)
- 추가 논의 필요 항목
- 구체화 필요 항목`;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const { messages, project_id, nickname } = (await request.json()) as {
      messages: Message[];
      project_id?: string;
      nickname?: string;
    };

    if (!messages || messages.length === 0) {
      return Response.json({ error: "대화 내용이 없습니다" }, { status: 400 });
    }

    // 본문 대화 정리
    const conversationText = messages
      .map((m) => `[${m.role === "user" ? "질문" : "조던"}] ${m.content}`)
      .join("\n\n");

    // 기획 바이블 전체 로드
    let bibleText = "";
    if (project_id) {
      try {
        bibleText = await buildDecisionContext(project_id, 500, null);
      } catch (err) {
        console.error("[api/document] 기획 바이블 로드 실패:", err);
      }
    }

    const userContent = bibleText
      ? `아래 입력을 토대로 게임 기획서를 작성해주세요.\n\n` +
        `=== 1. 본문 대화 (이번 기획서의 중심 데이터) ===\n${conversationText}\n\n` +
        `=== 2. 기획 바이블 (전체 누적 기준 — 반드시 교차 검증) ===\n${bibleText}`
      : `아래 대화 내용을 바탕으로 게임 기획서를 작성해주세요.\n(기획 바이블 항목은 아직 없습니다)\n\n${conversationText}`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // 백그라운드 생성: non-streaming, 완성까지 대기
    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      system: DOC_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const fullText = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    // design_docs에 저장 (project_id 있을 때만)
    // 대화 기반 신규 작성 = 새 family 생성 → version_no는 항상 1로 시작
    let saved: unknown = null;
    if (project_id) {
      // 제목: 본문 첫 H1 추출 (없으면 기본값)
      const titleMatch = fullText.match(/^#\s+(.+?)$/m);
      const title = titleMatch
        ? titleMatch[1]
            .slice(0, 80)
            .replace(/\s*기획서\s*$/, "")
            .replace(/\s*기획\s*$/, "")
            .trim() || "대화 기반 기획서"
        : "대화 기반 기획서";

      // 새 family ID — Postgres가 INSERT 시 id 생성하므로,
      // 클라이언트 측에서 UUID 생성해서 family_id로 같이 넣는다 (한 INSERT에 같은 값)
      const newFamilyId = crypto.randomUUID();

      const { data: doc, error: saveErr } = await supabase
        .from("design_docs")
        .insert({
          project_id,
          doc_family_id: newFamilyId,
          version_no: 1,
          title,
          content_markdown: fullText,
          status: "draft",
          decision_snapshot: {
            source: "chat_selection",
            messages_count: messages.length,
            generated_at: new Date().toISOString(),
          },
          source_decision_ids: [],
          created_by_nickname: nickname ?? null,
          changes_summary: `대화 ${messages.length}개 선택 + 기획 바이블 교차 검증`,
        })
        .select()
        .single();

      if (saveErr) {
        console.error("[api/document] 저장 실패:", saveErr.message);
      } else {
        saved = doc;
      }
    }

    return Response.json({
      success: true,
      content: fullText,
      doc: saved,
    });
  } catch (error) {
    console.error("[api/document] 오류:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
