"use client";

// 게임 화면 와이어프레임 편집기 — Excalidraw 임베드
// PNG 다운로드 / Supabase Storage 업로드 후 기획서에 자동 첨부

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";
const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full" style={{ color: SILVER_DIM }}>편집기 로딩 중...</div> }
);

interface DocMeta {
  id: string;
  title: string;
  category_main_id: string | null;
  category_area_code: string | null;
  created_at: string;
  content_markdown?: string;
}

export default function WireframeEditor({
  open,
  onClose,
  nickname,
}: {
  open: boolean;
  onClose: () => void;
  nickname?: string;
}) {
  const [title, setTitle] = useState("새 화면 시안");
  const [exporting, setExporting] = useState(false);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  // 기획서 첨부 모달
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [docSections, setDocSections] = useState<string[]>([]);
  const [attachPosition, setAttachPosition] = useState<"end" | "after_section" | "top">("end");
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [attaching, setAttaching] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string>("");

  const handleApiReady = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  // PNG blob 생성 (공통)
  async function generatePngBlob(): Promise<Blob | null> {
    if (!apiRef.current) return null;
    const { exportToBlob } = await import("@excalidraw/excalidraw");
    const elements = apiRef.current.getSceneElements();
    if (elements.length === 0) {
      alert("그려진 내용이 없어요.");
      return null;
    }
    return await exportToBlob({
      elements,
      files: apiRef.current.getFiles(),
      mimeType: "image/png",
      appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
    });
  }

  // PNG 다운로드
  async function exportPng() {
    setExporting(true);
    try {
      const blob = await generatePngBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safe = title.replace(/[\\/:*?"<>|]/g, "_").trim() || "wireframe";
      a.download = `${safe}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`내보내기 실패: ${String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  // 기획서 첨부 흐름 시작 — 1) PNG 생성 → 2) 업로드 → 3) 기획서 목록 로드 → 4) 모달 표시
  async function startAttachFlow() {
    setExporting(true);
    try {
      const blob = await generatePngBlob();
      if (!blob) return;

      // base64 변환
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject();
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Storage 업로드
      const uploadRes = await fetch("/api/wireframe/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, title }),
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok || !uploadData.success) {
        alert(`업로드 실패: ${uploadData.error ?? "알 수 없는 오류"}`);
        return;
      }
      setUploadedUrl(uploadData.url);

      // 기획서 목록 fetch
      const docsRes = await fetch(`/api/design-docs?project_id=${DEFAULT_PROJECT_ID}`);
      const docsData = await docsRes.json();
      const list = (docsData.docs ?? []) as DocMeta[];
      setDocs(list);
      if (list.length > 0) {
        setSelectedDocId(list[0].id);
        await loadDocSections(list[0].id);
      }
      setShowAttachModal(true);
    } catch (err) {
      alert(`첨부 준비 실패: ${String(err)}`);
    } finally {
      setExporting(false);
    }
  }

  // 선택된 doc의 H2 섹션 추출
  async function loadDocSections(docId: string) {
    try {
      const res = await fetch(`/api/design-docs/${docId}`);
      const data = await res.json();
      const md = (data.doc?.content_markdown as string) ?? "";
      const sections: string[] = [];
      for (const line of md.split("\n")) {
        const m = line.match(/^##\s+(.+)/);
        if (m) sections.push(m[1].trim().replace(/[*_`]/g, ""));
      }
      setDocSections(sections);
      setSelectedSection(sections[0] ?? "");
    } catch { setDocSections([]); }
  }

  async function submitAttach() {
    if (!selectedDocId || !uploadedUrl) return;
    setAttaching(true);
    try {
      const res = await fetch("/api/design-docs/attach-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_id: selectedDocId,
          image_url: uploadedUrl,
          alt_text: title,
          position: attachPosition,
          section_title: attachPosition === "after_section" ? selectedSection : undefined,
          nickname,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`첨부 실패: ${data.error ?? "알 수 없는 오류"}`);
        return;
      }
      alert(`✅ "${docs.find(d => d.id === selectedDocId)?.title}" 기획서에 첨부됐어요`);
      setShowAttachModal(false);
    } catch (err) {
      alert(`첨부 실패: ${String(err)}`);
    } finally {
      setAttaching(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: "#0a0e1a" }}>
      {/* 상단 액션 바 */}
      <div className="px-4 py-2.5 flex items-center gap-2 flex-shrink-0 flex-wrap" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <p className="text-sm font-bold flex-shrink-0" style={{ color: SILVER }}>🎨 화면 설계</p>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-xs px-2.5 py-1.5 rounded-lg outline-none flex-shrink-0"
          style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", maxWidth: "260px" }}
          placeholder="시안 이름"
        />
        <div className="flex-1" />
        <button
          onClick={startAttachFlow}
          disabled={exporting}
          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 flex-shrink-0"
          style={{ backgroundColor: "rgba(200,180,255,0.2)", border: "1px solid rgba(200,180,255,0.5)", color: "rgba(220,200,255,1)" }}
        >
          {exporting ? "업로드 중..." : "📎 기획서에 첨부"}
        </button>
        <button
          onClick={exportPng}
          disabled={exporting}
          className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 flex-shrink-0"
          style={{ backgroundColor: "rgba(100,180,255,0.2)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}
        >
          📥 PNG 다운로드
        </button>
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
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
            canvasActions: { loadScene: false, saveAsImage: false, export: false, changeViewBackgroundColor: true, toggleTheme: false },
          }}
          langCode="ko-KR"
        />
      </div>

      <div className="px-4 py-2 flex-shrink-0 text-[10px]" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderTop: `1px solid ${SILVER_FAINT}`, color: SILVER_DIM }}>
        💡 사각형·라운드·텍스트로 화면 레이아웃 구성 → <b>📎 기획서에 첨부</b>로 자동 업로드 + 마크다운 삽입
      </div>

      {/* 기획서 첨부 모달 */}
      {showAttachModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => !attaching && setShowAttachModal(false)}>
          <div
            className="rounded-2xl w-full max-w-md shadow-2xl flex flex-col"
            style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <p className="text-sm font-bold" style={{ color: SILVER }}>📎 기획서에 첨부</p>
              <button onClick={() => setShowAttachModal(false)} disabled={attaching} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>✕</button>
            </div>
            <div className="px-5 py-4 flex flex-col gap-3">
              {docs.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: SILVER_DIM }}>생성된 기획서가 없어요. 먼저 기획서를 만들고 시도하세요.</p>
              ) : (
                <>
                  {/* 기획서 선택 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs" style={{ color: SILVER_DIM }}>대상 기획서</label>
                    <select
                      value={selectedDocId}
                      onChange={(e) => { setSelectedDocId(e.target.value); loadDocSections(e.target.value); }}
                      className="px-3 py-2 rounded-lg text-xs outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                    >
                      {docs.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                    </select>
                  </div>

                  {/* 삽입 위치 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs" style={{ color: SILVER_DIM }}>삽입 위치</label>
                    <select
                      value={attachPosition}
                      onChange={(e) => setAttachPosition(e.target.value as "end" | "after_section" | "top")}
                      className="px-3 py-2 rounded-lg text-xs outline-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                    >
                      <option value="end">맨 끝</option>
                      <option value="top">맨 위 (제목 바로 아래)</option>
                      <option value="after_section">특정 섹션 바로 아래</option>
                    </select>
                  </div>

                  {/* 섹션 선택 (after_section 일 때만) */}
                  {attachPosition === "after_section" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs" style={{ color: SILVER_DIM }}>섹션</label>
                      <select
                        value={selectedSection}
                        onChange={(e) => setSelectedSection(e.target.value)}
                        className="px-3 py-2 rounded-lg text-xs outline-none"
                        style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                      >
                        {docSections.length === 0 && <option value="">(섹션 없음)</option>}
                        {docSections.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  )}

                  <p className="text-[10px] mt-1" style={{ color: SILVER_DIM }}>
                    💡 이미지는 클라우드에 영구 저장돼요. 첨부 전 원본 백업 자동 생성.
                  </p>

                  <div className="flex gap-2 justify-end mt-2">
                    <button onClick={() => setShowAttachModal(false)} disabled={attaching} className="text-xs px-4 py-2 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>취소</button>
                    <button
                      onClick={submitAttach}
                      disabled={attaching || !selectedDocId}
                      className="text-xs px-4 py-2 rounded-lg font-bold disabled:opacity-40"
                      style={{ backgroundColor: "rgba(200,180,255,0.25)", border: "1px solid rgba(200,180,255,0.6)", color: "rgba(220,200,255,1)" }}
                    >
                      {attaching ? "첨부 중..." : "📎 첨부"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
