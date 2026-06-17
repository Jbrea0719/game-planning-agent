"use client";

// 용어 일괄 변경 — 여러 기획서에서 단어를 한 번에 찾아 바꾸기.
// 1) 찾을 단어 입력 → 영향받는 기획서·매칭 수·스니펫 미리보기
// 2) 바꿀 단어 입력 + 기획서 선택 → 일괄 적용 (각 기획서 본문·제목 in-place 수정)

import { useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface Match {
  family_id: string;
  doc_id: string;
  title: string;
  content_count: number;
  title_count: number;
  snippets: string[];
}

export default function BulkReplaceModal({
  open, projectId, nickname, onClose, onApplied,
}: {
  open: boolean;
  projectId: string;
  nickname?: string;
  onClose: () => void;
  onApplied: (updated: number) => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState(false);

  if (!open) return null;

  async function search() {
    const f = find.trim();
    if (!f || searching) return;
    setSearching(true);
    setMatches(null);
    try {
      const res = await fetch("/api/design-docs/bulk-replace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, find: f }),
      });
      const data = await res.json();
      if (data.error) { alert(`검색 실패: ${data.error}`); return; }
      const ms: Match[] = data.matches ?? [];
      setMatches(ms);
      setTotal(data.total ?? 0);
      setSelected(new Set(ms.map(m => m.family_id)));  // 기본 전체 선택
    } catch (e) { alert(`검색 실패: ${String(e)}`); } finally { setSearching(false); }
  }

  function toggle(fid: string) {
    setSelected(prev => { const n = new Set(prev); if (n.has(fid)) n.delete(fid); else n.add(fid); return n; });
  }

  async function apply() {
    const f = find.trim();
    if (!f || applying || !matches) return;
    if (selected.size === 0) { alert("적용할 기획서를 1개 이상 선택하세요."); return; }
    if (!confirm(`선택한 ${selected.size}개 기획서에서\n"${f}" → "${replace}"\n로 일괄 변경합니다. 진행할까요?`)) return;
    setApplying(true);
    try {
      const res = await fetch("/api/design-docs/bulk-replace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, find: f, replace, apply: true, family_ids: [...selected], nickname }),
      });
      const data = await res.json();
      if (data.error) { alert(`적용 실패: ${data.error}`); return; }
      onApplied(data.updated ?? 0);
    } catch (e) { alert(`적용 실패: ${String(e)}`); } finally { setApplying(false); }
  }

  const inputStyle = { backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" } as const;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }} onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "rgba(180,210,255,1)" }}>🔧 용어 일괄 변경</p>
            <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>여러 기획서의 단어를 한 번에 찾아 바꿉니다 (예: 재화 이름 변경)</p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: "thin" }}>
          {/* 찾기 */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <p className="text-xs font-bold mb-1.5" style={{ color: SILVER }}>찾을 단어</p>
              <input value={find} onChange={e => setFind(e.target.value)} onKeyDown={e => e.key === "Enter" && search()}
                placeholder="예: 루비" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} autoFocus />
            </div>
            <button onClick={search} disabled={searching || !find.trim()} className="text-sm px-4 py-2 rounded-lg font-bold disabled:opacity-40"
              style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(200,225,255,1)" }}>
              {searching ? "찾는 중..." : "🔍 찾기"}
            </button>
          </div>

          {/* 결과 */}
          {matches !== null && (
            matches.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: SILVER_DIM }}>"{find.trim()}" 가 들어간 기획서가 없어요.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: SILVER }}><b style={{ color: "rgba(180,210,255,1)" }}>{matches.length}개</b> 기획서 · 총 <b>{total}곳</b> 발견</p>
                  <div className="flex gap-2">
                    <button onClick={() => setSelected(new Set(matches.map(m => m.family_id)))} className="text-[11px] px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>전체 선택</button>
                    <button onClick={() => setSelected(new Set())} className="text-[11px] px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>전체 해제</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {matches.map(m => (
                    <label key={m.family_id} className="flex gap-2.5 p-2.5 rounded-xl cursor-pointer" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${selected.has(m.family_id) ? "rgba(100,180,255,0.5)" : SILVER_FAINT}` }}>
                      <input type="checkbox" checked={selected.has(m.family_id)} onChange={() => toggle(m.family_id)} className="mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: SILVER }}>📄 {m.title}
                          <span className="ml-1.5 font-normal" style={{ color: SILVER_DIM }}>
                            {m.content_count > 0 && `본문 ${m.content_count}곳`}{m.title_count > 0 && `${m.content_count > 0 ? " · " : ""}제목 ${m.title_count}곳`}
                          </span>
                        </p>
                        {m.snippets.map((s, i) => (
                          <p key={i} className="text-[11px] mt-1 leading-snug" style={{ color: SILVER_DIM }}>{s}</p>
                        ))}
                      </div>
                    </label>
                  ))}
                </div>

                {/* 바꾸기 */}
                <div className="pt-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
                  <p className="text-xs font-bold mb-1.5" style={{ color: SILVER }}>바꿀 단어</p>
                  <input value={replace} onChange={e => setReplace(e.target.value)} placeholder="예: 보석 (비우면 삭제됨)" className="w-full px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} />
                </div>
              </>
            )
          )}
        </div>

        {/* 하단 */}
        {matches !== null && matches.length > 0 && (
          <div className="px-5 py-3 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
            <p className="text-[11px]" style={{ color: SILVER_DIM }}>선택한 {selected.size}개 기획서에 적용 · 미리 백업은 없으니 확인 후 진행</p>
            <button onClick={apply} disabled={applying || selected.size === 0} className="text-sm px-4 py-2 rounded-lg font-bold disabled:opacity-40"
              style={{ backgroundColor: "rgba(100,220,160,0.25)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}>
              {applying ? "적용 중..." : `🔧 ${selected.size}개에 일괄 적용`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
