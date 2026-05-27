// 기획서 수정 요청 — 기존 버전을 기반으로 사용자 지시대로 수정한 새 버전 생성
// POST /api/design-docs/revise { doc_id, instruction, nickname? }
//
// 흐름:
//   1. 원본 기획서 로드 (content_markdown)
//   2. 기획 바이블 전체 로드 (교차 검증용)
//   3. Claude로 수정 → 전체 마크다운 반환
//   4. design_docs에 새 버전 INSERT (v(N+1))
//   5. changes_summary에 사용자 지시 기록

import Anthropic from "@anthropic-ai/sdk";
import { buildDecisionContext } from "@/lib/decision-context";
import { supabase } from "@/lib/supabase";

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
7. 사용자 지시가 모호하면 가장 합리적인 해석을 적용하고, 끝에 "## 변경 메모" 섹션에 한 줄로 적는다.`;

export async function POST(request: Request) {
  try {
    const { doc_id, instruction, nickname } = (await request.json()) as {
      doc_id: string;
      instruction: string;
      nickname?: string;
    };

    if (!doc_id) return Response.json({ error: "doc_id 필수" }, { status: 400 });
    if (!instruction || !instruction.trim()) {
      return Response.json({ error: "수정 요청 내용을 입력하세요" }, { status: 400 });
    }

    // 1. 원본 doc 로드 (family_id + 카테고리 포함)
    const { data: orig, error: loadErr } = await supabase
      .from("design_docs")
      .select("id, project_id, doc_family_id, title, content_markdown, version_no, category_main_id, category_area_code, category_sub_id")
      .eq("id", doc_id)
      .maybeSingle();

    if (loadErr || !orig) {
      return Response.json({ error: "원본 기획서를 찾을 수 없어요" }, { status: 404 });
    }

    // 2. 기획 바이블 로드
    let bibleText = "";
    try {
      bibleText = await buildDecisionContext(orig.project_id, 500, null);
    } catch (err) {
      console.error("[design-docs/revise] 바이블 로드 실패:", err);
    }

    // 3. Claude 호출 (non-streaming)
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userContent =
      `=== 원본 기획서 (v${orig.version_no} · ${orig.title}) ===\n` +
      `${orig.content_markdown}\n\n` +
      `=== 사용자 수정 요청 ===\n${instruction.trim()}\n\n` +
      (bibleText
        ? `=== 기획 바이블 (교차 검증 기준) ===\n${bibleText}\n\n`
        : "") +
      `위 원본 기획서를 사용자 수정 요청대로 갱신해서 전체 마크다운을 반환하세요.`;

    const res = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      system: REVISE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const revisedMd = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as Anthropic.TextBlock).text)
      .join("");

    if (!revisedMd.trim()) {
      return Response.json({ error: "수정 결과가 비어 있어요" }, { status: 500 });
    }

    // 4. 다음 버전 번호 산출 — 같은 family 내에서만 max + 1
    const familyId = orig.doc_family_id ?? orig.id;
    const { data: lastVer } = await supabase
      .from("design_docs")
      .select("version_no")
      .eq("doc_family_id", familyId)
      .order("version_no", { ascending: false })
      .limit(1);
    const nextVersion = ((lastVer?.[0]?.version_no as number | undefined) ?? orig.version_no) + 1;

    // 새 제목: 본문 첫 H1에서 추출 (없으면 원본 제목 유지)
    const titleMatch = revisedMd.match(/^#\s+(.+?)$/m);
    const newTitle = titleMatch
      ? titleMatch[1]
          .slice(0, 80)
          .replace(/\s*기획서\s*$/, "")
          .replace(/\s*기획\s*$/, "")
          .trim() || orig.title
      : orig.title;

    // 5. INSERT
    const shortInstr = instruction.trim().slice(0, 120);
    const { data: saved, error: saveErr } = await supabase
      .from("design_docs")
      .insert({
        project_id: orig.project_id,
        doc_family_id: familyId,  // 부모와 같은 family 유지
        category_main_id: orig.category_main_id ?? null,  // 카테고리도 상속
        category_area_code: orig.category_area_code ?? null,
        category_sub_id: orig.category_sub_id ?? null,
        version_no: nextVersion,
        title: newTitle,
        content_markdown: revisedMd,
        status: "draft",
        decision_snapshot: {
          source: "revision",
          parent_doc_id: orig.id,
          parent_version_no: orig.version_no,
          instruction: shortInstr,
          revised_at: new Date().toISOString(),
        },
        source_decision_ids: [],
        created_by_nickname: nickname ?? null,
        changes_summary: `v${orig.version_no} → v${nextVersion} 수정 요청: ${shortInstr}`,
      })
      .select()
      .single();

    if (saveErr) {
      console.error("[design-docs/revise] 저장 실패:", saveErr.message);
      return Response.json({ error: saveErr.message }, { status: 500 });
    }

    return Response.json({ success: true, doc: saved });
  } catch (err) {
    console.error("[design-docs/revise] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
