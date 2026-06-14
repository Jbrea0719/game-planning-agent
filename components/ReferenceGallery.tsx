"use client";

// 레퍼런스 갤러리 (Feature J)
// 참고 게임 화면을 종류별 라벨로 모아두고, "이 느낌으로" 선택 시 채팅에 첨부해 분석 근거로 사용.
// 날것 스크린샷을 매번 찾는 대신, 구조화된(라벨링된) 레퍼런스 라이브러리를 쌓는다.
// ※ 실제 게임 스크린샷은 사용자가 직접 업로드(저작권). 프레임워크는 바로 동작.

import { useEffect, useRef, useState } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

// 화면 종류 — 영웅수집형 게임 기준
const CATEGORIES = ["전투 UI", "영웅 도감", "상점·BM", "가챠 연출", "로비·메인", "성장·강화", "기타"];

interface Shot {
  id: string;
  url: string;
  category: string;
  game: string;
  label: string;
  note: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (img: { dataUrl: string; mime: string; base64: string }, label: string) => void;
}

// 업로드용 다운스케일 (긴 변 maxEdge로 축소, JPEG)
function downscale(file: File, maxEdge = 1568): Promise<{ dataUrl: string; mime: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.max(img.width, img.height) > maxEdge ? maxEdge / Math.max(img.width, img.height) : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
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

export default function ReferenceGallery({ open, onClose, onPick }: Props) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCat, setActiveCat] = useState<string>("전체");
  const fileRef = useRef<HTMLInputElement>(null);

  // 업로드 폼 상태
  const [pending, setPending] = useState<{ dataUrl: string; mime: string; base64: string } | null>(null);
  const [fGame, setFGame] = useState("");
  const [fLabel, setFLabel] = useState("");
  const [fNote, setFNote] = useState("");
  const [fCat, setFCat] = useState(CATEGORIES[0]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/reference-shots");
      const data = await res.json();
      setShots(data.shots ?? []);
    } catch { setShots([]); } finally { setLoading(false); }
  }

  useEffect(() => { if (open) void load(); }, [open]);

  async function onFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const img = await downscale(file);
      setPending(img);
    } catch (e) { alert(`이미지 처리 실패: ${String(e)}`); }
  }

  async function saveShot() {
    if (!pending || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reference-shots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mime: pending.mime, data: pending.base64, category: fCat, game: fGame, label: fLabel, note: fNote }),
      });
      const data = await res.json();
      if (data.error) { alert(`저장 실패: ${data.error}`); return; }
      setPending(null); setFGame(""); setFLabel(""); setFNote("");
      await load();
    } finally { setSaving(false); }
  }

  async function removeShot(id: string) {
    if (!confirm("이 레퍼런스를 삭제할까요?")) return;
    try {
      await fetch("/api/reference-shots", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      setShots(prev => prev.filter(s => s.id !== id));
    } catch { /* 무시 */ }
  }

  // "이 느낌으로" — 이미지 url을 base64로 받아 채팅 첨부로 전달
  async function pick(shot: Shot) {
    try {
      const res = await fetch(shot.url);
      const blob = await res.blob();
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const mime = blob.type || "image/jpeg";
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const label = [shot.game, shot.label].filter(Boolean).join(" · ") || shot.category;
      onPick({ dataUrl, mime, base64 }, label);
      onClose();
    } catch (e) { alert(`불러오기 실패: ${String(e)}`); }
  }

  if (!open) return null;

  const visible = activeCat === "전체" ? shots : shots.filter(s => s.category === activeCat);

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div
        className="rounded-2xl flex flex-col shadow-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}`, width: "min(96vw, 900px)", height: "min(90vh, 760px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div>
            <p className="text-sm font-bold" style={{ color: SILVER }}>🗂️ 레퍼런스 갤러리</p>
            <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>참고 게임 화면을 모아두고 “이 느낌으로” 선택해 분석 근거로 첨부</p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>

        {/* 카테고리 탭 */}
        <div className="px-5 pt-3 flex gap-1.5 flex-wrap flex-shrink-0">
          {["전체", ...CATEGORIES].map(c => (
            <button key={c} onClick={() => setActiveCat(c)}
              className="text-[11px] px-2.5 py-1 rounded-full"
              style={{
                backgroundColor: activeCat === c ? "rgba(100,180,255,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${activeCat === c ? "rgba(100,180,255,0.6)" : SILVER_FAINT}`,
                color: activeCat === c ? "rgba(180,210,255,1)" : SILVER_DIM,
              }}>
              {c}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* 추가 버튼 */}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          {!pending && (
            <button onClick={() => fileRef.current?.click()}
              className="text-xs px-3 py-2 rounded-lg mb-4 font-medium"
              style={{ backgroundColor: "rgba(100,220,160,0.15)", border: "1px solid rgba(100,220,160,0.5)", color: "rgba(150,255,200,1)" }}>
              ➕ 레퍼런스 추가
            </button>
          )}

          {/* 업로드 폼 */}
          {pending && (
            <div className="rounded-xl p-3 mb-4 flex gap-3" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
              <img src={pending.dataUrl} alt="미리보기" className="h-28 w-auto rounded-lg flex-shrink-0" style={{ border: `1px solid ${SILVER_FAINT}` }} />
              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  <select value={fCat} onChange={e => setFCat(e.target.value)} className="text-xs px-2 py-1.5 rounded-lg outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input value={fGame} onChange={e => setFGame(e.target.value)} placeholder="게임명 (예: 원신)" className="flex-1 text-xs px-2 py-1.5 rounded-lg outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }} />
                </div>
                <input value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder="라벨 (예: 캐릭터 도감 그리드)" className="w-full text-xs px-2 py-1.5 rounded-lg outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }} />
                <input value={fNote} onChange={e => setFNote(e.target.value)} placeholder="메모 (선택) — 이 화면의 참고 포인트" className="w-full text-[11px] px-2 py-1.5 rounded-lg outline-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }} />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setPending(null)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>취소</button>
                  <button onClick={saveShot} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-40" style={{ backgroundColor: "rgba(100,220,160,0.25)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}>{saving ? "저장 중..." : "저장"}</button>
                </div>
              </div>
            </div>
          )}

          {/* 그리드 */}
          {loading ? (
            <p className="text-xs text-center py-12" style={{ color: SILVER_DIM }}>불러오는 중...</p>
          ) : visible.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-3xl mb-2" style={{ opacity: 0.5 }}>🗂️</p>
              <p className="text-xs" style={{ color: SILVER_DIM }}>아직 레퍼런스가 없어요. “➕ 레퍼런스 추가”로 참고 게임 화면을 모아보세요.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {visible.map(s => (
                <div key={s.id} className="rounded-xl overflow-hidden flex flex-col" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
                  <div className="relative">
                    <img src={s.url} alt={s.label} className="w-full object-cover" style={{ height: 130 }} />
                    <span className="absolute top-1.5 left-1.5 text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "rgba(180,210,255,1)" }}>{s.category}</span>
                    <button onClick={() => removeShot(s.id)} className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "rgba(255,160,160,1)" }}>🗑️</button>
                  </div>
                  <div className="p-2 flex flex-col gap-1 flex-1">
                    <p className="text-[11px] font-bold truncate" style={{ color: SILVER }}>{s.game || "(게임 미지정)"}</p>
                    {s.label && <p className="text-[10px] truncate" style={{ color: SILVER_DIM }}>{s.label}</p>}
                    <button onClick={() => pick(s)} className="mt-auto text-[10px] px-2 py-1 rounded-lg font-medium" style={{ backgroundColor: "rgba(100,180,255,0.18)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}>
                      ✨ 이 느낌으로
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
