// 대화 기반 기존 기획서 수정 — 대화(맥락선 범위)를 근거로 기존 기획서를 수정(추가·변경·삭제)
// POST /api/design-docs/revise-from-chat
//   미리보기:  { doc_id, messages, nickname }            → { original_markdown, revised_markdown, title } (저장 안 함)
//   적용:      { doc_id, content_markdown, title?, nickname, apply:true } → 백업 후 덮어쓰기 { success, doc }
//
// 미리보기 단계에서 클라이언트가 원본 vs 수정본 diff를 색상으로 보여주고,
// 사용자가 [적용]을 누르면 apply:true로 다시 호출 → 깨끗한 마크다운(마커 없음)만 저장.

import Anthropic from "@anthropic-ai/sdk";
import { buildDecisionContext } from "@/lib/decision-context";
import { supabase } from "@/lib/supabase";
import { createBackup } from "@/lib/doc-backup";
import { MODEL } from "@/lib/models";

type ChatMsg = { role: "user" | "assistant"; content: string };

const REVISE_FROM_CHAT_SYSTEM = `당신은 영웅수집형 모바일 게임 기획서 편집 전문가입니다.

[작업]
사용자와 조던(AI)이 나눈 **대화 내용을 근거로** 기존 기획서를 수정해서 **전체 마크다운**을 반환합니다.
대화에서 논의·결정된 내용을 기획서에 반영(추가·변경·삭제)하는 것이 핵심입니다.

[원칙]
1. 대화에서 명시적으로 논의·결정된 사항을 최우선으로 반영한다.
2. 대화에서 다루지 않은 영역은 가급적 원본 그대로 유지한다 (불필요한 재작성 X).
3. 대화 내용에 따라 기존 섹션을 **수정**하거나, 새 내용을 **추가**하거나, 더 이상 맞지 않는 부분을 **삭제**한다.
4. 기획 바이블과 충돌하면 대화 결정 우선 + 끝의 검증 섹션에 "⚠️ 바이블과 차이: ..." 한 줄 명시.
5. 마크다운 구조(헤더·리스트·표)는 원본 형식을 따른다.
6. 코드블록(\`\`\`)으로 전체를 감싸지 않는다 — 본문 마크다운만 그대로 반환.
7. **변경 표시 마커(예: [추가], [삭제], 색상 태그)를 절대 넣지 마세요.** 깨끗한 최종 본문만 반환합니다. (변경 부분 비교는 시스템이 따로 처리)
8. 대화에서 근거를 찾을 수 없는 내용은 추측해서 넣지 않는다.
9. 본문에 해당하지 않는 빈 섹션은 만들지 않는다.
10. 마지막은 항상 "기획 바이블 교차 검증 결과"와 "다음 단계 (TODO)"로 마무리.`;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      doc_id: string;
      messages?: ChatMsg[];
      content_markdown?: string;
      title?: string;
      nickname?: string;
      apply?: boolean;
    };
    const { doc_id, apply, nickname } = body;
    if (!doc_id) return Response.json({ error: "doc_id 필수" }, { status: 400 });

    // ── 적용 모드: 사용자가 미리보기에서 확인한 본문을 백업 후 저장 ──
    if (apply) {
      const content = (body.content_markdown ?? "").trim();
      if (!content) return Response.json({ error: "적용할 본문이 없어요" }, { status: 400 });

      const { data: orig, error: loadErr } = await supabase
        .from("design_docs")
        .select("id, project_id, title, content_markdown")
        .eq("id", doc_id)
        .maybeSingle();
      if (loadErr || !orig) return Response.json({ error: "원본 기획서를 찾을 수 없어요" }, { status: 404 });

      await createBackup({
        doc_id: orig.id,
        project_id: orig.project_id,
        title: orig.title,
        content_markdown: orig.content_markdown,
        reason: "대화 기반 수정 직전",
        instruction: "대화 기반 수정",
        nickname,
      });

      const newTitle = (body.title ?? "").trim() || orig.title;
      const { data: saved, error: saveErr } = await supabase
        .from("design_docs")
        .update({
          title: newTitle,
          content_markdown: content,
          decision_snapshot: { source: "revision_from_chat", revised_at: new Date().toISOString() },
          created_by_nickname: nickname ?? null,
          changes_summary: "대화 기반 수정",
        })
        .eq("id", doc_id)
        .select()
        .single();
      if (saveErr) return Response.json({ error: saveErr.message }, { status: 500 });
      return Response.json({ success: true, doc: saved });
    }

    // ── 미리보기 모드: 대화를 근거로 수정본 생성 (저장 안 함) ──
    const messages = body.messages ?? [];
    if (messages.length === 0) {
      return Response.json({ error: "대화 내용이 비어 있어요 (맥락선 범위 확인)" }, { status: 400 });
    }

    const { data: orig, error: loadErr } = await supabase
      .from("design_docs")
      .select("id, project_id, title, content_markdown")
      .eq("id", doc_id)
      .maybeSingle();
    if (loadErr || !orig) return Response.json({ error: "원본 기획서를 찾을 수 없어요" }, { status: 404 });

    // 기획 바이블 (교차 검증용)
    let bibleText = "";
    try {
      bibleText = await buildDecisionContext(orig.project_id, 500, null);
    } catch (err) {
      console.error("[revise-from-chat] 바이블 로드 실패:", err);
    }

    // 대화를 텍스트로 정리 (질문/조던 라벨)
    const convoText = messages
      .map((m) => `${m.role === "user" ? "사용자" : "조던"}: ${m.content}`)
      .join("\n\n");

    const userContent =
      `=== 원본 기획서 (${orig.title}) ===\n${orig.content_markdown}\n\n` +
      `=== 수정 근거가 되는 대화 ===\n${convoText}\n\n` +
      (bibleText ? `=== 기획 바이블 (교차 검증 기준) ===\n${bibleText}\n\n` : "") +
      `위 대화에서 논의·결정된 내용을 원본 기획서에 반영(추가·변경·삭제)해서 전체 마크다운을 반환하세요. 변경 표시 마커는 넣지 마세요.`;

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model: MODEL.DOC_WRITING,  // Opus — 기획서 수정 최고 품질
      max_tokens: 8192,
      system: REVISE_FROM_CHAT_SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });

    const revisedMd = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");
    if (!revisedMd.trim()) {
      return Response.json({ error: "수정 결과가 비어 있어요" }, { status: 500 });
    }

    // 새 제목: 본문 첫 H1에서 추출 (없으면 원본 유지)
    const titleMatch = revisedMd.match(/^#\s+(.+?)$/m);
    const newTitle = titleMatch
      ? (titleMatch[1].slice(0, 80).replace(/\s*기획서\s*$/, "").replace(/\s*기획\s*$/, "").trim() || orig.title)
      : orig.title;

    return Response.json({
      original_markdown: orig.content_markdown,
      revised_markdown: revisedMd,
      title: newTitle,
      doc_title: orig.title,
    });
  } catch (err) {
    console.error("[revise-from-chat] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
