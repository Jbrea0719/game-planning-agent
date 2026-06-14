"use client";

// 이미지 영역 표시기 (Feature H — 영역 지정)
//
// 첨부 이미지 위에 빨강/노랑으로 동그라미·선을 그려 "여기를 봐줘"를 시각적으로 전달.
// 표시를 이미지에 합성(burn-in)해서 새 첨부 이미지로 교체 → 조던(vision)이 표시를 그대로 본다.
// 서버·라이브러리 불필요(브라우저 canvas만 사용, 비용 0).

import { useEffect, useRef, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface Props {
  src: string;  // 원본 이미지 dataURL
  onCancel: () => void;
  onDone: (dataUrl: string, mime: string, base64: string) => void;
}

export default function ImageAnnotator({ src, onCancel, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  // 그린 획들 — [color, [points]] (undo·다시그리기용)
  const strokesRef = useRef<{ color: string; pts: { x: number; y: number }[] }[]>([]);
  const [color, setColor] = useState("#ff3b30");  // 빨강 기본
  const [ready, setReady] = useState(false);

  // 이미지 로드 → 캔버스 크기 설정 + 첫 렌더
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;
      // 성능을 위해 최대 폭 1200으로 제한(비율 유지)
      const maxW = 1200;
      const scale = img.width > maxW ? maxW / img.width : 1;
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      redraw();
      setReady(true);
    };
    img.src = src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function redraw() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(3, canvas.width / 250);
    for (const s of strokesRef.current) {
      ctx.strokeStyle = s.color;
      ctx.beginPath();
      s.pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
    }
  }

  // 포인터 좌표 → 캔버스 내부 좌표 변환
  function toCanvasPt(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    drawingRef.current = true;
    const p = toCanvasPt(e);
    lastRef.current = p;
    strokesRef.current.push({ color, pts: [p] });
    canvasRef.current?.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const p = toCanvasPt(e);
    const cur = strokesRef.current[strokesRef.current.length - 1];
    if (cur) cur.pts.push(p);
    lastRef.current = p;
    redraw();
  }
  function onPointerUp() {
    drawingRef.current = false;
    lastRef.current = null;
  }

  function undo() { strokesRef.current.pop(); redraw(); }
  function clearAll() { strokesRef.current = []; redraw(); }

  function done() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 표시가 없으면 그냥 취소(원본 유지)
    if (strokesRef.current.length === 0) { onCancel(); return; }
    const mime = "image/png";
    const dataUrl = canvas.toDataURL(mime);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    onDone(dataUrl, mime, base64);
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4" onClick={onCancel}>
      <div
        className="rounded-2xl flex flex-col shadow-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}`, maxWidth: "min(96vw, 900px)", maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <p className="text-sm font-bold" style={{ color: SILVER }}>✏️ 영역 표시 — 봐줬으면 하는 곳에 동그라미·선</p>
          <button onClick={onCancel} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>취소</button>
        </div>

        <div className="px-4 py-3 overflow-auto flex items-center justify-center" style={{ minHeight: 200 }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            style={{ maxWidth: "100%", maxHeight: "62vh", touchAction: "none", cursor: "crosshair", borderRadius: 8, border: `1px solid ${SILVER_FAINT}` }}
          />
          {!ready && <span className="text-xs" style={{ color: SILVER_DIM }}>이미지 불러오는 중...</span>}
        </div>

        <div className="px-4 py-3 flex items-center gap-2 flex-wrap flex-shrink-0" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
          {/* 색상 */}
          {[{ c: "#ff3b30", n: "빨강" }, { c: "#ffd60a", n: "노랑" }, { c: "#34d399", n: "초록" }].map(({ c, n }) => (
            <button key={c} onClick={() => setColor(c)} title={n}
              className="w-7 h-7 rounded-full flex-shrink-0"
              style={{ backgroundColor: c, border: color === c ? "2px solid white" : `1px solid ${SILVER_FAINT}` }} />
          ))}
          <button onClick={undo} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>되돌리기</button>
          <button onClick={clearAll} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>전체 지우기</button>
          <button onClick={done} className="ml-auto text-xs px-4 py-1.5 rounded-lg font-bold" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>표시 적용</button>
        </div>
      </div>
    </div>
  );
}
