"use client";

// 스크린샷 → 텍스트 UI 프레임 모달
//   1) 화면 스크린샷 업로드 → 2) AI가 박스 드로잉 텍스트 프레임 생성
//   3) 편집 가능한 고정폭 textarea에서 다듬기 → 4) 복사 / 현재 기획서 본문에 추가
//   레퍼런스 화면을 베이스로 UI 프레임을 잡고 직접 수정하는 용도.

import { useRef, useState } from "react";

// 이미지 다운스케일(긴 변 1280px) — 비전 토큰·전송량 절약
async function downscale(file: File, max = 1280): Promise<{ base64: string; mime: string; dataUrl: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  const out = canvas.toDataURL("image/jpeg", 0.9);
  return { base64: out.split(",")[1], mime: "image/jpeg", dataUrl: out };
}

export default function ScreenshotFrameModal({
  open, onClose, docId, currentMarkdown, nickname, onInserted,
}: {
  open: boolean;
  onClose: () => void;
  docId?: string;
  currentMarkdown?: string;
  nickname?: string;
  onInserted?: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [imgData, setImgData] = useState<{ base64: string; mime: string } | null>(null);
  const [note, setNote] = useState("");
  const [frame, setFrame] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [inserted, setInserted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => { setPreview(null); setImgData(null); setNote(""); setFrame(""); setNotes(""); setErr(""); setInserted(false); };
  const close = () => { reset(); onClose(); };

  const pickFile = async (file?: File) => {
    if (!file) return;
    setErr("");
    try {
      const { base64, mime, dataUrl } = await downscale(file);
      setImgData({ base64, mime });
      setPreview(dataUrl);
      setFrame(""); setNotes("");
    } catch {
      setErr("이미지를 읽지 못했어요. 다른 파일로 시도해 주세요.");
    }
  };

  const generate = async () => {
    if (!imgData || busy) return;
    setBusy(true); setErr(""); setFrame(""); setNotes("");
    try {
      const res = await fetch("/api/screenshot-to-frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imgData.base64, mime: imgData.mime, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { setErr(data.error || "생성 실패"); return; }
      setFrame(data.frame || "");
      setNotes(data.notes || "");
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(frame); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* 무시 */ }
  };

  const insert = async () => {
    if (!docId || !frame.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const block = `\n\n## 📐 UI 프레임\n\n\`\`\`\n${frame.trim()}\n\`\`\`\n`;
      const next = (currentMarkdown ?? "") + block;
      const res = await fetch(`/api/design-docs/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_markdown: next, nickname }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || "삽입 실패"); return; }
      setInserted(true);
      onInserted?.();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.7)" }} onClick={close}>
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--card-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--accent-2)" }}>📐 스크린샷 → 텍스트 UI 프레임</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>참고 화면을 올리면 박스 문자 와이어프레임으로 옮겨줘요</p>
          </div>
          <button onClick={close} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text)" }}>닫기</button>
        </div>

        {/* 내용 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3" style={{ scrollbarWidth: "thin" }}>
          {/* 1. 업로드 */}
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            {!preview ? (
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-xl py-8 flex flex-col items-center gap-2 transition-colors"
                style={{ backgroundColor: "var(--surface-2)", border: "1.5px dashed var(--accent-faint)", color: "var(--text-dim)" }}
              >
                <span style={{ fontSize: 28 }}>🖼️</span>
                <span className="text-xs font-medium">스크린샷 선택 (게임·앱 화면)</span>
              </button>
            ) : (
              <div className="flex items-start gap-3">
                <img src={preview} alt="미리보기" className="h-28 w-auto rounded-lg flex-shrink-0" style={{ border: "1px solid var(--card-border)" }} />
                <div className="flex-1 min-w-0">
                  <button onClick={() => fileRef.current?.click()} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text)" }}>다른 이미지</button>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="(선택) 지시 — 예: 세로 화면, 영웅 상세 위주로"
                    className="mt-2 w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ backgroundColor: "var(--surface-input)", border: "1px solid var(--card-border)", color: "var(--text)" }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 2. 생성 버튼 */}
          {preview && (
            <button
              onClick={generate}
              disabled={busy}
              className="w-full py-2.5 rounded-lg text-sm font-bold disabled:opacity-50"
              style={{ backgroundColor: "var(--accent)", color: "var(--on-accent)" }}
            >
              {busy && !frame ? "프레임 그리는 중…" : frame ? "🔄 다시 생성" : "📐 텍스트 프레임 생성"}
            </button>
          )}

          {err && <p className="text-xs px-1" style={{ color: "#e06464" }}>⚠️ {err}</p>}

          {/* 3. 결과 — 편집 가능한 고정폭 프레임 */}
          {frame && (
            <div>
              <p className="text-xs font-bold mb-1.5" style={{ color: "var(--text)" }}>UI 프레임 (직접 수정 가능)</p>
              <textarea
                value={frame}
                onChange={(e) => setFrame(e.target.value)}
                spellCheck={false}
                className="w-full rounded-lg px-3 py-3 text-xs outline-none resize-y"
                style={{
                  minHeight: 240,
                  backgroundColor: "var(--surface-2)",
                  border: "1px solid var(--card-border)",
                  color: "var(--text)",
                  fontFamily: '"Nanum Gothic Coding", "D2Coding", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  lineHeight: 1.5,
                  whiteSpace: "pre",
                }}
              />
              {notes && (
                <p className="text-xs mt-2 px-1" style={{ color: "var(--text-dim)", lineHeight: 1.55 }}>💡 {notes}</p>
              )}
            </div>
          )}
        </div>

        {/* 푸터 — 액션 */}
        {frame && (
          <div className="flex items-center gap-2 px-5 py-3 flex-shrink-0" style={{ borderTop: "1px solid var(--card-border)" }}>
            <button onClick={copy} className="text-xs px-3 py-2 rounded-lg font-medium" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text)" }}>
              {copied ? "✓ 복사됨" : "⎘ 복사"}
            </button>
            {docId && (
              <button onClick={insert} disabled={busy || inserted} className="text-xs px-3 py-2 rounded-lg font-bold disabled:opacity-50" style={{ backgroundColor: "var(--accent)", color: "var(--on-accent)" }}>
                {inserted ? "✓ 기획서에 추가됨" : "📄 기획서 본문에 추가"}
              </button>
            )}
            <span className="ml-auto text-[11px]" style={{ color: "var(--text-mute)" }}>코드블록으로 추가돼요</span>
          </div>
        )}
      </div>
    </div>
  );
}
