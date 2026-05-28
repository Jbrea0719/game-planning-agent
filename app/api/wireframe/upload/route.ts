// 와이어프레임 PNG 업로드 API
// POST /api/wireframe/upload { dataUrl, title }
//   → Supabase Storage(wireframes 버킷)에 업로드 → public URL 반환

import { supabase } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const { dataUrl, title } = (await request.json()) as {
      dataUrl: string;
      title: string;
    };

    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      return Response.json({ error: "유효한 이미지 데이터 필요" }, { status: 400 });
    }

    // data URL → Buffer
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return Response.json({ error: "data URL 파싱 실패" }, { status: 400 });
    const mime = match[1];
    const ext = mime.split("/")[1] || "png";
    const base64 = match[2];
    const buffer = Buffer.from(base64, "base64");

    // 파일 이름: {제목}_{타임스탬프}.{ext}
    // Supabase Storage 키는 ASCII만 허용 → 한글·특수문자 모두 _ 로 변환
    const safeName = (title || "wireframe")
      .replace(/[^a-zA-Z0-9_-]/g, "_")  // ASCII 영문·숫자·_- 만 허용, 나머지는 _
      .replace(/_+/g, "_")              // 연속된 _ 하나로 압축
      .replace(/^_|_$/g, "")            // 양쪽 끝 _ 제거
      .slice(0, 40) || "wireframe";
    const filename = `${safeName}_${Date.now()}.${ext}`;
    const path = `${new Date().toISOString().split("T")[0]}/${filename}`;

    const { error } = await supabase.storage
      .from("wireframes")
      .upload(path, buffer, {
        contentType: mime,
        cacheControl: "31536000",  // 1년 캐시
        upsert: false,
      });

    if (error) {
      console.error("[wireframe/upload] 실패:", error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // public URL
    const { data: urlData } = supabase.storage.from("wireframes").getPublicUrl(path);
    return Response.json({
      success: true,
      url: urlData.publicUrl,
      path,
      filename,
    });
  } catch (err) {
    console.error("[wireframe/upload] 오류:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
