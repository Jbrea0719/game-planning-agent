"use client";

// AI mockup 생성기 — 자연어 → HTML 시안 → 미리보기 + 수정 반복

import { useState, useRef } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

interface DocMeta {
  id: string;
  title: string;
}

// 화면 시안 프리셋 — 게임 기획서 작성용
interface Preset {
  id: string;
  label: string;
  icon: string;
  width: number;
  height: number;
  hint: string;        // 클로드에게 전달할 사이즈·종류 힌트
  group: "전체 화면" | "부분 시안";
}

const PRESETS: Preset[] = [
  // 전체 화면
  { id: "pc_landscape", label: "PC 가로 (1280×720)", icon: "🖥️", width: 1280, height: 720, group: "전체 화면",
    hint: "PC 게임 전체 화면 (1280×720, 16:9 가로). 데스크톱 풀스크린 UI." },
  { id: "mobile_landscape", label: "모바일 가로 (844×390)", icon: "📱", width: 844, height: 390, group: "전체 화면",
    hint: "모바일 게임 가로 화면 (844×390, 21:9 가로). 가로 모드 모바일 게임 UI." },
  { id: "tablet_landscape", label: "태블릿 가로 (1024×768)", icon: "📱", width: 1024, height: 768, group: "전체 화면",
    hint: "태블릿 가로 화면 (1024×768, 4:3). 태블릿 풀스크린 UI." },
  // 부분 시안
  { id: "button", label: "버튼 / 컨트롤 (320×120)", icon: "🔘", width: 320, height: 120, group: "부분 시안",
    hint: "게임 UI의 단일 버튼·컨트롤 컴포넌트만 (320×120). 한 가지 인터랙션 요소에 집중." },
  { id: "card", label: "카드 / 아이템 (260×360)", icon: "🃏", width: 260, height: 360, group: "부분 시안",
    hint: "영웅·아이템·재화 카드 단일 컴포넌트 (260×360, 세로 카드 비례). 한 장의 카드 디자인에 집중." },
  { id: "popup", label: "팝업 / 모달 (520×640)", icon: "💬", width: 520, height: 640, group: "부분 시안",
    hint: "다이얼로그·확인 팝업·결과 화면 등 모달 UI (520×640). 중앙 정렬 카드형 컨테이너." },
  { id: "hud_top", label: "상단 HUD (1200×120)", icon: "📊", width: 1200, height: 120, group: "부분 시안",
    hint: "게임 화면 상단 HUD 바 (1200×120, 가로). 재화·레벨·로고·메뉴 버튼 같은 헤더 요소." },
  { id: "side_panel", label: "사이드 패널 (340×720)", icon: "📋", width: 340, height: 720, group: "부분 시안",
    hint: "사이드 메뉴·캐릭터 패널·인벤토리 등 좌우 패널 (340×720, 세로). 메뉴·리스트 UI." },
  { id: "tab_bar", label: "탭 바 / 네비 (1200×96)", icon: "📑", width: 1200, height: 96, group: "부분 시안",
    hint: "하단 탭 바·네비게이션·메뉴 (1200×96, 좁고 긴 가로). 아이콘+텍스트 형태 탭." },
];

