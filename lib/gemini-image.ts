// Google Gemini 이미지 생성 (UI 목업용)
// 환경변수 GEMINI_API_KEY 필요. 모델: gemini-2.5-flash-image (이미지 생성, "Nano Banana")
// 반환: { base64, mime } — 호출측에서 DB(doc_images)에 저장 후 URL로 본문에 삽입

const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export type GeneratedImage = { base64: string; mime: string };

export async function generateMockupImage(prompt: string): Promise<GeneratedImage> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 미설정");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Generate a single game UI mockup image. ${prompt}` }] }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    if (p?.inlineData?.data) {
      return { base64: p.inlineData.data, mime: p.inlineData.mimeType ?? "image/png" };
    }
  }
  throw new Error("Gemini 응답에 이미지 없음");
}
