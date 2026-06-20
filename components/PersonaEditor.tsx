"use client";

// 검토자 생성·수정 폼 (모달). 프리셋 '복제' 시 editingId=null로 들어와 새로 저장됨.

import { useState } from "react";
import type { Persona } from "@/lib/review-personas";

export default function PersonaEditor({
  open, initial, editingId, nickname, onClose, onSaved,
}: {
  open: boolean;
  initial: Persona | null;     // 복제·수정 시 채워서 전달, 새로 만들면 null
  editingId: string | null;    // 기존 커스텀 수정이면 DB id, 그 외(신규·복제)는 null
  nickname?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [emoji, setEmoji] = useState(initial?.emoji ?? "🧐");
  const [name, setName] = useState(initial?.name ?? "");
  const [identity, setIdentity] = useState(initial?.identity ?? "");
  const [perspective, setPerspective] = useState(initial?.perspective ?? "");
  const [tone, setTone] = useState(initial?.tone ?? "");
  const [strictness, setStrictness] = useState(initial?.strictness ?? 3);
  const [kBible, setKBible] = useState(initial?.knowledge?.bible ?? true);
  const [kRules, setKRules] = useState(initial?.knowledge?.rules ?? true);
  const [kRef, setKRef] = useState(initial?.knowledge?.refgames ?? true);
  const [expertise, setExpertise] = useState(initial?.knowledge?.expertise ?? "");
  const [focus, setFocus] = useState<string[]>(initial?.focus ?? []);
  const [avoid, setAvoid] = useState<string[]>(initial?.avoid ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!open) return null;

  const save = async () => {
    if (!name.trim()) { setErr("이름을 입력하세요"); return; }
    setBusy(true); setErr("");
    try {
      const body = {
        id: editingId ?? undefined,
        name: name.trim(), emoji, identity, perspective, tone, strictness,
        knowledge: { bible: kBible, rules: kRules, refgames: kRef, expertise },
        focus: focus.map((s) => s.trim()).filter(Boolean),
        avoid: avoid.map((s) => s.trim()).filter(Boolean),
        nickname,
      };
      const res = await fetch("/api/review-personas", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setErr(data.error || "저장 실패"); return; }
      onSaved();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full px-3 py-2 rounded-lg text-sm outline-none";
  const fieldStyle = { backgroundColor: "var(--surface-input)", border: "1px solid var(--card-border)", color: "var(--text)" } as const;
  const label = "text-xs font-bold mb-1.5 block";
  const labelStyle = { color: "var(--text-dim)" } as const;

  // 항목 리스트 편집기 (추가·수정·삭제)
  const listEditor = (items: string[], setItems: (v: string[]) => void, placeholder: string) => (
    <div className="space-y-1.5">
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={v}
            onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={placeholder}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={fieldStyle}
          />
          <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="w-8 h-8 rounded-lg flex-shrink-0 text-xs" style={{ border: "1px solid var(--card-border)", color: "var(--text-mute)" }} aria-label="삭제">✕</button>
        </div>
      ))}
      <button onClick={() => setItems([...items, ""])} className="text-xs px-2.5 py-1.5 rounded-lg" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text-dim)" }}>+ 항목 추가</button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--card-border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--accent-2)" }}>{editingId ? "검토자 수정" : "새 검토자"}</p>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text)" }}>닫기</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ scrollbarWidth: "thin" }}>
          <div className="flex gap-3">
            <div style={{ width: 64 }}>
              <label className={label} style={labelStyle}>이모지</label>
              <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="w-full px-2 py-2 rounded-lg text-center text-lg outline-none" style={fieldStyle} />
            </div>
            <div className="flex-1">
              <label className={label} style={labelStyle}>이름</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 효율 따지는 시니어 기획자" className={field} style={fieldStyle} />
            </div>
          </div>

          <div>
            <label className={label} style={labelStyle}>한 줄 정체성</label>
            <input value={identity} onChange={(e) => setIdentity(e.target.value)} placeholder="예: 10년차 라이브 서비스 기획자" className={field} style={fieldStyle} />
          </div>

          <div>
            <label className={label} style={labelStyle}>시선 — 무엇을 중시하고 무엇을 걸러내나 (피드백의 핵심)</label>
            <textarea value={perspective} onChange={(e) => setPerspective(e.target.value)} rows={4} placeholder="예: 개발 대비 효율을 따진다. 우선순위 낮은 스펙, 과잉설계, 좋아보이지만 효과 약한 스펙을 제거·후순위로 분류한다." className={field + " resize-y"} style={fieldStyle} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={label} style={labelStyle}>말투·성격</label>
              <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="예: 냉정·논리형 / 우호·코칭형" className={field} style={fieldStyle} />
            </div>
            <div style={{ width: 150 }}>
              <label className={label} style={labelStyle}>엄격도 {strictness}/5</label>
              <input type="range" min={1} max={5} step={1} value={strictness} onChange={(e) => setStrictness(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--accent)" }} />
            </div>
          </div>

          <div>
            <label className={label} style={labelStyle}>✅ 특히 신경 쓸 것 (이 관점을 우선 점검)</label>
            {listEditor(focus, setFocus, "예: 개발 대비 효과, 우선순위, 과잉설계")}
          </div>

          <div>
            <label className={label} style={labelStyle}>🚫 신경 쓰지 말 것 (지적하지 않을 부분)</label>
            {listEditor(avoid, setAvoid, "예: 사소한 워딩, 아트 취향")}
          </div>

          <div>
            <label className={label} style={labelStyle}>지식 범주 — 무엇을 근거로 보나</label>
            <div className="flex flex-wrap gap-3 mb-2">
              {([["바이블", kBible, setKBible], ["절대 규칙", kRules, setKRules], ["참고 게임", kRef, setKRef]] as const).map(([t, v, set], i) => (
                <label key={i} className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text)" }}>
                  <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} /> {t}
                </label>
              ))}
            </div>
            <textarea value={expertise} onChange={(e) => setExpertise(e.target.value)} rows={2} placeholder="고유 전문성·배경(선택) — 예: 수집형 RPG BM 설계 경험" className={field + " resize-y"} style={fieldStyle} />
          </div>

          {err && <p className="text-xs" style={{ color: "#e06464" }}>⚠️ {err}</p>}
        </div>

        <div className="px-5 py-3 flex items-center justify-end gap-2 flex-shrink-0" style={{ borderTop: "1px solid var(--card-border)" }}>
          <button onClick={onClose} disabled={busy} className="text-xs px-4 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text-dim)" }}>취소</button>
          <button onClick={save} disabled={busy} className="text-xs px-4 py-2 rounded-lg font-bold disabled:opacity-50" style={{ backgroundColor: "var(--accent)", color: "var(--on-accent)" }}>{busy ? "저장 중…" : "저장"}</button>
        </div>
      </div>
    </div>
  );
}
