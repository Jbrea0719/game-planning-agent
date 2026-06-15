"use client";

// 절대 규칙(게임 헌법) 편집 섹션 — 기획 바이블 패널 최상단에 표시.
// 바이블(가변 결정)보다 상위. 여기 등록된 규칙은 모든 답변·기획서·시안 생성 시 자동 주입된다.

import { useEffect, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const GOLD = "rgba(255,205,120,1)";
const GOLD_DIM = "rgba(255,205,120,0.5)";
const GOLD_FAINT = "rgba(255,205,120,0.12)";
const GOLD_BORDER = "rgba(255,205,120,0.4)";

interface Rule {
  id: string;
  content: string;
}

export default function AbsoluteRulesSection({ nickname }: { nickname?: string }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/absolute-rules");
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch { setRules([]); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function add() {
    const c = newContent.trim();
    if (!c) return;
    try {
      const res = await fetch("/api/absolute-rules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: c, nickname }),
      });
      const data = await res.json();
      if (data.error) { alert(`추가 실패: ${data.error}\n(테이블이 아직 없으면 마이그레이션 020을 적용하세요)`); return; }
      setNewContent(""); setAdding(false);
      await load();
    } catch (e) { alert(`추가 실패: ${String(e)}`); }
  }

  async function saveEdit(id: string) {
    const c = editContent.trim();
    if (!c) return;
    try {
      await fetch("/api/absolute-rules", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: c }),
      });
      setEditingId(null); setEditContent("");
      await load();
    } catch { /* 무시 */ }
  }

  async function remove(id: string) {
    if (!confirm("이 절대 규칙을 삭제할까요?")) return;
    try {
      await fetch("/api/absolute-rules", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setRules(prev => prev.filter(r => r.id !== id));
    } catch { /* 무시 */ }
  }

  return (
    <div className="rounded-xl p-3 mb-3" style={{ backgroundColor: GOLD_FAINT, border: `1px solid ${GOLD_BORDER}` }}>
      <div className="flex items-center justify-between mb-1.5">
        <button onClick={() => setCollapsed(c => !c)} className="flex items-center gap-1.5">
          <span className="text-sm font-bold" style={{ color: GOLD }}>⚖️ 절대 규칙 (게임 헌법)</span>
          <span className="text-[10px]" style={{ color: GOLD_DIM }}>{collapsed ? "▶" : "▼"}</span>
        </button>
        <span className="text-[10px]" style={{ color: GOLD_DIM }}>{rules.length}개</span>
      </div>
      <p className="text-[10px] mb-2" style={{ color: GOLD_DIM }}>
        바이블보다 위. 모든 답변·기획서·시안이 반드시 지키는 불변 규칙 (예: 가로형, 턴제, 다IP 콜라보).
      </p>

      {!collapsed && (
        <>
          {loading ? (
            <p className="text-[11px]" style={{ color: SILVER_DIM }}>불러오는 중...</p>
          ) : rules.length === 0 ? (
            <p className="text-[11px] mb-2" style={{ color: SILVER_DIM }}>아직 절대 규칙이 없어요. 아래에서 추가하세요.</p>
          ) : (
            <div className="space-y-1.5 mb-2">
              {rules.map((r, i) => (
                <div key={r.id} className="flex items-start gap-2 px-2 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(0,0,0,0.18)" }}>
                  {editingId === r.id ? (
                    <>
                      <input
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveEdit(r.id); if (e.key === "Escape") setEditingId(null); }}
                        autoFocus
                        className="flex-1 text-[12px] px-2 py-1 rounded outline-none"
                        style={{ backgroundColor: "rgba(0,0,0,0.4)", border: `1px solid ${GOLD_BORDER}`, color: "#e0e8f0" }}
                      />
                      <button onClick={() => saveEdit(r.id)} className="text-[10px] px-2 py-1 rounded" style={{ backgroundColor: "rgba(100,220,160,0.25)", color: "rgba(150,255,200,1)" }}>저장</button>
                      <button onClick={() => setEditingId(null)} className="text-[10px] px-2 py-1 rounded" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: SILVER_DIM }}>취소</button>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] font-bold flex-shrink-0" style={{ color: GOLD }}>{i + 1}.</span>
                      <span className="flex-1 text-[12px]" style={{ color: SILVER }}>{r.content}</span>
                      <button onClick={() => { setEditingId(r.id); setEditContent(r.content); }} className="text-[11px] flex-shrink-0" style={{ color: GOLD_DIM }} title="수정">✏️</button>
                      <button onClick={() => remove(r.id)} className="text-[11px] flex-shrink-0" style={{ color: "rgba(255,150,150,0.8)" }} title="삭제">🗑️</button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <div className="flex gap-1.5">
              <input
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") add(); if (e.key === "Escape") { setAdding(false); setNewContent(""); } }}
                autoFocus
                placeholder="예: 우리 게임은 가로형이다 / 턴제 전투다"
                className="flex-1 text-[12px] px-2 py-1.5 rounded-lg outline-none"
                style={{ backgroundColor: "rgba(0,0,0,0.3)", border: `1px solid ${GOLD_BORDER}`, color: "#e0e8f0" }}
              />
              <button onClick={add} className="text-[11px] px-3 py-1.5 rounded-lg font-bold" style={{ backgroundColor: "rgba(255,205,120,0.25)", border: `1px solid ${GOLD_BORDER}`, color: GOLD }}>추가</button>
              <button onClick={() => { setAdding(false); setNewContent(""); }} className="text-[11px] px-2 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: SILVER_DIM }}>취소</button>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="text-[11px] px-3 py-1.5 rounded-lg font-medium w-full" style={{ backgroundColor: "rgba(255,205,120,0.15)", border: `1px solid ${GOLD_BORDER}`, color: GOLD }}>
              ➕ 절대 규칙 추가
            </button>
          )}
        </>
      )}
    </div>
  );
}
