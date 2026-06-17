"use client";

// AI 일괄 수정 (방향성 변경) — 여러 기획서를 하나의 지시로 AI가 수정.
// 1) 키워드로 대상 기획서 찾기 → 선택  2) 공통 수정 지시 입력
// 3) 기획서별 수정안 미리보기(색상 diff)  4) 확인한 것만 일괄 적용(각 자동 백업)

import { useMemo, useState } from "react";
import { diffLines, type Change } from "diff";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface Candidate { family_id: string; doc_id: string; title: string; }
interface Preview {
  doc_id: string; doc_title: string; title: string;
  original_markdown: string; revised_markdown: string;
  add: number; mod: number; del: number;
  include: boolean; expanded: boolean; applied: boolean;
}
type Seg = { kind: "add" | "mod-old" | "mod-new" | "del" | "same"; text: string };

function buildSegments(original: string, revised: string): Seg[] {
  const parts: Change[] = diffLines(original || "", revised || "");
  const segs: Seg[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], next = parts[i + 1];
    if (p.removed && next && next.added) { segs.push({ kind: "mod-old", text: p.value }); segs.push({ kind: "mod-new", text: next.value }); i++; }
    else if (p.removed) segs.push({ kind: "del", text: p.value });
    else if (p.added) segs.push({ kind: "add", text: p.value });
    else segs.push({ kind: "same", text: p.value });
  }
  return segs;
}
const STYLE: Record<Seg["kind"], React.CSSProperties> = {
  add: { backgroundColor: "rgba(80,220,120,0.16)", color: "#c8f0d0", borderLeft: "3px solid rgba(80,220,120,0.8)" },
  "mod-old": { backgroundColor: "rgba(255,200,90,0.12)", color: "#e8c98a", borderLeft: "3px solid rgba(255,200,90,0.8)", textDecoration: "line-through", opacity: 0.85 },
  "mod-new": { backgroundColor: "rgba(255,200,90,0.18)", color: "#f5e0a8", borderLeft: "3px solid rgba(255,200,90,0.9)" },
  del: { backgroundColor: "rgba(255,90,90,0.13)", color: "#f0bcbc", borderLeft: "3px solid rgba(255,90,90,0.8)", textDecoration: "line-through" },
  same: { color: "#7a8498" },
};
function countSegs(segs: Seg[]) {
  return segs.reduce((a, s) => { if (s.kind === "add") a.add++; else if (s.kind === "mod-new") a.mod++; else if (s.kind === "del") a.del++; return a; }, { add: 0, mod: 0, del: 0 });
}

