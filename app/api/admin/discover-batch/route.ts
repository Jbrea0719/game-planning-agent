// 일괄 도메인 발견 — 여러 게임을 한 번에 자동 발견하고 캐시에 저장
// 사용:
//   GET /api/admin/discover-batch?games=원신,니케,스타레일,에픽세븐
//   GET /api/admin/discover-batch?all=true  (REGISTERED_GAMES 전체)
//
// 검수 UI에서 호출 후 결과를 사용자가 검토 → 수동 큐레이션 승격

import { REGISTERED_GAMES } from "../../router/route";
import { ensureGameDomains } from "@/lib/domain-discovery";

// 알려진 게임 목록 (REGISTERED_GAMES와 별개로, 일괄 발견 대상 확장 가능)
// 사용자가 자주 묻는 게임 위주로 큐레이션
const KNOWN_GAMES_FOR_BATCH: { id: string; names: string[] }[] = [
  { id: "sena_rebirth", names: ["세븐나이츠 리버스", "세나리"] },
  { id: "seven_knights2", names: ["세븐나이츠2"] },
  { id: "seven_knights", names: ["세븐나이츠"] },
  { id: "afk_journey", names: ["AFK 저니", "afk journey", "AFK2"] },
  { id: "afk_arena", names: ["AFK Arena", "AFK 아레나"] },
  { id: "summoners_war", names: ["서머너즈워"] },
  { id: "nikke", names: ["승리의 여신: 니케", "니케"] },
  { id: "epic7", names: ["에픽세븐"] },
  { id: "genshin", names: ["원신"] },
  { id: "starrail", names: ["붕괴: 스타레일", "스타레일"] },
  { id: "arknights", names: ["명일방주", "아크나이츠"] },
  { id: "fgo", names: ["Fate/Grand Order", "페이트 그랜드 오더", "fgo"] },
  { id: "blue_archive", names: ["블루아카이브"] },
  { id: "eversoul", names: ["에버소울"] },
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const gamesParam = url.searchParams.get("games");
  const all = url.searchParams.get("all") === "true";
  const forceReDiscover = url.searchParams.get("force") === "true";

  let targetGames: { id: string; names: string[] }[] = [];

  if (all) {
    targetGames = KNOWN_GAMES_FOR_BATCH;
  } else if (gamesParam) {
    // 쉼표로 구분된 게임 이름들 → KNOWN_GAMES_FOR_BATCH에서 매칭
    const requested = gamesParam.split(",").map(s => s.trim()).filter(Boolean);
    for (const name of requested) {
      const lower = name.toLowerCase();
      const matched = KNOWN_GAMES_FOR_BATCH.find(g =>
        g.id === lower || g.names.some(n => n.toLowerCase() === lower)
      );
      if (matched) targetGames.push(matched);
      else targetGames.push({ id: name.toLowerCase().replace(/\s+/g, "_"), names: [name] });
    }
  } else {
    return Response.json({
      error: "쿼리 파라미터 필요",
      usage: {
        all: "/api/admin/discover-batch?all=true",
        specific: "/api/admin/discover-batch?games=원신,니케",
        force: "&force=true 추가하면 캐시 무시하고 재발견",
      },
      available_games: KNOWN_GAMES_FOR_BATCH.map(g => ({ id: g.id, name: g.names[0] })),
    }, { status: 400 });
  }

  // 순차 처리 (Claude 호출 너무 많이 동시에 안 보내기 위해)
  const results: Array<{
    game_id: string;
    game_name: string;
    source: string;
    domain_count: number;
    domains: Array<{ url: string; tier: string; note?: string }>;
    elapsed_ms: number;
    error?: string;
  }> = [];

  for (const g of targetGames) {
    const start = Date.now();
    try {
      const result = await ensureGameDomains(g.id, g.names, {
        skipManual: true,   // 자동 발견 결과를 그대로 보고 싶음
        skipCache: forceReDiscover,
      });
      results.push({
        game_id: g.id,
        game_name: g.names[0],
        source: result.source,
        domain_count: result.domains.length,
        domains: result.domains,
        elapsed_ms: Date.now() - start,
      });
    } catch (err) {
      results.push({
        game_id: g.id,
        game_name: g.names[0],
        source: "error",
        domain_count: 0,
        domains: [],
        elapsed_ms: Date.now() - start,
        error: String(err),
      });
    }
  }

  // REGISTERED_GAMES도 상태 같이 표시
  const registeredStatus = REGISTERED_GAMES.map(r => ({
    id: r.id,
    has_kb: r.has_kb,
    discovered: results.some(res => res.game_id === r.id),
  }));

  return Response.json({
    description: "일괄 도메인 발견 결과",
    total: results.length,
    results,
    registered_games_status: registeredStatus,
    next_step: "검수 후 GAME_COMMUNITIES에 추가하려면 /admin/curation 페이지 사용",
  });
}
