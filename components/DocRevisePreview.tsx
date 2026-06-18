"use client";

// 대화 기반 기획서 수정 — 미리보기(색상 diff) + 적용 모달
// 원본 vs 수정본을 줄 단위로 비교해 추가🟢 / 수정🟡 / 삭제🔴 로 색상 표시.
// [적용] 누르면 변경 마커 없는 "깨끗한 수정본"만 저장(백업 후 덮어쓰기).

import { useMemo, useState } from "react";
import { diffLines, type Change } from "diff";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

export type RevisePreview = {
  doc_id: string;
  doc_title: string;   // 원본 제목
  title: string;       // 수정본 제목(본문 H1 기준)
  original_markdown: string;
  revised_markdown: string;
};

// diff 블록 — kind: 추가/수정-이전/수정-이후/삭제/유지
type Seg = { kind: "add" | "mod-old" | "mod-new" | "del" | "same"; text: string };

function buildSegments(original: string, revised: string): Seg[] {
  const parts: Change[] = diffLines(original || "", revised || "");
  const segs: Seg[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const next = parts[i + 1];
    if (p.removed && next && next.added) {
      // 삭제 직후 추가 → "수정"(변경) 쌍으로 처리
      segs.push({ kind: "mod-old", text: p.value });
      segs.push({ kind: "mod-new", text: next.value });
      i++; // next 소비
    } else if (p.removed) {
      segs.push({ kind: "del", text: p.value });
    } else if (p.added) {
      segs.push({ kind: "add", text: p.value });
    } else {
      segs.push({ kind: "same", text: p.value });
    }
  }
  return segs;
}

const STYLE: Record<Seg["kind"], React.CSSProperties> = {
  add:      { backgroundColor: "rgba(80,220,120,0.16)", color: "#c8f0d0", borderLeft: "3px solid rgba(80,220,120,0.8)" },
  "mod-old":{ backgroundColor: "rgba(255,200,90,0.12)", color: "#e8c98a", borderLeft: "3px solid rgba(255,200,90,0.8)", textDecoration: "line-through", opacity: 0.85 },
  "mod-new":{ backgroundColor: "rgba(255,200,90,0.18)", color: "#f5e0a8", borderLeft: "3px solid rgba(255,200,90,0.9)" },
  del:      { backgroundColor: "rgba(255,90,90,0.13)",  color: "#f0bcbc", borderLeft: "3px solid rgba(255,90,90,0.8)", textDecoration: "line-through" },
  same:     { color: "#8a94a8" },
};

export default function DocRevisePreview({
  open,
  preview,
  nickname,
  onClose,
  onApplied,
}: {
  open: boolean;
  preview: RevisePreview | null;
  nickname?: string;
  onClose: () => void;
  onApplied: (doc: unknown) => void;
}) {
  const [applying, setApplying] = useState(false);
  const segs = useMemo(
    () => (preview ? buildSegments(preview.original_markdown, preview.revised_markdown) : []),
    [preview]
  );

  if (!open || !preview) return null;

  const counts = segs.reduce(
    (acc, s) => {
      if (s.kind === "add") acc.add++;
      else if (s.kind === "mod-new") acc.mod++;
      else if (s.kind === "del") acc.del++;
      return acc;
    },
    { add: 0, mod: 0, del: 0 }
  );

  async function apply() {
    if (!preview || applying) return;
    setApplying(true);
    try {
      const res = await fetch("/api/design-docs/revise-from-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_id: preview.doc_id,
          content_markdown: preview.revised_markdown,  // 깨끗한 본문 (마커 없음)
          title: preview.title,
          nickname,
          apply: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "적용 실패");
      onApplied(data.doc);
      onClose();
    } catch (err) {
      alert(`적용 실패: ${String(err)}`);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.75)" }} onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="px-5 py-4 flex items-center justify-between gap-3" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div className="min-w-0">
            <p className="text-sm font-bold truncate" style={{ color: "var(--accent-2)" }}>🛠️ 수정 미리보기 — {preview.doc_title}</p>
            <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>
              아래 색상으로 바뀐 부분을 확인하고 [적용]하면 깨끗한 본문으로 저장돼요. (수정 전 자동 백업)
            </p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>

        {/* 범례 */}
        <div className="px-5 py-2 flex items-center gap-3 text-xs flex-wrap" style={{ borderBottom: `1px solid ${SILVER_FAINT}`, color: SILVER_DIM }}>
          <span><span style={{ color: "#7ee0a0" }}>■</span> 추가 {counts.add}</span>
          <span><span style={{ color: "#f5d27a" }}>■</span> 수정 {counts.mod}</span>
          <span><span style={{ color: "#f08a8a" }}>■</span> 삭제 {counts.del}</span>
          {counts.add + counts.mod + counts.del === 0 && <span style={{ color: SILVER_DIM }}>변경 사항이 감지되지 않았어요.</span>}
        </div>

        {/* diff 본문 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 text-xs leading-relaxed" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
          {segs.map((s, i) => (
            <div key={i} className="px-2 py-0.5 my-0.5 rounded" style={{ ...STYLE[s.kind], whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {s.kind === "mod-old" && <span className="mr-1 opacity-70">수정 전 →</span>}
              {s.kind === "mod-new" && <span className="mr-1 opacity-70">수정 후 →</span>}
              {s.text.replace(/\n$/, "")}
            </div>
          ))}
        </div>

        {/* 하단 버튼 */}
        <div className="px-5 py-3 flex items-center justify-end gap-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
          <button onClick={onClose} disabled={applying} className="text-xs px-4 py-2 rounded-lg disabled:opacity-40" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>취소</button>
          <button
            onClick={apply}
            disabled={applying}
            className="text-xs px-4 py-2 rounded-lg font-bold flex items-center gap-1.5 disabled:opacity-40"
            style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(200,225,255,1)" }}
          >
            {applying ? "적용 중..." : "✓ 이 내용으로 적용"}
          </button>
        </div>
      </div>
    </div>
  );
}
