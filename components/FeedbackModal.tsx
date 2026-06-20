"use client";

// 기획서 피드백 받기 — 검토자 선택(단일/패널) → 항목화 피드백 → 항목별 반영방식·메모·상의 → 선택 반영(미리보기).
//   반영은 기존 /revise(preview) + DocRevisePreview(색상 미리보기·적용) 재사용.

import { useEffect, useMemo, useState } from "react";
import { PRESET_PERSONAS, rowToPersona, APPLY_MODES, type Persona, type ApplyModeKey } from "@/lib/review-personas";
import PersonaManager from "./PersonaManager";
import DocRevisePreview, { type RevisePreview } from "./DocRevisePreview";

interface FeedbackItem {
  title: string; type: string; severity: string;
  rationale: string; suggestion: string; suggested_mode: string; section?: string;
}
interface ReviewerResult {
  persona: { id: string; name: string; emoji: string };
  items: FeedbackItem[]; summary: string; error?: string;
}
// 화면용 평탄화 항목
interface FlatItem extends FeedbackItem { key: string; reviewer: { name: string; emoji: string }; }
interface ItemState { checked: boolean; mode: ApplyModeKey; memo: string; }

const SEV_ORDER: Record<string, number> = { 치명: 0, 중요: 1, 사소: 2 };
const sevStyle = (s: string) =>
  s === "치명" ? { backgroundColor: "var(--color-danger-soft, rgba(224,100,100,0.18))", color: "#e06464" }
  : s === "중요" ? { backgroundColor: "rgba(230,170,60,0.18)", color: "#d89a3a" }
  : { backgroundColor: "var(--surface-2)", color: "var(--text-mute)" };

