// UI 목업 이미지 생성 — Gemini로 생성 후 doc_images에 저장, 서빙 URL 반환
// POST { prompt, doc_id? } → { id, url }   (url = /api/img/<id>)

import { supabase } from "@/lib/supabase";
import { generateMockupImage } from "@/lib/gemini-image";

export async function POST(request: Request) {
  try {
    const { prompt, doc_id } = (await request.json()) as { prompt: string; doc_id?: string };
    if (!prompt) return Response.json({ error: "prompt 필요" }, { status: 400 });

    // Gemini 이미지 생성 (실패 시 명확한 에러)
    let img;
    try {
      img = await generateMockupImage(prompt);
    } catch (e) {
      console.error("[mockup-image] 생성 실패:", e);
      return Response.json({ error: `이미지 생성 실패: ${String(e)}` }, { status: 502 });
    }

    // DB 저장
    const { data, error } = await supabase
      .from("doc_images")
      .insert({ doc_id: doc_id ?? null, mime: img.mime, data: img.base64, prompt })
      .select("id")
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ id: data.id, url: `/api/img/${data.id}` });
  } catch (error) {
    console.error("[mockup-image] 오류:", error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