export default function BulkReviseModal({
  open, projectId, nickname, onClose, onApplied,
}: {
  open: boolean; projectId: string; nickname?: string; onClose: () => void; onApplied: (n: number) => void;
}) {
  const [phase, setPhase] = useState<"select" | "preview">("select");
  const [find, setFind] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [instruction, setInstruction] = useState("");
  const [searching, setSearching] = useState(false);
  const [gen, setGen] = useState<{ done: number; total: number } | null>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [apply, setApply] = useState<{ done: number; total: number } | null>(null);

  if (!open) return null;

  async function search() {
    const f = find.trim(); if (!f || searching) return;
    setSearching(true); setCandidates(null);
    try {
      const res = await fetch("/api/design-docs/bulk-replace", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, find: f }),
      });
      const data = await res.json();
      const cs: Candidate[] = (data.matches ?? []).map((m: { family_id: string; doc_id: string; title: string }) => ({ family_id: m.family_id, doc_id: m.doc_id, title: m.title }));
      setCandidates(cs);
      setSelectedDocs(new Set(cs.map(c => c.doc_id)));
    } catch (e) { alert(`검색 실패: ${String(e)}`); } finally { setSearching(false); }
  }

  async function generate() {
    const ins = instruction.trim();
    if (!ins) { alert("수정 지시를 입력하세요."); return; }
    const docs = (candidates ?? []).filter(c => selectedDocs.has(c.doc_id));
    if (docs.length === 0) { alert("대상 기획서를 1개 이상 선택하세요."); return; }
    if (!confirm(`${docs.length}개 기획서에 대해 AI가 수정안을 생성합니다. (AI 호출 ${docs.length}회 — 비용 발생)\n진행할까요?`)) return;
    setGen({ done: 0, total: docs.length });
    const out: Preview[] = [];
    for (let i = 0; i < docs.length; i++) {
      try {
        const res = await fetch("/api/design-docs/revise", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc_id: docs[i].doc_id, instruction: ins, preview: true }),
        });
        const data = await res.json();
        if (data.success) {
          const segs = buildSegments(data.original_markdown ?? "", data.revised_markdown ?? "");
          const c = countSegs(segs);
          const changed = c.add + c.mod + c.del > 0;
          out.push({
            doc_id: docs[i].doc_id, doc_title: data.doc_title ?? docs[i].title, title: data.new_title ?? docs[i].title,
            original_markdown: data.original_markdown ?? "", revised_markdown: data.revised_markdown ?? "",
            add: c.add, mod: c.mod, del: c.del, include: changed, expanded: false, applied: false,
          });
        }
      } catch { /* 한 건 실패해도 계속 */ }
      setGen({ done: i + 1, total: docs.length });
    }
    setPreviews(out);
    setGen(null);
    setPhase("preview");
  }

  async function applyAll() {
    const targets = previews.filter(p => p.include && !p.applied);
    if (targets.length === 0) { alert("적용할 기획서를 선택하세요."); return; }
    if (!confirm(`${targets.length}개 기획서에 수정안을 적용합니다. (각 기획서는 적용 전 자동 백업)\n진행할까요?`)) return;
    setApply({ done: 0, total: targets.length });
    let ok = 0;
    for (let i = 0; i < targets.length; i++) {
      try {
        const res = await fetch("/api/design-docs/revise-from-chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc_id: targets[i].doc_id, content_markdown: targets[i].revised_markdown, title: targets[i].title, nickname, apply: true }),
        });
        const data = await res.json();
        if (res.ok && data.success) { ok++; setPreviews(prev => prev.map(p => p.doc_id === targets[i].doc_id ? { ...p, applied: true } : p)); }
      } catch { /* 계속 */ }
      setApply({ done: i + 1, total: targets.length });
    }
    setApply(null);
    onApplied(ok);
  }

  const inputStyle = { backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" } as const;
  const includeCount = previews.filter(p => p.include && !p.applied).length;

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "rgba(200,180,255,1)" }}>🤖 AI 일괄 수정 (방향성 변경)</p>
            <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>여러 기획서를 하나의 지시로 AI가 문맥에 맞게 수정 — 미리보고 적용</p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>

        {/* ── 1단계: 대상 선택 + 지시 ── */}
        {phase === "select" && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: "thin" }}>
            <div>
              <p className="text-xs font-bold mb-1.5" style={{ color: SILVER }}>① 대상 기획서 찾기 <span style={{ color: SILVER_DIM, fontWeight: 400 }}>(키워드로 관련 기획서 검색)</span></p>
              <div className="flex gap-2">
                <input value={find} onChange={e => setFind(e.target.value)} onKeyDown={e => e.key === "Enter" && search()} placeholder="예: 재화" className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={inputStyle} autoFocus />
                <button onClick={search} disabled={searching || !find.trim()} className="text-sm px-4 py-2 rounded-lg font-bold disabled:opacity-40" style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(200,225,255,1)" }}>{searching ? "..." : "🔍 찾기"}</button>
              </div>
            </div>

            {candidates !== null && (
              candidates.length === 0 ? <p className="text-xs" style={{ color: SILVER_DIM }}>"{find.trim()}" 가 들어간 기획서가 없어요.</p> : (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold" style={{ color: SILVER }}>{candidates.length}개 발견 — 수정할 기획서 선택</p>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedDocs(new Set(candidates.map(c => c.doc_id)))} className="text-[11px] px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>전체</button>
                      <button onClick={() => setSelectedDocs(new Set())} className="text-[11px] px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>해제</button>
                    </div>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {candidates.map(c => (
                      <label key={c.doc_id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${selectedDocs.has(c.doc_id) ? "rgba(100,180,255,0.4)" : SILVER_FAINT}` }}>
                        <input type="checkbox" checked={selectedDocs.has(c.doc_id)} onChange={() => setSelectedDocs(prev => { const n = new Set(prev); if (n.has(c.doc_id)) n.delete(c.doc_id); else n.add(c.doc_id); return n; })} />
                        <span className="text-xs truncate" style={{ color: SILVER }}>📄 {c.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            )}

            <div>
              <p className="text-xs font-bold mb-1.5" style={{ color: SILVER }}>② 공통 수정 지시 <span style={{ color: SILVER_DIM, fontWeight: 400 }}>(선택한 기획서 모두에 동일 적용)</span></p>
              <textarea value={instruction} onChange={e => setInstruction(e.target.value)} rows={3} placeholder="예: 재화 체계가 단일 재화에서 '루비(유료)·골드(무료)' 이중 재화로 바뀌었어. 각 기획서의 재화 사용처를 새 체계에 맞게 수정해줘." className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none" style={inputStyle} />
            </div>
          </div>
        )}

        {/* ── 2단계: 미리보기 ── */}
        {phase === "preview" && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ scrollbarWidth: "thin" }}>
            <p className="text-xs" style={{ color: SILVER_DIM }}>각 기획서의 수정안이에요. <span style={{ color: "#7ee0a0" }}>■</span>추가 <span style={{ color: "#f5d27a" }}>■</span>수정 <span style={{ color: "#f08a8a" }}>■</span>삭제. 적용할 것만 체크 후 [선택 적용].</p>
            {previews.map(p => (
              <div key={p.doc_id} className="rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${p.applied ? "rgba(100,220,160,0.5)" : SILVER_FAINT}` }}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <input type="checkbox" checked={p.include && !p.applied} disabled={p.applied} onChange={() => setPreviews(prev => prev.map(x => x.doc_id === p.doc_id ? { ...x, include: !x.include } : x))} />
                  <span className="text-xs font-bold truncate flex-1" style={{ color: SILVER }}>📄 {p.title}</span>
                  <span className="text-[10px]" style={{ color: SILVER_DIM }}>🟢{p.add} 🟡{p.mod} 🔴{p.del}</span>
                  {p.applied && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(100,220,160,0.2)", color: "rgba(150,255,200,1)" }}>적용됨</span>}
                  <button onClick={() => setPreviews(prev => prev.map(x => x.doc_id === p.doc_id ? { ...x, expanded: !x.expanded } : x))} className="text-[11px] px-2 py-0.5 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>{p.expanded ? "접기" : "변경 보기"}</button>
                </div>
                {p.expanded && (
                  <div className="px-3 pb-3 text-[11px] leading-relaxed max-h-72 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
                    {buildSegments(p.original_markdown, p.revised_markdown).filter(s => s.kind !== "same").map((s, i) => (
                      <div key={i} className="px-2 py-0.5 my-0.5 rounded" style={{ ...STYLE[s.kind], whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                        {s.kind === "mod-old" && <span className="mr-1 opacity-70">전→</span>}{s.kind === "mod-new" && <span className="mr-1 opacity-70">후→</span>}{s.text.replace(/\n$/, "")}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── 하단 ── */}
        <div className="px-5 py-3 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
          {phase === "select" ? (
            <>
              <span className="text-[11px]" style={{ color: SILVER_DIM }}>{gen ? `미리보기 생성 중... ${gen.done}/${gen.total}` : "AI 호출은 비용이 들어요 — 대상을 꼭 필요한 것만 선택하세요"}</span>
              <button onClick={generate} disabled={!!gen || !instruction.trim() || selectedDocs.size === 0} className="text-sm px-4 py-2 rounded-lg font-bold disabled:opacity-40" style={{ backgroundColor: "rgba(200,180,255,0.25)", border: "1px solid rgba(200,180,255,0.5)", color: "rgba(220,200,255,1)" }}>
                {gen ? `생성 중 ${gen.done}/${gen.total}` : `🤖 수정안 미리보기 (${selectedDocs.size}개)`}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setPhase("select")} disabled={!!apply} className="text-xs px-3 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>← 다시 선택</button>
              <button onClick={applyAll} disabled={!!apply || includeCount === 0} className="text-sm px-4 py-2 rounded-lg font-bold disabled:opacity-40" style={{ backgroundColor: "rgba(100,220,160,0.25)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}>
                {apply ? `적용 중 ${apply.done}/${apply.total}` : `✓ ${includeCount}개 적용 (자동 백업)`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
