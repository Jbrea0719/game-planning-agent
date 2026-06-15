"use client";

// 댓글 리치텍스트 에디터 — 볼드 / 폰트 크기 / 폰트 색상
// contentEditable + 선택 영역을 span으로 감싸는 방식(execCommand 비의존, 예측 가능).
// 제출 시 innerHTML을 새니타이즈해서 부모로 넘김.

import { useRef, useState } from "react";
import { sanitizeCommentHtml, FONT_SIZES, COMMENT_COLORS } from "@/lib/sanitize-comment";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";
const BLUE = "rgba(180,210,255,1)";

interface Props {
  onSubmit: (html: string) => void | boolean | Promise<void | boolean>;  // false 반환 시 입력 유지(실패)
  placeholder?: string;
  submitLabel?: string;
  posting?: boolean;
  onCancel?: () => void;
  compact?: boolean;
}

export default function RichCommentEditor({ onSubmit, placeholder, submitLabel = "등록", posting, onCancel, compact }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const [showColors, setShowColors] = useState(false);
  const [busy, setBusy] = useState(false);

  // 현재 선택 영역을 style 적용한 span으로 감싸기
  function wrap(style: Partial<CSSStyleDeclaration>) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;  // 선택해야 적용
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    const span = document.createElement("span");
    Object.assign(span.style, style);
    try {
      span.appendChild(range.extractContents());
      range.insertNode(span);
      // 선택 유지
      sel.removeAllRanges();
      const r = document.createRange();
      r.selectNodeContents(span);
      sel.addRange(r);
    } catch { /* 무시 */ }
    setEmpty((el.textContent ?? "").trim().length === 0);
  }

  async function submit() {
    const el = ref.current;
    if (!el || busy) return;
    // 태그 빼고 실제 글자가 있는지 확인
    const text = el.textContent ?? "";
    if (!text.trim()) return;
    const html = sanitizeCommentHtml(el.innerHTML);
    setBusy(true);
    try {
      const ok = await onSubmit(html);
      // 성공(true 또는 반환값 없음)일 때만 비움 — 실패(false)면 입력 내용 보존해 재시도 가능
      if (ok !== false) { el.innerHTML = ""; setEmpty(true); }
    } finally {
      setBusy(false);
    }
  }

  const btn = "text-[11px] px-2 py-1 rounded";
  const btnStyle = { backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: SILVER } as const;

  return (
    <div className="flex-1">
      {/* 툴바 */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrap({ fontWeight: "bold" }); }} className={btn} style={{ ...btnStyle, fontWeight: "bold" }} title="볼드">B</button>
        {/* 크기 */}
        <div className="flex items-center gap-0.5">
          {FONT_SIZES.map((s, i) => (
            <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); wrap({ fontSize: `${s}px` }); }} className={btn} style={btnStyle} title={`${s}px`}>
              <span style={{ fontSize: `${10 + i * 2}px` }}>가</span>
            </button>
          ))}
        </div>
        {/* 색상 */}
        <div className="relative">
          <button type="button" onMouseDown={(e) => { e.preventDefault(); setShowColors(v => !v); }} className={btn} style={btnStyle} title="색상">🎨</button>
          {showColors && (
            <div className="absolute z-10 mt-1 p-1.5 rounded-lg flex gap-1.5 flex-wrap" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}`, width: 132 }}>
              {COMMENT_COLORS.map(c => (
                <button key={c.name} type="button"
                  onMouseDown={(e) => { e.preventDefault(); wrap({ color: c.value || "inherit" }); setShowColors(false); }}
                  title={c.name}
                  className="w-5 h-5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: c.value || "transparent", border: c.value ? "1px solid rgba(255,255,255,0.3)" : `1px solid ${SILVER_DIM}` }}>
                  {!c.value && <span style={{ fontSize: 8, color: SILVER_DIM }}>×</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="text-[9px]" style={{ color: SILVER_DIM }}>※ 글자를 선택한 뒤 적용</span>
      </div>

      {/* 입력 영역 */}
      <div className="relative">
        {empty && <span className="absolute left-3 top-2 text-[13px] pointer-events-none" style={{ color: SILVER_DIM }}>{placeholder ?? "의견을 남겨주세요…"}</span>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={() => setEmpty((ref.current?.textContent ?? "").trim().length === 0)}
          className="w-full text-[13px] px-3 py-2 rounded-lg outline-none"
          style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", minHeight: compact ? 44 : 56, lineHeight: 1.6 }}
        />
      </div>

      <div className="flex justify-end gap-2 mt-1.5">
        {onCancel && <button type="button" onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>취소</button>}
        <button type="button" onClick={submit} disabled={posting || busy || empty}
          className="text-xs px-4 py-1.5 rounded-lg font-bold disabled:opacity-40"
          style={{ backgroundColor: "rgba(100,180,255,0.2)", border: "1px solid rgba(100,180,255,0.5)", color: BLUE }}>
          {posting || busy ? "등록 중…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
