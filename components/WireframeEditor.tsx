"use client";

// 게임 화면 와이어프레임 편집기 — Excalidraw 임베드
// PNG 캡쳐해서 기획서 마크다운에 첨부하거나 별도 저장

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

// Excalidraw는 SSR 안 됨 → dynamic import로 client only
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full" style={{ color: SILVER_DIM }}>편집기 로딩 중...</div> }
);

export default function WireframeEditor({
  open,
  onClose,
  onExport,
  initialTitle,
}: {
  open: boolean;
  onClose: () => void;
  onExport?: (dataUrl: string, title: string) => void;
  initialTitle?: string;
}) {
  const [title, setTitle] = useState(initialTitle ?? "새 화면 시안");
  const [exporting, setExporting] = useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  async function exportPng() {
    if (!apiRef.current) return;
    setExporting(true);
    try {
      const { exportToBlob } = await import("@excalidraw/excalidraw");
      const elements = apiRef.current.getSceneElements();
      if (elements.length === 0) {
        alert("그려진 내용이 없어요.");
        return;
      }
      const blob = await exportToBlob({
        elements,
        files: apiRef.current.getFiles(),
        mimeType: "image/png",
        appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
      });
      // 다운로드
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = title.replace(/[\\/:*?"<>|]/g, "_").trim() || "wireframe";
      a.download = `${safe}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // onExport 콜백 (data URL로 변환)
      if (onExport) {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") onExport(reader.result, title);
        };
        reader.readAsDataURL(blob);
      }
    } catch (err) {
      console.error("[wireframe] export 실패:", err);
      alert(`내보내기 실패: ${String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: "#0a0e1a" }}>
      {/* 상단 액션 바 */}
      <div className="px-4 py-2.5 flex items-center gap-3 flex-shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <p className="text-sm font-bold flex-shrink-0" style={{ color: SILVER }}>🎨 화면 설계</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg outline-none"
          style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", maxWidth: "260px" }}
          placeholder="시안 이름"
        />
        <div className="flex-1" />
        <button
          onClick={exportPng}
          disabled={exporting}
          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
          style={{ backgroundColor: "rgba(100,180,255,0.2)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}
        >
          {exporting ? "내보내는 중..." : "📥 PNG 다운로드"}
        </button>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ backgroundColor: "rgba(100,220,160,0.18)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}
        >
          ← 닫기
        </button>
      </div>

      {/* Excalidraw 캔버스 */}
      <div className="flex-1 min-h-0" style={{ backgroundColor: "#fff" }}>
        <Excalidraw
          excalidrawAPI={handleApiReady}
          initialData={{ appState: { viewBackgroundColor: "#fafafa" }, elements: [] }}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveAsImage: false,
              export: false,
              changeViewBackgroundColor: true,
              toggleTheme: false,
            },
          }}
          langCode="ko-KR"
        />
      </div>

      <div className="px-4 py-2 flex-shrink-0 text-[10px]" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderTop: `1px solid ${SILVER_FAINT}`, color: SILVER_DIM }}>
        💡 사각형·라운드·텍스트로 화면 레이아웃 구성 → 📥 PNG 다운로드로 저장 → 기획서에 첨부
      </div>
    </div>
  );
}
