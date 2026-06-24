// 결정 대기 API — 목록 조회 + 최종 등록(대기 → 바이블 이동)
// GET  /api/decisions/pending?project_id=...                 → 대기 항목 목록(+카테고리 라벨)
// POST /api/decisions/pending  { items:[{id,content?,sub_category_id?,confidence?}], nickname }
//        → 선택 항목을 decisions(바이블)로 등록하고 대기에서 제거. (최종 등록)

import { supabase } from "@/lib/supabase";
import { logActivity } from "@/lib/activity-log";

interface PendingRow {
  id: string;
  project_id: string;
  sub_category_id: string | null;
  content: string;
  context: string | null;
  confidence: string;
  jordan_agreement: string | null;
  source_message_pair_id: string | null;
  source_session_id: string | null;
  created_by_nickname: string | null;
  created_at: string;
}

// 카테고리 라벨 맵 ("영역 > 소분류" 또는 "소분류")
async function subLabelMap(): Promise<Map<string, string>> {
  const { data } = await supabase.from("sub_categories").select("id, name_ko, area_name");
  const m = new Map<string, string>();
  for (const s of (data ?? []) as { id: string; name_ko: string; area_name: string | null }[]) {
    m.set(s.id, s.area_name ? `${s.area_name} > ${s.name_ko}` : s.name_ko);
  }
  return m;
}

// ─── GET: 대기 목록 ─────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("project_id");
    if (!projectId) return Response.json({ error: "project_id 필수" }, { status: 400 });

    const { data, error } = await supabase
      .from("pending_decisions")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as PendingRow[];
    const labels = await subLabelMap();
    const pending = rows.map(r => ({
      id: r.id,
      content: r.content,
      context: r.context,
      confidence: r.confidence,
      jordan_agreement: r.jordan_agreement ?? "neutral",
      sub_category_id: r.sub_category_id,
      sub_category_label: r.sub_category_id ? (labels.get(r.sub_category_id) ?? null) : null,
      created_at: r.created_at,
    }));
    return Response.json({ pending, count: pending.length });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ─── POST: 최종 등록 (대기 → 바이블) ──────────────────────────────────
interface RegisterItem {
  id: string;
  content?: string;
  sub_category_id?: string | null;
  confidence?: "decided" | "review" | "tentative";
}
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { items?: RegisterItem[]; nickname?: string };
    const items = body.items ?? [];
    if (items.length === 0) return Response.json({ error: "등록할 항목이 없어요" }, { status: 400 });

    const ids = items.map(i => i.id);
    const overrides = new Map(items.map(i => [i.id, i]));

    // 대기 원본 로드
    const { data: rows, error: loadErr } = await supabase
      .from("pending_decisions")
      .select("*")
      .in("id", ids);
    if (loadErr) return Response.json({ error: loadErr.message }, { status: 500 });
    const pendings = (rows ?? []) as PendingRow[];
    if (pendings.length === 0) return Response.json({ registered: 0 });

    // 바이블(decisions)로 옮길 행 — 카드/대기함에서 수정한 값(override) 우선 반영
    const toInsert = pendings.map(p => {
      const o = overrides.get(p.id);
      return {
        project_id: p.project_id,
        sub_category_id: o?.sub_category_id !== undefined ? o.sub_category_id : p.sub_category_id,
        content: (o?.content ?? p.content).trim(),
        context: p.context,
        confidence: o?.confidence ?? p.confidence,
        source_message_pair_id: p.source_message_pair_id,
        source_session_id: p.source_session_id,
        is_auto_extracted: true,
        created_by_nickname: body.nickname ?? p.created_by_nickname ?? null,
      };
    });

    const { data: inserted, error: insErr } = await supabase
      .from("decisions")
      .insert(toInsert)
      .select("id, content");
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 });

    // 등록 성공한 항목을 대기에서 제거
    const { error: delErr } = await supabase.from("pending_decisions").delete().in("id", ids);
    if (delErr) console.error("[pending] 대기 제거 실패:", delErr.message);

    // 히스토리 기록 (best-effort)
    for (const d of inserted ?? []) {
      await logActivity({
        scope: "jordan", action: "create", entity: "decision",
        title: (d.content as string).slice(0, 80),
        detail: "결정 대기 → 최종 등록",
        target_id: d.id as string, nickname: body.nickname,
      });
    }

    return Response.json({ registered: inserted?.length ?? 0 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
