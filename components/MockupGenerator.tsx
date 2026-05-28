"use client";

// AI mockup 생성기 — 자연어 → HTML 시안 → 미리보기 + 수정 반복

import { useState, useRef } from "react";

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

export default function MockupGenerator({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [description, setDescription] = useState("");
  const [refineMode, setRefineMode] = useState(false);
  const [refineInput, setRefineInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [mockupHtml, setMockupHtml] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  async function generateMockup(refine: boolean) {
    const desc = refine ? refineInput : description;
    if (!desc.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/mockup/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: desc,
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

  // PNG 캡처는 클라이언트 측 html2canvas 필요 — 일단 HTML 다운로드만 제공
  function downloadHtml() {
    if (!mockupHtml) return;
    const blob = new Blob([mockupHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mockup_${Date.now()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
        <div className="flex-1" />
        {mockupHtml && (
          <>
            <button
              onClick={resetAll}
              className="text-xs px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
            >🔄 새로 시작</button>
            <button
              onClick={downloadHtml}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ backgroundColor: "rgba(100,180,255,0.2)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}
            >📥 HTML 다운로드</button>
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
              <div>
                <p className="text-xs font-bold mb-2" style={{ color: SILVER }}>🎯 화면 설명</p>
                <p className="text-[10px] mb-2" style={{ color: SILVER_DIM }}>
                  자세할수록 좋은 결과. 화면 구성·요소 위치·재화·메뉴 등을 구체적으로.
                </p>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="예시:&#10;&#10;캐릭터 컬렉션 화면.&#10;- 상단: 로고 + 골드·다이아 재화 표시&#10;- 가운데: 3x4 격자, 각 카드에 캐릭터 일러스트·이름·등급(별)·레벨&#10;- 하단: 메인 탭 5개 (홈/캐릭터/장비/상점/이벤트)&#10;- 우상단: 정렬 필터 버튼"
                  rows={14}
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
              <p className="text-sm">왼쪽에 화면 설명을 입력하고</p>
              <p className="text-sm">[🪄 시안 생성]을 눌러보세요</p>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <iframe
                ref={iframeRef}
                srcDoc={mockupHtml}
                title="mockup preview"
                sandbox="allow-same-origin allow-scripts"
                className="rounded-xl shadow-2xl"
                style={{
                  width: "min(420px, 100%)",
                  height: "min(90vh, 800px)",
                  border: `1px solid ${SILVER_FAINT}`,
                  backgroundColor: "#000",
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
