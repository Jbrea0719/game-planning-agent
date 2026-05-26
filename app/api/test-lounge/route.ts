// Jina AI Reader 본문 추출 진단
// 사용:
//   /api/test-lounge                     — 라운지·DC·나무위키·인벤 자동 테스트
//   /api/test-lounge?url=https://...     — 특정 URL 테스트

const DEFAULT_URLS = [
  "https://game.naver.com/lounge/sena_rebirth/home",
  "https://game.naver.com/lounge/sena_rebirth/board/feed",
  "https://gall.dcinside.com/mgallery/board/lists/?id=sevennightsrebirth",
  "https://namu.wiki/w/%EC%84%B8%EB%B8%90%EB%82%98%EC%9D%B4%EC%B8%A0%20%EB%A6%AC%EB%B2%84%EC%8A%A4",
  "https://www.inven.co.kr/board/sena",
];

async function jinaExtract(url: string): Promise<{ length: number; first: string; last: string } | { error: string }> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "Accept": "text/plain" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };

    const text = (await res.text()).trim();
    return {
      length: text.length,
      first: text.slice(0, 500),
      last: text.slice(-300),
    };
  } catch (e) {
    return { error: String(e) };
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  const urls = target ? [target] : DEFAULT_URLS;

  const results: Record<string, unknown> = {};
  for (const u of urls) {
    results[u] = await jinaExtract(u);
  }

  return Response.json({
    extractor: "Jina AI Reader (https://r.jina.ai)",
    instruction: "length > 1000이고 first에 실제 콘텐츠가 보이면 성공. SPA·봇 차단도 우회 가능.",
    results,
  });
}
