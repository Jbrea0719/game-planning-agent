// 레퍼런스 갤러리 (Feature J)
// 참고 게임 화면 스크린샷을 종류별 라벨로 보관 → "이런 느낌" 선택 시 분석 근거로 첨부.
//
// 저장: 기존 doc_images 테이블 재사용(마이그레이션 불필요).
//   doc_id = "refshot", prompt = JSON({category, game, label, note})
//   이미지는 기존 /api/img/<id> 라우트로 서빙.

import { supabase } from "@/lib/supabase";

const ALLOWED_MIME = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const REF_DOC_ID = "refshot";

interface RefMeta {
  category: string;
  game: string;
  label: string;
  note: string;
}

function parseMeta(prompt: string | null): RefMeta {
  try {
    const o = JSON.parse(prompt ?? "{}");
    return {
      category: typeof o.category === "string" ? o.category : "기타",
      game: typeof o.game === "string" ? o.game : "",
      label: typeof o.label === "string" ? o.label : "",
      note: typeof o.note === "string" ? o.note : "",
    };
  } catch {
    return { category: "기타", game: "", label: "", note: "" };
  }
}

// ── 목록 ─────────────────────────────────────────────
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("doc_images")
      .select("id, prompt, created_at")
      .eq("doc_id", REF_DOC_ID)
      .order("created_at", { ascending: false });
    if (error) {
      // 테이블/컬럼 문제 시에도 앱이 죽지 않게 빈 목록
      console.error("[reference-shots] 목록 실패:", error.message);
      return Response.json({ shots: [] });
    }
    const shots = (data ?? []).map(r => {
      const m = parseMeta(r.prompt as string | null);
      return { id: r.id as string, url: `/api/img/${r.id}`, ...m };
    });
    return Response.json({ shots });
  } catch (err) {
    return Response.json({ shots: [], error: String(err) });
  }
}

// ── 추가 ─────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const { mime, data, category, game, label, note } = (await request.json()) as {
      mime: string;
      data: string;
      category?: string;
      game?: string;
      label?: string;
      note?: string;
    };
    if (!data || !mime) return Response.json({ error: "mime·data 필수" }, { status: 400 });
    if (!ALLOWED_MIME.includes(mime)) return Response.json({ error: `지원하지 않는 형식: ${mime}` }, { status: 400 });
    if (data.length > 7_000_000) return Response.json({ error: "이미지가 너무 큽니다 (최대 약 5MB)" }, { status: 413 });

    const meta: RefMeta = {
      category: category?.trim() || "기타",
      game: game?.trim() || "",
      label: label?.trim() || "",
      note: note?.trim() || "",
    };
    const { data: row, error } = await supabase
      .from("doc_images")
      .insert({ doc_id: REF_DOC_ID, mime, data, prompt: JSON.stringify(meta) })
      .select("id")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ id: row.id, url: `/api/img/${row.id}`, ...meta });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ── 삭제 ─────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const { id } = (await request.json()) as { id?: string };
    if (!id) return Response.json({ error: "id 필수" }, { status: 400 });
    const { error } = await supabase.from("doc_images").delete().eq("id", id).eq("doc_id", REF_DOC_ID);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
