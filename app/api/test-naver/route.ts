// 네이버 검색 진단 엔드포인트
// 사용: /api/test-naver?q=세나리+5월+업데이트&filter=game.naver.com
// 또는: /api/test-naver?q=세나리+업데이트  (필터 없이)

type NaverItem = { title: string; link: string; description: string; postdate?: string };

function strip(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/g, " ").trim();
}

async function fetchType(query: string, type: string, clientId: string, clientSecret: string): Promise<NaverItem[]> {
  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=15&sort=sim`,
      { headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "세나리 업데이트";
  const filter = url.searchParams.get("filter") ?? "";

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ error: "NAVER 키 미설정" }, { status: 500 });
  }

  // 3개 타입 병렬 검색
  const [webkr, cafe, news] = await Promise.all([
    fetchType(query, "webkr", clientId, clientSecret),
    fetchType(query, "cafearticle", clientId, clientSecret),
    fetchType(query, "news", clientId, clientSecret),
  ]);

  const format = (items: NaverItem[]) => {
    const filtered = filter
      ? items.filter(i => i.link.toLowerCase().includes(filter.toLowerCase()))
      : items;
    return {
      total_returned: items.length,
      after_filter: filtered.length,
      items: filtered.slice(0, 5).map(i => ({
        title: strip(i.title),
        url: i.link,
        description: strip(i.description).slice(0, 200),
        postdate: i.postdate,
      })),
    };
  };

  return Response.json({
    query,
    filter: filter || "(없음 — 모든 결과)",
    webkr: format(webkr),
    cafearticle: format(cafe),
    news: format(news),
  });
}
