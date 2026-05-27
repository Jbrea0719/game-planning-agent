"use client";

import { useState, useEffect } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface DiscoveredDomain {
  url: string;
  tier: "official" | "press" | "wiki" | "community";
  note?: string;
}

interface GameResult {
  game_id: string;
  game_name: string;
  source: string;
  domain_count: number;
  domains: DiscoveredDomain[];
  elapsed_ms: number;
  error?: string;
}

interface BatchResponse {
  total?: number;
  results?: GameResult[];
  available_games?: Array<{ id: string; name: string }>;
}

export default function CurationPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GameResult[]>([]);
  const [availableGames, setAvailableGames] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [editedDomains, setEditedDomains] = useState<Record<string, DiscoveredDomain[]>>({});
  const [forceMode, setForceMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 첫 로드 시 사용 가능한 게임 목록 조회
  useEffect(() => {
    fetch("/api/admin/discover-batch")
      .then(r => r.json())
      .then((data: BatchResponse) => {
        if (data.available_games) setAvailableGames(data.available_games);
      })
      .catch(() => {});
  }, []);

  async function runDiscovery() {
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const gamesParam = Array.from(selectedGames).join(",");
      const url = gamesParam
        ? `/api/admin/discover-batch?games=${encodeURIComponent(gamesParam)}${forceMode ? "&force=true" : ""}`
        : `/api/admin/discover-batch?all=true${forceMode ? "&force=true" : ""}`;
      const res = await fetch(url);
      const data: BatchResponse = await res.json();
      if (data.results) {
        setResults(data.results);
        // 편집 가능한 도메인 상태 초기화
        const initialEdits: Record<string, DiscoveredDomain[]> = {};
        for (const r of data.results) {
          initialEdits[r.game_id] = [...r.domains];
        }
        setEditedDomains(initialEdits);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleDomain(gameId: string, index: number) {
    setEditedDomains(prev => {
      const next = { ...prev };
      const list = [...(next[gameId] || [])];
      list.splice(index, 1);
      next[gameId] = list;
      return next;
    });
  }

  function copyAsCurationCode(result: GameResult) {
    const domains = editedDomains[result.game_id] || result.domains;
    const filters = domains.map(d => `      "${d.url}",`).join("\n");
    const dcGalleryUrl = domains.find(d => d.url.includes("dcinside") && d.url.includes("id="));
    const dcId = dcGalleryUrl?.url.match(/id=([^&]+)/)?.[1];

    const code = `  "${result.game_id}": {
    officialDomains: ["game.naver.com", "inven.co.kr", "cafe.naver.com"],
    officialUrlFilters: [
${filters}
    ],${dcId ? `\n    dcGalleryId: "${dcId}",` : ""}
  },`;
    navigator.clipboard.writeText(code);
    alert(`${result.game_name} 큐레이션 코드 복사됨!\n\nGAME_COMMUNITIES (app/api/agent/route.ts)에 붙여넣으세요.`);
  }

  return (
    <div className="min-h-screen text-white p-6" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1525 50%, #0a1020 100%)" }}>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-4" style={{ color: SILVER }}>🎮 게임 도메인 큐레이션</h1>
        <p className="text-sm mb-6" style={{ color: SILVER_DIM }}>
          알려진 게임들에 대해 자동 도메인 발견을 수행하고, 결과를 검수해 GAME_COMMUNITIES 코드로 변환합니다.
        </p>

        {/* 게임 선택 패널 */}
        <div className="mb-4 p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
          <p className="text-sm font-medium mb-3" style={{ color: SILVER }}>
            대상 게임 선택 (전체 비우면 모두)
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {availableGames.map(g => (
              <button
                key={g.id}
                onClick={() => {
                  setSelectedGames(prev => {
                    const next = new Set(prev);
                    if (next.has(g.name)) next.delete(g.name); else next.add(g.name);
                    return next;
                  });
                }}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{
                  backgroundColor: selectedGames.has(g.name) ? "rgba(100,180,255,0.2)" : "transparent",
                  border: `1px solid ${selectedGames.has(g.name) ? "rgba(100,180,255,0.6)" : SILVER_FAINT}`,
                  color: selectedGames.has(g.name) ? "rgba(180,210,255,1)" : SILVER,
                }}
              >
                {g.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs flex items-center gap-2 cursor-pointer" style={{ color: SILVER_DIM }}>
              <input type="checkbox" checked={forceMode} onChange={e => setForceMode(e.target.checked)} />
              캐시 무시하고 재발견 (force)
            </label>
            <button
              onClick={runDiscovery}
              disabled={loading}
              className="text-sm px-4 py-2 rounded-lg font-medium"
              style={{
                backgroundColor: loading ? SILVER_FAINT : "rgba(100,180,255,0.25)",
                border: `1px solid ${loading ? SILVER_FAINT : "rgba(100,180,255,0.7)"}`,
                color: loading ? SILVER_DIM : "rgba(180,220,255,1)",
              }}
            >
              {loading ? "🔍 발견 중... (게임당 5~15초)" : "🚀 자동 발견 시작"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "rgba(255,100,100,0.1)", border: "1px solid rgba(255,100,100,0.3)", color: "rgba(255,180,180,1)" }}>
            ❌ {error}
          </div>
        )}

        {/* 결과 카드들 */}
        <div className="flex flex-col gap-4">
          {results.map(r => (
            <div key={r.game_id} className="p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold" style={{ color: SILVER }}>{r.game_name}</h2>
                  <span className="text-xs px-2 py-0.5 rounded" style={{
                    backgroundColor: r.source === "manual" ? "rgba(100,220,160,0.15)"
                                  : r.source === "cache" ? "rgba(150,180,255,0.15)"
                                  : r.source === "auto" ? "rgba(255,200,100,0.15)"
                                  : "rgba(255,100,100,0.15)",
                    color: r.source === "manual" ? "rgba(150,255,200,1)"
                         : r.source === "cache" ? "rgba(180,210,255,1)"
                         : r.source === "auto" ? "rgba(255,220,150,1)"
                         : "rgba(255,180,180,1)",
                  }}>
                    {r.source} ({r.elapsed_ms}ms)
                  </span>
                  <span className="text-xs" style={{ color: SILVER_DIM }}>id: {r.game_id}</span>
                </div>
                {r.domains.length > 0 && (
                  <button
                    onClick={() => copyAsCurationCode(r)}
                    className="text-xs px-3 py-1 rounded-lg"
                    style={{ backgroundColor: "rgba(100,220,160,0.15)", border: "1px solid rgba(100,220,160,0.4)", color: "rgba(150,255,200,1)" }}
                  >
                    📋 큐레이션 코드 복사
                  </button>
                )}
              </div>

              {r.error && (
                <p className="text-sm" style={{ color: "rgba(255,180,180,1)" }}>오류: {r.error}</p>
              )}

              {(editedDomains[r.game_id] || []).length === 0 ? (
                <p className="text-sm" style={{ color: SILVER_DIM }}>발견된 도메인 없음</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(editedDomains[r.game_id] || []).map((d, idx) => (
                    <div key={`${r.game_id}-${idx}`} className="flex items-start gap-2 p-2 rounded" style={{ backgroundColor: "rgba(0,0,0,0.2)" }}>
                      <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5" style={{
                        backgroundColor:
                          d.tier === "official" ? "rgba(100,220,160,0.15)" :
                          d.tier === "press" ? "rgba(150,180,255,0.15)" :
                          d.tier === "wiki" ? "rgba(255,200,100,0.15)" :
                          "rgba(192,200,216,0.15)",
                        color:
                          d.tier === "official" ? "rgba(150,255,200,1)" :
                          d.tier === "press" ? "rgba(180,210,255,1)" :
                          d.tier === "wiki" ? "rgba(255,220,150,1)" :
                          SILVER,
                      }}>
                        {d.tier}
                      </span>
                      <div className="flex-1 min-w-0">
                        <a href={d.url.startsWith("http") ? d.url : `https://${d.url}`} target="_blank" rel="noopener noreferrer"
                           className="text-xs break-all hover:underline" style={{ color: SILVER }}>
                          {d.url}
                        </a>
                        {d.note && <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>{d.note}</p>}
                      </div>
                      <button
                        onClick={() => toggleDomain(r.game_id, idx)}
                        className="text-xs w-5 h-5 rounded flex-shrink-0"
                        title="이 도메인 제거"
                        style={{ color: "rgba(255,180,180,0.7)" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 rounded-xl text-sm" style={{ backgroundColor: "rgba(100,180,255,0.05)", border: "1px solid rgba(100,180,255,0.2)", color: SILVER_DIM }}>
          <p className="font-medium mb-2" style={{ color: "rgba(180,210,255,1)" }}>💡 사용 방법</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>위에서 검수하고 싶은 게임 선택 (또는 비워두면 전체)</li>
            <li><b>🚀 자동 발견 시작</b> 클릭 (게임당 5~15초 소요)</li>
            <li>결과 카드에서 잘못된 도메인은 <b>✕</b> 클릭해 제거</li>
            <li><b>📋 큐레이션 코드 복사</b> 클릭 → 클립보드에 코드 복사됨</li>
            <li><code>app/api/agent/route.ts</code>의 GAME_COMMUNITIES에 붙여넣기</li>
            <li>git push → 배포 → 해당 게임 질문은 이제 검증된 도메인으로 답변</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
