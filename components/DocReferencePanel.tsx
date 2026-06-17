"use client";

// 기획서별 레퍼런스 이미지 패널 (데스크톱 우측 / 모바일 하단 공용)
// - 정민님이 참고·예상결과 이미지를 업로드 → 코멘트(출처·참고포인트)와 함께 리스트로 모아둠
// - 썸네일 클릭 → 큰 화면 보기. 모바일(세로)에서는 자동으로 가로 풀스크린(90° 회전)으로 크게.
// 저장은 doc_family_id 기준(버전 무관) — /api/design-docs/reference-images

import { useCallback, useEffect, useRef, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface RefImg { id: string; url: string; comment: string; }
interface Pending { dataUrl: string; mime: string; base64: string; }

// 업로드용 다운스케일 (긴 변 maxEdge, JPEG) — 크게 보기 위해 1920까지 허용
function downscale(file: File, maxEdge = 1920): Promise<Pending> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.max(img.width, img.height) > maxEdge ? maxEdge / Math.max(img.width, img.height) : 1;
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("canvas 없음")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        const mime = "image/jpeg";
        const dataUrl = canvas.toDataURL(mime, 0.9);
        resolve({ dataUrl, mime, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) });
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 큰 화면 뷰어 — 모바일 세로면 90° 회전해 가로 풀스크린
function LargeViewer({ img, onClose }: { img: RefImg; onClose: () => void }) {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 760);
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => { window.removeEventListener("resize", check); window.removeEventListener("orientationchange", check); };
  }, []);

  // 모바일 세로: 회전시켜 화면 긴 변을 가로로 사용
  const imgStyle: React.CSSProperties = portrait
    ? { transform: "rotate(90deg)", maxWidth: "100vh", maxHeight: "100vw", objectFit: "contain" }
    : { maxWidth: "96vw", maxHeight: "92vh", objectFit: "contain" };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.92)" }} onClick={onClose}>
      <img src={img.url} alt={img.comment || "레퍼런스"} style={imgStyle} onClick={(e) => e.stopPropagation()} />
      {img.comment && (
        <div className="absolute left-0 right-0 bottom-0 px-4 py-3 text-center text-xs" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.7))", color: "#e0e8f0" }}>
          {img.comment}
        </div>
      )}
      <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: "rgba(0,0,0,0.55)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>✕</button>
      {portrait && (
        <p className="absolute top-3 left-3 text-[10px] px-2 py-1 rounded" style={{ backgroundColor: "rgba(0,0,0,0.5)", color: SILVER_DIM }}>📱 가로로 크게 보는 중</p>
      )}
    </div>
  );
}

