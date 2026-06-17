// 기획서별 레퍼런스 이미지 — 정민님이 참고/예상결과 이미지를 기획서에 모아두는 기능.
//
// 저장: 기존 doc_images 테이블 재사용(마이그레이션 불필요).
//   doc_id = "refdoc:<doc_family_id>"  (버전 무관 안정 키 — 댓글과 동일 원칙. 본문 자동이미지와 안 섞임)
//   prompt = JSON({ comment, order })   (자유 코멘트 + 정렬 순서)
//   이미지는 기존 /api/img/<id> 라우트로 서빙.

import { supabase } from "@/lib/supabase";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const PREFIX = "refdoc:";

const docKey = (familyId: string) => `${PREFIX}${familyId}`;

function parseMeta(prompt: string | null): { comment: string; order: number } {
  try {
    const o = JSON.parse(prompt ?? "{}");
    return {
      comment: typeof o.comment === "string" ? o.comment : "",
      order: typeof o.order === "number" ? o.order : 0,
    };
  } catch {
    return { comment: "", order: 0 };
  }
}

// ── 목록 (GET ?family_id=...) — order 오름차순, 동률은 생성순 ──────
export async function GET(request: Request) {
  try {
    const familyId = new URL(request.url).searchParams.get("family_id")?.trim();
    if (!familyId) return Response.json({ images: [] });
    const { data, error } = await supabase
      .from("doc_images")
      .select("id, prompt, created_at")
      .eq("doc_id", docKey(familyId))
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[reference-images] 목록 실패:", error.message);
      return Response.json({ images: [] });
    }
    const images = (data ?? [])
      .map((r, i) => {
        const m = parseMeta(r.prompt as string | null);
        return { id: r.id as string, url: `/api/img/${r.id}`, comment: m.comment, _order: m.order, _seq: i };
      })
      .sort((a, b) => (a._order - b._order) || (a._seq - b._seq))
      .map(({ id, url, comment }) => ({ id, url, comment }));
    return Response.json({ images });
  } catch (err) {
    return Response.json({ images: [], error: String(err) });
  }
}

// ── 추가 (POST {family_id, mime, data, comment}) ─────────────────
export async function POST(request: Request) {
  try {
    const { family_id, mime, data, comment } = (await request.json()) as {
      family_id?: string; mime?: string; data?: string; comment?: string;
    };
    if (!family_id) return Response.json({ error: "family_id 필수" }, { status: 400 });
    if (!data || !mime) return Response.json({ error: "mime·data 필수" }, { status: 400 });
    if (!ALLOWED_MIME.includes(mime)) return Response.json({ error: `지원하지 않는 형식: ${mime}` }, { status: 400 });
    if (data.length > 7_000_000) return Response.json({ error: "이미지가 너무 큽니다 (최대 약 5MB)" }, { status: 413 });

    const meta = { comment: comment?.trim() || "", order: Date.now() };  // 새 이미지는 맨 뒤
    const { data: row, error } = await supabase
      .from("doc_images")
      .insert({ doc_id: docKey(family_id), mime, data, prompt: JSON.stringify(meta) })
      .select("id")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ id: row.id, url: `/api/img/${row.id}`, comment: meta.comment });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ── 코멘트 수정 (PATCH {id, comment}) — 순서(order)는 보존 ────────
export async function PATCH(request: Request) {
  try {
    const { id, comment } = (await request.json()) as { id?: string; comment?: string };
    if (!id) return Response.json({ error: "id 필수" }, { status: 400 });
    const { data: cur } = await supabase.from("doc_images").select("prompt").eq("id", id).maybeSingle();
    const order = parseMeta((cur?.prompt as string | null) ?? null).order;
    const { error } = await supabase
      .from("doc_images")
      .update({ prompt: JSON.stringify({ comment: comment?.trim() || "", order }) })
      .eq("id", id)
      .like("doc_id", `${PREFIX}%`);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ── 순서 재정렬 (PUT {ordered_ids: string[]}) — 코멘트 보존 ───────
export async function PUT(request: Request) {
  try {
    const { ordered_ids } = (await request.json()) as { ordered_ids?: string[] };
    if (!Array.isArray(ordered_ids) || ordered_ids.length === 0) return Response.json({ error: "ordered_ids 필수" }, { status: 400 });
    // 기존 코멘트 보존을 위해 한 번에 조회
    const { data } = await supabase.from("doc_images").select("id, prompt").in("id", ordered_ids).like("doc_id", `${PREFIX}%`);
    const byId = new Map((data ?? []).map(r => [r.id as string, parseMeta(r.prompt as string | null)]));
    await Promise.all(ordered_ids.map((id, i) => {
      const comment = byId.get(id)?.comment ?? "";
      return supabase.from("doc_images").update({ prompt: JSON.stringify({ comment, order: i }) }).eq("id", id).like("doc_id", `${PREFIX}%`);
    }));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ── 삭제 (DELETE {id}) ───────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const { id } = (await request.json()) as { id?: string };
    if (!id) return Response.json({ error: "id 필수" }, { status: 400 });
    const { error } = await supabase.from("doc_images").delete().eq("id", id).like("doc_id", `${PREFIX}%`);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
