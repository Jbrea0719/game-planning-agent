"use client";

// 손그림 스케치 → 와이어프레임 결과 모달 (Feature L)
// 첨부된 스케치 이미지를 /api/sketch-to-wireframe에 보내 정돈된 와이어프레임 HTML + 비평을 받아 보여준다.

import { useEffect, useRef, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface Props {
  imageBase64: string;
  mime: string;
  note?: string;
  onClose: () => void;
}

export default function SketchWireframeModal({ imageBase64, mime, note, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [html, setHtml] = useState("");
  const [critique, setCritique] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const ranRef = useRef(false);

  async function run() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sketch-to-wireframe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, mime, note }),
      });
      const data = await res.json();
      if (data.success) {
        setHtml(data.html);
        setCritique(data.critique ?? "");
      } else {
        setError(data.error ?? "생성 실패");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function copyHtml() {
    navigator.clipboard?.writeText(html).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4" onClick={onClose}>
      <div
        className="rounded-2xl flex flex-col shadow-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}`, width: "min(96vw, 860px)", maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <p className="text-sm font-bold" style={{ color: SILVER }}>📐 스케치 → 와이어프레임</p>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {loading && (
            <div className="text-center py-16">
              <p className="text-sm animate-pulse" style={{ color: SILVER_DIM }}>✏️ 스케치를 읽고 와이어프레임으로 정돈하는 중...</p>
              <p className="text-[11px] mt-2" style={{ color: SILVER_DIM }}>Opus가 그림을 분석하고 있어요 (10~20초)</p>
            </div>
          )}
          {error && !loading && (
            <div className="text-center py-12">
              <p className="text-sm" style={{ color: "rgba(255,150,150,1)" }}>⚠️ {error}</p>
              <button onClick={run} className="mt-3 text-xs px-4 py-2 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>다시 시도</button>
            </div>
          )}
          {!loading && !error && html && (
            <>
              <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${SILVER_FAINT}` }}>
                <iframe title="wireframe" srcDoc={html} className="w-full" style={{ height: 460, backgroundColor: "#1a1a2e", border: "none" }} sandbox="allow-scripts" />
              </div>
              {critique && (
                <div className="rounded-xl px-3.5 py-3" style={{ backgroundColor: "rgba(100,180,255,0.06)", border: "1px solid rgba(100,180,255,0.25)" }}>
                  <p className="text-xs font-bold mb-1.5" style={{ color: "var(--accent-2)" }}>🧐 조던의 비평</p>
                  <p className="text-[12px] whitespace-pre-wrap leading-relaxed" style={{ color: SILVER }}>{critique}</p>
                </div>
              )}
            </>
          )}
        </div>

        {!loading && !error && html && (
          <div className="px-4 py-3 flex-shrink-0 flex items-center gap-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
            <button onClick={run} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>🔄 다시 생성</button>
            <button onClick={copyHtml} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>{copied ? "복사됨 ✓" : "HTML 복사"}</button>
            <span className="ml-auto text-[10px]" style={{ color: SILVER_DIM }}>화면설계(🎨)에서 더 다듬을 수 있어요</span>
          </div>
        )}
      </div>
    </div>
  );
}