export default function FeedbackModal({
  open, onClose, docId, docTitle, currentMarkdown, nickname, onApplied, onDiscuss,
}: {
  open: boolean;
  onClose: () => void;
  docId?: string;
  docTitle?: string;
  currentMarkdown?: string;
  nickname?: string;
  onApplied: () => void;
  onDiscuss?: (seed: string) => void;   // '조던과 상의' — 채팅으로 이 항목 가져가기
}) {
  const [custom, setCustom] = useState<Persona[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(["preset:efficiency-director"]));
  const [managerOpen, setManagerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ReviewerResult[] | null>(null);
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>({});
  const [preview, setPreview] = useState<RevisePreview | null>(null);
  const [err, setErr] = useState("");

  const allPersonas = useMemo(() => [...PRESET_PERSONAS, ...custom], [custom]);

  const loadCustom = async () => {
    try {
      const res = await fetch("/api/review-personas");
      const data = await res.json();
      setCustom((data.personas ?? []).map(rowToPersona));
    } catch { /* 무시 */ }
  };
  useEffect(() => { if (open) void loadCustom(); }, [open]);

  // 평탄화 + 심각도 정렬 (Hook이므로 early return 위에 둬야 함)
  const flat: FlatItem[] = useMemo(() => {
    if (!results) return [];
    const out: FlatItem[] = [];
    results.forEach((r, ri) => r.items.forEach((it, ii) => out.push({
      ...it, key: `${ri}-${ii}`, reviewer: { name: r.persona.name, emoji: r.persona.emoji },
    })));
    return out.sort((a, b) => (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3));
  }, [results]);

  if (!open) return null;

  const reset = () => { setResults(null); setItemStates({}); setErr(""); setPreview(null); };
  const close = () => { reset(); onClose(); };

  const togglePersona = (id: string) => {
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const generate = async () => {
    if (!docId || busy) return;
    const personas = allPersonas.filter((p) => selectedIds.has(p.id));
    if (personas.length === 0) { setErr("검토자를 1명 이상 선택하세요"); return; }
    setBusy(true); setErr(""); setResults(null); setItemStates({});
    try {
      const res = await fetch("/api/design-docs/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: docId, personas, nickname }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setErr(data.error || "생성 실패"); return; }
      setResults(data.results as ReviewerResult[]);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const stateOf = (it: FlatItem): ItemState =>
    itemStates[it.key] ?? {
      checked: false,
      mode: (APPLY_MODES.find((m) => m.key === it.suggested_mode)?.key ?? "보완") as ApplyModeKey,
      memo: "",
    };
  const setState = (key: string, patch: Partial<ItemState>) =>
    setItemStates((prev) => ({ ...prev, [key]: { ...stateOf(flat.find((f) => f.key === key)!), ...prev[key], ...patch } }));

  const selectedItems = flat.filter((it) => stateOf(it).checked);

  const buildInstruction = (): string => {
    const lines = selectedItems.map((it, i) => {
      const st = stateOf(it);
      return `${i + 1}) [${st.mode}] ${it.title}\n   - 근거: ${it.rationale}\n   - 제안: ${it.suggestion}${it.section ? `\n   - 위치: ${it.section}` : ""}${st.memo.trim() ? `\n   - 사용자 메모(최우선): ${st.memo.trim()}` : ""}`;
    });
    return (
      `아래는 기획서 검토 피드백 중 사용자가 선택한 반영 항목입니다. 각 항목을 지정된 '반영 방식'대로만 정확히 반영하고, 나머지 본문 구조는 유지하세요.\n\n` +
      lines.join("\n\n") +
      `\n\n[반영 방식 해석]\n- 보완: 제안대로 보완·수정\n- 축소: 범위를 줄여 간소화\n- 후순위: 후순위/옵션으로 내리고 본문 비중을 줄임(완전 삭제는 아님)\n- 제거: 해당 스펙을 본문에서 삭제\n- 직접지시: 사용자 메모 내용만 그대로 반영\n\n선택되지 않은 다른 피드백은 반영하지 마세요.`
    );
  };

  const reflect = async () => {
    if (!docId || selectedItems.length === 0 || busy) return;
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/design-docs/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_id: docId, instruction: buildInstruction(), nickname, preview: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setErr(data.error || "미리보기 생성 실패"); return; }
      setPreview({
        doc_id: docId,
        doc_title: data.doc_title ?? docTitle ?? "",
        title: data.new_title ?? docTitle ?? "",
        original_markdown: data.original_markdown ?? currentMarkdown ?? "",
        revised_markdown: data.revised_markdown ?? "",
      });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const discuss = (it: FlatItem) => {
    if (!onDiscuss) return;
    onDiscuss(`[검토 피드백] ${it.reviewer.emoji} ${it.reviewer.name}\n· ${it.title}\n· 근거: ${it.rationale}\n· 제안: ${it.suggestion}\n\n이 항목을 어떻게 반영할지(또는 반영 여부) 같이 정해줘.`);
    close();
  };

  const panelMode = selectedIds.size > 1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }} onClick={close}>
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--card-border)" }} onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--accent-2)" }}>🧐 기획서 피드백 받기</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>대상: {docTitle ?? "기획서"} · 과잉·저효과 스펙을 솎아내는 검토</p>
          </div>
          <button onClick={close} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text)" }}>닫기</button>
        </div>

        {/* 검토자 선택 */}
        <div className="px-5 pt-3 pb-2 flex-shrink-0" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs" style={{ color: "var(--text-secondary, var(--text-dim))" }}>검토자 {panelMode ? `· 패널 ${selectedIds.size}명 (관점 비교)` : ""}</p>
            <button onClick={() => setManagerOpen(true)} className="text-[11px] px-2 py-1 rounded-lg" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text-dim)" }}>🧑‍⚖️ 검토자 관리</button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allPersonas.map((p) => {
              const on = selectedIds.has(p.id);
              return (
                <button key={p.id} onClick={() => togglePersona(p.id)} className="text-xs px-2.5 py-1.5 rounded-full transition-colors" style={{
                  backgroundColor: on ? "var(--accent-2-soft)" : "var(--surface-2)",
                  border: `${on ? "2px" : "1px"} solid ${on ? "var(--accent-2)" : "var(--card-border)"}`,
                  color: on ? "var(--text)" : "var(--text-dim)", fontWeight: on ? 700 : 500,
                }}>{p.emoji} {p.name}</button>
              );
            })}
          </div>
          {!results && (
            <div className="flex items-center gap-2 mt-3 mb-1">
              <button onClick={generate} disabled={busy} className="text-sm px-4 py-2 rounded-lg font-bold disabled:opacity-50" style={{ backgroundColor: "var(--accent)", color: "var(--on-accent)" }}>
                {busy ? "검토 중…" : panelMode ? `🧐 ${selectedIds.size}명에게 피드백 받기` : "🧐 피드백 받기"}
              </button>
              {panelMode && <span className="text-[11px]" style={{ color: "var(--text-mute)" }}>인원수만큼 비용 발생</span>}
            </div>
          )}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: "thin" }}>
          {err && <p className="text-xs mb-2" style={{ color: "#e06464" }}>⚠️ {err}</p>}

          {busy && !results && (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-mute)" }}>검토자가 기획서를 읽고 있어요…</p>
          )}

          {results && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold" style={{ color: "var(--text)" }}>피드백 {flat.length}개</p>
                <p className="text-xs" style={{ color: "var(--accent-2)" }}>선택 {selectedItems.length}개</p>
              </div>
              <div className="space-y-2.5">
                {flat.map((it) => {
                  const st = stateOf(it);
                  return (
                    <div key={it.key} className="rounded-xl px-3 py-3" style={{ backgroundColor: "var(--surface-2)", border: `1px solid ${st.checked ? "var(--accent-2)" : "var(--card-border)"}` }}>
                      <div className="flex gap-2.5 items-start">
                        <input type="checkbox" checked={st.checked} onChange={(e) => setState(it.key, { checked: e.target.checked })} style={{ marginTop: 3 }} aria-label="반영 선택" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="text-[11px] px-1.5 py-0.5 rounded font-bold" style={sevStyle(it.severity)}>{it.severity}</span>
                            <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ border: "1px solid var(--card-border)", color: "var(--text-mute)" }}>{it.type}</span>
                            {panelMode && <span className="text-[11px]" style={{ color: "var(--text-mute)" }}>{it.reviewer.emoji} {it.reviewer.name}</span>}
                            <span className="text-[13px] font-bold" style={{ color: "var(--text)" }}>{it.title}</span>
                          </div>
                          <p className="text-xs" style={{ color: "var(--text-dim)", lineHeight: 1.55 }}>근거: {it.rationale}</p>
                          <p className="text-xs mt-1" style={{ color: "var(--accent-2)", lineHeight: 1.55 }}>→ {it.suggestion}</p>

                          {st.checked && (
                            <div className="mt-2.5">
                              <p className="text-[11px] mb-1" style={{ color: "var(--text-mute)" }}>반영 방식</p>
                              <div className="flex flex-wrap gap-1.5 mb-2">
                                {APPLY_MODES.map((m) => {
                                  const mon = st.mode === m.key;
                                  return (
                                    <button key={m.key} title={m.desc} onClick={() => setState(it.key, { mode: m.key })} className="text-[11px] px-2 py-1 rounded-lg" style={{
                                      border: `${mon ? "2px" : "1px"} solid ${mon ? "var(--accent-2)" : "var(--card-border)"}`,
                                      color: mon ? "var(--accent-2)" : "var(--text-mute)", fontWeight: mon ? 700 : 400,
                                    }}>{m.key}</button>
                                  );
                                })}
                              </div>
                              <div className="flex items-center gap-2">
                                <input value={st.memo} onChange={(e) => setState(it.key, { memo: e.target.value })} placeholder="메모(선택) — 부분 반영·뉘앙스 지시" className="flex-1 px-2.5 py-1.5 rounded-lg text-xs outline-none" style={{ backgroundColor: "var(--surface-input)", border: "1px solid var(--card-border)", color: "var(--text)" }} />
                                {onDiscuss && <button onClick={() => discuss(it)} className="text-[11px] px-2 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1" style={{ color: "var(--accent-2)", border: "1px solid var(--card-border)" }}>💬 조던과 상의</button>}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {flat.length === 0 && <p className="text-sm text-center py-6" style={{ color: "var(--text-mute)" }}>지적할 항목을 못 찾았어요. 다른 검토자로 시도해 보세요.</p>}
              </div>
            </>
          )}
        </div>

        {/* 푸터 */}
        {results && flat.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderTop: "1px solid var(--card-border)" }}>
            <button onClick={reflect} disabled={busy || selectedItems.length === 0} className="text-sm px-4 py-2 rounded-lg font-bold disabled:opacity-40" style={{ backgroundColor: "var(--accent)", color: "var(--on-accent)" }}>
              {busy ? "미리보기 생성 중…" : `선택 ${selectedItems.length}개, 방식대로 반영 →`}
            </button>
            <span className="text-[11px]" style={{ color: "var(--text-mute)" }}>색상 미리보기로 확인 후 적용</span>
          </div>
        )}
      </div>

      {/* 검토자 관리 */}
      <PersonaManager open={managerOpen} nickname={nickname} onClose={() => setManagerOpen(false)} onChanged={loadCustom} />

      {/* 반영 미리보기 (기존 수정 미리보기 재사용) */}
      <DocRevisePreview
        open={!!preview}
        preview={preview}
        nickname={nickname}
        onClose={() => setPreview(null)}
        onApplied={() => { onApplied(); close(); }}
      />
    </div>
  );
}
