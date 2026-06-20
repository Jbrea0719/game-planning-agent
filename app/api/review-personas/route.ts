// 기획서 검토자(커스텀 페르소나) CRUD
//   GET    /api/review-personas?project_id=...   → 목록(최신 sort_order/생성순)
//   POST   /api/review-personas                  → 생성
//   PATCH  /api/review-personas                  → 수정 {id, ...필드}
//   DELETE /api/review-personas?id=...           → 삭제
// 프리셋은 코드(lib/review-personas.ts)에 있고, 여기엔 사용자 정의분만 저장.

import { supabase } from "@/lib/supabase";

const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

interface PersonaBody {
  id?: string;
  name?: string;
  emoji?: string;
  identity?: string;
  perspective?: string;
  tone?: string;
  strictness?: number;
  knowledge?: { bible: boolean; rules: boolean; refgames: boolean; expertise: string };
  focus?: string[];
  avoid?: string[];
  nickname?: string;
  project_id?: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const { data, error } = await supabase
    .from("review_personas")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ personas: data ?? [] });
}

export async function POST(request: Request) {
  try {
    const b = (await request.json()) as PersonaBody;
    if (!b.name?.trim()) return Response.json({ error: "이름을 입력하세요" }, { status: 400 });
    const { data, error } = await supabase
      .from("review_personas")
      .insert({
        project_id: b.project_id ?? DEFAULT_PROJECT_ID,
        name: b.name.trim(),
        emoji: b.emoji || "🧐",
        identity: b.identity ?? "",
        perspective: b.perspective ?? "",
        tone: b.tone ?? "",
        strictness: typeof b.strictness === "number" ? b.strictness : 3,
        knowledge: b.knowledge ?? { bible: true, rules: true, refgames: true, expertise: "" },
        focus_points: Array.isArray(b.focus) ? b.focus : [],
        avoid_points: Array.isArray(b.avoid) ? b.avoid : [],
        created_by_nickname: b.nickname ?? null,
      })
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ persona: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const b = (await request.json()) as PersonaBody;
    if (!b.id) return Response.json({ error: "id 필수" }, { status: 400 });
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const k of ["name", "emoji", "identity", "perspective", "tone", "strictness", "knowledge"] as const) {
      if (b[k] !== undefined) patch[k] = b[k];
    }
    if (b.focus !== undefined) patch.focus_points = Array.isArray(b.focus) ? b.focus : [];
    if (b.avoid !== undefined) patch.avoid_points = Array.isArray(b.avoid) ? b.avoid : [];
    const { data, error } = await supabase
      .from("review_personas")
      .update(patch)
      .eq("id", b.id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ persona: data });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return Response.json({ error: "id 필수" }, { status: 400 });
  const { error } = await supabase.from("review_personas").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
