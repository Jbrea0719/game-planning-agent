// 결정사항 AI 재분류 API
//
// POST /api/decisions/reclassify
//   { action: "preview", project_id, decision_ids?, only_uncategorized? }
//     → AI가 각 결정의 적합 카테고리를 제안만 함 (DB 변경 없음). { proposals: [...] }
//   { action: "apply", assignments: [{ id, sub_category_id }], nickname? }
//     → 검토 후 확정된 배치를 실제로 DB에 반영. { applied: 개수 }

import { supabase } from "@/lib/supabase";
import { reclassifyDecisions, type ReclassifyInput } from "@/lib/decision-reclassifier";

interface PreviewBody {
  action: "preview";
  project_id: string;
  decision_ids?: string[];      // 지정 시 이 결정들만. 없으면 only_uncategorized 따름
  only_uncategorized?: boolean; // true(기본): 미분류만 / false: 프로젝트 전체
}
interface ApplyBody {
  action: "apply";
  assignments: Array<{ id: string; sub_category_id: string | null }>;
  nickname?: string;
}
type Body = PreviewBody | ApplyBody;

interface DecisionRow {
  id: string;
  content: string;
  context: string | null;
  sub_category_id: string | null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;

    // ── 제안 (preview) ──────────────────────────────────────────────
    if (body.action === "preview") {
      if (!body.project_id) {
        return Response.json({ error: "project_id 필수" }, { status: 400 });
      }

      let query = supabase
        .from("decisions")
        .select("id, content, context, sub_category_id")
        .eq("project_id", body.project_id);

      if (body.decision_ids && body.decision_ids.length > 0) {
        query = query.in("id", body.decision_ids);
      } else if (body.only_uncategorized !== false) {
        // 기본: 미분류(sub_category_id IS NULL)만 대상
        query = query.is("sub_category_id", null);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[reclassify] 결정사항 조회 실패:", error.message);
        return Response.json({ error: error.message }, { status: 500 });
      }

      const rows = (data ?? []) as DecisionRow[];
      if (rows.length === 0) {
        return Response.json({ proposals: [] });
      }

      const inputs: ReclassifyInput[] = rows.map(r => ({
        id: r.id,
        content: r.content,
        context: r.context,
        current_sub_category_id: r.sub_category_id,
      }));
      const proposals = await reclassifyDecisions(inputs);
      return Response.json({ proposals });
    }

    // ── 적용 (apply) ────────────────────────────────────────────────
    if (body.action === "apply") {
      if (!Array.isArray(body.assignments) || body.assignments.length === 0) {
        return Response.json({ error: "assignments 필수" }, { status: 400 });
      }

      const nowIso = new Date().toISOString();
      let applied = 0;
      for (const a of body.assignments) {
        if (!a.id) continue;
        const { error } = await supabase
          .from("decisions")
          .update({
            sub_category_id: a.sub_category_id ?? null,
            updated_at: nowIso,
            ...(body.nickname ? { updated_by_nickname: body.nickname } : {}),
          })
          .eq("id", a.id);
        if (error) {
          console.error(`[reclassify] 적용 실패 (id=${a.id}):`, error.message);
          continue;
        }
        applied += 1;
      }
      return Response.json({ applied });
    }

    return Response.json({ error: "알 수 없는 action" }, { status: 400 });
  } catch (err) {
    console.error("[reclassify] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
