// 기획서 수정 요청 — 기존 기획서를 사용자 지시대로 갱신 (in-place UPDATE)
// POST /api/design-docs/revise { doc_id, instruction, nickname? }
//
// 흐름:
//   1. 원본 기획서 로드
//   2. 수정 전 본문을 design_doc_backups에 백업 (7일 유지)
//   3. 기획 바이블 전체 로드 (교차 검증용)
//   4. Claude로 수정 → 전체 마크다운 반환
//   5. design_docs UPDATE — 같은 row를 새 내용으로 덮어씀

import Anthropic from "@anthropic-ai/sdk";
import { buildDecisionContext } from "@/lib/decision-context";
import { buildAbsoluteRulesContext } from "@/lib/absolute-rules-context";
import { supabase } from "@/lib/supabase";
import { createBackup } from "@/lib/doc-backup";
import { MODEL } from "@/lib/models";
import { logActivity } from "@/lib/activity-log";

const REVISE_SYSTEM_PROMPT = `당신은 영웅수집형 모바일 게임 기획서 편집 전문가입니다.

[작업]
기존 기획서를 사용자의 수정 지시에 따라 갱신해서 **전체 마크다운**을 반환합니다.

[원칙]
1. 사용자 지시를 가장 우선으로 반영한다.
2. 지시 외 영역은 가급적 유지한다 (불필요한 재작성 X).
3. 기획 바이블과 충돌이 발생하면 본문 우선 + "⚠️ 기획 바이블과 차이: ..." 명시.
4. 마크다운 구조(헤더·리스트·표)는 원본 형식을 따른다.
5. 코드블록(\`\`\`)으로 전체를 감싸지 않는다 — 본문 마크다운만 그대로 반환.
6. 변경 사항은 자연스럽게 본문에 녹이되, 추측이나 임의 확장은 하지 않는다.
7. 사용자 지시가 모호하면 가장 합리적인 해석을 적용하고, 끝에 "## 변경 메모" 섹션에 한 줄로 적는다.
8. **본문에 해당하지 않는 빈 섹션은 만들지 마세요** (예: UI 기획에 "수익화 연계" 강제 X).
9. 분량은 내용에 맞춰 — 필요하면 **최대 3만 자까지** 상세하게. 단, 군더더기로 억지로 늘리지 말 것.
10. 마지막은 항상 "기획 바이블 교차 검증 결과"와 "다음 단계 (TODO)"로 마무리.`;

export async function POST(request: Request) {
  try {
    const { doc_id, instruction, nickname, preview } = (await request.json()) as {
      doc_id: string;
      instruction: string;
      nickname?: string;
      preview?: boolean;  // true면 저장 안 하고 수정본만 반환 (일괄 AI 수정 미리보기용)
    };

    if (!doc_id) return Response.json({ error: "doc_id 필수" }, { status: 400 });
    if (!instruction || !instruction.trim()) {
      return Response.json({ error: "수정 요청 내용을 입력하세요" }, { status: 400 });
    }

    // 1. 원본 doc 로드
    const { data: orig, error: loadErr } = await supabase
      .from("design_docs")
      .select("id, project_id, title, content_markdown, category_main_id, category_area_code, category_sub_id")
      .eq("id", doc_id)
      .maybeSingle();

    if (loadErr || !orig) {
      return Response.json({ error: "원본 기획서를 찾을 수 없어요" }, { status: 404 });
    }

    // 2. 수정 전 백업 (7일 보존, 실패해도 흐름 계속) — 미리보기 모드는 저장 안 하므로 백업도 생략
    if (!preview) {
      await createBackup({
        doc_id: orig.id,
        project_id: orig.project_id,
        title: orig.title,
        content_markdown: orig.content_markdown,
        reason: "수정 요청 직전",
        instruction: instruction.trim().slice(0, 200),
        nickname,
      });
    }

    // 3. 기획 바이블 로드
    let bibleText = "";
    try {
      bibleText = await buildDecisionContext(orig.project_id, 500, null);
    } catch (err) {
      console.error("[design-docs/revise] 바이블 로드 실패:", err);
    }

    // 4. Claude 호출 (non-streaming)
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userContent =
      `=== 원본 기획서 (${orig.title}) ===\n` +
      `${orig.content_markdown}\n\n` +
      `=== 사용자 수정 요청 ===\n${instruction.trim()}\n\n` +
      (bibleText
        ? `=== 기획 바이블 (교차 검증 기준) ===\n${bibleText}\n\n`
        : "") +
      `위 원본 기획서를 사용자 수정 요청대로 갱신해서 전체 마크다운을 반환하세요.`;

    const absoluteRules = await buildAbsoluteRulesContext();
    const stream = client.messages.stream({
      model: MODEL.DOC_WRITING,  // Opus 4.7 — 기획서 수정 최고 품질
      max_tokens: 60000,  // 한국어 ~3만 자까지 허용 (스트리밍이라 타임아웃 안전)
      system: (absoluteRules ? absoluteRules + "\n\n" : "") + REVISE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
    const res = await stream.finalMessage();

    const revisedMd = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    if (!revisedMd.trim()) {
      return Response.json({ error: "수정 결과가 비어 있어요" }, { status: 500 });
    }

    // 새 제목: 본문 첫 H1에서 추출 (없으면 원본 제목 유지)
    const titleMatch = revisedMd.match(/^#\s+(.+?)$/m);
    const newTitle = titleMatch
      ? titleMatch[1]
          .slice(0, 80)
          .replace(/\s*기획서\s*$/, "")
          .replace(/\s*기획\s*$/, "")
          .trim() || orig.title
      : orig.title;

    // 미리보기 모드: 저장하지 않고 수정본만 반환 (일괄 AI 수정 B에서 doc별 미리보기에 사용)
    if (preview) {
      return Response.json({
        success: true,
        revised_markdown: revisedMd,
        new_title: newTitle,
        original_markdown: orig.content_markdown,
        doc_title: orig.title,
      });
    }

    // 5. UPDATE — 기존 doc을 새 내용으로 덮어씀
    const shortInstr = instruction.trim().slice(0, 120);
    const { data: saved, error: saveErr } = await supabase
      .from("design_docs")
      .update({
        title: newTitle,
        content_markdown: revisedMd,
        decision_snapshot: {
          source: "revision",
          last_instruction: shortInstr,
          revised_at: new Date().toISOString(),
        },
        created_by_nickname: nickname ?? null,
        changes_summary: `수정 요청: ${shortInstr}`,
      })
      .eq("id", doc_id)
      .select()
      .single();

    if (saveErr) {
      console.error("[design-docs/revise] 저장 실패:", saveErr.message);
      return Response.json({ error: saveErr.message }, { status: 500 });
    }

    // 변경 히스토리 기록 (실패해도 무시)
    await logActivity({
      scope: "doc",
      action: "update",
      entity: "doc",
      title: newTitle,
      detail: `수정 요청: ${shortInstr}`,
      target_id: doc_id,
      nickname,
    });

    return Response.json({ success: true, doc: saved });
  } catch (err) {
    console.error("[design-docs/revise] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
