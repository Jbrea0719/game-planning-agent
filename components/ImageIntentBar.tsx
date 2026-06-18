"use client";

// 이미지 첨부 의도 태그 + 메모 바 (Feature H)
// 첨부 미리보기 아래에 표시 — 분석 관점 칩(다중) + 메모 입력 + "영역 표시" 버튼.

import { IMAGE_INTENT_TAGS } from "@/lib/image-intent";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface Props {
  tags: string[];
  setTags: (t: string[]) => void;
  memo: string;
  setMemo: (m: string) => void;
  onAnnotate: () => void;
  hasAnnotation: boolean;
  onSketch?: () => void;  // 스케치 → 와이어프레임 (Feature L)
}

export default function ImageIntentBar({ tags, setTags, memo, setMemo, onAnnotate, hasAnnotation, onSketch }: Props) {
  function toggle(key: string) {
    setTags(tags.includes(key) ? tags.filter(k => k !== key) : [...tags, key]);
  }
  return (
    <div className="px-4 pt-2 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] flex-shrink-0" style={{ color: SILVER_DIM }}>분석 관점:</span>
        {IMAGE_INTENT_TAGS.map(t => {
          const on = tags.includes(t.key);
          return (
            <button key={t.key} onClick={() => toggle(t.key)}
              className="text-[10px] px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: on ? "rgba(100,180,255,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${on ? "rgba(100,180,255,0.6)" : SILVER_FAINT}`,
                color: on ? "var(--accent-2)" : SILVER_DIM,
              }}>
              {t.label}
            </button>
          );
        })}
        <button onClick={onAnnotate}
          className="text-[10px] px-2 py-0.5 rounded-full ml-auto flex-shrink-0"
          style={{
            backgroundColor: hasAnnotation ? "rgba(255,90,90,0.18)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${hasAnnotation ? "rgba(255,90,90,0.55)" : SILVER_FAINT}`,
            color: hasAnnotation ? "rgba(255,170,170,1)" : SILVER_DIM,
          }}>
          {hasAnnotation ? "✏️ 표시됨" : "✏️ 영역 표시"}
        </button>
        {onSketch && (
          <button onClick={onSketch}
            className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: "rgba(150,120,255,0.14)", border: "1px solid rgba(150,120,255,0.5)", color: "rgba(195,180,255,1)" }}>
            📐 와이어프레임화
          </button>
        )}
      </div>
      <input
        value={memo}
        onChange={e => setMemo(e.target.value)}
        placeholder="이미지에서 특히 봐줬으면 하는 점 (선택) — 예: 하단 탭바 배치, 가챠 연출 화면"
        className="w-full text-[11px] px-2.5 py-1.5 rounded-lg outline-none"
        style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}
      />
    </div>
  );
}
