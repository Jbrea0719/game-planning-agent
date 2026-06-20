"use client";

// 검토자 관리 화면 — 프리셋(복제만) + 내 검토자(수정·삭제) + 새로 만들기.
// PersonaEditor로 생성/수정.

import { useEffect, useState } from "react";
import { PRESET_PERSONAS, rowToPersona, type Persona } from "@/lib/review-personas";
import PersonaEditor from "./PersonaEditor";

export default function PersonaManager({
  open, nickname, onClose, onChanged,
}: {
  open: boolean;
  nickname?: string;
  onClose: () => void;
  onChanged: () => void;   // 목록 변경 시 부모(피드백 모달)에 알림
}) {
  const [custom, setCustom] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editInitial, setEditInitial] = useState<Persona | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/review-personas");
      const data = await res.json();
      setCustom((data.personas ?? []).map(rowToPersona));
    } catch { /* 무시 */ } finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(); }, [open]);

  if (!open) return null;

  const openNew = () => { setEditInitial(null); setEditingId(null); setEditorOpen(true); };
  const openDuplicate = (p: Persona) => { setEditInitial({ ...p, name: `${p.name} (복사)` }); setEditingId(null); setEditorOpen(true); };
  const openEdit = (p: Persona) => { setEditInitial(p); setEditingId(p.id); setEditorOpen(true); };

  const remove = async (id: string) => {
    if (!confirm("이 검토자를 삭제할까요?")) return;
    await fetch(`/api/review-personas?id=${id}`, { method: "DELETE" });
    await load(); onChanged();
  };

  const card = (p: Persona, isPreset: boolean) => (
    <div key={p.id} className="rounded-xl px-3.5 py-3" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)" }}>
      <div className="flex items-start gap-2">
        <span style={{ fontSize: 18 }}>{p.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold" style={{ color: "var(--text)" }}>{p.name}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>{p.identity}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-dim)", lineHeight: 1.55 }}>{p.perspective}</p>
          <p className="text-[11px] mt-1.5" style={{ color: "var(--text-mute)" }}>
            엄격도 {p.strictness}/5 · 근거 {[p.knowledge.bible && "바이블", p.knowledge.rules && "규칙", p.knowledge.refgames && "참고게임"].filter(Boolean).join("·") || "없음"}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          {isPreset ? (
            <button onClick={() => openDuplicate(p)} className="text-[11px] px-2 py-1 rounded-lg" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--card-border)", color: "var(--text)" }}>복제</button>
          ) : (
            <>
              <button onClick={() => openEdit(p)} className="text-[11px] px-2 py-1 rounded-lg" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--card-border)", color: "var(--text)" }}>수정</button>
              <button onClick={() => remove(p.id)} className="text-[11px] px-2 py-1 rounded-lg" style={{ color: "#e06464", border: "1px solid rgba(224,100,100,0.4)" }}>삭제</button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--card-border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--accent-2)" }}>🧑‍⚖️ 검토자 관리</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>프리셋은 복제해서 내 입맛대로, 내 검토자는 자유롭게 수정</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openNew} className="text-xs px-3 py-1.5 rounded-lg font-bold" style={{ backgroundColor: "var(--accent)", color: "var(--on-accent)" }}>+ 새 검토자</button>
            <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text)" }}>닫기</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: "thin" }}>
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: "var(--text-dim)" }}>내 검토자 {custom.length > 0 ? `(${custom.length})` : ""}</p>
            {loading ? (
              <p className="text-xs" style={{ color: "var(--text-mute)" }}>불러오는 중…</p>
            ) : custom.length === 0 ? (
              <p className="text-xs px-3 py-3 rounded-xl" style={{ color: "var(--text-mute)", backgroundColor: "var(--surface-2)", border: "1px dashed var(--card-border)" }}>아직 없어요. 아래 프리셋을 복제하거나 [+ 새 검토자]로 만들어 보세요.</p>
            ) : (
              <div className="space-y-2">{custom.map((p) => card(p, false))}</div>
            )}
          </div>
          <div>
            <p className="text-xs font-bold mb-2" style={{ color: "var(--text-dim)" }}>프리셋</p>
            <div className="space-y-2">{PRESET_PERSONAS.map((p) => card(p, true))}</div>
          </div>
        </div>
      </div>

      <PersonaEditor
        open={editorOpen}
        initial={editInitial}
        editingId={editingId}
        nickname={nickname}
        onClose={() => setEditorOpen(false)}
        onSaved={() => { void load(); onChanged(); }}
      />
    </div>
  );
}
