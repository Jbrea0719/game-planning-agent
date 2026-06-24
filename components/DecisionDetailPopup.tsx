"use client";

// 결정사항 [상세] 팝업 — 짧은 결정이 어떤 대화에서 나왔는지 전후 맥락을 보여줌.
// /api/decisions/source 에서 추출 근거(context) + 원본 대화 페어 앞뒤 턴을 받아 표시.

import { useEffect, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.55)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface Turn { pair_id: string; user: string; assistant: string; is_target: boolean }
interface SourceData {
  content: string; context: string | null; confidence: string;
  nickname: string | null; found: boolean; turns: Turn[];
}

// 답변 본문에 섞인 내부 마커 제거 (사람이 읽게)
function cleanAssistant(t: string): string {
  let s = t || "";
  const i = s.indexOf("__JORDAN_ANSWER_START__");
  if (i !== -1) s = s.slice(i + "__JORDAN_ANSWER_START__".length);
  s = s
    .replace(/__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__/g, "")
    .replace(/__DECISIONS_DATA__[\s\S]*?__END__/g, "")
    .replace(/__BIBLE_CONFLICTS__[\s\S]*?__END__/g, "")
    .replace(/__DECISIONS_(?:EXTRACTED|HELD)__\d+/g, "")
    .replace(/__(?:DECISIONS_DATA|DECISIONS_HELD|DECISIONS_EXTRACTED|BIBLE_CONFLICTS|JORDAN_CRITIC_START)__[\s\S]*$/, "")
    .replace(/__TRUNCATED__/g, "");
  return s.trim();
}

export default function DecisionDetailPopup({ decisionId, onClose }: { decisionId: string; onClose: () => void }) {
  const [data, setData] = useState<SourceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/decisions/source?id=${decisionId}`)
      .then(r => r.json())
      .then(d => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [decisionId]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div data-modal="detail" className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)" }} onClick={onClose}>
      <div
        className="flex flex-col rounded-2xl shadow-2xl"
        style={{ width: "min(560px, 96vw)", maxHeight: "85vh", backgroundColor: "#0d1320", border: `1px solid ${SILVER_FAINT}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 — 결정 내용 */}
        <div className="px-4 py-3 flex items-start justify-between gap-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div className="min-w-0">
            <p className="text-[11px] mb-1" style={{ color: SILVER_DIM }}>🔍 결정 상세 — 이 결정이 나온 대화 맥락</p>
            <p className="text-sm font-bold" style={{ color: "#e8eef6", lineHeight: 1.45 }}>{data?.content ?? "…"}</p>
          </div>
          <button onClick={onClose} className="text-xs px-2.5 py-1 rounded flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin" }}>
          {loading && <p className="text-xs text-center py-8" style={{ color: SILVER_DIM }}>불러오는 중…</p>}

          {!loading && data && (
            <>
              {/* 추출 근거 */}
              {data.context && (
                <div className="mb-3 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(100,180,255,0.07)", border: "1px solid rgba(100,180,255,0.25)" }}>
                  <p className="text-[10px] mb-0.5" style={{ color: "var(--accent-2)" }}>💡 판단 근거</p>
                  <p className="text-xs" style={{ color: SILVER, lineHeight: 1.5 }}>{data.context}</p>
                </div>
              )}

              {/* 전후 대화 */}
              {data.found && data.turns.length > 0 ? (
                <>
                  <p className="text-[10px] mb-2" style={{ color: SILVER_DIM }}>📜 원본 대화 (★ = 이 결정이 나온 지점)</p>
                  <div className="flex flex-col gap-2.5">
                    {data.turns.map(t => {
                      const a = cleanAssistant(t.assistant);
                      return (
                        <div
                          key={t.pair_id}
                          className="rounded-lg px-3 py-2"
                          style={t.is_target
                            ? { backgroundColor: "rgba(255,200,100,0.08)", border: "1px solid rgba(255,200,100,0.45)" }
                            : { backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}
                        >
                          {t.is_target && <p className="text-[10px] mb-1 font-bold" style={{ color: "rgba(255,220,150,1)" }}>★ 이 대화에서 결정됨</p>}
                          {t.user && (
                            <p className="text-xs mb-1.5" style={{ color: "#dbe4f0", lineHeight: 1.5 }}>
                              <span style={{ color: SILVER_DIM }}>🙋 </span>{t.user.length > 600 ? t.user.slice(0, 600) + "…" : t.user}
                            </p>
                          )}
                          {a && (
                            <p className="text-xs" style={{ color: "#c4d0e0", lineHeight: 1.5 }}>
                              <span style={{ color: SILVER_DIM }}>🤖 </span>{a.length > 1200 ? a.slice(0, 1200) + "…" : a}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <p className="text-xs text-center py-6 leading-relaxed" style={{ color: SILVER_DIM }}>
                  이 결정에는 연결된 원본 대화 정보가 없어요.<br />
                  (직접 추가했거나 출처가 저장되기 전에 만들어진 항목)
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
