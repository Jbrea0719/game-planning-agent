// 기획서 자동 생성 API
// POST /api/design-docs/generate { project_id, title?, nickname? }
//
// 흐름:
//   1. 프로젝트의 모든 결정사항 + 카테고리 트리 조회
//   2. 카테고리 구조 기반으로 마크다운 기획서 자동 생성 (Claude Sonnet)
//   3. design_docs 테이블에 새 버전(v1, v2, ...) INSERT
//   4. 생성된 기획서 반환

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface DecisionRow {
  id: string;
  sub_category_id: string | null;
  content: string;
  context: string | null;
  confidence: string;
  is_auto_extracted: boolean;
}

interface MainCategory {
  id: string;
  name_ko: string;
  icon: string | null;
  description: string | null;
  display_order: number | null;
}

interface SubCategory {
  id: string;
  main_category_id: string;
  area_code: string | null;
  area_name: string | null;
  name_ko: string;
  display_order: number | null;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
}

// ─── POST: 새 기획서 버전 생성 ───────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      project_id: string;
      title?: string;
      nickname?: string;
    };

    if (!body.project_id) {
      return Response.json({ error: "project_id 필수" }, { status: 400 });
    }

    // 1. 프로젝트 정보
    const { data: project } = await supabase
      .from("projects")
      .select("id, name, description")
      .eq("id", body.project_id)
      .maybeSingle();
    if (!project) {
      return Response.json({ error: "프로젝트 없음" }, { status: 404 });
    }

    // 2. 결정사항 전체 조회
    const { data: decRaw } = await supabase
      .from("decisions")
      .select("id, sub_category_id, content, context, confidence, is_auto_extracted")
      .eq("project_id", body.project_id);
    const decisions = (decRaw ?? []) as DecisionRow[];

    // 3. 카테고리 트리 조회
    const { data: mainRaw } = await supabase
      .from("main_categories")
      .select("id, name_ko, icon, description, display_order")
      .eq("is_active", true)
      .order("display_order");
    const mains = (mainRaw ?? []) as MainCategory[];

    const { data: subRaw } = await supabase
      .from("sub_categories")
      .select("id, main_category_id, area_code, area_name, name_ko, display_order")
      .eq("is_active", true)
      .order("display_order");
    const subs = (subRaw ?? []) as SubCategory[];

    // 4. 바이블 자동 생성 = 새 family v1 (수정 요청으로 v2, v3로 진화)
    const nextVersion = 1;
    const newFamilyId = crypto.randomUUID();

    // 5. 결정사항을 카테고리별로 그룹핑
    const decisionsBySub = new Map<string, DecisionRow[]>();
    for (const d of decisions) {
      const k = d.sub_category_id ?? "_uncategorized";
      if (!decisionsBySub.has(k)) decisionsBySub.set(k, []);
      decisionsBySub.get(k)!.push(d);
    }

    // 6. 프롬프트용 카테고리 구조 텍스트 빌드
    const categoryContext = buildCategoryContext(mains, subs, decisionsBySub);

    // 7. Claude로 기획서 마크다운 생성
    const markdown = await generateMarkdown(project as Project, categoryContext, nextVersion);

    // 8. design_docs에 저장
    const title = body.title ?? `v${nextVersion} 자동 생성`;
    const sourceDecisionIds = decisions.map(d => d.id);

    const { data: saved, error: saveErr } = await supabase
      .from("design_docs")
      .insert({
        project_id: body.project_id,
        doc_family_id: newFamilyId,
        version_no: nextVersion,
        title,
        content_markdown: markdown,
        status: "draft",
        decision_snapshot: { count: decisions.length, generated_at: new Date().toISOString() },
        source_decision_ids: sourceDecisionIds,
        created_by_nickname: body.nickname ?? null,
        changes_summary: `초안 — 결정사항 ${decisions.length}개 기반으로 자동 생성`,
      })
      .select()
      .single();

    if (saveErr) {
      console.error("[design-docs/generate] 저장 실패:", saveErr.message);
      return Response.json({ error: saveErr.message }, { status: 500 });
    }

    return Response.json({ doc: saved });
  } catch (err) {
    console.error("[design-docs/generate] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ─── 카테고리 + 결정사항 컨텍스트 빌드 ────────────────────────────────
function buildCategoryContext(
  mains: MainCategory[],
  subs: SubCategory[],
  decisionsBySub: Map<string, DecisionRow[]>
): string {
  const lines: string[] = [];

  for (const m of mains) {
    const mySubs = subs.filter(s => s.main_category_id === m.id);
    if (mySubs.length === 0) continue;

    lines.push(`\n## ${m.icon ?? ""} ${m.name_ko}\n`);

    // area_code 그룹핑 (인게임만 해당)
    const areas = new Map<string, { name: string; subs: SubCategory[] }>();
    const flatSubs: SubCategory[] = [];

    for (const s of mySubs) {
      if (s.area_code) {
        const code = s.area_code;
        if (!areas.has(code)) areas.set(code, { name: s.area_name ?? code, subs: [] });
        areas.get(code)!.subs.push(s);
      } else {
        flatSubs.push(s);
      }
    }

    // 영역별 또는 평평
    if (areas.size > 0) {
      const sortedAreas = Array.from(areas.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [, { name, subs: aSubs }] of sortedAreas) {
        lines.push(`\n### ${name}\n`);
        for (const s of aSubs) lines.push(formatSubLine(s, decisionsBySub.get(s.id) ?? []));
      }
    } else {
      for (const s of flatSubs) lines.push(formatSubLine(s, decisionsBySub.get(s.id) ?? []));
    }
  }

  // 미분류 결정사항
  const uncategorized = decisionsBySub.get("_uncategorized") ?? [];
  if (uncategorized.length > 0) {
    lines.push(`\n## 📌 카테고리 미지정 결정사항\n`);
    for (const d of uncategorized) {
      const status = decisionStatus(d.confidence);
      lines.push(`- ${status} ${d.content}${d.context ? ` (출처: ${d.context.slice(0, 60)})` : ""}`);
    }
  }

  return lines.join("\n");
}

function formatSubLine(s: SubCategory, decisions: DecisionRow[]): string {
  if (decisions.length === 0) {
    return `- **${s.name_ko}**: ❓ 미정 (결정사항 없음)`;
  }
  const items = decisions.map(d => {
    const status = decisionStatus(d.confidence);
    return `  - ${status} ${d.content}${d.context ? ` _(메모: ${d.context.slice(0, 80)})_` : ""}`;
  });
  return `- **${s.name_ko}**:\n${items.join("\n")}`;
}

function decisionStatus(confidence: string): string {
  if (confidence === "decided") return "✅";
  if (confidence === "review") return "🔍";
  if (confidence === "tentative") return "⚪";
  return "•";
}

// ─── Claude Sonnet으로 마크다운 기획서 생성 ──────────────────────────
async function generateMarkdown(
  project: Project,
  categoryContext: string,
  versionNo: number
): Promise<string> {
  const today = new Date().toISOString().split("T")[0];

  const systemPrompt = `당신은 영웅수집형 모바일 게임의 시니어 디렉터예요.
주어진 결정사항 데이터를 바탕으로 **정식 게임 기획서를 마크다운으로 작성**합니다.

[작성 원칙]
1. 단순 결정사항 나열이 아닌, 문맥 있는 기획서 문장으로 정리
2. 각 항목의 결정 상태를 시각화:
   - ✅ 결정됨 (decided)
   - 🔍 검토 중 (review)
   - ⚪ 미정·잠정 (tentative)
   - ❓ 미정 (결정사항 없음)
3. 빈 영역도 표시하되 "추가 검토 필요" 표기
4. 마크다운 표·리스트·강조 활용
5. **추측 금지** — 결정사항에 없는 사실 임의 추가 X
6. 톤: 정식 기획서, 단정적인 서술 (~이다, ~한다)

[문서 구조]
# {게임명} 기획서 (v{버전})

## 📋 메타 정보
- 작성일, 버전, 결정사항 누적 개수

## 📑 목차

## (대카테고리별 본문)
- ## 1. 아웃게임 ... ## 2. 인게임 ... 등
- 각 영역에서 결정사항 있는 항목은 표시, 없으면 "❓ 미정"

## 📌 미해결·검토 사항
- 🔍 검토 중·⚪ 미정 결정사항 목록
- ❓ 결정사항 없는 영역 목록 (자동 산출)

## 💡 다음 단계 제안
- 우선 결정해야 할 영역 2~3개 짚어주기

[중요]
- 결정사항 출처 표기 안 함 (사용자 본인이 작성한 내용)
- 마크다운 코드블록(\`\`\`) 사용 금지 — 그대로 렌더링되는 마크다운만
- 길이 제한 없음, 결정사항이 많으면 길게, 적으면 짧게
- 결정사항이 거의 없으면 솔직하게 "아직 결정된 사항이 부족합니다" 명시`;

  const userContent = `프로젝트 정보:
- 이름: ${project.name}
- 설명: ${project.description ?? "(없음)"}

생성 정보:
- 버전: v${versionNo}
- 작성일: ${today}

다음은 카테고리별 결정사항 데이터예요. 이를 정식 게임 기획서로 정리해주세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${categoryContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 16000,  // 긴 기획서 대응
    system: [
      { type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } } as unknown as Anthropic.TextBlockParam,
    ],
    messages: [{ role: "user", content: userContent }],
  });

  const text = res.content
    .filter(b => b.type === "text")
    .map(b => (b as Anthropic.TextBlock).text)
    .join("");

  return text || `# ${project.name} 기획서 (v${versionNo})\n\n_(생성 실패)_`;
}
