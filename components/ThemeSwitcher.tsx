"use client";

// 스킨(테마) 전환 버튼 — 헤더에 배치. 클릭 시 드롭다운에서 테마 선택.
// 선택은 localStorage 에 저장되어 다음 방문에도 유지됨.

import { useEffect, useRef, useState } from "react";
import { THEMES, applyTheme, getStoredTheme, type ThemeId } from "@/lib/themes";

export default function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<ThemeId>("dark");
  const ref = useRef<HTMLDivElement>(null);

  // 저장된 테마로 초기화 (스크립트가 이미 적용했지만 버튼 표시 상태 동기화)
  useEffect(() => {
    setCurrent(getStoredTheme());
  }, []);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const cur = THEMES.find((t) => t.id === current) ?? THEMES[0];

  const pick = (id: ThemeId) => {
    applyTheme(id);
    setCurrent(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="스킨 변경"
        aria-label="스킨 변경"
        className="flex items-center gap-1.5 rounded-full transition-colors"
        style={{
          padding: compact ? "5px 9px" : "6px 11px",
          backgroundColor: "var(--surface-input)",
          border: "1px solid var(--accent-faint)",
          color: "var(--text-dim)",
          fontSize: compact ? "12px" : "12.5px",
          fontWeight: 600,
        }}
      >
        <span aria-hidden style={{ fontSize: "13px", lineHeight: 1 }}>{cur.emoji}</span>
        {!compact && <span>{cur.label}</span>}
        <span aria-hidden style={{ fontSize: "9px", opacity: 0.7 }}>▾</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-1.5 rounded-xl overflow-hidden z-50 shadow-2xl"
          style={{
            minWidth: 180,
            backgroundColor: "var(--surface-2)",
            border: "1px solid var(--accent-faint)",
            boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
          }}
        >
          <div
            className="px-3 py-2 text-[11px] font-bold"
            style={{ color: "var(--text-mute)", borderBottom: "1px solid var(--accent-faint)" }}
          >
            스킨 선택
          </div>
          {THEMES.map((t) => {
            const active = t.id === current;
            return (
              <button
                key={t.id}
                onClick={() => pick(t.id)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                style={{
                  backgroundColor: active ? "var(--accent-2-soft)" : "transparent",
                  color: "var(--text)",
                  fontSize: "13px",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {/* 색 미리보기 스와치 */}
                <span className="flex flex-shrink-0 rounded-md overflow-hidden" style={{ border: "1px solid var(--accent-faint)" }}>
                  {t.swatch.map((c, i) => (
                    <span key={i} style={{ width: 11, height: 18, backgroundColor: c }} />
                  ))}
                </span>
                <span aria-hidden>{t.emoji}</span>
                <span className="flex-1">{t.label}</span>
                {active && <span aria-hidden style={{ color: "var(--accent-2)", fontSize: "12px" }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
