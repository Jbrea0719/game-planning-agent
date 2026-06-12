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
import { suggestDocumentCategory } from "@/lib/document-categorizer";
import { MODEL } from "@/lib/models";

const DOC_SYSTEM_PROMPT = `당신은 영웅수집형 모바일 게임 기획서 작성 전문가입니다.

[입력 구성]
1. **본문 대화** — 사용자가 선택한 대화 구간(맥락 전체). 이번 기획서의 주제·세부 결정의 1차 근거. **빠짐없이 반영할 것.**
2. **기획 바이블** — 이 프로젝트에서 지금까지 누적된 전체 결정·검토 사항. 모든 기획에 일관되게 적용돼야 하는 기준 자산.
3. **참고 기획서** — 사용자가 함께 참고하라고 선택한 기존 기획서들(있을 때만). 이번 기획서와 연계·일관성을 유지하고, 충돌·중복이 있으면 명시한다.

[작성 절차]
1단계 — 본문 대화 전체에서 이번 기획서에 들어갈 핵심 결정·세부 사양을 빠짐없이 추출한다.
2단계 — 추출한 내용을 **기획 바이블 전체 + 참고 기획서와 반드시 교차 검증**한다.
  • 일치하는 항목 → 본문에 자연스럽게 통합한다.
  • 충돌하는 항목 → 본문 대화를 우선하되, "⚠️ 기획 바이블과 차이: [원래 결정] → [이번 변경]" 또는 "⚠️ 참고 기획서와 차이: ..."로 명시한다.
  • 본문 대화에 없지만 기획 바이블·참고 기획서에 명시된 관련 기준 → "참고: [출처] 기준 [내용]"으로 보강한다.
3단계 — 본문의 **주제 유형을 판단**하고 그에 맞는 목차로 작성한다.

[작성 원칙]
- 본문 대화에서 논의된 내용을 빠짐없이 반영.
- 분량은 내용에 맞춰 자유롭게 — 다룰 내용이 많으면 **최대 3만 자까지** 상세하게 작성. 단, 빈 섹션·반복·군더더기로 억지로 늘리지 말 것 (밀도 있게).
- 구체적인 수치·예시는 그대로 포함.
- 불분명한 부분은 "추후 논의 필요" 또는 "TBD"로 표시.
- 실무에서 바로 사용 가능한 수준.
- 마크다운 형식.
- H1 제목은 주제만 간결하게 ("기획서" 접미사 X).
- **본문에 해당하지 않는 빈 섹션은 만들지 마세요** (예: UI 기획에 "수익화 연계" 강제 X).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[주제 유형별 목차 템플릿 — 본문 내용에 맞게 선택]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 **A. 시스템·메커니즘 기획** (영웅 등급/성장/스킬, 가챠, 강화, 한계돌파 등)
  1. 개요 (목적·핵심 컨셉)
  2. 시스템 구조 (단계·상태·전이)
  3. 상세 설계 (수치·확률·조건)
  4. 유저 동선 (UX 흐름·진입 조건·획득 보상)
  5. 밸런스 기준 (난이도·인플레이션 관리)
  6. 수익화 연계 (BM 포인트, 해당 시만)
  7. 리스크·대안
  8. 기획 바이블 교차 검증
  9. 다음 단계 (TODO)

🎨 **B. 콘텐츠 기획** (PVE 스테이지, 레이드, 이벤트, 스토리, 던전 등)
  1. 개요 (콘텐츠 목적·타겟 유저)
  2. 핵심 플레이 루프
  3. 상세 구성 (스테이지·보스·보상 테이블)
  4. 난이도·진행 곡선
  5. 보상 설계 (재화·아이템·진행 가속도)
  6. 시즌·운영 사이클 (해당 시만)
  7. 리스크·대안
  8. 기획 바이블 교차 검증
  9. 다음 단계 (TODO)

⚔️ **C. PVP·경쟁 기획** (아레나, 길드전, 랭킹, 매칭 등)
  1. 개요 (목적·타겟층)
  2. 매칭·랭킹 시스템
  3. 룰·승패 조건
  4. 보상 구조 (시즌·일일·주간)
  5. 카운터·메타 설계
  6. 리스크 (어뷰징·매칭 불균형 등)
  7. 기획 바이블 교차 검증
  8. 다음 단계 (TODO)

📱 **D. UI·UX 기획** (로비·메뉴·HUD·진입 동선 등)
  1. 개요 (목적·해결할 문제)
  2. 화면 구조·정보 계층
  3. 주요 동선 (사용자 시나리오)
  4. 상호작용·피드백
  5. 시각·접근성 가이드
  6. 리스크·대안
  7. 기획 바이블 교차 검증
  8. 다음 단계 (TODO)

💰 **E. 수익화·BM 기획** (가챠 패키지, 시즌 패스, 광고, 정액제 등)
  1. 개요 (수익 목표·유저 가치)
  2. BM 구조·과금 포인트
  3. 가격·재화 정책
  4. 유저층별 설계 (라이트·헤비)
  5. 비교 사례 (참고 게임 — 본문에 있을 때만)
  6. 리스크 (가챠 피로·과금 압박 등)
  7. 기획 바이블 교차 검증
  8. 다음 단계 (TODO)

🌐 **F. 운영·라이브 기획** (업데이트 사이클, 이벤트 캘린더, 커뮤니티 등)
  1. 개요 (운영 철학·기간)
  2. 업데이트 로드맵
  3. 이벤트·캠페인 계획
  4. 커뮤니티 운영 전략
  5. KPI·성과 지표
  6. 기획 바이블 교차 검증
  7. 다음 단계 (TODO)

🧩 **G. 통합·종합 기획** (위 카테고리에 안 맞거나 여러 영역 걸친 경우)
  1. 개요
  2. 핵심 메커니즘
  3. 상세 설계
  4. 밸런스·유저 경험
  5. 수익화 연계
  6. 리스크 및 고려사항
  7. 기획 바이블 교차 검증
  8. 다음 단계 (TODO)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
**중요**: 위 7개 템플릿 중 본문에 가장 맞는 것을 선택. 본문이 짧거나 한 가지 영역만 다루면 해당 템플릿. 여러 영역이 섞이면 G(통합) 사용. 어떤 템플릿을 골라도 **마지막은 항상 "기획 바이블 교차 검증 결과"와 "다음 단계 (TODO)"**로 마무리.`;

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      messages?: Message[];
      project_id?: string;
      nickname?: string;
      reference_doc_ids?: string[];  // 참고 기획서 id 목록 — 작성 시 연계·교차 검증
      // 저장(apply) 모드 — 미리보기에서 확정한 내용을 저장만 (재생성 없음)
      apply?: boolean;
      content_markdown?: string;
      title?: string;
      category_main_id?: string | null;
      category_area_code?: string | null;
      category_sub_id?: string | null;
      messages_count?: number;
    };

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ── 저장(apply) 모드: 미리보기에서 확정한 제목·내용·카테고리를 저장 (생성 X) ──
    if (body.apply) {
      const finalTitle = (body.title ?? "").trim() || "대화 기반 기획서";
      if (!body.project_id || !body.content_markdown?.trim()) {
        return Response.json({ error: "저장할 내용이 없어요" }, { status: 400 });
      }
      const { data: doc, error: saveErr } = await supabase
        .from("design_docs")
        .insert({
          project_id: body.project_id,
          title: finalTitle,
          content_markdown: body.content_markdown,
          status: "draft",
          category_main_id: body.category_main_id ?? null,
          category_area_code: body.category_area_code ?? null,
          category_sub_id: body.category_sub_id ?? null,
          decision_snapshot: { source: "chat_selection", messages_count: body.messages_count ?? 0, generated_at: new Date().toISOString() },
          source_decision_ids: [],
          created_by_nickname: body.nickname ?? null,
          changes_summary: `대화 ${body.messages_count ?? 0}개 선택 + 기획 바이블 교차 검증`,
        })
        .select()
        .single();
      if (saveErr) {
        console.error("[api/document] 저장 실패:", saveErr.message);
        return Response.json({ error: saveErr.message }, { status: 500 });
      }
      return Response.json({ success: true, doc });
    }

    // ── 미리보기(preview) 모드: 생성만, 저장 안 함 ──
    const { messages, project_id, nickname, reference_doc_ids } = body;
    if (!messages || messages.length === 0) {
      return Response.json({ error: "대화 내용이 없습니다" }, { status: 400 });
    }

    // 본문 대화 정리 (선택 구간 전체, 잘림 없음)
    const conversationText = messages
      .map((m) => `[${m.role === "user" ? "질문" : "조던"}] ${m.content}`)
      .join("\n\n");

    // 기획 바이블 전체 로드 (한도 상향 — 사실상 전체)
    let bibleText = "";
    if (project_id) {
      try {
        bibleText = await buildDecisionContext(project_id, 1000, null);
      } catch (err) {
        console.error("[api/document] 기획 바이블 로드 실패:", err);
      }
    }

    // 참고 기획서 로드 (사용자가 선택한 기존 기획서 본문)
    let referenceText = "";
    if (reference_doc_ids && reference_doc_ids.length > 0) {
      try {
        const { data: refDocs } = await supabase
          .from("design_docs")
          .select("title, content_markdown")
          .in("id", reference_doc_ids);
        if (refDocs && refDocs.length > 0) {
          const PER = 12000;  // 기획서당 길이 상한 (토큰 관리)
          referenceText = refDocs
            .map((d, i) => {
              const full = d.content_markdown || "";
              const body = full.slice(0, PER) + (full.length > PER ? "\n…(이하 생략)" : "");
              return `[참고 기획서 ${i + 1}: ${d.title}]\n${body}`;
            })
            .join("\n\n---\n\n");
        }
      } catch (err) {
        console.error("[api/document] 참고 기획서 로드 실패:", err);
      }
    }

    const sections: string[] = [
      `=== 1. 본문 대화 (이번 기획서의 중심 데이터 — 맥락 전체) ===\n${conversationText}`,
    ];
    if (bibleText) sections.push(`=== 2. 기획 바이블 (전체 누적 기준 — 반드시 교차 검증) ===\n${bibleText}`);
    if (referenceText) sections.push(`=== 3. 참고 기획서 (사용자 선택 — 연계·충돌 점검) ===\n${referenceText}`);
    const userContent = `아래 입력을 토대로 게임 기획서를 작성해주세요. 본문 대화 전체와 기획 바이블${referenceText ? "·참고 기획서" : ""}를 빠짐없이 반영하세요.\n\n${sections.join("\n\n")}`;

    // 생성: 스트리밍으로 받아 max_tokens 상향(긴 기획서 지원, 비스트리밍 타임아웃 회피)
    const stream = client.messages.stream({
      model: MODEL.DOC_WRITING,  // Opus 4.7 — 기획서 작성 최고 품질
      max_tokens: 60000,  // 한국어 ~3만 자까지 허용 (스트리밍이라 타임아웃 안전)
      system: DOC_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
    const res = await stream.finalMessage();

    const fullText = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    // 제목: 본문 첫 H1 추출 (없으면 기본값) — 미리보기에서 사용자가 수정 가능
    const titleMatch = fullText.match(/^#\s+(.+?)$/m);
    const title = titleMatch
      ? titleMatch[1]
          .slice(0, 80)
          .replace(/\s*기획서\s*$/, "")
          .replace(/\s*기획\s*$/, "")
          .trim() || "대화 기반 기획서"
      : "대화 기반 기획서";

    // 카테고리 제안 + 전체 요약 (병렬) — 미리보기 표시용
    const [suggestion, summary] = await Promise.all([
      suggestDocumentCategory(title, fullText),
      (async () => {
        try {
          const sres = await client.messages.create({
            model: "claude-haiku-4-5",  // 요약은 저렴한 모델로
            max_tokens: 500,
            system: "다음 게임 기획서를 2~4문장으로 핵심만 간략히 요약하세요. 무엇에 대한 기획서이고 어떤 핵심 결정·구조를 담았는지. 머리말·군더더기 없이 요약 본문만.",
            messages: [{ role: "user", content: fullText.slice(0, 14000) }],
          });
          return sres.content.filter((b) => b.type === "text").map((b) => (b as Anthropic.TextBlock).text).join("").trim();
        } catch {
          return "";
        }
      })(),
    ]);

    // 저장하지 않고 미리보기 데이터만 반환 (사용자가 제목 수정·확인 후 apply로 저장)
    return Response.json({
      preview: true,
      content: fullText,
      title,
      summary,
      category: {
        main_id: suggestion.main_id,
        area_code: suggestion.area_code,
        sub_id: suggestion.sub_id,
        label: suggestion.label,  // "대 > 영역 > 소" 또는 null(미분류)
      },
      messages_count: messages.length,
    });
  } catch (error) {
    console.error("[api/document] 오류:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