export default function MockupGenerator({
  open,
  onClose,
  nickname,
}: {
  open: boolean;
  onClose: () => void;
  nickname?: string;
}) {
  const [description, setDescription] = useState("");
  const [refineMode, setRefineMode] = useState(false);
  const [refineInput, setRefineInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [mockupHtml, setMockupHtml] = useState("");
  const [mockupTitle, setMockupTitle] = useState("AI 시안");
  const [presetId, setPresetId] = useState<string>("pc_landscape");  // 기본: PC 가로
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const currentPreset = PRESETS.find(p => p.id === presetId) ?? PRESETS[0];

  // 기획서 첨부 모달
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [docSections, setDocSections] = useState<string[]>([]);
  const [attachPosition, setAttachPosition] = useState<"end" | "after_section" | "top">("end");
  const [selectedSection, setSelectedSection] = useState<string>("");
  const [attaching, setAttaching] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string>("");
  const [capturingPng, setCapturingPng] = useState(false);

  const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

  async function generateMockup(refine: boolean) {
    const desc = refine ? refineInput : description;
    if (!desc.trim() || generating) return;
    setGenerating(true);
    try {
      // 프리셋 힌트를 사용자 설명 앞에 붙여서 전달
      const presetPrefix = `[화면 종류·사이즈]\n${currentPreset.hint}\n\n[요청 내용]\n`;
      const fullDesc = refine ? desc : `${presetPrefix}${desc}`;
      const res = await fetch("/api/mockup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: fullDesc,
          refineFrom: refine ? mockupHtml : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`생성 실패: ${data.error ?? "알 수 없는 오류"}`);
        return;
      }
      setMockupHtml(data.html);
      setRefineInput("");
      if (refine) setRefineMode(false);
    } catch (err) {
      alert(`생성 실패: ${String(err)}`);
    } finally { setGenerating(false); }
  }

  function downloadHtml() {
    if (!mockupHtml) return;
    const blob = new Blob([mockupHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = mockupTitle.replace(/[\\/:*?"<>|]/g, "_").trim() || "mockup";
    a.download = `${safe}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // iframe 안의 HTML을 PNG로 캡쳐 (html2canvas)
  // Tailwind CDN 로드 대기 후 캡쳐
  async function captureIframeAsPng(): Promise<string | null> {
    const iframe = iframeRef.current;
    if (!iframe) return null;
    const doc = iframe.contentDocument;
    if (!doc) return null;

    // Tailwind CDN 로드 대기 (최대 3초)
    await new Promise<void>((resolve) => {
      let elapsed = 0;
      const tick = () => {
        const ready = doc.readyState === "complete";
        if (ready || elapsed >= 3000) resolve();
        else { elapsed += 100; setTimeout(tick, 100); }
      };
      tick();
    });
    // 추가 안정화 (Tailwind 스타일 적용 시간)
    await new Promise(r => setTimeout(r, 500));

    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(doc.documentElement, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
        width: doc.documentElement.scrollWidth,
        height: doc.documentElement.scrollHeight,
      });
      return canvas.toDataURL("image/png");
    } catch (err) {
      console.error("[mockup] PNG 캡쳐 실패:", err);
      return null;
    }
  }

  // PNG 다운로드
  async function downloadPng() {
    setCapturingPng(true);
    try {
      const dataUrl = await captureIframeAsPng();
      if (!dataUrl) { alert("PNG 변환 실패"); return; }
      const a = document.createElement("a");
      a.href = dataUrl;
      const safe = mockupTitle.replace(/[\\/:*?"<>|]/g, "_").trim() || "mockup";
      a.download = `${safe}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally { setCapturingPng(false); }
  }

  // 기획서 첨부 흐름 — PNG 변환 → 업로드 → 기획서 목록 fetch → 모달
  async function startAttachFlow() {
    setCapturingPng(true);
    try {
      const dataUrl = await captureIframeAsPng();
      if (!dataUrl) { alert("PNG 변환 실패"); return; }

      // 업로드
      const uploadRes = await fetch("/api/wireframe/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, title: mockupTitle }),
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
    } finally { setCapturingPng(false); }
  }

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
          alt_text: mockupTitle,
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
    } finally { setAttaching(false); }
  }

  function resetAll() {
    if (mockupHtml && !confirm("현재 시안을 버리고 새로 시작할까요?")) return;
    setMockupHtml("");
    setDescription("");
    setRefineInput("");
    setRefineMode(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ backgroundColor: "#0a0e1a" }}>
      {/* 상단 액션 바 */}
      <div className="px-4 py-2.5 flex items-center gap-2 flex-shrink-0 flex-wrap" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <p className="text-sm font-bold flex-shrink-0" style={{ color: SILVER }}>🪄 AI 시안 생성</p>
        {mockupHtml && (
          <input
            value={mockupTitle}
            onChange={(e) => setMockupTitle(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg outline-none flex-shrink-0"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", maxWidth: "240px" }}
            placeholder="시안 이름"
          />
        )}
        <div className="flex-1" />
        {mockupHtml && (
          <>
            <button
              onClick={resetAll}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
            >🔄 새로 시작</button>
            <button
              onClick={startAttachFlow}
              disabled={capturingPng}
              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
              style={{ backgroundColor: "rgba(200,180,255,0.2)", border: "1px solid rgba(200,180,255,0.5)", color: "rgba(220,200,255,1)" }}
            >
              {capturingPng ? "변환 중..." : "📎 기획서에 첨부"}
            </button>
            <button
              onClick={downloadPng}
              disabled={capturingPng}
              className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
              style={{ backgroundColor: "rgba(100,180,255,0.2)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}
            >📥 PNG</button>
            <button
              onClick={downloadHtml}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
            >📥 HTML</button>
          </>
        )}
        <button
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ backgroundColor: "rgba(100,220,160,0.18)", border: "1px solid rgba(100,220,160,0.6)", color: "rgba(150,255,200,1)" }}
        >← 닫기</button>
      </div>

      {/* 본문 — 입력 영역 + 미리보기 */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        {/* 왼쪽: 입력 */}
        <div className="md:w-[400px] flex flex-col p-4 gap-3" style={{ borderRight: `1px solid ${SILVER_FAINT}` }}>
          {!mockupHtml ? (
            <>
              {/* 프리셋 선택 */}
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: SILVER }}>📐 화면 종류·사이즈</p>
                <select
                  value={presetId}
                  onChange={(e) => setPresetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none mb-2"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                >
                  <optgroup label="전체 화면">
                    {PRESETS.filter(p => p.group === "전체 화면").map(p => (
                      <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="부분 시안 (기획서용)">
                    {PRESETS.filter(p => p.group === "부분 시안").map(p => (
                      <option key={p.id} value={p.id}>{p.icon} {p.label}</option>
                    ))}
                  </optgroup>
                </select>
                <p className="text-[10px]" style={{ color: SILVER_DIM }}>
                  💡 부분 시안은 특정 버튼·카드·HUD 같은 컴포넌트 단위로 만들어 기획서에 첨부
                </p>
              </div>

              <div>
                <p className="text-xs font-bold mb-2" style={{ color: SILVER }}>🎯 시안 설명</p>
                <p className="text-[10px] mb-2" style={{ color: SILVER_DIM }}>
                  자세할수록 좋은 결과. 구성·요소·색감 등 구체적으로.
                </p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={getPlaceholder(currentPreset)}
                  rows={11}
                  className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", lineHeight: 1.55 }}
                  autoFocus
                />
              </div>
              <button
                onClick={() => generateMockup(false)}
                disabled={generating || !description.trim()}
                className="text-sm py-3 rounded-lg font-bold disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ backgroundColor: "rgba(200,180,255,0.25)", border: "1px solid rgba(200,180,255,0.6)", color: "rgba(220,200,255,1)" }}
              >
                {generating ? (
                  <>
                    <span className="inline-block w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(220,200,255,0.3)", borderTopColor: "rgba(220,200,255,1)" }} />
                    생성 중...
                  </>
                ) : (
                  <>🪄 시안 생성</>
                )}
              </button>
              <p className="text-[10px]" style={{ color: SILVER_DIM }}>
                💡 Opus 4.7 사용 (정밀도 ↑, 약 15~30초 소요)
              </p>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: SILVER }}>📝 수정 요청</p>
                <p className="text-[10px] mb-2" style={{ color: SILVER_DIM }}>
                  현재 시안을 어떻게 바꿀지 설명. (예: "재화 영역을 우상단으로", "카드 5x4 격자로")
                </p>
                {!refineMode ? (
                  <button
                    onClick={() => setRefineMode(true)}
                    className="w-full text-sm py-2.5 rounded-lg font-medium"
                    style={{ backgroundColor: "rgba(100,180,255,0.18)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}
                  >✏️ 수정 요청 시작</button>
                ) : (
                  <>
                    <textarea
                      value={refineInput}
                      onChange={(e) => setRefineInput(e.target.value)}
                      placeholder="예: 재화 영역을 우상단으로 옮기고, 카드 사이 간격을 조금 더 넓혀줘"
                      rows={5}
                      className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none mb-2"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", lineHeight: 1.55 }}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setRefineMode(false); setRefineInput(""); }}
                        className="flex-1 text-xs py-2 rounded-lg"
                        style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
                      >취소</button>
                      <button
                        onClick={() => generateMockup(true)}
                        disabled={generating || !refineInput.trim()}
                        className="flex-1 text-xs py-2 rounded-lg font-bold disabled:opacity-40"
                        style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.6)", color: "rgba(180,210,255,1)" }}
                      >
                        {generating ? "수정 중..." : "🪄 적용"}
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
                <p className="text-xs font-bold mb-2" style={{ color: SILVER_DIM }}>📌 원본 설명</p>
                <p className="text-[10px] whitespace-pre-wrap" style={{ color: SILVER_DIM, maxHeight: "150px", overflow: "auto" }}>
                  {description}
                </p>
              </div>
            </>
          )}
        </div>

        {/* 오른쪽: 미리보기 iframe */}
        <div className="flex-1 min-h-0 p-4 flex items-center justify-center" style={{ backgroundColor: "#06080f" }}>
          {!mockupHtml ? (
            <div className="text-center" style={{ color: SILVER_DIM }}>
              <p className="text-6xl mb-3">🎨</p>
              <p className="text-sm font-medium" style={{ color: SILVER }}>{currentPreset.icon} {currentPreset.label}</p>
              <p className="text-xs mt-1">선택된 프리셋. 왼쪽에서 변경 가능</p>
              <p className="text-sm mt-4">설명 입력 후 [🪄 시안 생성] 클릭</p>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center overflow-auto p-2">
              <iframe
                ref={iframeRef}
                srcDoc={mockupHtml}
                title="mockup preview"
                sandbox="allow-same-origin allow-scripts"
                className="rounded-xl shadow-2xl flex-shrink-0"
                style={{
                  width: `min(${currentPreset.width}px, 100%)`,
                  height: `min(${currentPreset.height}px, calc(100vh - 120px))`,
                  border: `1px solid ${SILVER_FAINT}`,
                  backgroundColor: "#000",
                }}
              />
            </div>
          )}
        </div>
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
                    💡 시안이 PNG로 변환돼 클라우드에 영구 저장. 첨부 전 원본 백업 자동 생성.
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

// 프리셋별 placeholder 예시 텍스트
function getPlaceholder(p: Preset): string {
  switch (p.id) {
    case "pc_landscape":
      return "예시:\n\nPC 로비 화면.\n- 좌측: 메인 메뉴 6개 (홈/캐릭터/길드/상점/이벤트/설정)\n- 가운데: 캐릭터 일러스트 + 진행 중인 이벤트 배너\n- 상단: 재화 (골드·다이아·티켓) + 우상단 우편함·알림\n- 하단: 일일 미션 진행도";
    case "mobile_landscape":
      return "예시:\n\n전투 화면 (가로 모바일).\n- 좌측: 영웅 1·2·3 카드 + HP/스킬\n- 중앙: 전투 영역 (적 진영)\n- 우측: 자동전투·속도배수·일시정지\n- 상단: 웨이브·시간·재화";
    case "tablet_landscape":
      return "예시:\n\n캐릭터 상세 화면 (태블릿).\n- 좌측 60%: 캐릭터 풀바디 일러스트 + 능력치\n- 우측 40%: 스킬·장비·각성·스토리 탭";
    case "button":
      return "예시:\n\n가챠 뽑기 버튼 (1회/10회).\n- 좌: 1회 뽑기 (다이아 200)\n- 우: 10회 뽑기 (다이아 1800, 할인 표시)\n- 강조 효과 + 가챠 아이콘";
    case "card":
      return "예시:\n\n전설 등급 영웅 카드.\n- 상단: 등급 별 5개 + 클래스 아이콘\n- 중앙: 캐릭터 일러스트 (placeholder)\n- 하단: 이름·레벨·체력바\n- 우상단: 신규 NEW 뱃지";
    case "popup":
      return "예시:\n\n뽑기 결과 팝업.\n- 상단: '뽑기 결과!' 헤더\n- 중앙: 획득한 영웅 3장 가로 나열 (등급별 효과)\n- 하단: [다시 뽑기] [확인] 버튼";
    case "hud_top":
      return "예시:\n\n인게임 상단 HUD.\n- 좌측: 로고·서버\n- 중앙: 재화 (골드·다이아·체력·티켓) 4종\n- 우측: 우편함·이벤트·설정 아이콘";
    case "side_panel":
      return "예시:\n\n캐릭터 사이드 패널.\n- 상단: 검색바 + 정렬 드롭다운\n- 메인: 보유 영웅 리스트 (이미지·이름·레벨·등급)\n- 하단: [강화] [장비] 빠른 진입 버튼";
    case "tab_bar":
      return "예시:\n\n메인 메뉴 하단 탭 바.\n- 5개 탭: 홈·캐릭터·전투·상점·더보기\n- 각 탭: 아이콘 + 한글 라벨\n- 현재 활성: 파란색 강조";
    default:
      return "화면 구성을 자세히 설명해주세요.";
  }
}