export default function DocReferencePanel({ familyId }: { familyId?: string | null }) {
  const [images, setImages] = useState<RefImg[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewer, setViewer] = useState<RefImg | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingComment, setPendingComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!familyId) { setImages([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/design-docs/reference-images?family_id=${encodeURIComponent(familyId)}`);
      const data = await res.json();
      setImages(data.images ?? []);
    } catch { setImages([]); } finally { setLoading(false); }
  }, [familyId]);

  useEffect(() => { void load(); }, [load]);

  async function onFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    try { setPending(await downscale(file)); setPendingComment(""); }
    catch (e) { alert(`이미지 처리 실패: ${String(e)}`); }
  }

  async function save() {
    if (!pending || !familyId || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/design-docs/reference-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family_id: familyId, mime: pending.mime, data: pending.base64, comment: pendingComment }),
      });
      const data = await res.json();
      if (data.error) { alert(`저장 실패: ${data.error}`); return; }
      setPending(null); setPendingComment("");
      await load();
    } finally { setSaving(false); }
  }

  async function saveComment(id: string) {
    try {
      await fetch("/api/design-docs/reference-images", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, comment: editText }),
      });
      setImages(prev => prev.map(im => im.id === id ? { ...im, comment: editText } : im));
    } catch { /* 무시 */ } finally { setEditingId(null); }
  }

  async function remove(id: string) {
    if (!confirm("이 레퍼런스 이미지를 삭제할까요?")) return;
    try {
      await fetch("/api/design-docs/reference-images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setImages(prev => prev.filter(im => im.id !== id));
    } catch { /* 무시 */ }
  }

  if (!familyId) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold" style={{ color: "rgba(180,210,255,1)" }}>📌 레퍼런스 이미지</p>
        <span className="text-[10px]" style={{ color: SILVER_DIM }}>{images.length}장</span>
      </div>
      <p className="text-[11px]" style={{ color: SILVER_DIM }}>참고·예상결과 이미지를 모아두세요. 썸네일을 누르면 크게 볼 수 있어요.</p>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
      {!pending && (
        <button onClick={() => fileRef.current?.click()} className="text-xs px-3 py-2 rounded-lg font-medium" style={{ backgroundColor: "rgba(100,220,160,0.15)", border: "1px solid rgba(100,220,160,0.5)", color: "rgba(150,255,200,1)" }}>
          ➕ 레퍼런스 추가
        </button>
      )}

      {/* 업로드 폼 — 미리보기 + 코멘트 */}
      {pending && (
        <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
          <img src={pending.dataUrl} alt="미리보기" className="w-full rounded-lg" style={{ maxHeight: 160, objectFit: "contain", border: `1px solid ${SILVER_FAINT}` }} />
          <textarea value={pendingComment} onChange={e => setPendingComment(e.target.value)} rows={2}
            placeholder="코멘트 (출처 게임·참고 포인트 등) — 선택"
            className="w-full text-xs px-2 py-1.5 rounded-lg outline-none resize-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setPending(null)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>취소</button>
            <button onClick={save} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-40" style={{ backgroundColor: "rgba(100,220,160,0.25)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}>{saving ? "저장 중..." : "저장"}</button>
          </div>
        </div>
      )}

      {/* 리스트 */}
      {loading ? (
        <p className="text-xs text-center py-6" style={{ color: SILVER_DIM }}>불러오는 중...</p>
      ) : images.length === 0 ? (
        <div className="text-center py-6 rounded-xl" style={{ border: `1px dashed ${SILVER_FAINT}` }}>
          <p className="text-2xl mb-1" style={{ opacity: 0.5 }}>📌</p>
          <p className="text-[11px]" style={{ color: SILVER_DIM }}>아직 등록된 레퍼런스가 없어요.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {images.map(im => (
            <div key={im.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
              <div className="relative group">
                <img src={im.url} alt={im.comment || "레퍼런스"} onClick={() => setViewer(im)} className="w-full cursor-zoom-in" style={{ maxHeight: 150, objectFit: "cover" }} />
                <button onClick={() => remove(im.id)} className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px]" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "rgba(255,160,160,1)" }}>🗑️</button>
                <span className="absolute bottom-1.5 right-1.5 text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "rgba(180,210,255,1)" }}>🔍 크게</span>
              </div>
              <div className="p-2">
                {editingId === im.id ? (
                  <div className="flex flex-col gap-1.5">
                    <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2} autoFocus
                      className="w-full text-[11px] px-2 py-1.5 rounded-lg outline-none resize-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }} />
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => setEditingId(null)} className="text-[10px] px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>취소</button>
                      <button onClick={() => saveComment(im.id)} className="text-[10px] px-2 py-1 rounded font-bold" style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(200,225,255,1)" }}>저장</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-1.5">
                    <p className="text-[11px] flex-1 whitespace-pre-wrap" style={{ color: im.comment ? SILVER : SILVER_DIM }}>{im.comment || "코멘트 없음"}</p>
                    <button onClick={() => { setEditingId(im.id); setEditText(im.comment); }} className="text-[11px] flex-shrink-0" style={{ color: SILVER_DIM }} title="코멘트 수정">✏️</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewer && <LargeViewer img={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}
