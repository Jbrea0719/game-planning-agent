"use client";

import { REFERENCE_GAMES } from "@/lib/reference-games";
import { useState, useRef, useEffect, memo, KeyboardEvent, ClipboardEvent } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // GFM 지원 — 표(table)·취소선 등 마크다운 확장 렌더링
import dynamic from "next/dynamic";
import DecisionPanel from "@/components/DecisionPanel";
import DocumentView from "@/components/DocumentView";
import DocPickerModal from "@/components/DocPickerModal";
import DocRevisePreview, { type RevisePreview } from "@/components/DocRevisePreview";
import DocGenPreview, { type DocGenPreviewData } from "@/components/DocGenPreview";
import ExtractedReviewCard from "@/components/ExtractedReviewCard";
import MobileChatPage from "@/components/MobileChatPage";
import HistoryPanel from "@/components/HistoryPanel";
import ImageIntentBar from "@/components/ImageIntentBar";
import ImageAnnotator from "@/components/ImageAnnotator";
import SketchWireframeModal from "@/components/SketchWireframeModal";
import ReferenceGallery from "@/components/ReferenceGallery";
import NotificationBell from "@/components/NotificationBell";
import { buildImageIntentPrefix } from "@/lib/image-intent";
import { useDeviceMode, DEVICE_FRAMES } from "@/hooks/useIsMobile";
import { useCrossTabSync } from "@/hooks/useCrossTabSync";

// WireframeEditor·MockupGenerator는 DocumentView 안에서 호출 (📄 기획서 → 🎨 화면 설계 버튼)

// 단일 프로젝트 고정 ID (Phase A — 추후 다중 프로젝트 지원 시 변경)
const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

type Message = {
  role: "user" | "assistant";
  content: string;
  pair_id?: string;
  is_deleted?: boolean;
  image_id?: string;  // 첨부 이미지 (doc_images id) — /api/img/<id>로 표시
};

type CriticEntry = { round: number; approved: boolean; feedback: string };

type MessagePair = {
  pair_id: string;
  user: Message;
  assistant: Message;
  is_deleted: boolean;
  detail_content?: string;
  detail_loading?: boolean;
  detail_shown?: boolean;
  timestamp?: string;
  critic_history?: CriticEntry[];
  critic_shown?: boolean;
  feedback_summary?: string;
  feedback_summary_shown?: boolean;
};

function getTime() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "오후" : "오전";
  const hour = h % 12 || 12;
  return `${ampm} ${hour}:${m}`;
}

// 조던 테마 컬러
const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";

function getDateStr() {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function getUniqueFilename(base: string, ext: string): string {
  // jordan_agent_download_names 키로 다운로드 파일명 중복 방지
  const STORAGE_KEY = "jordan_agent_download_names";
  const stored: Record<string, number> = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  const key = `${base}.${ext}`;
  if (!stored[key]) {
    stored[key] = 1;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return `${base}.${ext}`;
  } else {
    stored[key]++;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    return `${base}_(${stored[key]}).${ext}`;
  }
}

async function downloadFile(content: string, type: "txt" | "md") {
  // 기본 제목: 조던_답변
  let title = "조던_답변";
  try {
    const res = await fetch("/api/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (data.title) title = data.title;
  } catch { /* 실패 시 기본값 사용 */ }

  const base = `${title}_${getDateStr()}`;
  const filename = getUniqueFilename(base, type);

  const mime = type === "md" ? "text/markdown" : "text/plain";
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// **"텍스트"** 패턴에서 따옴표를 제거해 마크다운 bold가 깨지지 않도록 전처리
function fixMarkdown(text: string): string {
  return text
    .replace(/\*\*"([^"]+)"\*\*/g, "**$1**")
    .replace(/\*\*'([^']+)'\*\*/g, "**$1**");
}

// ════════════════════════════════════════
// 출처 라벨 스타일 적용 — 핵심 키워드 강조와 시각 분리
// 예: [공식 인용 — 4개 일치], [유저 의견 다수 — 디시 8건], [확인 안 됨]
// ════════════════════════════════════════
const CITATION_PATTERN = /\[(?:공식 인용|언론 인용|위키 인용|유저 의견|\d+개 출처만|확인 안 됨)[^\]]*\]/g;

// 텍스트 내 citation 패턴을 muted color span으로 감싸기
function renderWithCitations(text: string): React.ReactNode {
  if (!text || !text.includes("[")) return text;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(CITATION_PATTERN.source, "g");
  let idx = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <span
        key={`cite-${idx++}`}
        style={{
          color: "rgba(150,160,180,0.55)",  // 차분한 회색 — 본문보다 흐림
          fontSize: "0.82em",
          fontWeight: 400,
          fontStyle: "normal",
        }}
      >
        {match[0]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

// React children 재귀 처리: 모든 text 노드에 citation 스타일 적용
function processChildrenForCitations(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === "string") return renderWithCitations(child);
    if (React.isValidElement(child)) {
      const el = child as React.ReactElement<{ children?: React.ReactNode }>;
      if (el.props.children) {
        return React.cloneElement(el, {
          children: processChildrenForCitations(el.props.children),
        });
      }
    }
    return child;
  });
}

// react-markdown에 넘길 components 객체
// p, li, strong, em, h1~h6, td 등 텍스트가 들어가는 모든 요소에 적용
type MdProps = { children?: React.ReactNode };
const citationComponents = {
  p: ({ children, ...props }: MdProps) => <p {...props}>{processChildrenForCitations(children)}</p>,
  li: ({ children, ...props }: MdProps) => <li {...props}>{processChildrenForCitations(children)}</li>,
  strong: ({ children, ...props }: MdProps) => <strong {...props}>{processChildrenForCitations(children)}</strong>,
  em: ({ children, ...props }: MdProps) => <em {...props}>{processChildrenForCitations(children)}</em>,
  h1: ({ children, ...props }: MdProps) => <h1 {...props}>{processChildrenForCitations(children)}</h1>,
  h2: ({ children, ...props }: MdProps) => <h2 {...props}>{processChildrenForCitations(children)}</h2>,
  h3: ({ children, ...props }: MdProps) => <h3 {...props}>{processChildrenForCitations(children)}</h3>,
  h4: ({ children, ...props }: MdProps) => <h4 {...props}>{processChildrenForCitations(children)}</h4>,
  // 표 — 좁은 화면에서 칸이 뭉개지지 않게 가로 스크롤 래퍼 + 내용 폭 기준
  table: ({ children, ...props }: MdProps) => (
    <div style={{ overflowX: "auto", margin: "0.6rem 0", WebkitOverflowScrolling: "touch", border: "1px solid rgba(192,200,216,0.18)", borderRadius: 8 }}>
      <table {...props} style={{ borderCollapse: "collapse", width: "auto", fontSize: "13px", lineHeight: 1.5 }}>{children}</table>
    </div>
  ),
  th: ({ children, ...props }: MdProps) => <th {...props} style={{ border: "1px solid rgba(192,200,216,0.22)", padding: "6px 10px", textAlign: "left", whiteSpace: "nowrap", backgroundColor: "rgba(255,255,255,0.05)", fontWeight: 700 }}>{processChildrenForCitations(children)}</th>,
  td: ({ children, ...props }: MdProps) => <td {...props} style={{ border: "1px solid rgba(192,200,216,0.15)", padding: "6px 10px", verticalAlign: "top", minWidth: 56 }}>{processChildrenForCitations(children)}</td>,
  blockquote: ({ children, ...props }: MdProps) => <blockquote {...props}>{processChildrenForCitations(children)}</blockquote>,
};

// 어시스턴트 메시지 렌더러 — 출처 라벨 스타일 자동 적용
// memo: 마크다운 파싱은 비용이 커서, text가 바뀔 때만 다시 그림.
// → 입력창 타이핑으로 부모가 리렌더돼도 쌓인 메시지는 재파싱 안 함 (PC 입력 렉 해결, 모바일과 동일 처리).
const AssistantMarkdown = memo(function AssistantMarkdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]} components={citationComponents}>{fixMarkdown(text)}</ReactMarkdown>;
});

// ── 헤더 버튼용 커스텀 툴팁 ──
// 데스크톱: 마우스 호버 시 표시
// 모바일: 터치 다운 → 표시 / 터치 떼면 → 닫히고 버튼 클릭 자연 발생
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [touched, setTouched] = useState(false);
  return (
    <div
      className="relative group flex-shrink-0"
      onTouchStart={() => setTouched(true)}
      onTouchEnd={() => setTouched(false)}
      onTouchCancel={() => setTouched(false)}
    >
      {children}
      <span
        className={`pointer-events-none absolute top-full mt-2 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-md text-xs transition-opacity duration-150 z-50 ${touched ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        style={{
          backgroundColor: "rgba(15,25,40,0.97)",
          border: "1px solid rgba(192,200,216,0.3)",
          color: "#e0e8f0",
          backdropFilter: "blur(8px)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          maxWidth: "240px",
          minWidth: "max-content",
          whiteSpace: "normal",
          lineHeight: 1.45,
          textAlign: "center",
        }}
      >
        {text}
      </span>
    </div>
  );
}

// 토큰 한도 초과로 잘린 경우 불완전한 마지막 줄 제거
function cleanTruncated(text: string): string {
  let clean = text.replace("__TRUNCATED__", "").trimEnd();
  if (/([요다죠네해)]|[!?.。！？])\s*$/.test(clean)) return clean;
  const lastNL = clean.lastIndexOf("\n");
  if (lastNL > 0) return clean.slice(0, lastNL).trimEnd();
  return clean;
}

export default function ChatPage() {
  // 디바이스 분기 — 모바일이면 MobileChatPage 렌더 (같은 URL, 클라이언트 분기)
  // SSR/초기 hydration 동안엔 null → 깜빡임 방지 위해 빈 화면
  const { isMobile, frameKind } = useDeviceMode();
  if (isMobile === null) {
    return <div className="h-screen" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1525 50%, #0a1020 100%)" }} />;
  }
  if (isMobile) {
    // PC에서 모바일 뷰 강제 (frameKind 있음) → 디바이스 프레임 안에 렌더
    if (frameKind) {
      const frame = DEVICE_FRAMES[frameKind];
      return (
        <div className="h-[100dvh] flex flex-col items-center justify-center p-4 gap-3 overflow-hidden" style={{ background: "linear-gradient(160deg, #1a1f30 0%, #14182a 100%)" }}>
          {/* 프레임 헤더 */}
          <div className="flex items-center justify-between gap-3 flex-shrink-0" style={{ width: `${frame.width}px`, maxWidth: "calc(100vw - 32px)" }}>
            <p className="text-sm font-bold truncate" style={{ color: "#c0c8d8" }}>
              {frameKind === "ios" ? "📱" : "🤖"} PC에서 모바일 뷰 ({frame.label})
            </p>
            <a
              href="/chat?view=desktop"
              className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
              style={{ backgroundColor: "rgba(192,200,216,0.15)", border: "1px solid rgba(192,200,216,0.4)", color: "#c0c8d8" }}
            >
              🖥️ PC 뷰로 돌아가기
            </a>
          </div>
          {/* 디바이스 프레임 — 뷰포트 높이에 맞춰 자동 축소 (비율 유지) */}
          <div
            className="rounded-[36px] overflow-hidden shadow-2xl border-[8px] flex-shrink"
            style={{
              width: `${frame.width}px`,
              height: `${frame.height}px`,
              maxHeight: "calc(100dvh - 90px)",
              maxWidth: "calc(100vw - 32px)",
              aspectRatio: `${frame.width} / ${frame.height}`,
              borderColor: frameKind === "ios" ? "#222" : "#2a2a30",
              backgroundColor: "#000",
            }}
          >
            <MobileChatPage simulateKeyboard />
          </div>
        </div>
      );
    }
    // 실제 모바일 — 100dvh로 전체 채움
    return (
      <div className="h-[100dvh]">
        <MobileChatPage />
      </div>
    );
  }
  return <DesktopChatPage />;
}

function DesktopChatPage() {
  const [pairs, setPairs] = useState<MessagePair[]>([]);
  const [streamingPair, setStreamingPair] = useState<{ user: string; assistant: string; userImageId?: string } | null>(null);
  // 첨부 이미지 (전송 전 미리보기) + 업로드 상태
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; mime: string; base64: string } | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  // 이미지 의도 태그 + 메모 + 영역표시 (Feature H)
  const [imageIntentTags, setImageIntentTags] = useState<string[]>([]);
  const [imageMemo, setImageMemo] = useState("");
  const [imageHasAnnotation, setImageHasAnnotation] = useState(false);
  const [showAnnotator, setShowAnnotator] = useState(false);
  const [showSketchModal, setShowSketchModal] = useState(false);  // 스케치→와이어프레임 (Feature L)
  const [showRefGallery, setShowRefGallery] = useState(false);  // 레퍼런스 갤러리 (Feature J)
  const [docOpenTarget, setDocOpenTarget] = useState<{ docId: string | null; commentId: string | null } | null>(null);  // 알림 바로가기 타겟
  // 이미지 첨부 해제 시 의도 상태도 초기화
  function clearAttachedImage() {
    setAttachedImage(null);
    setImageIntentTags([]);
    setImageMemo("");
    setImageHasAnnotation(false);
  }
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // 방별 생성 중 상태 — 여러 대화방에서 동시에 답변 생성(백그라운드) 가능
  const [generatingConvIds, setGeneratingConvIds] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);  // 🕘 히스토리 — 별도 팝업
  // showWireframe/showMockup state는 DocumentView 안으로 이동됨
  // 맥락선 없을 때 안내 토스트
  const [noAnchorNotice, setNoAnchorNotice] = useState(false);
  // 조던 인터뷰 모드
  const [interviewLoading, setInterviewLoading] = useState(false);
  // 기획서 백그라운드 작성 상태 + 취소용 AbortController
  const [docBackgroundGenerating, setDocBackgroundGenerating] = useState(false);
  const docGenAbortRef = useRef<AbortController | null>(null);
  // 기획서 작성 완료 알림 (사용자 확인 시 사라짐, 자동 해제 X)
  const [docCompletedNotice, setDocCompletedNotice] = useState<{ title: string; version_no: number } | null>(null);
  // 📄 기획서 버튼 레드닷 — 보지 않은 신규 기획서 있음 (localStorage 유지)
  const [docNewDot, setDocNewDot] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showAnswerCompleteBtn, setShowAnswerCompleteBtn] = useState(false);
  // 롤링 맥락 카드 — 항상 3줄, 새 답변마다 백그라운드로 교체
  const [agentContext, setAgentContext] = useState("");
  const [showContextModal, setShowContextModal] = useState(false);
  // 대화방 (병렬 작업) — 방마다 메시지·맥락 독립
  // DB가 상태(맥락선·참고기획서·맥락카드)의 단일 소스 — 목록에 함께 실어와 룸 전환 시 복원
  const [conversations, setConversations] = useState<{
    id: string; title: string;
    context_anchor_pair_id?: string | null;
    context_anchor_time?: string | null;
    reference_doc_ids?: string[] | null;
    agent_context?: string | null;
  }[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [showConvList, setShowConvList] = useState(false);
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [convRenameInput, setConvRenameInput] = useState("");
  const currentConvIdRef = useRef<string | null>(null);  // sendMessage 등에서 최신값 참조용
  // 맥락 결정사항 — 맥락선 이후 추가된 결정사항만 보여줌
  type RecentDecision = {
    id: string;
    content: string;
    confidence: string;
    sub_category_id: string | null;
    created_at: string;
    created_by_nickname?: string | null;
  };
  const [recentDecisions, setRecentDecisions] = useState<RecentDecision[]>([]);
  const [recentDecisionsLoading, setRecentDecisionsLoading] = useState(false);
  // 인라인 신뢰도 라벨 토글 (기본 OFF — 가독성 우선, localStorage에 저장)
  const [showCitations, setShowCitations] = useState(false);
  // 자세한 답변 자동 표시 (기본 OFF) — ON이면 답변 완료 시 자동으로 '자세한 답변'까지 펼침
  const [autoDetail, setAutoDetail] = useState(false);
  // 결정사항 트래커 패널 (UI 명칭: 기획 바이블)
  const [showDecisionPanel, setShowDecisionPanel] = useState(false);
  const [decisionCount, setDecisionCount] = useState(0);
  // 신규 항목 알림용 빨간 점 — 클릭 시 또는 2분 후 자동 사라짐
  const [bibleNewBadge, setBibleNewBadge] = useState(false);
  const prevDecisionCountRef = useRef(0);
  const bibleBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 맥락 시작점 anchor — 이 시점 이후의 대화·결정사항만 조던에게 전달
  const [contextAnchorPairId, setContextAnchorPairId] = useState<string | null>(null);
  const [contextAnchorTimestamp, setContextAnchorTimestamp] = useState<string | null>(null);
  // reloadKey 증가 → DecisionPanel이 결정사항 다시 fetch (자동 추출 후 갱신)
  const [decisionReloadKey, setDecisionReloadKey] = useState(0);
  // 자동 추출 알림 (사용자에게 잠시 노출)
  const [extractedNotice, setExtractedNotice] = useState<number | null>(null);
  // 추출된 결정사항 검토 모달
  type ExtractedItem = { id: string; content: string; confidence: string; sub_category_label: string | null };
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [showExtractedReview, setShowExtractedReview] = useState(false);
  // 보류된 결정 알림 (조던이 반대·우려)
  const [heldNotice, setHeldNotice] = useState<number | null>(null);
  // 바이블 일관성 검사 — 새 답변이 기존 결정과 모순될 때 경고 (Feature C)
  type BibleConflict = { existing: string; newClaim: string; reason: string; severity: "high" | "low" };
  const [bibleConflicts, setBibleConflicts] = useState<BibleConflict[] | null>(null);
  // 기획서 뷰
  const [showDocumentView, setShowDocumentView] = useState(false);
  const [showDocMenu, setShowDocMenu] = useState(false);  // 헤더 '📄 기획서 ▾' 드롭다운
  const [docGenPreview, setDocGenPreview] = useState<DocGenPreviewData | null>(null);  // 기획서 작성 미리보기
  // 기획서 작성 방향 지시 입력 (선택 대화 → 작성 시작 시 뜨는 입력창)
  const [showDocDirection, setShowDocDirection] = useState(false);
  const [docDirection, setDocDirection] = useState("");
  // 참고 기획서(다중) — 답변 시 교차 참고·충돌 점검. 방별 유지(localStorage)
  const [refDocIds, setRefDocIds] = useState<string[]>([]);
  const [showRefPicker, setShowRefPicker] = useState(false);
  // 대화 기반 기획서 수정 — 수정 대상(단일) + 미리보기
  const [reviseTargetDocId, setReviseTargetDocId] = useState<string | null>(null);
  const [reviseTargetTitle, setReviseTargetTitle] = useState<string>("");
  const [showReviseTargetPicker, setShowReviseTargetPicker] = useState(false);
  const [revisePreview, setRevisePreview] = useState<RevisePreview | null>(null);
  const [reviseGenLoading, setReviseGenLoading] = useState(false);
  const [docReloadKey, setDocReloadKey] = useState(0);
  // categoryReloadKey 증가 → DecisionPanel이 카테고리 다시 fetch (기획서 쪽 변경과 실시간 동기화)
  const [categoryReloadKey, setCategoryReloadKey] = useState(0);
  const [generatingDoc, setGeneratingDoc] = useState(false);

  // 탭 간 실시간 동기화 — 다른 탭의 변경을 받아 이 탭 갱신 (수신은 broadcast 안 함 → 루프 방지)
  const broadcastSync = useCrossTabSync({
    onDecisions: () => setDecisionReloadKey(k => k + 1),
    onCategories: () => { setCategoryReloadKey(k => k + 1); setDocReloadKey(k => k + 1); },
    onDocs: () => setDocReloadKey(k => k + 1),
    onToggle: (key, value) => {
      if (key === "citations") setShowCitations(value);
      else if (key === "autoDetail") setAutoDetail(value);
    },
  });
  // 로컬 변경 → 다른 탭에도 반영
  const bumpDecisions = () => { setDecisionReloadKey(k => k + 1); broadcastSync({ kind: "decisions" }); };
  const bumpCategories = () => { setCategoryReloadKey(k => k + 1); setDocReloadKey(k => k + 1); broadcastSync({ kind: "categories" }); };
  const bumpDocs = () => { setDocReloadKey(k => k + 1); broadcastSync({ kind: "docs" }); };
  // 답변 피드백 상태 — pair_id별로 'accurate' | 'inaccurate' | undefined
  const [feedbacks, setFeedbacks] = useState<Record<string, "accurate" | "inaccurate">>({});
  // 부정확 사유 입력 모달 (열린 pair_id)
  const [reasonInputPairId, setReasonInputPairId] = useState<string | null>(null);
  const [reasonInputText, setReasonInputText] = useState("");

  // 마운트 시 localStorage에서 토글 상태 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("jordan_show_citations");
    if (saved === "true") setShowCitations(true);
    if (localStorage.getItem("jordan_auto_detail") === "true") setAutoDetail(true);
    // 미확인 기획서 레드닷 복원
    const dotSaved = localStorage.getItem("jordan_doc_new_dot");
    if (dotSaved === "true") setDocNewDot(true);
  }, []);

  // 토글 변경 시 localStorage에 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("jordan_show_citations", String(showCitations));
  }, [showCitations]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("jordan_auto_detail", String(autoDetail));
  }, [autoDetail]);

  // 맥락 결정사항 모달 열릴 때 + 결정사항 갱신 시 fetch
  // 맥락선이 있으면 그 이후 created_at만 표시
  useEffect(() => {
    if (!showContextModal) return;
    setRecentDecisionsLoading(true);
    fetch(`/api/decisions?project_id=${DEFAULT_PROJECT_ID}`)
      .then(r => r.json())
      .then(data => {
        const all = (data.decisions ?? []) as RecentDecision[];
        const filtered = contextAnchorTimestamp
          ? all.filter(d => d.created_at >= contextAnchorTimestamp)
          : all;
        // 최신순
        filtered.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        setRecentDecisions(filtered);
      })
      .catch(err => console.error("[맥락 결정사항] fetch 실패:", err))
      .finally(() => setRecentDecisionsLoading(false));
  }, [showContextModal, decisionReloadKey, contextAnchorTimestamp]);

  // 기획 바이블 카운트 증가 감지 → 빨간 점 ON + 2분 자동 해제
  useEffect(() => {
    const prev = prevDecisionCountRef.current;
    if (decisionCount > prev && prev !== 0) {
      // 첫 로드(0→N)는 제외, 실제 증가만 알림
      setBibleNewBadge(true);
      if (bibleBadgeTimerRef.current) clearTimeout(bibleBadgeTimerRef.current);
      bibleBadgeTimerRef.current = setTimeout(() => setBibleNewBadge(false), 2 * 60 * 1000);
    }
    prevDecisionCountRef.current = decisionCount;
  }, [decisionCount]);
  const [docContent, setDocContent] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [docCopied, setDocCopied] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);  // 이미지 첨부용 숨김 input
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingRawRef = useRef<string>("");
  // 방별 백그라운드 생성 추적 — convId → AbortController / 진행 중 텍스트
  const genAbortRef = useRef<Map<string, AbortController>>(new Map());
  const genStateRef = useRef<Map<string, { user: string; raw: string; pairId: string; time: string; imageId?: string }>>(new Map());
  const streamingConvIdRef = useRef<string | null>(null);  // 현재 streamingPair가 속한 방
  const userScrolledUpRef = useRef(false);
  const isSubLoadingRef = useRef(false); // loadDetail / loadFeedbackSummary 중 여부
  const pendingAutoAnchorRef = useRef(false); // 기획서 작성/수정 진입 시 다음 새 대화에 맥락선 자동 설정

  useEffect(() => {
    // jordan_agent_nickname 키로 닉네임 저장
    const saved = localStorage.getItem("jordan_agent_nickname");
    if (saved) setSessionId("agent:" + saved);
    else setShowModal(true);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void bootstrapConversations(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ── 마지막으로 보던 화면 유지 (새로고침 시 채팅으로 안 튕기게) ──
  // 탭별 독립(sessionStorage). render 시점에 한 번 읽어둬 동기화 effect가 덮어쓰기 전에 보존.
  const savedViewRef = useRef<string | null>(typeof window !== "undefined" ? sessionStorage.getItem("jordan_view") : null);
  useEffect(() => {
    const v = savedViewRef.current;
    if (v === "doc") setShowDocumentView(true);
    else if (v === "bible") setShowDecisionPanel(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 화면 전환 시 현재 화면을 이 탭에 기록 (기획서 > 바이블 > 채팅 우선순위)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const view = showDocumentView ? "doc" : showDecisionPanel ? "bible" : "chat";
    sessionStorage.setItem("jordan_view", view);
  }, [showDocumentView, showDecisionPanel]);

  // 대화방 부트스트랩 — 목록 로드, 없으면 기본 방 생성(기존 메시지 흡수), 마지막 방 열기
  async function bootstrapConversations(sid: string) {
    try {
      const res = await fetch(`/api/conversations?session_id=${encodeURIComponent(sid)}`);
      const data = await res.json();
      let convs: {
      id: string; title: string; created_at?: string;
      context_anchor_pair_id?: string | null;
      context_anchor_time?: string | null;
      reference_doc_ids?: string[] | null;
      agent_context?: string | null;
    }[] = data.conversations ?? [];
      if (convs.length === 0) {
        const cr = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid, title: "기본 대화", adopt_orphans: true }),
        });
        const cd = await cr.json();
        if (cd.conversation) convs = [cd.conversation];
      }
      // 상태 컬럼도 함께 보관(마이그레이션 전이면 undefined) — loadConversation에서 DB 우선 복원에 사용
      setConversations(convs.map(c => ({
        id: c.id, title: c.title,
        context_anchor_pair_id: c.context_anchor_pair_id,
        context_anchor_time: c.context_anchor_time,
        reference_doc_ids: c.reference_doc_ids,
        agent_context: c.agent_context,
      })));
      // 복구: 방에 미배정된(숨겨진) 기존 메시지를 가장 오래된 방으로 흡수
      if (convs.length > 0) {
        const oldest = [...convs].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0];
        try {
          await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sid, adopt_into: oldest.id }) });
        } catch { /* 무시 */ }
      }
      // 방 선택 우선순위: URL(?conv=) > 이 탭의 sessionStorage > (없으면 방 목록 표시)
      // sessionStorage는 '탭마다 독립'(새로고침해도 유지, 탭 닫으면 소멸)이라 여러 탭이 서로 다른
      // 방을 열어둬도 섞이지 않음. 예전엔 모든 탭이 공유하는 localStorage를 폴백으로 써서 '새 탭이
      // 다른 탭 방으로 튀던' 문제가 있었음 → 공유 폴백 제거.
      const urlConv = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("conv") : null;
      const tabConv = typeof window !== "undefined" ? sessionStorage.getItem("jordan_tab_conv") : null;
      const target = (urlConv && convs.find(c => c.id === urlConv)) ? urlConv
        : (tabConv && convs.find(c => c.id === tabConv)) ? tabConv
        : null;
      if (target) { await loadConversation(target, sid); return; }
      // 자동 입장할 방이 없음(새 탭) → 방 목록을 띄워 사용자가 직접 선택 (병렬 작업 충돌 방지)
      setShowConvList(true);
      return;
    } catch (err) {
      // 대화방 테이블 미생성/오류 시 → 기존 방식(전체 메시지)으로 폴백해 앱이 정상 동작하게 보장
      console.error("[대화방] 부트스트랩 — 기존 방식 폴백:", err);
      try {
        const r = await fetch(`/api/messages?session_id=${encodeURIComponent(sid)}`);
        const d = await r.json();
        if (d.messages?.length) setPairs(groupIntoPairs(d.messages));
        const savedCtx = localStorage.getItem(`jordan_agent_context:${sid}`);
        if (savedCtx) setAgentContext(savedCtx);
        // 폴백 경로에서도 맥락선 복원 (세션 키)
        setContextAnchorPairId(localStorage.getItem(`jordan_context_anchor_pair:${sid}`));
        setContextAnchorTimestamp(localStorage.getItem(`jordan_context_anchor_time:${sid}`));
      } catch { /* 무시 */ }
    }
  }

  // 특정 대화방 열기 — 메시지·맥락·anchor를 방 기준으로 로드
  async function loadConversation(convId: string, sid?: string) {
    const s = sid ?? sessionId;
    if (!s) return;
    setCurrentConvId(convId);
    currentConvIdRef.current = convId;
    // 현재 방을 '이 탭'에만 기억 — sessionStorage는 탭마다 독립(새로고침해도 유지, 탭 닫으면 소멸)
    if (typeof window !== "undefined") sessionStorage.setItem("jordan_tab_conv", convId);
    // URL(?conv=)·탭 제목에 방 고정 — 탭별 독립, 새로고침해도 이 방 유지
    if (typeof window !== "undefined") {
      const roomTitle = conversations.find(c => c.id === convId)?.title ?? "대화";
      const u = new URL(window.location.href);
      u.searchParams.set("conv", convId);
      window.history.replaceState(null, "", u.toString());
      document.title = `조던 — ${roomTitle}`;
    }
    setShowConvList(false);
    setPairs([]);
    try {
      const res = await fetch(`/api/messages?session_id=${encodeURIComponent(s)}&conversation_id=${encodeURIComponent(convId)}`);
      const data = await res.json();
      setPairs(data.messages?.length ? groupIntoPairs(data.messages) : []);
    } catch { setPairs([]); }
    // 방별 상태 복원 — DB(서버) 우선, 없으면 기존 localStorage 폴백. DB값은 localStorage에도 미러링(캐시 워밍)
    const room = conversations.find(c => c.id === convId);
    // 맥락 카드: DB값 있으면 우선
    if (room?.agent_context != null) {
      setAgentContext(room.agent_context);
      localStorage.setItem(`jordan_agent_context:${convId}`, room.agent_context);
    } else {
      setAgentContext(localStorage.getItem(`jordan_agent_context:${convId}`) ?? "");
    }
    // 맥락선(anchor): DB값 있으면 우선
    // DB값 우선, 없으면 '이 방 전용' localStorage만 사용. 세션 공용 키(:${s}) 폴백 제거 —
    // 다른 방의 맥락선이 새어 들어와 '해제된 듯' 보이던 문제 차단.
    const apair = room?.context_anchor_pair_id != null
      ? room.context_anchor_pair_id
      : localStorage.getItem(`jordan_context_anchor_pair:${convId}`);
    const atime = room?.context_anchor_pair_id != null
      ? (room.context_anchor_time ?? null)
      : localStorage.getItem(`jordan_context_anchor_time:${convId}`);
    setContextAnchorPairId(apair);
    setContextAnchorTimestamp(atime);
    // anchor를 룸 키 localStorage로 미러링/이관 (DB값이든 세션 레거시든 다음부턴 룸 키로 일관)
    if (apair && !localStorage.getItem(`jordan_context_anchor_pair:${convId}`)) {
      localStorage.setItem(`jordan_context_anchor_pair:${convId}`, apair);
      if (atime) localStorage.setItem(`jordan_context_anchor_time:${convId}`, atime);
    }
    // 참고 기획서 복원: DB값 있으면 우선, 없으면 localStorage
    if (Array.isArray(room?.reference_doc_ids)) {
      setRefDocIds(room.reference_doc_ids);
      if (room.reference_doc_ids.length > 0) localStorage.setItem(`jordan_ref_docs:${convId}`, JSON.stringify(room.reference_doc_ids));
      else localStorage.removeItem(`jordan_ref_docs:${convId}`);
    } else {
      try {
        const rd = localStorage.getItem(`jordan_ref_docs:${convId}`);
        setRefDocIds(rd ? (JSON.parse(rd) as string[]) : []);
      } catch { setRefDocIds([]); }
    }
    // 이 방에 진행 중인 백그라운드 생성이 있으면 라이브 스트림 복원
    const g = genStateRef.current.get(convId);
    if (g) {
      let disp = g.raw.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__$/, "");
      const i = disp.indexOf("__JORDAN_ANSWER_START__");
      if (i !== -1) disp = disp.slice(i + "__JORDAN_ANSWER_START__".length).trimStart();
      streamingRawRef.current = g.raw;
      streamingConvIdRef.current = convId;
      setStreamingPair({ user: g.user, assistant: disp.replace("__TRUNCATED__", ""), userImageId: g.imageId });
    } else {
      streamingRawRef.current = "";
      streamingConvIdRef.current = null;
      setStreamingPair(null);
    }
  }

  async function createConversation() {
    if (!sessionId) return;
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, title: "새 대화" }),
      });
      const data = await res.json();
      if (data.conversation) {
        setConversations(prev => [data.conversation, ...prev]);
        await loadConversation(data.conversation.id);
      }
    } catch (err) { console.error("[대화방] 생성 실패:", err); }
  }

  async function renameConversation(id: string, title: string) {
    const t = title.trim();
    setRenamingConvId(null);
    setConvRenameInput("");
    if (!t) return;
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: t } : c));
    await fetch("/api/conversations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, title: t }),
    }).catch(() => {});
  }

  async function deleteConversation(id: string) {
    if (!confirm("이 대화방과 그 안의 모든 대화를 삭제할까요?")) return;
    await fetch("/api/conversations", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => {});
    const remaining = conversations.filter(c => c.id !== id);
    setConversations(remaining);
    if (currentConvId === id) {
      if (remaining.length > 0) await loadConversation(remaining[0].id);
      else await createConversation();
    }
  }

  // 맥락 카드 재생성 (특정 페어 범위 기준)
  async function rebuildContextCard(forPairs: MessagePair[]) {
    if (!sessionId) return;
    if (forPairs.length === 0) return;
    const lastPair = forPairs[forPairs.length - 1];
    if (!lastPair.user?.content || !lastPair.assistant?.content) return;
    try {
      const res = await fetch("/api/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: lastPair.user.content,
          answer: lastPair.assistant.content,
          existingContext: "",  // anchor 변경 후 빈 상태에서 시작
        }),
      });
      const data = await res.json();
      if (data.context && sessionId) {
        setAgentContext(data.context);
        localStorage.setItem(`jordan_agent_context:${currentConvId ?? sessionId}`, data.context);
        // DB에도 저장(서버 단일 소스) — 실제 방 id일 때만, fire-and-forget
        if (currentConvIdRef.current) {
          void fetch("/api/conversations", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: currentConvIdRef.current, agent_context: data.context }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[맥락 카드 재생성] 실패:", err);
    }
  }

  // anchor 설정·해제 함수 — 맥락 카드도 함께 재생성
  // 키는 ref 기반(currentConvIdRef)으로 통일 — state 클로저 지연·키 불일치로 새로고침 시 사라지던 문제 방지
  function setContextAnchor(pairId: string, timestamp: string) {
    if (!sessionId) return;
    const roomKey = currentConvIdRef.current ?? sessionId;
    pendingAutoAnchorRef.current = false;  // 수동 설정 시 자동 맥락선 대기 해제
    setContextAnchorPairId(pairId);
    setContextAnchorTimestamp(timestamp);
    localStorage.setItem(`jordan_context_anchor_pair:${roomKey}`, pairId);
    localStorage.setItem(`jordan_context_anchor_time:${roomKey}`, timestamp);
    // DB에도 저장(서버 단일 소스) — 실제 방 id일 때만, fire-and-forget
    if (currentConvIdRef.current) {
      void fetch("/api/conversations", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentConvIdRef.current, context_anchor_pair_id: pairId, context_anchor_time: timestamp }),
      }).catch(() => {});
    }

    // 맥락 카드 리셋 + anchor 이후 페어 기준으로 재생성
    setAgentContext("");
    localStorage.removeItem(`jordan_agent_context:${roomKey}`);
    const anchorIdx = pairs.findIndex(p => p.pair_id === pairId);
    if (anchorIdx >= 0) {
      const afterAnchor = pairs.slice(anchorIdx).filter(p => !p.is_deleted);
      void rebuildContextCard(afterAnchor);
    }
  }
  function clearContextAnchor() {
    if (!sessionId) return;
    const roomKey = currentConvIdRef.current ?? sessionId;
    pendingAutoAnchorRef.current = false;
    setContextAnchorPairId(null);
    setContextAnchorTimestamp(null);
    localStorage.removeItem(`jordan_context_anchor_pair:${roomKey}`);
    localStorage.removeItem(`jordan_context_anchor_time:${roomKey}`);
    // DB에서도 해제 — 실제 방 id일 때만, fire-and-forget
    if (currentConvIdRef.current) {
      void fetch("/api/conversations", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentConvIdRef.current, context_anchor_pair_id: null, context_anchor_time: null }),
      }).catch(() => {});
    }

    // 맥락 카드 리셋 + 전체 활성 페어 기준으로 재생성
    setAgentContext("");
    localStorage.removeItem(`jordan_agent_context:${roomKey}`);
    const allActive = pairs.filter(p => !p.is_deleted);
    void rebuildContextCard(allActive);
  }

  // 스트리밍 중 + 사용자가 스크롤 올리지 않았을 때만 자동 하단 이동
  useEffect(() => {
    if (streamingPair !== null && !userScrolledUpRef.current) {
      scrollToBottom();
    }
  }, [streamingPair]);

  // isLoading = "지금 보고 있는 방"이 생성 중인지 (다른 방 생성은 백그라운드로 계속)
  useEffect(() => {
    setIsLoading(!!currentConvId && generatingConvIds.has(currentConvId));
  }, [generatingConvIds, currentConvId]);

  // pairs 로드 시 각 pair의 기존 피드백 복원 (병렬 fetch)
  useEffect(() => {
    if (pairs.length === 0) return;
    const targetPairs = pairs.filter(p => p.pair_id && feedbacks[p.pair_id] === undefined);
    if (targetPairs.length === 0) return;

    Promise.all(
      targetPairs.map(async p => {
        try {
          const res = await fetch(`/api/feedback?pair_id=${encodeURIComponent(p.pair_id)}`);
          const data = await res.json();
          return data.feedback ? { pairId: p.pair_id, type: data.feedback.feedback_type } : null;
        } catch {
          return null;
        }
      })
    ).then(results => {
      const updates: Record<string, "accurate" | "inaccurate"> = {};
      for (const r of results) {
        if (r) updates[r.pairId] = r.type;
      }
      if (Object.keys(updates).length > 0) {
        setFeedbacks(prev => ({ ...prev, ...updates }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs]);

  // 최초 진입·새로고침 시 자동 동작 — 최하단 스크롤 + 입력창 포커스
  // pairs가 실제로 채워진 시점을 감지 (이전 대화 복원 완료 시)
  const initScrolledRef = useRef(false);
  useEffect(() => {
    if (initScrolledRef.current) return;
    if (!sessionId) return;

    // 빈 상태(로딩 중 또는 새 세션)에서는 focus만, 스크롤은 건너뜀
    if (pairs.length === 0) {
      inputRef.current?.focus();
      return;
    }

    // pairs가 처음 채워졌을 때 = 이전 대화 복원 완료
    initScrolledRef.current = true;
    // 메시지 DOM 렌더 완료 후 스크롤 (requestAnimationFrame 2회로 안전 보장)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom();
        inputRef.current?.focus();
      });
    });
    // 백업: 일부 환경(이미지 등 늦은 레이아웃)에서 RAF 부족할 수 있어 500ms 후 한 번 더
    const backup = setTimeout(() => {
      scrollToBottom();
    }, 500);
    return () => clearTimeout(backup);
  }, [pairs, sessionId]);

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
    // 스트리밍 중 사용자 스크롤 감지 — 살짝만 올려도 자동스크롤 멈춤(임계값 낮춤),
    // 바닥 근처로 내려오면 다시 따라감. (프로그램 자동스크롤은 바닥에 닿으므로 false로 복귀)
    if (isLoading || isSubLoadingRef.current) {
      if (distFromBottom > 60) {
        userScrolledUpRef.current = true;
      } else if (distFromBottom < 24) {
        userScrolledUpRef.current = false;
      }
    }
  }

  function groupIntoPairs(messages: (Message & { detail_content?: string; detail_shown?: boolean })[]): MessagePair[] {
    const pairMap = new Map<string, { user?: Message; assistant?: Message; is_deleted: boolean; detail_content?: string; detail_shown?: boolean }>();
    const order: string[] = [];
    for (const msg of messages) {
      const pid = msg.pair_id ?? "unknown";
      if (!pairMap.has(pid)) { pairMap.set(pid, { is_deleted: msg.is_deleted ?? false }); order.push(pid); }
      const entry = pairMap.get(pid)!;
      if (msg.role === "user") entry.user = msg;
      else {
        entry.assistant = msg;
        // assistant row에 저장된 자세한 답변 복원
        if (msg.detail_content) entry.detail_content = msg.detail_content;
        if (msg.detail_shown) entry.detail_shown = msg.detail_shown;
      }
      if (msg.is_deleted) entry.is_deleted = true;
    }
    return order.map((pid) => {
      const entry = pairMap.get(pid)!;
      if (!entry.user || !entry.assistant) return null;
      return {
        pair_id: pid,
        user: entry.user,
        assistant: entry.assistant,
        is_deleted: entry.is_deleted,
        detail_content: entry.detail_content,
        detail_shown: entry.detail_shown,
      };
    }).filter(Boolean) as MessagePair[];
  }

  function confirmNickname() {
    const trimmed = nicknameInput.trim();
    if (!trimmed) return;
    // jordan_agent_nickname 키로 저장, session_id prefix: agent:
    localStorage.setItem("jordan_agent_nickname", trimmed);
    setSessionId("agent:" + trimmed);
    setShowModal(false);
  }

  // 조던 인터뷰 시작 — 빈 카테고리 자동 분석 → 질문 생성 → 채팅에 주입
  async function startInterview() {
    if (interviewLoading || !sessionId) return;
    setInterviewLoading(true);
    try {
      // 최근 인터뷰 주제 추출 — 최근 10개 user 메시지 중 짧은 것들
      const recentTopics = pairs.slice(-10)
        .map(p => p.user.content.slice(0, 40))
        .filter(c => c.length < 50);

      const res = await fetch("/api/jordan-interview/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: DEFAULT_PROJECT_ID,
          recent_topics: recentTopics,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`인터뷰 질문 생성 실패: ${data.error ?? "알 수 없는 오류"}`);
        return;
      }

      const pairId = crypto.randomUUID();
      const userMsg = "🎤 결정 안 된 영역 점검해줘";
      const interviewQuestion = `**🎤 조던 인터뷰** — ${data.category_hint ? `\`${data.category_hint}\` 영역에서 한 가지 물어볼게요.` : "다음 결정을 위해 한 가지 물어볼게요."}\n\n${data.question}\n\n_답변해주시면 자동으로 바이블에 추가돼요._`;

      // DB에 저장 (정상 대화처럼)
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { session_id: sessionId, pair_id: pairId, role: "user", content: userMsg, universes: "게임기획" },
            { session_id: sessionId, pair_id: pairId, role: "assistant", content: interviewQuestion, universes: "게임기획" },
          ],
        }),
      }).catch(() => {});

      // 클라이언트 상태 추가
      setPairs(prev => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: userMsg, pair_id: pairId } as Message,
        assistant: { role: "assistant", content: interviewQuestion, pair_id: pairId } as Message,
        is_deleted: false,
        timestamp: getTime(),
      }]);

      // 입력창에 포커스
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      alert(`인터뷰 시작 실패: ${String(err)}`);
    } finally {
      setInterviewLoading(false);
    }
  }

  // 특정 소분류 기획서 작성 시작 — 기획서 리스트의 '작성하기' 버튼에서 호출
  // '작성하기'는 현재 대화방이 아니라 **신규 대화방**을 만들어 거기서 진행 (주제 분리)
  async function startInterviewForCategory(subCategoryId: string, label: string) {
    if (interviewLoading || !sessionId) return;
    setInterviewLoading(true);
    try {
      // 1. 신규 대화방 생성 — 작성하기는 항상 새 방에서 시작
      let newConvId: string | null = null;
      try {
        const cr = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, title: `✍️ ${label}` }),
        });
        const cd = await cr.json();
        if (cd.conversation?.id) {
          newConvId = cd.conversation.id;
          setConversations(prev => [cd.conversation, ...prev]);
        }
      } catch { /* 방 생성 실패 시 현재 방에서 진행(폴백) */ }

      // 2. 인터뷰 질문 생성
      const res = await fetch("/api/jordan-interview/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: DEFAULT_PROJECT_ID,
          target_sub_category_id: subCategoryId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(`기획서 작성 질문 생성 실패: ${data.error ?? "알 수 없는 오류"}`);
        return;
      }

      // 3. 신규 방으로 전환 (pairs 비움 + URL/탭 고정). DB 저장은 전환 후에 해야 중복 안 됨.
      if (newConvId) await loadConversation(newConvId);
      const convId = newConvId ?? currentConvIdRef.current;

      const pairId = crypto.randomUUID();
      const userMsg = `✍️ "${label}" 기획서 작성 시작`;
      const interviewQuestion = `**✍️ 기획서 작성 — \`${data.category_hint ?? label}\`**\n\n이 항목을 채우기 위해 하나씩 정해볼게요.\n\n${data.question}\n\n_답변을 쌓아가면 이 내용으로 기획서를 작성해드려요._`;

      // 4. DB 저장 — 신규 방 id로 (재진입 시 그 방에 표시)
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { session_id: sessionId, pair_id: pairId, role: "user", content: userMsg, universes: "게임기획", conversation_id: convId },
            { session_id: sessionId, pair_id: pairId, role: "assistant", content: interviewQuestion, universes: "게임기획", conversation_id: convId },
          ],
        }),
      }).catch(() => {});

      // 5. 화면에 주입 (전환된 빈 방에 추가)
      const injectTime = getTime();
      setPairs(prev => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: userMsg, pair_id: pairId } as Message,
        assistant: { role: "assistant", content: interviewQuestion, pair_id: pairId } as Message,
        is_deleted: false,
        timestamp: injectTime,
      }]);

      // 자동 맥락선 — 기획서 작성 시작 시점부터 맥락선을 찍어 이후 대화만 작성 근거로
      setContextAnchor(pairId, new Date().toISOString());

      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      alert(`기획서 작성 시작 실패: ${String(err)}`);
    } finally {
      setInterviewLoading(false);
    }
  }

  // 이미지 다운스케일 (긴 변 최대 maxEdge px) → data URL 반환. 토큰·용량·전송시간 절감
  function downscaleImage(file: File, maxEdge: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new window.Image();
        image.onerror = reject;
        image.onload = () => {
          let w = image.width, h = image.height;
          const scale = Math.min(1, maxEdge / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return reject(new Error("canvas 미지원"));
          ctx.drawImage(image, 0, 0, w, h);
          const outMime = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
          resolve(canvas.toDataURL(outMime, 0.9));
        };
        image.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  // 클립보드 붙여넣기(Ctrl+V) → 캡처 이미지를 별도 파일 없이 바로 첨부 (클로드와 동일한 UX)
  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();  // 이미지 붙여넣기 시 텍스트(파일경로 등) 삽입 방지
          void handleImagePick(file);
          return;
        }
      }
    }
  }

  // 파일 선택 → 다운스케일 → 미리보기 상태에 저장
  async function handleImagePick(file: File | null | undefined) {
    if (!file || !file.type.startsWith("image/")) return;
    setImageUploading(true);
    try {
      const dataUrl = await downscaleImage(file, 1568);  // Claude 권장 해상도
      const head = dataUrl.slice(0, dataUrl.indexOf(","));
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const mime = head.slice(head.indexOf(":") + 1, head.indexOf(";"));
      setAttachedImage({ dataUrl, mime, base64 });
      setImageHasAnnotation(false);  // 새 이미지 → 영역표시 초기화 (의도 태그·메모는 유지)
    } catch (e) {
      console.warn("[image] 처리 실패:", e);
    } finally {
      setImageUploading(false);
    }
  }

  async function sendMessage() {
    const trimmed = input.trim();
    const img = attachedImage;  // 전송 시점 고정
    if ((!trimmed && !img) || isLoading || imageUploading) return;
    // 방 미선택(새 탭에서 아직 방을 안 고른 상태) — 빈 방으로 전송 방지, 목록을 열어 선택 유도
    if (!currentConvIdRef.current) { setShowConvList(true); alert("먼저 위쪽 💬 버튼에서 작업할 대화방을 선택하세요."); return; }
    const baseQuestion = trimmed || "첨부한 이미지를 보고 분석·평가해줘.";
    // 이미지 첨부 시 의도 태그·메모·영역표시 지침을 질문 앞에 붙여 조던 시야를 좁힘 (Feature H)
    const question = img
      ? buildImageIntentPrefix(imageIntentTags, imageMemo, imageHasAnnotation) + baseQuestion
      : baseQuestion;
    const pairId = crypto.randomUUID();
    const time = getTime();

    // 입력창·첨부 미리보기 즉시 비우기 (UX)
    setInput("");
    clearAttachedImage();
    if (inputRef.current) inputRef.current.style.height = "auto"; // 전송 후 입력창 높이 기본값 복원
    userScrolledUpRef.current = false; // 새 질문 시작 시 초기화

    // 첨부 이미지가 있으면 먼저 업로드 → image_id 확보 (표시·조던 전달용)
    let uploadedImageId: string | null = null;
    if (img) {
      try {
        const up = await fetch("/api/chat-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, mime: img.mime, data: img.base64 }),
        });
        const uj = await up.json();
        uploadedImageId = uj.id ?? null;
      } catch { /* 업로드 실패 시 이미지 없이 진행 */ }
    }

    // 맥락 anchor 적용 — 설정돼 있으면 그 시점 이후 pair만 컨텍스트로 전달
    const visiblePairs = pairs.filter(p => !p.is_deleted);
    let relevantPairs = visiblePairs;
    if (contextAnchorPairId) {
      const anchorIdx = visiblePairs.findIndex(p => p.pair_id === contextAnchorPairId);
      if (anchorIdx >= 0) relevantPairs = visiblePairs.slice(anchorIdx);
    }

    const allMessages = [
      ...relevantPairs.flatMap(p => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]),
      { role: "user" as const, content: question },
    ];
    const genConvId = currentConvIdRef.current;  // 이 답변이 속한 대화방 (전송 시점 고정)

    const controller = new AbortController();
    if (genConvId) {
      genAbortRef.current.set(genConvId, controller);
      genStateRef.current.set(genConvId, { user: question, raw: "", pairId, time, imageId: uploadedImageId ?? undefined });
      setGeneratingConvIds(prev => new Set(prev).add(genConvId));  // 이 방을 생성 중으로 표시
    }
    // 지금 보고 있는 방이면 즉시 스트리밍 표시
    setStreamingPair({ user: question, assistant: "", userImageId: uploadedImageId ?? undefined });
    streamingConvIdRef.current = genConvId;
    streamingRawRef.current = "";

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          session_id: sessionId,
          pair_id: pairId,
          agentContext,  // 롤링 맥락 카드 전달
          show_citations: showCitations,  // 인라인 신뢰도 라벨 토글
          context_anchor_time: contextAnchorTimestamp,  // 결정사항 cutoff (이후 created_at만 사용)
          conversation_id: genConvId,  // 이 답변이 속한 대화방
          image_id: uploadedImageId,  // 첨부 이미지 — 조던이 보고 답변
          reference_doc_ids: refDocIds,  // 참고 기획서 — 교차 참고·충돌 점검
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error("오류");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value);
        const _st = genConvId ? genStateRef.current.get(genConvId) : null;
        if (_st) _st.raw = assistantText;  // 백그라운드 누적 (방 전환해도 유지)
        // 지금 보고 있는 방일 때만 화면 갱신 (다른 방 생성은 화면에 안 보이게)
        if (genConvId === currentConvIdRef.current) {
          let displayText = assistantText.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__$/, "");
          const dispAnswerIdx = displayText.indexOf("__JORDAN_ANSWER_START__");
          if (dispAnswerIdx !== -1) {
            displayText = displayText.slice(dispAnswerIdx + "__JORDAN_ANSWER_START__".length).trimStart();
          }
          displayText = displayText.replace("__TRUNCATED__", "");
          streamingRawRef.current = assistantText;
          setStreamingPair({ user: question, assistant: displayText, userImageId: uploadedImageId ?? undefined });
        }
      }

      // 메타데이터 파싱 및 분리
      const criticMatch = assistantText.match(/__JORDAN_CRITIC_START__([\s\S]*?)__JORDAN_CRITIC_END__/);
      let criticHistory: CriticEntry[] | undefined;
      let cleanText = assistantText;
      if (criticMatch) {
        try { criticHistory = JSON.parse(criticMatch[1]); } catch { /* 무시 */ }
        cleanText = assistantText.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__/, "");
      }

      // 자동 추출 마커 감지 → 트래커 새로고침 + 알림 + 검토 모달
      const extractedMatch = assistantText.match(/__DECISIONS_EXTRACTED__(\d+)/);
      if (extractedMatch) {
        const cnt = parseInt(extractedMatch[1], 10);
        if (cnt > 0) {
          bumpDecisions();
          setExtractedNotice(cnt);
          setTimeout(() => setExtractedNotice(null), 7000);
        }
        cleanText = cleanText.replace(/__DECISIONS_EXTRACTED__\d+/, "");
      }
      // 추출된 결정 데이터 파싱 → 검토 모달용 보관
      const dataMatch = assistantText.match(/__DECISIONS_DATA__([\s\S]+?)__END__/);
      if (dataMatch) {
        try {
          const items = JSON.parse(dataMatch[1]) as ExtractedItem[];
          if (items.length > 0) {
            setExtractedItems(items);
            setShowExtractedReview(true);
          }
        } catch { /* 무시 */ }
        cleanText = cleanText.replace(/__DECISIONS_DATA__[\s\S]+?__END__/, "");
      }

      // 보류 마커 감지 — 조던 반대·우려로 등록 안 된 결정
      const heldMatch = assistantText.match(/__DECISIONS_HELD__(\d+)/);
      if (heldMatch) {
        const cnt = parseInt(heldMatch[1], 10);
        if (cnt > 0) {
          setHeldNotice(cnt);
          setTimeout(() => setHeldNotice(null), 7000);  // 7초 표시 (좀 더 길게)
        }
        cleanText = cleanText.replace(/__DECISIONS_HELD__\d+/, "");
      }
      // 바이블 일관성 충돌 마커 감지 (Feature C) — 기존 결정과 모순 시 경고 배너
      const conflictMatch = assistantText.match(/__BIBLE_CONFLICTS__([\s\S]+?)__END__/);
      if (conflictMatch) {
        try {
          const conflicts = JSON.parse(conflictMatch[1]) as BibleConflict[];
          if (Array.isArray(conflicts) && conflicts.length > 0) setBibleConflicts(conflicts);
        } catch { /* 무시 */ }
        cleanText = cleanText.replace(/__BIBLE_CONFLICTS__[\s\S]+?__END__/, "");
      }
      // 진행 상태 텍스트 제거: __JORDAN_ANSWER_START__ 이후만 답변으로 사용
      const answerStartIdx = cleanText.indexOf("__JORDAN_ANSWER_START__");
      if (answerStartIdx !== -1) {
        cleanText = cleanText.slice(answerStartIdx + "__JORDAN_ANSWER_START__".length).trimStart();
      }
      if (cleanText.includes("__TRUNCATED__")) {
        cleanText = cleanTruncated(cleanText);
      }

      const newPair = {
        pair_id: pairId,
        user: { role: "user" as const, content: question, pair_id: pairId, image_id: uploadedImageId ?? undefined },
        assistant: { role: "assistant" as const, content: cleanText, pair_id: pairId },
        is_deleted: false,
        timestamp: time,
        critic_history: criticHistory,
      };
      // 지금 그 방을 보고 있으면 즉시 반영. 다른 방이면 DB에 저장됐으니 그 방 다시 열 때 표시됨
      if (genConvId === currentConvIdRef.current) {
        const hadScrolledUp = userScrolledUpRef.current;
        userScrolledUpRef.current = false;
        setPairs((prev) => [...prev, newPair]);
        // 기획서 수정 진입 등으로 예약된 자동 맥락선 — 이 새 대화를 맥락 시작점으로
        if (pendingAutoAnchorRef.current) {
          pendingAutoAnchorRef.current = false;
          setContextAnchor(newPair.pair_id, new Date().toISOString());
        }
        setStreamingPair(null);
        streamingConvIdRef.current = null;
        updateContextCard(question, cleanText);  // 맥락 카드 백그라운드 업데이트
        if (hadScrolledUp) setShowAnswerCompleteBtn(true);
        else scrollToBottom();
        // 자세한 답변 자동 표시 옵션 ON → 답변 완료 후 자동으로 자세한 답변까지 펼침
        if (autoDetail) void loadDetail(newPair.pair_id, newPair);
      }
    } catch {
      // AbortError·네트워크 오류 — 조용히 처리 (상태 해제는 finally)
    } finally {
      if (genConvId) {
        genAbortRef.current.delete(genConvId);
        genStateRef.current.delete(genConvId);
        setGeneratingConvIds(prev => { const n = new Set(prev); n.delete(genConvId); return n; });
      }
    }
  }

  // 질문 실수: 답변 중단 + 질문·답변 모두 삭제 (현재 방의 생성만 중단)
  function cancelAndDiscard() {
    const cid = currentConvIdRef.current;
    if (cid) genAbortRef.current.get(cid)?.abort();
    setStreamingPair(null);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto"; // 입력창 높이 기본값 복원
    userScrolledUpRef.current = false;
    setShowAnswerCompleteBtn(false);
  }

  // 질문 수정: 답변 중단 + 질문을 입력창에 복원 (현재 방의 생성만 중단)
  function cancelAndEdit() {
    const question = streamingPair?.user ?? "";
    const cid = currentConvIdRef.current;
    if (cid) genAbortRef.current.get(cid)?.abort();
    setStreamingPair(null);
    setInput(question);
    userScrolledUpRef.current = false;
    setShowAnswerCompleteBtn(false);
  }

  // 자세한 답변 영속성 저장 (DB)
  async function persistDetail(pairId: string, opts: { detail_content?: string; detail_shown?: boolean }) {
    try {
      await fetch("/api/messages/detail", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair_id: pairId, ...opts }),
      });
    } catch (err) {
      console.warn("[detail] 저장 실패:", err);
    }
  }

  // pairOverride: state에 아직 반영 안 된 방금 만든 pair로도 자세한 답변을 바로 받을 수 있게 (자동 표시용)
  async function loadDetail(pairId: string, pairOverride?: MessagePair) {
    const pair = pairOverride ?? pairs.find((p) => p.pair_id === pairId);
    if (!pair) return;
    // 이미 저장된 자세한 답변 있으면 → 토글만 (재요청 X)
    if (pair.detail_content) {
      const nextShown = !pair.detail_shown;
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_shown: nextShown } : p));
      void persistDetail(pairId, { detail_shown: nextShown });
      return;
    }
    isSubLoadingRef.current = true;
    userScrolledUpRef.current = false;
    setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_loading: true, detail_shown: true } : p));
    try {
      // 현재 Q&A만 전달해서 입력 토큰 절약 (출력 공간 확보)
      const context = [
        { role: "user" as const, content: pair.user.content },
        { role: "assistant" as const, content: pair.assistant.content },
        { role: "user" as const, content: "위 답변을 더 자세하고 풍부하게 설명해줘." },
      ];
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: context, detailed: true }),
      });
      if (!response.ok || !response.body) throw new Error("오류");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_content: text.replace("__TRUNCATED__", "") } : p));
        if (!userScrolledUpRef.current) scrollToBottom();
      }
      const hadScrolledUp = userScrolledUpRef.current;
      const finalDetailText = text.includes("__TRUNCATED__") ? cleanTruncated(text) : text;
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_content: finalDetailText } : p));
      // DB에 영속화 — 다음번 진입 시 펼친 상태로 복원
      void persistDetail(pairId, { detail_content: finalDetailText, detail_shown: true });
      if (hadScrolledUp) {
        setShowAnswerCompleteBtn(true);
      } else {
        scrollToBottom();
      }
    } catch {
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_content: "오류가 발생했습니다." } : p));
    } finally {
      isSubLoadingRef.current = false;
      userScrolledUpRef.current = false;
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_loading: false } : p));
    }
  }

  // 피드백 원문을 바로 표시 (재요약 없이 — 검토 에이전트 출력이 이미 디렉터 말투로 완성됨)
  function loadFeedbackSummary(pairId: string) {
    const pair = pairs.find(p => p.pair_id === pairId);
    if (!pair || !pair.critic_history || pair.critic_history.length === 0) return;
    if (pair.feedback_summary) {
      // 이미 로드됨 → 접기/펼치기만
      setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, feedback_summary_shown: !p.feedback_summary_shown } : p));
      return;
    }
    // APPROVED/NEEDS_IMPROVEMENT 첫 줄 제거 후 본문만 추출
    const feedbackText = pair.critic_history
      .map(c => c.feedback.replace(/^(APPROVED|NEEDS_IMPROVEMENT)[^\n]*/i, "").trim())
      .join("\n\n");
    setPairs(prev => prev.map(p =>
      p.pair_id === pairId
        ? { ...p, feedback_summary: feedbackText, feedback_summary_shown: true }
        : p
    ));
    scrollToBottom();
  }

  async function deletePair(pairId: string) {
    setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, is_deleted: true } : p));
    await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: pairId, is_deleted: true }) });
  }

  async function restorePair(pairId: string) {
    setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, is_deleted: false } : p));
    await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: pairId, is_deleted: false }) });
  }

  async function permanentDeletePair(pairId: string) {
    setPairs((prev) => prev.filter((p) => p.pair_id !== pairId));
    await fetch("/api/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: pairId }) });
  }

  async function bulkPermanentDelete() {
    if (!confirm(`삭제된 대화 ${deletedPairs.length}개를 모두 영구 삭제할까요?`)) return;
    const ids = deletedPairs.map((p) => p.pair_id);
    setPairs((prev) => prev.filter((p) => !p.is_deleted));
    await Promise.all(ids.map((id) =>
      fetch("/api/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: id }) })
    ));
  }

  // 맥락 카드 백그라운드 업데이트 (답변 완료 후 비동기 호출, 대기 없음)
  function updateContextCard(question: string, answer: string) {
    fetch("/api/context", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, existingContext: agentContext }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.context && sessionId) {
          setAgentContext(data.context);
          localStorage.setItem(`jordan_agent_context:${currentConvId ?? sessionId}`, data.context);
          // DB에도 저장(서버 단일 소스) — 실제 방 id일 때만, fire-and-forget
          if (currentConvIdRef.current) {
            void fetch("/api/conversations", {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: currentConvIdRef.current, agent_context: data.context }),
            }).catch(() => {});
          }
        }
      })
      .catch(() => { /* 실패해도 대화 흐름에 영향 없음 */ });
  }

  // ── 기획서 작성 관련 함수 ──

  function enterSelectMode() {
    // 선택 모드 진입 시 기본 선택값:
    // - 맥락선(anchor) 있으면 → 맥락선 이후(포함)만 체크, 윗쪽은 체크 해제
    // - 맥락선 없으면 → 전체 체크
    // 사용자는 윗쪽 추가/아랫쪽 제거를 자유롭게 조정 가능
    let defaultIds: string[];
    if (contextAnchorPairId) {
      const anchorIdx = activePairs.findIndex(p => p.pair_id === contextAnchorPairId);
      if (anchorIdx >= 0) {
        defaultIds = activePairs.slice(anchorIdx).map(p => p.pair_id);
      } else {
        defaultIds = activePairs.map(p => p.pair_id);
      }
    } else {
      defaultIds = activePairs.map(p => p.pair_id);
    }
    setSelectedPairIds(new Set(defaultIds));
    setSelectMode(true);
  }

  function togglePairSelect(pairId: string) {
    setSelectedPairIds((prev) => {
      const next = new Set(prev);
      if (next.has(pairId)) next.delete(pairId);
      else next.add(pairId);
      return next;
    });
  }

  function cancelSelectMode() {
    setSelectMode(false);
    setSelectedPairIds(new Set());
  }

  // 백그라운드 기획서 생성 — 모달 없음, 헤더 버튼 상태로 진행 표시
  // 완료 시: design_docs에 자동 저장 + 알림 토스트 + 📄 기획서 버튼 레드닷
  async function generateDocument(direction: string = "") {
    const selectedMsgs = activePairs
      .filter((p) => selectedPairIds.has(p.pair_id))
      .flatMap((p) => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]);
    if (selectedMsgs.length === 0) return;

    // 방향 입력창 닫고, 선택 모드 즉시 종료, 백그라운드 진행 표시 시작
    setShowDocDirection(false);
    setSelectMode(false);
    setSelectedPairIds(new Set());
    setDocBackgroundGenerating(true);

    // 취소용 AbortController
    const controller = new AbortController();
    docGenAbortRef.current = controller;

    try {
      const response = await fetch("/api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: selectedMsgs,
          project_id: DEFAULT_PROJECT_ID,
          nickname: sessionId?.replace(/^agent:/, "") ?? null,
          reference_doc_ids: refDocIds,  // 참고 기획서 — 작성 시 연계·교차 검증
          direction,  // 사용자가 지정한 작성 방향(빈 문자열이면 전체 반영)
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data.preview) {
        throw new Error(data.error ?? "생성 실패");
      }

      // 저장 전 미리보기 — 제목·카테고리·요약 확인 후 [저장]에서 실제 저장
      setDocGenPreview({
        content: data.content,
        title: data.title,
        summary: data.summary ?? "",
        category: data.category ?? { main_id: null, area_code: null, sub_id: null, label: null },
        messages_count: data.messages_count ?? 0,
      });
    } catch (err) {
      // 사용자가 취소한 경우는 조용히 처리
      if (err instanceof Error && err.name === "AbortError") {
        console.log("[기획서 작성] 사용자 취소");
      } else {
        console.error("[기획서 작성] 실패:", err);
        alert(`기획서 작성 실패: ${String(err)}`);
      }
    } finally {
      docGenAbortRef.current = null;
      setDocBackgroundGenerating(false);
    }
  }

  // 진행 중인 기획서 작성 취소
  function cancelDocGeneration() {
    if (docGenAbortRef.current) {
      docGenAbortRef.current.abort();
      docGenAbortRef.current = null;
    }
    setDocBackgroundGenerating(false);
  }

  // 📄 기획서 버튼 클릭 — 뷰 열고 레드닷 해제 (자동 해제 X, 클릭으로만)
  function openDocumentView() {
    setShowDocumentView(true);
    if (docNewDot) {
      setDocNewDot(false);
      localStorage.removeItem("jordan_doc_new_dot");
    }
  }

  // ── 참고 기획서 / 대화 기반 수정 ──
  // 참고 기획서 선택 저장 (방별 localStorage 유지)
  function applyRefDocs(ids: string[]) {
    setRefDocIds(ids);
    const key = `jordan_ref_docs:${currentConvId ?? sessionId}`;
    if (ids.length > 0) localStorage.setItem(key, JSON.stringify(ids));
    else localStorage.removeItem(key);
    // DB에도 저장(서버 단일 소스) — 실제 방 id일 때만, fire-and-forget
    if (currentConvIdRef.current) {
      void fetch("/api/conversations", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentConvIdRef.current, reference_doc_ids: ids }),
      }).catch(() => {});
    }
  }

  // 맥락선 범위 대화 → {role,content}[] (수정 근거)
  function getAnchorRangeMessages() {
    let range = activePairs;
    if (contextAnchorPairId) {
      const idx = activePairs.findIndex(p => p.pair_id === contextAnchorPairId);
      if (idx >= 0) range = activePairs.slice(idx);
    }
    return range.flatMap(p => [
      { role: p.user.role, content: p.user.content },
      { role: p.assistant.role, content: p.assistant.content },
    ]);
  }

  // 대화를 통한 수정 — 수정 대상 없으면 선택 모달, 있으면 미리보기 생성
  // docIdOverride: 방금 선택한 대상으로 즉시 미리보기 (state 비동기 회피)
  async function startConversationRevise(docIdOverride?: string) {
    const targetId = docIdOverride ?? reviseTargetDocId;
    if (!targetId) { setShowReviseTargetPicker(true); return; }
    const msgs = getAnchorRangeMessages();
    if (msgs.length === 0) { alert("수정 근거가 될 대화가 없어요. (맥락선 범위 확인)"); return; }
    setReviseGenLoading(true);
    try {
      const res = await fetch("/api/design-docs/revise-from-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_id: targetId,
          messages: msgs,
          nickname: sessionId?.replace(/^agent:/, "") ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "미리보기 실패");
      setRevisePreview({
        doc_id: targetId,
        doc_title: data.doc_title ?? reviseTargetTitle,
        title: data.title,
        original_markdown: data.original_markdown,
        revised_markdown: data.revised_markdown,
      });
    } catch (err) {
      alert(`수정 미리보기 실패: ${String(err)}`);
    } finally {
      setReviseGenLoading(false);
    }
  }

  // DocumentView "대화를 통한 수정" 진입 → 수정 대상 지정 + 뷰 닫기
  function enterReviseViaChat(docId: string, docTitle: string) {
    setReviseTargetDocId(docId);
    setReviseTargetTitle(docTitle);
    setShowDocumentView(false);
    // 자동 맥락선 — 이 시점 이후 대화부터 수정 근거가 되도록, 다음 새 대화에 맥락선 예약
    pendingAutoAnchorRef.current = true;
    setTimeout(() => inputRef.current?.focus(), 150);
  }

  async function copyDocument() {
    await navigator.clipboard.writeText(docContent);
    setDocCopied(true);
    setTimeout(() => setDocCopied(false), 2000);
  }

  async function copyMessage(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // 피드백 저장 (정확 / 부정확)
  async function submitFeedback(
    pairId: string,
    type: "accurate" | "inaccurate",
    reason?: string
  ) {
    if (!sessionId) return;
    const pair = pairs.find(p => p.pair_id === pairId);
    if (!pair) return;

    // 낙관적 업데이트 (UI 즉시 반영)
    setFeedbacks(prev => ({ ...prev, [pairId]: type }));

    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          pair_id: pairId,
          feedback_type: type,
          reason: reason ?? null,
          question: pair.user?.content,
          answer: pair.assistant?.content?.slice(0, 1000),
        }),
      });
    } catch (err) {
      console.error("[feedback] 저장 실패:", err);
    }
  }

  // 부정확 클릭 시 사유 입력 모달 열기
  function openReasonInput(pairId: string) {
    setReasonInputPairId(pairId);
    setReasonInputText("");
  }

  // 사유 입력 후 저장
  async function submitReason() {
    if (!reasonInputPairId) return;
    await submitFeedback(reasonInputPairId, "inaccurate", reasonInputText.trim() || undefined);
    setReasonInputPairId(null);
    setReasonInputText("");
  }

  // ── 기획서 새 버전 생성 ────────────────────────────────────────────
  async function handleGenerateDoc() {
    if (generatingDoc) return;
    setGeneratingDoc(true);
    try {
      const res = await fetch("/api/design-docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: DEFAULT_PROJECT_ID,
          nickname: sessionId?.replace(/^agent:/, "") ?? null,
        }),
      });
      const data = await res.json();
      if (data.doc) {
        // 트래커 닫고 기획서 뷰 열기 + reloadKey 갱신
        setShowDecisionPanel(false);
        bumpDocs();
        setShowDocumentView(true);
      } else if (data.error) {
        alert(`생성 실패: ${data.error}`);
      }
    } catch (err) {
      console.error("[기획서 생성] 실패:", err);
      alert("기획서 생성 중 오류가 발생했어요.");
    } finally {
      setGeneratingDoc(false);
    }
  }

  // 기획서 다운로드 (TXT — 마크다운 기호 제거)
  async function downloadDocTxt(content: string) {
    const clean = content
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/^#{1,4}\s+/gm, "")
      .replace(/^[-*]\s+/gm, "• ");
    const base = `기획서_${getDateStr()}`;
    const filename = getUniqueFilename(base, "txt");
    const blob = new Blob([clean], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // 기획서 다운로드 (MD)
  async function downloadDocMd(content: string) {
    const base = `기획서_${getDateStr()}`;
    const filename = getUniqueFilename(base, "md");
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && e.altKey) {
      // Alt+Enter → 줄바꿈
      e.preventDefault();
      setInput((prev) => prev + "\n");
    } else if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      // Enter → 전송
      e.preventDefault();
      sendMessage();
    }
  }

  const activePairs = pairs.filter((p) => !p.is_deleted);
  const deletedPairs = pairs.filter((p) => p.is_deleted);

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1525 50%, #0a1020 100%)" }}>

      {/* 닉네임 입력 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="rounded-2xl p-8 w-80 shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}>
                <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-base font-bold" style={{ color: SILVER }}>입장하기</h2>
            </div>
            <p className="text-xs mb-4" style={{ color: SILVER_DIM }}>닉네임을 입력하면 대화 기록이 저장됩니다</p>
            <input
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmNickname()}
              placeholder="닉네임 입력"
              autoComplete="off"
              className="w-full px-4 py-2.5 rounded-xl text-sm mb-4 outline-none"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
              autoFocus
            />
            <button
              onClick={confirmNickname}
              disabled={!nicknameInput.trim()}
              className="w-full py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
            >
              입장하기
            </button>
          </div>
        </div>
      )}

      {/* 기획서 모달 */}
      {showDocModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}>
            {/* 모달 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex items-center gap-2">
                <span style={{ color: SILVER }}>📄</span>
                <h2 className="text-sm font-bold" style={{ color: SILVER }}>기획서</h2>
                {docLoading && <span className="text-xs animate-pulse" style={{ color: SILVER_DIM }}>작성 중...</span>}
              </div>
              <div className="flex items-center gap-2">
                {!docLoading && docContent && (
                  <>
                    <button
                      onClick={copyDocument}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium"
                      style={{ backgroundColor: docCopied ? "rgba(100,200,100,0.2)" : SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: docCopied ? "#90d090" : SILVER }}
                    >
                      {docCopied ? "✓ 복사됨" : "복사"}
                    </button>
                    <button onClick={() => downloadDocTxt(docContent)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}>📄 TXT</button>
                    <button onClick={() => downloadDocMd(docContent)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}>📝 MD</button>
                  </>
                )}
                <button
                  onClick={() => setShowDocModal(false)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
                >
                  닫기
                </button>
              </div>
            </div>
            {/* 모달 내용 */}
            <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
              {docLoading && !docContent && (
                <div className="flex items-center gap-2 py-8 justify-center">
                  <span className="animate-pulse" style={{ color: SILVER_DIM }}>대화 내용을 분석해서 기획서를 작성하고 있어요...</span>
                </div>
              )}
              {docContent && (
                <div className="prose prose-sm max-w-none" style={{ color: "#e0e8f0" }}>
                  <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{fixMarkdown(docContent)}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 부정확 피드백 사유 입력 팝업 */}
      {reasonInputPairId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setReasonInputPairId(null)}>
          <div className="rounded-2xl w-full max-w-md shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }} onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b" style={{ borderColor: SILVER_FAINT }}>
              <p className="text-sm font-bold" style={{ color: "rgba(255,180,180,1)" }}>👎 부정확한 부분 알려주세요</p>
              <p className="text-xs mt-1" style={{ color: SILVER_DIM }}>구체적으로 알려주시면 다음 답변 품질 개선에 활용해요. 비워두고 보내도 OK.</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <textarea
                value={reasonInputText}
                onChange={(e) => setReasonInputText(e.target.value)}
                placeholder="예: 5월 14일 업데이트 정보가 잘못됨, 신규 영웅 이름이 다름 등"
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setReasonInputPairId(null)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>
                  취소
                </button>
                <button onClick={submitReason} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(255,180,180,0.2)", border: "1px solid rgba(255,180,180,0.5)", color: "rgba(255,200,200,1)" }}>
                  피드백 전송
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 결정사항 트래커 사이드 패널 */}
      <DecisionPanel
        open={showDecisionPanel}
        onClose={() => setShowDecisionPanel(false)}
        projectId={DEFAULT_PROJECT_ID}
        nickname={sessionId?.replace(/^agent:/, "") ?? ""}
        onCountChange={setDecisionCount}
        reloadKey={decisionReloadKey}
        categoryReloadKey={categoryReloadKey}
        onGenerateDoc={handleGenerateDoc}
        contextAnchorTimestamp={contextAnchorTimestamp}
      />

      {/* 기획서 보기 모드 (전체 화면) */}
      <DocumentView
        open={showDocumentView}
        onClose={() => setShowDocumentView(false)}
        projectId={DEFAULT_PROJECT_ID}
        nickname={sessionId?.replace(/^agent:/, "") ?? ""}
        reloadKey={docReloadKey}
        onCategoriesChanged={() => bumpCategories()}
        onDecisionsChanged={() => bumpDecisions()}
        onStartWriting={(subId, label) => startInterviewForCategory(subId, label)}
        onReviseViaChat={(docId, docTitle) => enterReviseViaChat(docId, docTitle)}
        openTarget={docOpenTarget}
      />

      {/* 참고 기획서 선택 (다중) */}
      <DocPickerModal
        open={showRefPicker}
        onClose={() => setShowRefPicker(false)}
        projectId={DEFAULT_PROJECT_ID}
        mode="multi"
        title="📑 참고 기획서 선택"
        selectedIds={refDocIds}
        onConfirm={(ids) => applyRefDocs(ids)}
      />
      {/* 수정 대상 선택 (단일) → 즉시 미리보기 생성 */}
      <DocPickerModal
        open={showReviseTargetPicker}
        onClose={() => setShowReviseTargetPicker(false)}
        projectId={DEFAULT_PROJECT_ID}
        mode="single"
        title="🛠️ 수정할 기획서 선택"
        onConfirm={(ids) => {
          if (ids[0]) {
            setReviseTargetDocId(ids[0]);
            setReviseTargetTitle("");
            void startConversationRevise(ids[0]);
          }
        }}
      />
      {/* 기획서 작성 방향 지시 입력 — 선택 대화 → '작성 시작' 시 표시 */}
      {showDocDirection && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4" onClick={() => setShowDocDirection(false)}>
          <div
            className="rounded-2xl w-full max-w-lg shadow-2xl flex flex-col"
            style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div>
                <p className="text-sm font-bold" style={{ color: SILVER }}>✍️ 기획서 작성 방향</p>
                <p className="text-[11px] mt-0.5" style={{ color: SILVER_DIM }}>선택한 <b style={{ color: "rgba(180,210,255,1)" }}>{selectedPairIds.size}개</b> 대화를 어떤 방향으로 정리할지 (선택 입력)</p>
              </div>
              <button onClick={() => setShowDocDirection(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={docDirection}
                onChange={(e) => setDocDirection(e.target.value)}
                placeholder={'예) 일반·초보·픽업·이벤트 소환 대화 중 "초보 소환"만 한정해서 작성해줘\n예) 밸런스 수치 위주로, BM 얘기는 빼고 정리해줘\n\n(비워두면 선택한 대화 전체를 반영합니다)'}
                rows={5}
                autoFocus
                className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none resize-none"
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", lineHeight: 1.6 }}
              />
              <div className="flex gap-2 justify-end mt-3">
                <button
                  onClick={() => generateDocument("")}
                  className="text-xs px-3 py-2 rounded-lg font-medium"
                  style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
                >전체 반영</button>
                <button
                  onClick={() => generateDocument(docDirection)}
                  className="text-xs px-4 py-2 rounded-lg font-bold"
                  style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
                >{docDirection.trim() ? "이 방향으로 작성" : "작성 시작"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 기획서 작성 — 저장 전 미리보기 (제목 수정·카테고리·요약) */}
      <DocGenPreview
        open={!!docGenPreview}
        preview={docGenPreview}
        projectId={DEFAULT_PROJECT_ID}
        nickname={sessionId?.replace(/^agent:/, "") ?? undefined}
        onClose={() => setDocGenPreview(null)}
        onSaved={(doc) => {
          setDocGenPreview(null);
          setDocCompletedNotice({ title: doc?.title ?? "새 기획서", version_no: doc?.version_no ?? 0 });
          setDocNewDot(true);
          localStorage.setItem("jordan_doc_new_dot", "true");
          bumpDocs();
        }}
      />

      {/* 대화 기반 수정 — 색상 diff 미리보기 + 적용 */}
      <DocRevisePreview
        open={!!revisePreview}
        preview={revisePreview}
        nickname={sessionId?.replace(/^agent:/, "") ?? undefined}
        onClose={() => setRevisePreview(null)}
        onApplied={() => {
          setRevisePreview(null);
          setReviseTargetDocId(null);
          setReviseTargetTitle("");
          bumpDocs();
          setDocNewDot(true);
          localStorage.setItem("jordan_doc_new_dot", "true");
        }}
      />

      {/* 화면 설계는 DocumentView 내부 버튼으로 통합됨 */}

      {/* 기획서 생성 중 오버레이 */}
      {generatingDoc && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.7)" }}>
          <div className="px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3" style={{ backgroundColor: "#0f1628", border: "1px solid rgba(100,180,255,0.5)" }}>
            <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(100,180,255,0.3)", borderTopColor: "rgba(180,210,255,1)" }} />
            <p className="text-sm" style={{ color: "rgba(180,210,255,1)" }}>
              📄 기획서 생성 중... (10~30초 소요)
            </p>
          </div>
        </div>
      )}

      {/* 기획서 작성 완료 알림 — 사용자 확인 시 사라짐 (자동 해제 X) */}
      {docCompletedNotice && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm"
          style={{
            backgroundColor: "rgba(15,25,40,0.97)",
            border: "1px solid rgba(100,180,255,0.6)",
            color: "rgba(180,210,255,1)",
            backdropFilter: "blur(10px)",
            maxWidth: "min(560px, 92vw)",
          }}
        >
          <span style={{ fontSize: "18px" }}>📄</span>
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="font-bold">기획서 작성 완료</p>
            <p className="text-xs truncate" style={{ color: "rgba(180,210,255,0.7)" }}>
              v{docCompletedNotice.version_no} · {docCompletedNotice.title}
            </p>
          </div>
          <button
            onClick={() => {
              setDocCompletedNotice(null);
              openDocumentView();
            }}
            className="text-xs px-3 py-1.5 rounded-lg ml-2 font-medium"
            style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}
          >
            바로 보기 →
          </button>
          <button
            onClick={() => setDocCompletedNotice(null)}
            className="text-xs px-2 py-1 rounded"
            style={{ color: "rgba(180,210,255,0.6)" }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 자동 추출 결정사항 검토 모달 — 우상단 카드 */}
      {showExtractedReview && extractedItems.length > 0 && (
        <ExtractedReviewCard
          items={extractedItems}
          onClose={() => { setShowExtractedReview(false); setExtractedItems([]); }}
          onChanged={() => bumpDecisions()}
        />
      )}

      {/* 맥락선 없음 안내 토스트 (2초) */}
      {noAnchorNotice && (
        <div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 text-sm"
          style={{
            backgroundColor: "rgba(15,25,40,0.95)",
            border: "1px solid rgba(255,200,100,0.5)",
            color: "rgba(255,220,150,1)",
            backdropFilter: "blur(10px)",
          }}
        >
          <span>📌</span>
          <span>맥락선이 없습니다</span>
        </div>
      )}

      {/* 자동 추출 알림 (5초 자동 사라짐) */}
      {extractedNotice !== null && (
        <div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 text-sm"
          style={{
            backgroundColor: "rgba(15,25,40,0.95)",
            border: "1px solid rgba(100,220,160,0.6)",
            color: "rgba(150,255,200,1)",
            backdropFilter: "blur(10px)",
          }}
        >
          <span>🤖</span>
          <span><b>{extractedNotice}개</b> 항목이 기획 바이블에 자동 추가됐어요</span>
          <button
            onClick={() => { setExtractedNotice(null); setShowDecisionPanel(true); }}
            className="ml-2 text-xs px-2 py-0.5 rounded"
            style={{ backgroundColor: "rgba(100,220,160,0.2)", border: "1px solid rgba(100,220,160,0.5)" }}
          >
            확인하기 →
          </button>
        </div>
      )}

      {/* 보류 알림 (조던 반대·우려로 등록 안 됨, 7초) */}
      {heldNotice !== null && (
        <div
          className="fixed bottom-40 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 text-sm"
          style={{
            backgroundColor: "rgba(15,25,40,0.95)",
            border: "1px solid rgba(255,200,100,0.6)",
            color: "rgba(255,220,150,1)",
            backdropFilter: "blur(10px)",
            maxWidth: "min(540px, 92vw)",
          }}
        >
          <span>⚠️</span>
          <span>
            <b>{heldNotice}개</b>의 결정이 조던 의견과 충돌해서 <b>등록 보류</b>됐어요.
            그래도 등록하려면 메시지에서 "그래도 등록해줘"라고 요청하세요.
          </span>
          <button
            onClick={() => setHeldNotice(null)}
            className="ml-2 text-xs px-2 py-0.5 rounded"
            style={{ backgroundColor: "rgba(255,200,100,0.2)", border: "1px solid rgba(255,200,100,0.4)" }}
          >
            확인
          </button>
        </div>
      )}

      {/* 바이블 일관성 충돌 경고 (Feature C) — 새 답변이 기존 결정과 모순될 때 */}
      {bibleConflicts !== null && bibleConflicts.length > 0 && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4" onClick={() => setBibleConflicts(null)}>
          <div
            className="rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"
            style={{ backgroundColor: "#1a1410", border: "1px solid rgba(255,180,90,0.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,180,90,0.25)" }}>
              <p className="text-sm font-bold flex items-center gap-2" style={{ color: "rgba(255,210,150,1)" }}>
                <span>⚠️</span> 기존 결정과 충돌 가능 {bibleConflicts.length}건
              </p>
              <button onClick={() => setBibleConflicts(null)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(255,200,100,0.15)", color: "rgba(255,210,150,0.9)" }}>닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <p className="text-[11px]" style={{ color: "rgba(255,210,150,0.7)" }}>
                방금 답변이 기획 바이블에 누적된 결정과 어긋날 수 있어요. 의도한 변경이면 무시하고, 아니면 방향을 다시 확인하세요.
              </p>
              {bibleConflicts.map((c, i) => (
                <div key={i} className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${c.severity === "high" ? "rgba(255,140,90,0.5)" : "rgba(255,200,100,0.3)"}` }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: c.severity === "high" ? "rgba(255,120,80,0.25)" : "rgba(255,200,100,0.18)", color: c.severity === "high" ? "rgba(255,180,150,1)" : "rgba(255,220,150,1)" }}>
                      {c.severity === "high" ? "직접 모순" : "느슨한 충돌"}
                    </span>
                  </div>
                  <p className="text-[11px] mb-1" style={{ color: SILVER_DIM }}>📌 기존: <span style={{ color: SILVER }}>{c.existing}</span></p>
                  <p className="text-[11px] mb-1" style={{ color: SILVER_DIM }}>🆕 이번 답변: <span style={{ color: SILVER }}>{c.newClaim}</span></p>
                  {c.reason && <p className="text-[10px] mt-1" style={{ color: "rgba(255,200,150,0.75)" }}>↳ {c.reason}</p>}
                </div>
              ))}
            </div>
            <div className="px-5 py-3 flex-shrink-0 flex justify-end gap-2" style={{ borderTop: "1px solid rgba(255,180,90,0.2)" }}>
              <button onClick={() => { setBibleConflicts(null); setShowDecisionPanel(true); }} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(100,180,255,0.15)", border: "1px solid rgba(100,180,255,0.4)", color: "rgba(180,210,255,1)" }}>바이블 확인 →</button>
              <button onClick={() => setBibleConflicts(null)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(255,200,100,0.18)", border: "1px solid rgba(255,200,100,0.4)", color: "rgba(255,220,150,1)" }}>의도한 변경임</button>
            </div>
          </div>
        </div>
      )}

      {/* 맥락 결정사항 팝업 — 맥락선 이하 기획 바이블에 추가된 결정 목록 */}
      {showContextModal && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-end z-50 p-4 pt-16" onClick={() => setShowContextModal(false)}>
          <div className="rounded-2xl w-96 max-h-[80vh] flex flex-col shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span style={{ color: "rgba(100,220,160,0.9)", fontSize: "12px" }}>📋</span>
                  <p className="text-xs font-bold" style={{ color: SILVER }}>맥락 결정사항</p>
                </div>
                <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>
                  {contextAnchorPairId
                    ? `맥락선 이하 추가된 결정 (${recentDecisions.length}개)`
                    : `기획 바이블 전체 (${recentDecisions.length}개) — 맥락선 설정 시 그 이후만 표시`}
                </p>
              </div>
              <button onClick={() => setShowContextModal(false)} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
              {recentDecisionsLoading ? (
                <p className="text-xs text-center py-4" style={{ color: SILVER_DIM }}>불러오는 중...</p>
              ) : recentDecisions.length === 0 ? (
                <p className="text-xs text-center py-6" style={{ color: SILVER_DIM }}>
                  {contextAnchorPairId
                    ? "맥락선 이하 추가된 결정이 아직 없어요"
                    : "기획 바이블에 누적된 결정이 없어요"}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {recentDecisions.map(d => {
                    const conf = d.confidence;
                    const confStyle =
                      conf === "decided" ? { bg: "rgba(100,220,160,0.15)", color: "rgba(150,255,200,1)", label: "✓" }
                      : conf === "review" ? { bg: "rgba(255,200,100,0.15)", color: "rgba(255,220,150,1)", label: "🔍" }
                      : { bg: "rgba(150,180,255,0.15)", color: "rgba(180,210,255,1)", label: "⚪" };
                    return (
                      <div key={d.id} className="px-3 py-2 rounded-lg flex items-start gap-2" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
                        <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5" style={{ backgroundColor: confStyle.bg, color: confStyle.color }}>
                          {confStyle.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs" style={{ color: "#e0e8f0", lineHeight: 1.45 }}>{d.content}</p>
                          <p className="text-[10px] mt-1" style={{ color: SILVER_DIM }}>
                            {new Date(d.created_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            {d.created_by_nickname && ` · ${d.created_by_nickname}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 px-4 py-2.5" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
              <button
                onClick={() => { setShowContextModal(false); setShowDecisionPanel(true); }}
                className="w-full text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: "rgba(100,220,160,0.18)", border: "1px solid rgba(100,220,160,0.5)", color: "rgba(150,255,200,1)" }}
              >
                📚 기획 바이블 전체 보기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 설정 팝업 — 참고 게임 / 출처 표시 / 관리 도구 / 답변 모델 */}
      {showSettingsModal && (() => {
        const isAdmin = sessionId?.replace(/^agent:/, "") === "정민";
        return (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowSettingsModal(false)}>
            <div
              className="rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl"
              style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
                <div>
                  <p className="text-sm font-bold flex items-center gap-2" style={{ color: SILVER }}>
                    <span>⚙️</span> 설정
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>
                    {isAdmin ? "관리자 모드 — 모든 항목 수정 가능" : "뷰어 모드 — 일부 항목은 읽기 전용"}
                  </p>
                </div>
                <button onClick={() => setShowSettingsModal(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>
                  닫기
                </button>
              </div>

              {/* 본문 */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>

                {/* 1. 답변 표시 — 출처 표시 토글 */}
                <section>
                  <p className="text-xs font-bold mb-2" style={{ color: "rgba(150,255,200,1)" }}>🏷️ 답변 표시</p>
                  <div className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
                    <div className="flex-1">
                      <p className="text-xs font-medium" style={{ color: SILVER }}>출처 표시</p>
                      <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>답변 문장에 [공식 인용 — N개 일치] 같은 신뢰도 라벨 표시</p>
                    </div>
                    <button
                      onClick={() => { const nv = !showCitations; setShowCitations(nv); broadcastSync({ kind: "toggle", key: "citations", value: nv }); }}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium ml-2 flex-shrink-0"
                      style={{
                        backgroundColor: showCitations ? "rgba(100,220,160,0.25)" : SILVER_FAINT,
                        border: `1px solid ${showCitations ? "rgba(100,220,160,0.7)" : SILVER_DIM}`,
                        color: showCitations ? "rgba(150,255,200,1)" : SILVER,
                      }}
                    >
                      {showCitations ? "ON" : "OFF"}
                    </button>
                  </div>
                  {/* 자세한 답변 자동 표시 */}
                  <div className="px-3 py-2.5 mt-2 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
                    <div className="flex-1">
                      <p className="text-xs font-medium" style={{ color: SILVER }}>자세한 답변 자동 표시</p>
                      <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>답변 완료 시 [▼ 자세한 답변]을 자동으로 펼쳐요. (켜면 답변마다 비용↑ — 자세한 답변을 매번 추가 생성)</p>
                    </div>
                    <button
                      onClick={() => { const nv = !autoDetail; setAutoDetail(nv); broadcastSync({ kind: "toggle", key: "autoDetail", value: nv }); }}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium ml-2 flex-shrink-0"
                      style={{
                        backgroundColor: autoDetail ? "rgba(100,220,160,0.25)" : SILVER_FAINT,
                        border: `1px solid ${autoDetail ? "rgba(100,220,160,0.7)" : SILVER_DIM}`,
                        color: autoDetail ? "rgba(150,255,200,1)" : SILVER,
                      }}
                    >
                      {autoDetail ? "ON" : "OFF"}
                    </button>
                  </div>
                </section>

                {/* 🕘 히스토리 — 변경 이력 (별도 팝업으로 열기) */}
                <section>
                  <p className="text-xs font-bold mb-2" style={{ color: "rgba(180,210,255,1)" }}>🕘 히스토리</p>
                  <p className="text-[10px] mb-2" style={{ color: SILVER_DIM }}>결정사항·카테고리·기획서의 추가·수정·삭제 기록 (각 항목 수정·삭제 가능)</p>
                  <button
                    onClick={() => { setShowSettingsModal(false); setShowHistoryModal(true); }}
                    className="text-xs px-3 py-2 rounded-lg font-medium w-full"
                    style={{ backgroundColor: "rgba(100,180,255,0.12)", border: "1px solid rgba(100,180,255,0.4)", color: "rgba(180,210,255,1)" }}
                  >
                    🕘 히스토리 열기
                  </button>
                </section>

                {/* 화면 설계는 📄 기획서 뷰의 [🎨 화면 설계] 버튼으로 이동됨 */}

                {/* 2. 참고 게임 라이브러리 */}
                <section>
                  <p className="text-xs font-bold mb-2" style={{ color: "rgba(180,210,255,1)" }}>🎮 참고 게임</p>
                  <div className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
                    <div className="flex-1">
                      <p className="text-xs font-medium" style={{ color: SILVER }}>등록된 게임 라이브러리</p>
                      <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>조던이 분석에 활용하는 신뢰 게임 {REFERENCE_GAMES.length}종</p>
                    </div>
                    <button
                      onClick={() => setShowGameModal(true)}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium ml-2 flex-shrink-0"
                      style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
                    >
                      자세히 →
                    </button>
                  </div>
                </section>

                {/* 3. 관리 도구 — 관리자만 수정 가능 */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-bold" style={{ color: "rgba(255,220,150,1)" }}>🛠️ 관리 도구</p>
                    {!isAdmin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,200,100,0.1)", color: "rgba(255,220,150,0.7)" }}>
                        🔒 관리자 전용
                      </span>
                    )}
                  </div>
                  <div className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}`, opacity: isAdmin ? 1 : 0.5 }}>
                    <div className="flex-1">
                      <p className="text-xs font-medium" style={{ color: SILVER }}>게임 도메인 큐레이션</p>
                      <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>
                        {isAdmin ? "신뢰 사이트 등록·발견 도구" : "관리자(정민)만 접근 가능"}
                      </p>
                    </div>
                    <button
                      onClick={() => isAdmin && window.open("/admin/curation", "_blank")}
                      disabled={!isAdmin}
                      className="text-xs px-3 py-1.5 rounded-lg font-medium ml-2 flex-shrink-0 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: isAdmin ? "rgba(255,200,100,0.2)" : SILVER_FAINT,
                        border: `1px solid ${isAdmin ? "rgba(255,200,100,0.5)" : SILVER_DIM}`,
                        color: isAdmin ? "rgba(255,220,150,1)" : SILVER_DIM,
                      }}
                    >
                      열기 →
                    </button>
                  </div>
                </section>

                {/* 4. 답변 모델 — 관리자만 수정 가능 */}
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-bold" style={{ color: "rgba(200,180,255,1)" }}>🤖 답변 모델</p>
                    {!isAdmin && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,200,100,0.1)", color: "rgba(255,220,150,0.7)" }}>
                        🔒 관리자 전용
                      </span>
                    )}
                  </div>
                  <div className="px-3 py-2.5 rounded-lg flex flex-col gap-2" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}`, opacity: isAdmin ? 1 : 0.85 }}>
                    {/* 최종 답변 */}
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: SILVER }}>최종 답변</p>
                        <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>사용자가 읽는 조던 답변</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded font-bold ml-2 flex-shrink-0" style={{ backgroundColor: "rgba(200,180,255,0.18)", border: "1px solid rgba(200,180,255,0.5)", color: "rgba(220,200,255,1)" }}>
                        Opus 4.7
                      </span>
                    </div>
                    {/* 기획서 작성·수정 */}
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: SILVER }}>기획서 작성·수정</p>
                        <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>대화 기반·바이블 자동 생성·수정 요청</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded font-bold ml-2 flex-shrink-0" style={{ backgroundColor: "rgba(200,180,255,0.18)", border: "1px solid rgba(200,180,255,0.5)", color: "rgba(220,200,255,1)" }}>
                        Opus 4.7
                      </span>
                    </div>
                    {/* 내부 단계 */}
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium" style={{ color: SILVER }}>내부 분석·검토</p>
                        <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>웹 검색·라우터·검토 등</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded font-bold ml-2 flex-shrink-0" style={{ backgroundColor: "rgba(100,180,255,0.15)", border: "1px solid rgba(100,180,255,0.4)", color: "rgba(180,210,255,1)" }}>
                        Sonnet 4.5
                      </span>
                    </div>
                    <p className="text-[10px] mt-1 pt-2" style={{ color: SILVER_DIM, borderTop: `1px solid ${SILVER_FAINT}` }}>
                      💎 사용자 직접 노출 결과물엔 Opus, 내부 단계엔 Sonnet — 품질·비용 균형
                    </p>
                  </div>
                </section>

                {/* 5. 화면 모드 전환 */}
                <section>
                  <p className="text-xs font-bold mb-2" style={{ color: "rgba(180,210,255,1)" }}>📱 화면 모드 미리보기 (PC → 모바일)</p>
                  <div className="px-3 py-2.5 rounded-lg flex flex-col gap-2" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
                    <p className="text-[10px]" style={{ color: SILVER_DIM }}>
                      PC에서 모바일 사용감을 미리 보고 싶을 때. 디바이스 프레임 안에 모바일 UI가 렌더됩니다.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => { window.location.href = "/chat?view=mobile-ios"; }}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ backgroundColor: "rgba(100,180,255,0.18)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}
                      >
                        📱 iPhone 14 (390×844)
                      </button>
                      <button
                        onClick={() => { window.location.href = "/chat?view=mobile-android"; }}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium"
                        style={{ backgroundColor: "rgba(100,220,160,0.18)", border: "1px solid rgba(100,220,160,0.5)", color: "rgba(150,255,200,1)" }}
                      >
                        🤖 Android (412×915)
                      </button>
                      <button
                        onClick={() => { window.location.href = "/chat?view=mobile"; }}
                        className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
                      >
                        풀스크린 모바일
                      </button>
                    </div>
                  </div>
                </section>

                {/* 🆕 최근 추가 기능 (2026-06-15) */}
                <section>
                  <p className="text-sm font-bold mb-2" style={{ color: "rgba(180,210,255,1)" }}>🆕 최근 추가 (2026-06-15)</p>
                  <div className="px-3 py-2.5 rounded-lg flex flex-col gap-2 text-[11px]" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>
                    <p><b style={{ color: "rgba(255,205,120,1)" }}>⚖️ 절대 규칙(게임 헌법)</b> — 📚 기획 바이블 패널 맨 위. 가로형·턴제 같은 불변 규칙을 등록하면 모든 답변·기획서·시안이 반드시 준수해요(바이블보다 상위).</p>
                    <p><b style={{ color: SILVER }}>💬 기획서 댓글</b> — 📄 기획서 맨 아래에서 의견·답글(유튜브식). <b>볼드·글자크기·색상</b> 서식 지원.</p>
                    <p><b style={{ color: SILVER }}>🔔 알림</b> — 내 기획서에 댓글이 달리거나 내 댓글에 답글이 달리면 헤더 🔔에 표시. 누르면 <b>그 댓글로 바로가기</b>.</p>
                    <p><b style={{ color: SILVER }}>🔍 기획서 검색</b> — 📄 기획서 리스트 상단 검색창에서 제목·본문 내용으로 검색.</p>
                    <p><b style={{ color: SILVER }}>✍️ 작성 방향 지시</b> — 대화 선택 후 작성 시작 시, 원하는 방향(예: “초보 소환만”)을 입력창에 적으면 그 범위로 좁혀 작성.</p>
                    <p><b style={{ color: SILVER }}>🕘 히스토리 팝업</b> — 설정의 “🕘 히스토리 열기” 버튼으로 변경 이력(조던기능/기획서)을 별도 창에서 봅니다.</p>
                    <p><b style={{ color: SILVER }}>⚠️ 바이블 일관성 검사</b> — 답변이 누적된 결정과 모순되면 자동으로 경고창이 떠요. “의도한 변경”이면 닫으면 됩니다.</p>
                    <p><b style={{ color: SILVER }}>🖼️ 이미지 의도 태그·영역 표시</b> — 이미지 첨부 시 분석 관점(레이아웃·색감 등) 선택 + 메모, ✏️로 이미지에 동그라미·선 표시.</p>
                    <p><b style={{ color: SILVER }}>📐 스케치→와이어프레임</b> — 손그림 스케치를 첨부하고 “📐 와이어프레임화”를 누르면 정돈된 시안 + 비평으로 변환.</p>
                    <p><b style={{ color: SILVER }}>🗂️ 레퍼런스 갤러리</b> — 입력창 🗂️ 버튼. 참고 게임 화면을 종류별로 모아두고 “이 느낌으로” 선택해 첨부.</p>
                    <p><b style={{ color: SILVER }}>🗂️ 시안 버전 히스토리</b> — AI 시안 생성(🎨 화면 설계)에서 수정마다 버전이 쌓여 이전 시안으로 되돌리기·분기 가능.</p>
                  </div>
                </section>

              </div>
            </div>
          </div>
        );
      })()}

      {/* ✏️ 이미지 영역 표시기 (Feature H) */}
      {showAnnotator && attachedImage && (
        <ImageAnnotator
          src={attachedImage.dataUrl}
          onCancel={() => setShowAnnotator(false)}
          onDone={(dataUrl, mime, base64) => {
            setAttachedImage({ dataUrl, mime, base64 });
            setImageHasAnnotation(true);
            setShowAnnotator(false);
          }}
        />
      )}

      {/* 🗂️ 레퍼런스 갤러리 (Feature J) */}
      <ReferenceGallery
        open={showRefGallery}
        onClose={() => setShowRefGallery(false)}
        onPick={(img, label) => {
          setAttachedImage(img);
          setImageHasAnnotation(false);
          setImageMemo(`레퍼런스 참고: ${label}`);
        }}
      />

      {/* 📐 스케치 → 와이어프레임 (Feature L) */}
      {showSketchModal && attachedImage && (
        <SketchWireframeModal
          imageBase64={attachedImage.base64}
          mime={attachedImage.mime}
          note={imageMemo}
          onClose={() => setShowSketchModal(false)}
        />
      )}

      {/* 🕘 히스토리 팝업 — 변경 이력 (조던 기능 / 기획서) */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] p-4" onClick={() => setShowHistoryModal(false)}>
          <div
            className="rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl"
            style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div>
                <p className="text-sm font-bold" style={{ color: SILVER }}>🕘 히스토리</p>
                <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>결정사항·카테고리·기획서의 추가·수정·삭제 기록</p>
              </div>
              <button onClick={() => setShowHistoryModal(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
              <HistoryPanel />
            </div>
          </div>
        </div>
      )}

      {/* 가이드 팝업 — 조던 전체 기능 요약 */}
      {showGuideModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={() => setShowGuideModal(false)}>
          <div
            className="rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
            style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 팝업 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div>
                <p className="text-sm font-bold" style={{ color: SILVER }}>📖 조던 사용 가이드</p>
                <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>영웅수집형 게임 기획 전문가 에이전트의 모든 기능</p>
              </div>
              <button onClick={() => setShowGuideModal(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
            </div>

            {/* 팝업 내용 */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>

              {/* 섹션 1 — 핵심 동작 */}
              <section>
                <p className="text-xs font-bold mb-2" style={{ color: "rgba(150,255,200,1)" }}>🤖 핵심 동작</p>
                <div className="space-y-2 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
                  <p><b style={{ color: SILVER }}>다단계 에이전트 파이프라인</b> — 분석 → 설계 → 검토 → 답변. 단순 챗봇이 아닌 디렉터급 의사결정 과정을 거쳐요.</p>
                  <p><b style={{ color: SILVER }}>실시간 게임 데이터 분석</b> — 등록된 11개 게임의 신뢰 출처(공식·라운지·인벤·디시·나무위키 등)를 실시간 검색해 근거 기반 답변.</p>
                  <p><b style={{ color: SILVER }}>스트리밍 응답</b> — 답변이 작성되는 과정을 실시간으로 표시.</p>
                  <p><b style={{ color: SILVER }}>🖼️ 이미지 첨부 분석</b> — 입력창 <b>📎 버튼</b>으로 게임 UI 스크린샷·와이어프레임·경쟁작 화면을 첨부하면, 조던이 <b>이미지를 직접 보고</b> UX 평가·개선점·의견을 제시해요. (Opus 비전 — 이미지를 글처럼 이해)</p>
                  <p><b style={{ color: SILVER }}>📑 참고 기획서</b> — 헤더 <b>📌 맥락 왼쪽의 📑 참고 기획서</b>로 기존 기획서를 체크해두면, 조던이 그 내용을 보고 답해요. <b>다른 기획과의 교차 참고·충돌 감지</b>에 활용 (예: "○○ 기획서는 5등급인데 지금은 7등급이라 충돌해요"). 대화방마다 따로 저장돼요.</p>
                  <p><b style={{ color: SILVER }}>🛠️ 기획서 수정</b> — 헤더 <b>📄 기획서 작성 옆의 🛠️ 기획서 수정</b>으로, <b>맥락선 범위 대화</b>를 근거로 기존 기획서를 수정(추가·변경·삭제)해요. 적용 전 <b>색상 미리보기</b>(🟢추가/🟡수정/🔴삭제)로 확인하고 [적용]하면 깨끗한 본문으로 저장(수정 전 자동 백업). 기획서 뷰의 <b>🪄 수정 요청 → 대화를 통한 수정</b>으로도 진입할 수 있어요.</p>
                </div>
              </section>

              {/* 섹션 2 — 헤더 도구 */}
              <section>
                <p className="text-xs font-bold mb-2" style={{ color: "rgba(180,210,255,1)" }}>🛠️ 헤더 도구 (좌 → 우)</p>
                <div className="space-y-2 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
                  <p><b style={{ color: SILVER }}>💬 대화방 (병렬 작업)</b> — 조던 이름 옆 <b>💬 버튼</b>으로 여러 대화방을 만들어 <b>주제별로 병렬 작업</b>. 카톡 채팅방처럼 [새 대화방 / 전환 / ✏️ 이름변경 / 🗑️ 삭제]. <b>방마다 대화·맥락이 독립</b>이라 서로 안 섞여요. 단, <b>기획 바이블·기획서는 전 방 공유</b>라 어느 방에서 작업해도 자산은 하나로 쌓여요. (기존 대화는 "기본 대화" 방에 그대로 보존)</p>
                  <p><b style={{ color: SILVER }}>📌 맥락</b> — 클릭하면 현재 맥락선 위치로 스크롤 + 노란 하이라이트. 설정 안 돼 있으면 <i>"맥락선이 없습니다"</i> 토스트. 설정/해제는 본문 안에서.</p>
                  <p><b style={{ color: SILVER }}>📚 기획 바이블 — 탭</b> — 바이블 패널 상단 <b>[전체] / [현재 맥락]</b> 탭. <b>전체</b>는 누적된 모든 결정, <b>현재 맥락</b>은 맥락선 이후 추가된 결정만 보여줘요. (옛 "📋 맥락 결정사항" 버튼이 이 탭으로 통합됨)</p>
                  <p><b style={{ color: SILVER }}>📄 기획서 ▾ (드롭다운)</b> — 헤더의 한 버튼에 <b>[📂 리스트 이동 / ✍️ 현재 맥락으로 작성 / 🛠️ 현재 맥락으로 수정]</b>이 묶여 있어요. <b>작성</b>은 대화 선택 후 [✓ 작성 시작] → 백그라운드 생성 → <b>저장 전 미리보기</b>(제목 수정 가능·카테고리 위치·전체 요약 확인) → [저장]. <b>수정</b>은 맥락선 범위 대화로 기존 기획서를 색상 미리보기 후 적용. <b>리스트 이동</b>은 기획서 뷰 열기.</p>
                  <p><b style={{ color: SILVER }}>📄 기획서</b> — 진입 시 좌측 <b>📚 기획서 리스트</b>가 기본 열림. 좁다 싶으면 헤더 <b>⇤</b> 버튼으로 사이드바 접고 본문 넓게 보기 (모바일·PC 공통, 설정 영속). <b>모바일에서는 좌→우 스와이프로 펼치기, 우→좌 스와이프로 접기</b>도 가능. 리스트는 <b>대 &gt; 중 &gt; 소 &gt; 기획서</b> 4단계 트리. 대(인게임/아웃게임…)는 진한 배경, 중(영웅/PVP…)는 옅은 배경, 소(영웅 등급/스킬…)는 좌측 보더, 기획서는 leaf. 각 단계마다 +/− 토글. 기획서 옆 ✏️로 이름 변경, 📂로 분류 변경. 리스트 헤더의 <b>⚙️</b>로 카테고리 관리 — 대/중/소 추가·수정·삭제는 물론, <b>각 카테고리 아래 최하위 기획서(📄)도 표시돼 🗑️로 삭제</b> 가능 (미분류·직속 기획서 포함). 안 본 기획서 옆에는 <b style={{ color: "rgba(255,150,150,1)" }}>빨간 점</b>(클릭하면 영구 해제). 뷰 안에서 <b>🪄 수정 요청</b>으로 자연어 지시 → 같은 기획서를 그 자리에서 갱신. 수정 전 원본은 <b>7일간 백업 폴더에 자동 보관</b>. <b>📥 내보내기</b>는 MD/TXT/HTML/PDF 4가지.</p>
                  <p><b style={{ color: SILVER }}>📖 가이드</b> — 지금 보고 있는 이 화면. 조던의 모든 기능을 한눈에 정리. 기능이 바뀌면 자동 갱신.</p>
                  <p><b style={{ color: SILVER }}>📱 모바일</b> — 같은 URL을 모바일에서 열면 자동으로 모바일 전용 뷰. 햄버거 메뉴(☰) 안에 모든 도구. 닉네임만 같으면 데이터·기획 바이블·기획서 자동 동기화. <i>?view=desktop</i> 쿼리로 PC 뷰 강제 가능.</p>
                  <p><b style={{ color: SILVER }}>⚙️ 설정</b> — 출처 표시, 참고 게임 라이브러리, 관리 도구(큐레이션·관리자 전용), 답변 모델(관리자 전용)이 한곳에 모임. 비관리자는 뷰어 모드로 일부만 수정 가능.</p>
                  <p><b style={{ color: SILVER }}>🎨 화면 설계</b> — 📄 기획서 뷰의 [🎨 화면 설계] 드롭다운에서 진입. <b>와이어프레임(직접 그리기)</b> 또는 <b>🪄 AI 시안 생성(자연어 → HTML)</b> 두 가지 모드. 작성 후 📎로 현재 기획서에 자동 첨부.</p>
                  <p><b style={{ color: SILVER }}>📚 기획 바이블</b> — 누적된 모든 기획 결정 자산. 모든 기획서 작성에 자동 참조. 신규 항목 추가 시 빨간 점(클릭/2분 뒤 해제).</p>
                </div>
              </section>

              {/* 섹션 3 — 답변별 도구 */}
              <section>
                <p className="text-xs font-bold mb-2" style={{ color: "rgba(255,220,150,1)" }}>💬 답변별 도구</p>
                <div className="space-y-2 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
                  <p><b style={{ color: SILVER }}>▼ 자세한 답변 보기</b> — 같은 질문에 대해 더 깊이 있는 확장 설명. <b>최고 품질 모델(Opus)</b>로 작성되고 글자가 흐르듯 실시간 표시돼요. <b>⚙️ 설정 → 답변 표시 → "자세한 답변 자동 표시"</b>를 켜면 매 답변마다 자동으로 펼쳐져요 (대신 답변마다 비용↑).</p>
                  <p><b style={{ color: SILVER }}>📋 디렉터 검토 의견</b> — 검토 에이전트가 본 답변에 대해 짚은 보완점·우려 사항.</p>
                  <p><b style={{ color: SILVER }}>👍 정확함 / 👎 부정확</b> — 피드백 저장. 부정확은 사유 입력 가능 → 차후 품질 개선에 활용.</p>
                  <p><b style={{ color: SILVER }}>📌 호버 압정</b> — 답변 좌측에 호버 시 나타남. <b>모든 페어에 표시되며 언제든 다른 시점으로 변경 가능</b>. 해제는 본문 내 맥락선 ✕로.</p>
                  <p><b style={{ color: SILVER }}>복사·삭제</b> — 답변 우상단 ⎘ 복사 / 호버 시 삭제. 삭제된 대화는 하단에서 복원 가능.</p>
                </div>
              </section>

              {/* 섹션 — 조던 인터뷰 */}
              <section>
                <p className="text-xs font-bold mb-2" style={{ color: "rgba(255,210,160,1)" }}>🎤 조던 인터뷰 (능동 질문)</p>
                <div className="space-y-2 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
                  <p><b style={{ color: SILVER }}>답변 끝 후속 질문</b> — 모든 답변 끝에 조던이 다음 결정에 도움될 질문 1~2개를 자연스럽게 제안. 선택지 포함이라 답변 부담 ↓.</p>
                  <p><b style={{ color: SILVER }}>🎤 조던에게 질문 받기</b> — (현재 버튼은 숨김 처리, 기능은 보존 — 필요 시 복구 가능) 조던이 바이블의 빈 영역을 자동 분석해 미결정 항목을 질문하던 기능.</p>
                  <p>두 가지 모두 사용자가 주도하지 않아도 조던이 능동적으로 결정 영역을 채워나가도록 유도.</p>
                </div>
              </section>

              {/* 섹션 4 — 자동 기능 */}
              <section>
                <p className="text-xs font-bold mb-2" style={{ color: "rgba(255,180,180,1)" }}>⚙️ 자동 기능</p>
                <div className="space-y-2 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
                  <p><b style={{ color: SILVER }}>기획 바이블 자동 추출</b> — 대화에서 결정·검토된 사항을 조던이 자동 추출해 바이블에 추가. 카테고리 자동 분류.</p>
                  <p><b style={{ color: SILVER }}>충돌 항목 보류</b> — 조던이 반대·우려를 표한 결정은 자동 등록 보류. 사용자가 "그래도 등록해줘" 요청 시에만 등록.</p>
                  <p><b style={{ color: SILVER }}>대화 기록 자동 저장</b> — Supabase에 저장. 새로고침·다른 기기에서도 복원.</p>
                </div>
              </section>

              {/* 섹션 5 — 활용 팁 */}
              <section>
                <p className="text-xs font-bold mb-2" style={{ color: "rgba(200,180,255,1)" }}>💡 활용 팁</p>
                <div className="space-y-2 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
                  <p><b style={{ color: SILVER }}>긴 프로젝트일 때</b> — 주제 전환 시 맥락 시작점(📌) 설정해서 이전 맥락 제외. 핵심 결정은 바이블에 누적돼 있으니 손실 없음.</p>
                  <p><b style={{ color: SILVER }}>기획서 만들기</b> — 충분히 대화로 발산 → 결정사항이 바이블에 쌓임 → 헤더 [📄 기획서 작성]으로 한 번에 정리.</p>
                  <p><b style={{ color: SILVER }}>바이블 직접 편집</b> — 📚 클릭해서 패널 열고 +/✏️/🗑️로 수동 관리 가능. 자동 추출이 놓친 항목도 직접 추가.</p>
                  <p><b style={{ color: SILVER }}>모바일</b> — 헤더 버튼 꾹 누르고 있으면 설명 팝업, 떼면 실행.</p>
                </div>
              </section>

            </div>
          </div>
        </div>
      )}

      {/* 참고 게임 팝업 — 설정 모달 위에 띄울 수 있도록 z-[60] */}
      {showGameModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-[60] p-4" onClick={() => setShowGameModal(false)}>
          <div className="rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }} onClick={(e) => e.stopPropagation()}>
            {/* 팝업 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div>
                <p className="text-sm font-bold" style={{ color: SILVER }}>🎮 참고 게임 라이브러리 ({REFERENCE_GAMES.length}개)</p>
                <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>에이전트가 검증된 신뢰 출처로 분석하는 등록 게임 목록</p>
              </div>
              <button onClick={() => setShowGameModal(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
            </div>
            {/* 팝업 내용 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
              {REFERENCE_GAMES.map((game) => (
                <div key={game.name} className="rounded-xl p-4" style={{ backgroundColor: "rgba(192,200,216,0.05)", border: `1px solid ${SILVER_FAINT}` }}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-sm font-bold" style={{ color: SILVER }}>{game.name}</p>
                      <p className="text-xs" style={{ color: SILVER_DIM }}>{game.studio}</p>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end ml-2">
                      {game.tags.map((tag) => (
                        <span key={tag} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(192,200,216,0.1)", border: `1px solid ${SILVER_FAINT}`, color: SILVER_DIM }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <ul className="space-y-1 mb-3">
                    {game.items.map((item, i) => (
                      <li key={i} className="text-xs flex gap-2" style={{ color: "#b8c4d4" }}>
                        <span style={{ color: SILVER_DIM, flexShrink: 0 }}>•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  {/* 신뢰 출처 — 에이전트가 이 게임 검색 시 참고하는 사이트들 */}
                  <div className="pt-2 mt-2" style={{ borderTop: `1px dashed ${SILVER_FAINT}` }}>
                    <p className="text-xs mb-1.5" style={{ color: SILVER_DIM }}>
                      🔎 검색 신뢰 출처
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {game.sources.map((src) => (
                        <span
                          key={src}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: "rgba(100,180,255,0.08)",
                            border: "1px solid rgba(100,180,255,0.25)",
                            color: "rgba(180,210,255,0.9)",
                          }}
                        >
                          {src}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <header className="px-6 py-4 flex items-center gap-4" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}`, boxShadow: `0 0 15px rgba(192,200,216,0.2)` }}>
          <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            {/* 에이전트 이름: 조던 */}
            <p className="font-bold text-sm" style={{ color: SILVER }}>조던</p>
            {/* 감성 뱃지 — 게임 경험 강조 */}
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", color: "#34d399" }}>✨ 다양한 수집형 게임 경험</span>
          </div>
          {/* 헤더 설명 */}
          <p className="text-xs leading-snug" style={{ color: SILVER_DIM }}>
            난 게임기획자이자 게임마스터 조던!<br />
            무엇이든 물어보라고!
          </p>
        </div>

        {/* 대화방 스위처 — 병렬 작업용 (여러 대화방 전환) */}
        {!selectMode && (
          <div className="relative">
            <button
              onClick={() => setShowConvList(v => !v)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5"
              style={{ backgroundColor: "rgba(100,180,255,0.15)", border: "1px solid rgba(100,180,255,0.45)", color: "rgba(180,210,255,1)" }}
              title="대화방 전환 — 여러 기획서를 병렬로 작업"
            >
              <span>💬</span>
              <span className="truncate" style={{ maxWidth: 150 }}>{conversations.find(c => c.id === currentConvId)?.title ?? "대화방"}</span>
              <span style={{ fontSize: "9px" }}>▾</span>
            </button>
            {showConvList && (
              <div className="absolute left-0 top-full mt-1 rounded-lg shadow-2xl py-1 z-30" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}`, minWidth: 240, maxHeight: 380, overflowY: "auto" }}>
                <button onClick={createConversation} className="block w-full text-left text-xs px-3 py-2 font-bold hover:bg-white/5" style={{ color: "#7dd3fc", borderBottom: `1px solid ${SILVER_FAINT}` }}>+ 새 대화방</button>
                {conversations.map(c => (
                  <div key={c.id} className="flex items-center gap-1 px-2 py-0.5 hover:bg-white/5" style={{ backgroundColor: c.id === currentConvId ? "rgba(100,180,255,0.12)" : "transparent" }}>
                    {renamingConvId === c.id ? (
                      <input
                        value={convRenameInput}
                        onChange={e => setConvRenameInput(e.target.value)}
                        onBlur={() => renameConversation(c.id, convRenameInput)}
                        onKeyDown={e => { if (e.key === "Enter") renameConversation(c.id, convRenameInput); if (e.key === "Escape") { setRenamingConvId(null); setConvRenameInput(""); } }}
                        autoFocus
                        className="flex-1 min-w-0 text-xs px-1.5 py-1 rounded outline-none"
                        style={{ backgroundColor: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,180,255,0.5)", color: "#e0e8f0" }}
                      />
                    ) : (
                      <button onClick={() => loadConversation(c.id)} className="flex-1 min-w-0 text-left text-xs px-1.5 py-1 truncate" style={{ color: c.id === currentConvId ? "rgba(180,210,255,1)" : "#d0d8e0" }} title={c.title}>{c.title}</button>
                    )}
                    <button onClick={() => { setRenamingConvId(c.id); setConvRenameInput(c.title); }} className="text-xs px-1 rounded hover:bg-white/10 flex-shrink-0" style={{ color: SILVER_DIM }} title="이름 변경">✏️</button>
                    <button onClick={() => deleteConversation(c.id)} className="text-xs px-1 rounded hover:bg-white/10 flex-shrink-0" style={{ color: "rgba(255,160,160,0.7)" }} title="삭제">🗑️</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* ─── 선택 모드: 작성 컨트롤만 크게 표시, 다른 헤더 버튼은 숨김 ─── */}
          {selectMode && (
            <>
              <span className="text-sm font-medium" style={{ color: SILVER }}>
                <b style={{ color: "rgba(180,210,255,1)" }}>{selectedPairIds.size}개</b> 선택됨
              </span>
              <button
                onClick={() => { if (selectedPairIds.size > 0) { setDocDirection(""); setShowDocDirection(true); } }}
                disabled={selectedPairIds.size === 0}
                className="text-sm px-4 py-2 rounded-lg font-bold disabled:opacity-40 whitespace-nowrap"
                style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: "0 2px 8px rgba(192,200,216,0.3)" }}
              >
                ✓ 작성 시작
              </button>
              <button
                onClick={cancelSelectMode}
                className="text-sm px-4 py-2 rounded-lg font-medium whitespace-nowrap"
                style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
              >
                취소
              </button>
            </>
          )}

          {/* ─── 일반 모드: 모든 헤더 버튼 표시 ─── */}
          {!selectMode && (
          <>
          {/* ① 맥락 — 아이콘만 (맨 앞). 현재 맥락선 위치로 이동 */}
          <Tooltip text={contextAnchorPairId ? "현재 맥락선 위치로 이동" : "맥락선이 설정돼 있지 않아요"}>
            <button
              onClick={() => {
                if (!contextAnchorPairId) {
                  setNoAnchorNotice(true);
                  setTimeout(() => setNoAnchorNotice(false), 2000);
                  return;
                }
                const el = document.getElementById(`pair-${contextAnchorPairId}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "center" });
                  el.style.transition = "background-color 0.3s";
                  const orig = el.style.backgroundColor;
                  el.style.backgroundColor = "rgba(255,200,100,0.1)";
                  setTimeout(() => { el.style.backgroundColor = orig; }, 1200);
                } else {
                  setNoAnchorNotice(true);
                  setTimeout(() => setNoAnchorNotice(false), 2000);
                }
              }}
              className="rounded-lg font-medium flex items-center justify-center w-8 h-8"
              style={{
                backgroundColor: contextAnchorPairId ? "rgba(255,200,100,0.18)" : "rgba(255,200,100,0.06)",
                border: `1px solid ${contextAnchorPairId ? "rgba(255,200,100,0.55)" : "rgba(255,200,100,0.2)"}`,
                color: contextAnchorPairId ? "rgba(255,220,150,1)" : "rgba(255,210,160,0.55)",
                fontSize: "14px",
              }}
            >
              📌
            </button>
          </Tooltip>

          {/* ② 참고 기획서 — 답변 시 교차 참고·충돌 점검 */}
          <Tooltip text="답변 시 참고할 기존 기획서 선택 (교차 참고·충돌 점검)">
            <button
              onClick={() => setShowRefPicker(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{
                backgroundColor: refDocIds.length ? "rgba(100,180,255,0.2)" : "rgba(100,180,255,0.08)",
                border: `1px solid ${refDocIds.length ? "rgba(100,180,255,0.55)" : "rgba(100,180,255,0.25)"}`,
                color: refDocIds.length ? "rgba(180,210,255,1)" : "rgba(170,200,235,0.7)",
              }}
            >
              📑 참고 기획서{refDocIds.length ? ` ${refDocIds.length}` : ""}
            </button>
          </Tooltip>

          {/* 📋 맥락 결정사항 버튼 제거 → 기획 바이블 패널의 '현재 맥락' 탭으로 통합됨 */}

          {/* ───────── 그룹 B: 행동·생성 (코랄/주황) ───────── */}
          {/* ②-1 🎤 조던 인터뷰 — 헤더 정리를 위해 숨김. 복구하려면 false → true 로 변경 */}
          {false && (
          <Tooltip text="조던이 바이블에서 빈 곳을 찾아 다음 결정을 위한 질문을 던져요">
            <button
              onClick={startInterview}
              disabled={interviewLoading}
              className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-40"
              style={{
                backgroundColor: "rgba(255,150,110,0.18)",
                border: "1px solid rgba(255,150,110,0.5)",
                color: "rgba(255,190,160,1)",
              }}
            >
              {interviewLoading ? (
                <>
                  <span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(255,190,160,0.3)", borderTopColor: "rgba(255,190,160,1)" }} />
                  분석 중
                </>
              ) : (
                <>🎤 조던에게 질문 받기</>
              )}
            </button>
          </Tooltip>
          )}

          {/* ③ 기획서 ▾ — 리스트 이동 / 현재 맥락으로 작성 / 현재 맥락으로 수정 (드롭다운 통합) */}
          <div className="relative">
            <Tooltip text="기획서 리스트 이동 · 현재 맥락으로 작성/수정">
              <button
                onClick={() => setShowDocMenu(v => !v)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium relative flex items-center gap-1.5"
                style={{
                  backgroundColor: showDocumentView ? "rgba(100,180,255,0.25)" : "rgba(100,180,255,0.12)",
                  border: `1px solid ${showDocumentView ? "rgba(100,180,255,0.6)" : "rgba(100,180,255,0.35)"}`,
                  color: showDocumentView ? "rgba(180,210,255,1)" : "rgba(170,200,235,0.95)",
                }}
              >
                {(docBackgroundGenerating || reviseGenLoading) && (
                  <span className="inline-block w-3 h-3 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(180,210,255,0.3)", borderTopColor: "rgba(180,210,255,1)" }} />
                )}
                📄 기획서 ▾
                {docNewDot && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: "rgba(255,80,80,0.95)", boxShadow: "0 0 6px rgba(255,80,80,0.7)" }} />
                )}
              </button>
            </Tooltip>
            {showDocMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowDocMenu(false)} />
                <div className="absolute right-0 mt-1 rounded-lg overflow-hidden z-30" style={{ minWidth: "240px", backgroundColor: "#141c2e", border: `1px solid ${SILVER_FAINT}`, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                  {/* 기획서 리스트 이동 */}
                  <button
                    onClick={() => { setShowDocMenu(false); if (showDocumentView) setShowDocumentView(false); else openDocumentView(); }}
                    className="w-full text-left text-xs px-3 py-2.5 hover:bg-white/5 flex items-center justify-between"
                    style={{ color: SILVER }}
                  >
                    <span>📂 기획서 리스트 이동</span>
                    {docNewDot && <span className="text-[10px]" style={{ color: "rgba(255,120,120,1)" }}>● 신규</span>}
                  </button>
                  {/* 현재 맥락으로 작성 */}
                  <button
                    onClick={() => { setShowDocMenu(false); if (docBackgroundGenerating) cancelDocGeneration(); else enterSelectMode(); }}
                    disabled={activePairs.length === 0 && !docBackgroundGenerating}
                    className="w-full text-left text-xs px-3 py-2.5 hover:bg-white/5 disabled:opacity-40"
                    style={{ color: SILVER, borderTop: `1px solid ${SILVER_FAINT}` }}
                  >
                    {docBackgroundGenerating ? "⏳ 작성 중... (취소)" : "✍️ 현재 맥락으로 기획서 작성"}
                  </button>
                  {/* 현재 맥락으로 수정 */}
                  <button
                    onClick={() => { setShowDocMenu(false); void startConversationRevise(); }}
                    disabled={reviseGenLoading || (activePairs.length === 0 && !reviseTargetDocId)}
                    className="w-full text-left text-xs px-3 py-2.5 hover:bg-white/5 disabled:opacity-40"
                    style={{ color: SILVER, borderTop: `1px solid ${SILVER_FAINT}` }}
                  >
                    {reviseGenLoading ? "⏳ 수정본 생성 중..." : reviseTargetDocId ? "🛠️ 이 대화로 기획서 수정" : "🛠️ 현재 맥락으로 기획서 수정"}
                  </button>
                  {reviseTargetDocId && (
                    <button
                      onClick={() => { setShowDocMenu(false); setReviseTargetDocId(null); setReviseTargetTitle(""); }}
                      className="w-full text-left text-xs px-3 py-2 hover:bg-white/5"
                      style={{ color: "#f08a8a", borderTop: `1px solid ${SILVER_FAINT}` }}
                    >
                      ✕ 수정 대상 해제
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {/* 출처 표시·참고 게임·큐레이션은 ⚙️ 설정 모달로 이동됨 */}

          {/* 🔔 알림 — 기획서 댓글/답글 */}
          <NotificationBell
            nickname={sessionId?.replace(/^agent:/, "") ?? undefined}
            onOpen={(docId, _familyId, commentId) => {
              setDocOpenTarget({ docId, commentId });
              setShowDocumentView(true);
            }}
          />

          {/* ⑦ 가이드 — 조던 전체 기능 요약 */}
          <Tooltip text="조던의 모든 기능 한눈에 보기">
            <button
              onClick={() => setShowGuideModal(true)}
              className="rounded-lg font-medium flex items-center justify-center w-8 h-8"
              style={{
                backgroundColor: SILVER_FAINT,
                border: `1px solid ${SILVER_DIM}`,
                color: SILVER,
                fontSize: "14px",
              }}
            >
              📖
            </button>
          </Tooltip>

          {/* ⑧ 기획 바이블 — 책 아이콘, 텍스트 없음, 신규 항목 빨간 점 */}
          <Tooltip text={`기획 바이블 (현재 ${decisionCount}개) — 누적된 기획 결정 자산. 모든 기획서 작성 시 교차 참조`}>
            <button
              onClick={() => {
                setShowDecisionPanel(v => !v);
                // 클릭 시 빨간 점 즉시 해제
                if (bibleNewBadge) {
                  setBibleNewBadge(false);
                  if (bibleBadgeTimerRef.current) {
                    clearTimeout(bibleBadgeTimerRef.current);
                    bibleBadgeTimerRef.current = null;
                  }
                }
              }}
              className="rounded-lg font-medium relative flex items-center justify-center w-8 h-8"
              style={{
                backgroundColor: showDecisionPanel ? "rgba(100,220,160,0.18)" : SILVER_FAINT,
                border: `1px solid ${showDecisionPanel ? "rgba(100,220,160,0.6)" : SILVER_DIM}`,
                color: showDecisionPanel ? "rgba(150,255,200,1)" : SILVER,
                fontSize: "14px",
              }}
            >
              📚
              {bibleNewBadge && (
                <span
                  className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full animate-pulse"
                  style={{ backgroundColor: "rgba(255,80,80,0.95)", boxShadow: "0 0 6px rgba(255,80,80,0.7)" }}
                />
              )}
            </button>
          </Tooltip>

          {/* ⑧ 설정 — 참고 게임 / 출처 표시 / 관리 도구 / 답변 모델 통합 */}
          <Tooltip text="설정 — 참고 게임, 출처 표시, 관리 도구, 답변 모델">
            <button
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{
                backgroundColor: SILVER_FAINT,
                border: `1px solid ${SILVER_DIM}`,
                color: SILVER,
                fontSize: "14px",
              }}
            >
              ⚙️
            </button>
          </Tooltip>
          {sessionId && (
            <span className="text-xs px-3 py-1 rounded-full" style={{ backgroundColor: SILVER_FAINT, border: `1px solid rgba(192,200,216,0.3)`, color: SILVER }}>{sessionId.replace(/^agent:/, "")}</span>
          )}
          </>
          )}
        </div>
      </header>

      {/* 대화 영역 */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-6" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
        <div className={`max-w-2xl mx-auto space-y-6 ${selectMode ? "pl-8" : ""}`}>

          {/* 빈 상태 */}
          {activePairs.length === 0 && !streamingPair && (
            !currentConvId ? (
              // 방 미선택(새 탭) — 병렬 작업 충돌 방지를 위해 방을 먼저 고르도록 안내
              <div className="text-center mt-20">
                <div className="text-3xl mb-3">💬</div>
                <p className="text-sm font-medium" style={{ color: SILVER }}>작업할 대화방을 선택하세요</p>
                <p className="text-xs mt-1" style={{ color: SILVER_DIM }}>탭마다 다른 방을 열어 병렬로 작업할 수 있어요</p>
                <button onClick={() => setShowConvList(true)} className="text-xs mt-4 px-4 py-2 rounded-lg font-medium" style={{ backgroundColor: "rgba(100,180,255,0.15)", border: "1px solid rgba(100,180,255,0.45)", color: "rgba(180,210,255,1)" }}>💬 대화방 목록 열기</button>
              </div>
            ) : (
              <div className="text-center mt-20">
                <div className="w-16 h-16 rounded-full mx-auto overflow-hidden mb-4" style={{ border: `1px solid ${SILVER_DIM}` }}><img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" /></div>
                <p className="text-sm font-medium" style={{ color: SILVER }}>조던</p>
                <p className="text-xs mt-1" style={{ color: SILVER_DIM }}>AFK Arena · 세븐나이츠 · 서머너즈워 · 니케 · 에픽세븐 · 원신 — 무엇이든 물어보세요</p>
                <p className="text-xs mt-3 px-4 py-2 rounded-full inline-block" style={{ backgroundColor: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399" }}>
                  ✨ 다양한 수집형 게임 경험으로 너와 함께해
                </p>
              </div>
            )
          )}

          {/* 활성 대화 쌍 */}
          {(() => {
            const anchorIdx = contextAnchorPairId
              ? activePairs.findIndex(p => p.pair_id === contextAnchorPairId)
              : -1;
            return activePairs.map((pair, idx) => {
              const isAnchor = pair.pair_id === contextAnchorPairId;
              const isBeforeAnchor = anchorIdx >= 0 && idx < anchorIdx;
              return (
            <div
              key={pair.pair_id}
              id={`pair-${pair.pair_id}`}
              className={`space-y-3 group relative ${selectMode ? "cursor-pointer" : ""}`}
              onClick={selectMode ? () => togglePairSelect(pair.pair_id) : undefined}
              style={{ opacity: isBeforeAnchor ? 0.4 : 1 }}
            >
              {/* anchor 표시선 */}
              {isAnchor && (
                <div className="flex items-center gap-2 py-1" style={{ color: "rgba(255,200,100,0.9)" }}>
                  <div className="flex-1" style={{ borderTop: "1px dashed rgba(255,200,100,0.6)" }} />
                  <span className="text-xs font-medium flex items-center gap-1.5">
                    📌 맥락선 — 이 아래만 조던의 대화·기획에 포함돼요
                    <button
                      onClick={(e) => { e.stopPropagation(); clearContextAnchor(); }}
                      className="text-xs px-1.5 py-0.5 rounded hover:bg-white/10"
                      style={{ color: "rgba(255,200,100,0.8)" }}
                      title="맥락선 해제"
                    >
                      ✕
                    </button>
                  </span>
                  <div className="flex-1" style={{ borderTop: "1px dashed rgba(255,200,100,0.6)" }} />
                </div>
              )}
              {/* 호버 시 anchor 설정 버튼 — 모든 페어에 표시 (언제든 변경 가능) */}
              {!selectMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); setContextAnchor(pair.pair_id, pair.timestamp ?? new Date().toISOString()); }}
                  className="absolute -left-7 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs rounded-full w-6 h-6 flex items-center justify-center"
                  style={{
                    backgroundColor: isAnchor ? "rgba(255,200,100,0.3)" : "rgba(255,200,100,0.15)",
                    border: `1px solid ${isAnchor ? "rgba(255,200,100,0.7)" : "rgba(255,200,100,0.4)"}`,
                    color: "rgba(255,220,150,0.95)",
                  }}
                  title={isAnchor ? "현재 맥락선 위치 (다른 페어 호버 시 이동 가능)" : "이 시점에 맥락선 설정 — 아래만 조던에게 전달"}
                >
                  📌
                </button>
              )}
              {/* 선택 모드 체크박스 */}
              {selectMode && (
                <div className="absolute -left-6 top-1 flex items-start">
                  <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: selectedPairIds.has(pair.pair_id) ? SILVER : "transparent", border: `2px solid ${selectedPairIds.has(pair.pair_id) ? SILVER : SILVER_DIM}` }}>
                    {selectedPairIds.has(pair.pair_id) && <span style={{ color: "#0a0e1a", fontSize: "10px", fontWeight: "bold" }}>✓</span>}
                  </div>
                </div>
              )}
              {/* 선택된 대화 하이라이트 */}
              {selectMode && (
                <div className="absolute inset-0 rounded-xl pointer-events-none" style={{ backgroundColor: selectedPairIds.has(pair.pair_id) ? "rgba(192,200,216,0.05)" : "transparent", border: selectedPairIds.has(pair.pair_id) ? `1px solid ${SILVER_FAINT}` : "1px solid transparent" }} />
              )}

              {/* 내 질문 */}
              <div className="flex justify-end items-end gap-2">
                <div className="flex flex-col items-end gap-1">
                  <button onClick={(e) => { e.stopPropagation(); deletePair(pair.pair_id); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-xs" style={{ color: SILVER_DIM }}>삭제</button>
                  {pair.timestamp && <span className="text-xs" style={{ color: SILVER_DIM }}>{pair.timestamp}</span>}
                </div>
                <div className="relative max-w-[70%]">
                  <button
                    onClick={(e) => { e.stopPropagation(); copyMessage(pair.user.content, `${pair.pair_id}-user`); }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 flex"
                    style={{ backgroundColor: copiedId === `${pair.pair_id}-user` ? "rgba(100,200,100,0.9)" : "rgba(30,40,60,0.9)", border: `1px solid ${SILVER_FAINT}` }}
                    title="복사"
                  >
                    <span style={{ fontSize: "10px", color: copiedId === `${pair.pair_id}-user` ? "#fff" : SILVER }}>
                      {copiedId === `${pair.pair_id}-user` ? "✓" : "⎘"}
                    </span>
                  </button>
                  {pair.user.image_id && (
                    <img src={`/api/img/${pair.user.image_id}`} alt="첨부 이미지"
                      className="mb-2 rounded-xl max-h-72 w-auto ml-auto block cursor-pointer"
                      style={{ border: `1px solid ${SILVER_FAINT}` }}
                      onClick={() => window.open(`/api/img/${pair.user.image_id}`, "_blank")} />
                  )}
                  <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-medium whitespace-pre-wrap" style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.25)` }}>
                    {pair.user.content}
                  </div>
                </div>
              </div>

              {/* AI 답변 */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}><img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" /></div>
                <div className="flex flex-col gap-1 max-w-[75%]">
                  <p className="text-xs ml-1" style={{ color: SILVER }}>조던</p>
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); copyMessage(pair.assistant.content, `${pair.pair_id}-assistant`); }}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 flex"
                      style={{ backgroundColor: copiedId === `${pair.pair_id}-assistant` ? "rgba(100,200,100,0.9)" : "rgba(30,40,60,0.9)", border: `1px solid ${SILVER_FAINT}` }}
                      title="복사"
                    >
                      <span style={{ fontSize: "10px", color: copiedId === `${pair.pair_id}-assistant` ? "#fff" : SILVER }}>
                        {copiedId === `${pair.pair_id}-assistant` ? "✓" : "⎘"}
                      </span>
                    </button>
                    <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm prose prose-sm max-w-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", backdropFilter: "blur(10px)" }}>
                      <AssistantMarkdown text={pair.assistant.content} />
                    </div>
                  </div>
                  {/* 1200자 초과 시 다운로드 + 길이 안내 */}
                  {pair.assistant.content.length > 1200 && (
                    <div className="flex items-center gap-2 ml-1 mt-1 flex-wrap">
                      <span className="text-xs" style={{ color: SILVER_DIM }}>📥 다운로드:</span>
                      <button onClick={() => downloadFile(pair.assistant.content, "txt")} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>📄 TXT</button>
                      <button onClick={() => downloadFile(pair.assistant.content, "md")} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>📝 MD</button>
                      <span className="text-[10px]" style={{ color: SILVER_DIM }}>· {pair.assistant.content.length.toLocaleString()}자</span>
                    </div>
                  )}

                  {/* 버튼 행: 자세한 답변 보기 + 설계 피드백 내용 + 피드백 평가 */}
                  <div className="flex items-center gap-4 ml-1 mt-1 flex-wrap">
                    <button onClick={() => loadDetail(pair.pair_id)} className="text-xs flex items-center gap-1 w-fit" style={{ color: SILVER_DIM }}>
                      {pair.detail_loading ? "⏳ 불러오는 중..." : pair.detail_shown ? "▲ 접기" : "▼ 자세한 답변 보기"}
                    </button>
                    {/* 설계 피드백 버튼 — critic_history가 있을 때만 표시 */}
                    {pair.critic_history && pair.critic_history.length > 0 && (
                      <button onClick={() => loadFeedbackSummary(pair.pair_id)} className="text-xs flex items-center gap-1 w-fit" style={{ color: "rgba(100,180,255,0.7)" }}>
                        {pair.feedback_summary_shown ? "▲ 검토 의견 접기" : "📋 디렉터 검토 의견"}
                      </button>
                    )}
                    {/* 피드백 평가 — 정확함 / 부정확 */}
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        onClick={() => submitFeedback(pair.pair_id, "accurate")}
                        title="답변이 정확함"
                        className="text-xs px-2 py-1 rounded-md transition-opacity"
                        style={{
                          backgroundColor: feedbacks[pair.pair_id] === "accurate" ? "rgba(100,220,160,0.2)" : "transparent",
                          color: feedbacks[pair.pair_id] === "accurate" ? "rgba(150,255,200,1)" : SILVER_DIM,
                          opacity: feedbacks[pair.pair_id] === "inaccurate" ? 0.3 : 1,
                        }}
                      >
                        👍
                      </button>
                      <button
                        onClick={() => openReasonInput(pair.pair_id)}
                        title="답변이 부정확함 (사유 입력)"
                        className="text-xs px-2 py-1 rounded-md transition-opacity"
                        style={{
                          backgroundColor: feedbacks[pair.pair_id] === "inaccurate" ? "rgba(255,140,140,0.2)" : "transparent",
                          color: feedbacks[pair.pair_id] === "inaccurate" ? "rgba(255,180,180,1)" : SILVER_DIM,
                          opacity: feedbacks[pair.pair_id] === "accurate" ? 0.3 : 1,
                        }}
                      >
                        👎
                      </button>
                    </div>
                  </div>

                  {/* 설계 피드백 요약 패널 — 피드백 색상: rgba(100,180,255,...) */}
                  {pair.feedback_summary_shown && pair.feedback_summary && (
                    <div className="px-4 py-3 rounded-2xl text-sm prose prose-sm max-w-none" style={{ backgroundColor: "rgba(100,180,255,0.06)", border: "1px solid rgba(100,180,255,0.2)", color: "#e0e8f0" }}>
                      <p className="text-xs font-semibold mb-2 not-prose" style={{ color: "rgba(100,180,255,0.85)" }}>📋 디렉터 검토 의견</p>
                      <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{pair.feedback_summary}</ReactMarkdown>
                    </div>
                  )}

                  {/* 자세한 답변 패널 */}
                  {pair.detail_shown && pair.detail_content && (() => {
                    // 남아있을 수 있는 에이전트 마커 제거
                    const rawDetail = pair.detail_content!
                      .replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__/, "")
                      .replace(/.*__JORDAN_ANSWER_START__/, "");
                    const MARKER = "__NEEDS_FULL__";
                    const markerIdx = rawDetail.indexOf(MARKER);
                    const bubbleText = markerIdx !== -1 ? rawDetail.slice(0, markerIdx).trim() : rawDetail.trim();
                    const fullText = markerIdx !== -1 ? rawDetail.slice(markerIdx + MARKER.length).trim() : null;
                    return (
                      <div className="flex flex-col gap-2">
                        <div className="px-4 py-3 rounded-2xl text-sm prose prose-sm max-w-none" style={{ backgroundColor: "rgba(192,200,216,0.07)", border: `1px solid rgba(192,200,216,0.25)`, color: "#e0e8f0" }}>
                          <AssistantMarkdown text={bubbleText} />
                        </div>
                        {fullText && !pair.detail_loading && (
                          <div className="flex flex-col gap-2 ml-1 px-3 py-2.5 rounded-xl" style={{ backgroundColor: "rgba(100,180,255,0.08)", border: "1px solid rgba(100,180,255,0.35)" }}>
                            <p className="text-xs font-bold" style={{ color: "rgba(180,210,255,1)" }}>📎 전체 답변은 더 길어요 — 문서로 다운로드</p>
                            <p className="text-[10px]" style={{ color: SILVER_DIM }}>
                              위 요약: {bubbleText.length.toLocaleString()}자 · 전체: <b style={{ color: "rgba(180,210,255,1)" }}>{fullText.length.toLocaleString()}자</b>
                            </p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              <button onClick={() => downloadFile(fullText, "txt")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "rgba(100,180,255,0.22)", border: "1px solid rgba(100,180,255,0.55)", color: "rgba(180,210,255,1)" }}>📄 TXT 전체 다운로드</button>
                              <button onClick={() => downloadFile(fullText, "md")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "rgba(100,180,255,0.22)", border: "1px solid rgba(100,180,255,0.55)", color: "rgba(180,210,255,1)" }}>📝 MD 전체 다운로드</button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
              );
            });
          })()}

          {/* 스트리밍 중 */}
          {streamingPair && (
            <div className="space-y-3">
              <div className="flex justify-end items-end gap-2">
                <div className="flex flex-col gap-1 items-end">
                  <div className="flex gap-2">
                    <button
                      onClick={cancelAndEdit}
                      className="text-xs px-3 py-1 rounded-full font-medium transition-opacity hover:opacity-80"
                      style={{ backgroundColor: "rgba(192,200,216,0.15)", border: `1px solid ${SILVER_DIM}`, color: SILVER }}>
                      ✏️ 질문 수정
                    </button>
                    <button
                      onClick={cancelAndDiscard}
                      className="text-xs px-3 py-1 rounded-full font-medium transition-opacity hover:opacity-80"
                      style={{ backgroundColor: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.35)", color: "#f87171" }}>
                      🗑️ 질문 실수
                    </button>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 max-w-[70%]">
                  {streamingPair.userImageId && (
                    <img src={`/api/img/${streamingPair.userImageId}`} alt="첨부 이미지"
                      className="rounded-xl max-h-72 w-auto" style={{ border: `1px solid ${SILVER_FAINT}` }} />
                  )}
                  <div className="px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-medium" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
                    {streamingPair.user}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}><img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" /></div>
                <div className="flex flex-col gap-1 max-w-[75%]">
                  <p className="text-xs ml-1" style={{ color: SILVER }}>조던</p>
                  <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm prose prose-sm max-w-none" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                    {streamingPair.assistant
                      ? <AssistantMarkdown text={streamingPair.assistant} />
                      : <span style={{ color: SILVER_DIM }} className="animate-pulse">···</span>}
                    {/* 처리 중 스피너 — 에이전트 단계별 라벨 표시 */}
                    {isLoading && (() => {
                      const txt = streamingRawRef.current;
                      // 스피너 라벨: 분석 중, 설계 중, 검토 중, 답변 작성 중
                      const label =
                        txt.includes("분석 에이전트") && !txt.match(/분석 에이전트.*✅/) ? "분석 중" :
                        txt.includes("설계 에이전트") && !txt.match(/설계 에이전트.*✅/) ? "설계 중" :
                        txt.includes("검토 에이전트") && !txt.match(/검토 에이전트.*(✅|📋)/) ? "검토 중" :
                        txt.includes("__JORDAN_ANSWER_START__") ? "답변 작성 중" : "처리 중";
                      return (
                        <div className="flex items-center gap-2 mt-3 pt-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
                          <div className="w-3.5 h-3.5 rounded-full border-2 animate-spin flex-shrink-0"
                            style={{ borderColor: SILVER_DIM, borderTopColor: "transparent" }} />
                          <span className="text-xs animate-pulse" style={{ color: SILVER_DIM }}>{label}...</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 삭제된 대화 */}
          {deletedPairs.length > 0 && (
            <div className="pt-2">
              <div className="flex items-center justify-center gap-2">
                <button onClick={() => setShowDeleted(!showDeleted)} className="text-xs flex items-center gap-1 px-3 py-1 rounded-full" style={{ color: SILVER_DIM, backgroundColor: "rgba(192,200,216,0.07)", border: `1px solid ${SILVER_FAINT}` }}>
                  {showDeleted ? "▲" : "▼"} 삭제된 대화 {deletedPairs.length}개
                </button>
                <button onClick={bulkPermanentDelete} className="text-xs flex items-center gap-1 px-3 py-1 rounded-full" style={{ color: "#f87171", backgroundColor: "rgba(255,50,50,0.07)", border: "1px solid rgba(255,50,50,0.2)" }}>
                  🗑️ 일괄 삭제
                </button>
              </div>
              {showDeleted && (
                <div className="space-y-4 mt-3">
                  {deletedPairs.map((pair) => (
                    <div key={pair.pair_id} className="opacity-40 space-y-2">
                      <div className="flex justify-end items-end gap-2">
                        <div className="flex gap-1">
                          <button onClick={() => restorePair(pair.pair_id)} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(192,200,216,0.1)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>↩️ 복원</button>
                          <button onClick={() => { if (confirm("영구 삭제할까요?")) permanentDeletePair(pair.pair_id); }} className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,50,50,0.1)", border: "1px solid rgba(255,50,50,0.2)", color: "#f87171" }}>🗑️ 영구삭제</button>
                        </div>
                        <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm line-through" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
                          {pair.user.content}
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}><img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" /></div>
                        <div className="px-4 py-3 rounded-2xl rounded-tl-sm text-sm max-w-[75%]" style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                          {pair.assistant.content}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* 답변 완료 버튼 (스크롤 올린 상태에서 스트리밍 완료 시) */}
      {showAnswerCompleteBtn && (
        <button
          onClick={() => { scrollToBottom(); setShowAnswerCompleteBtn(false); }}
          className="fixed bottom-24 right-6 px-4 h-10 rounded-full flex items-center gap-2 text-xs font-bold shadow-lg z-40"
          style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.5)` }}
        >
          답변 완료 ↓
        </button>
      )}
      {/* 수동 스크롤 버튼 — 누르면 자동스크롤 재개 (답변 완료 버튼 있을 때 숨김) */}
      {showScrollBtn && !showAnswerCompleteBtn && (
        <button onClick={() => { userScrolledUpRef.current = false; scrollToBottom(); }} className="fixed bottom-24 right-6 w-10 h-10 rounded-full flex items-center justify-center text-base shadow-lg z-40"
          style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.4)` }}>↓</button>
      )}

      {/* 입력창 */}
      <div style={{ backgroundColor: "rgba(0,0,0,0.5)", borderTop: `1px solid ${SILVER_FAINT}` }}>
        {/* 자세한 답변 기본 보기 토글 (⚙️ 설정과 연동) */}
        <div className="px-4 pt-2">
          <button
            onClick={() => { const nv = !autoDetail; setAutoDetail(nv); broadcastSync({ kind: "toggle", key: "autoDetail", value: nv }); }}
            title="켜면 답변마다 자세한 답변까지 자동으로 펼쳐요 (답변마다 비용↑)"
            className="text-xs px-2.5 py-1 rounded-full flex items-center gap-1.5"
            style={{
              backgroundColor: autoDetail ? "rgba(100,220,160,0.18)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${autoDetail ? "rgba(100,220,160,0.55)" : SILVER_FAINT}`,
              color: autoDetail ? "rgba(150,255,200,1)" : SILVER_DIM,
            }}
          >
            {autoDetail ? "☑" : "☐"} 자세한 답변 기본 보기
          </button>
        </div>
        {/* 첨부 이미지 미리보기 */}
        {(attachedImage || imageUploading) && (
          <div className="px-4 pt-3 flex items-center gap-2">
            {imageUploading && !attachedImage ? (
              <span className="text-xs animate-pulse" style={{ color: SILVER_DIM }}>🖼️ 이미지 처리 중...</span>
            ) : attachedImage && (
              <div className="relative inline-block">
                <img src={attachedImage.dataUrl} alt="첨부 미리보기" className="h-20 w-auto rounded-lg" style={{ border: `1px solid ${SILVER_FAINT}` }} />
                <button onClick={clearAttachedImage}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                  style={{ backgroundColor: "rgba(20,28,44,0.95)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>✕</button>
              </div>
            )}
          </div>
        )}
        {/* 이미지 의도 태그 + 메모 + 영역표시 (Feature H) */}
        {attachedImage && (
          <ImageIntentBar
            tags={imageIntentTags} setTags={setImageIntentTags}
            memo={imageMemo} setMemo={setImageMemo}
            hasAnnotation={imageHasAnnotation}
            onAnnotate={() => setShowAnnotator(true)}
            onSketch={() => setShowSketchModal(true)}
          />
        )}
        <div className="px-4 py-3 flex gap-2 items-end">
          {/* 숨김 파일 input + 첨부 버튼 */}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { handleImagePick(e.target.files?.[0]); e.currentTarget.value = ""; }} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            title="이미지 첨부"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-base flex-shrink-0 disabled:opacity-40"
            style={{ backgroundColor: "rgba(255,255,255,0.07)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}
          >
            📎
          </button>
          {/* 레퍼런스 갤러리 (Feature J) */}
          <button
            onClick={() => setShowRefGallery(true)}
            disabled={isLoading}
            title="레퍼런스 갤러리 — 참고 게임 화면 모음에서 '이 느낌으로' 첨부"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-base flex-shrink-0 disabled:opacity-40"
            style={{ backgroundColor: "rgba(255,255,255,0.07)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}
          >
            🗂️
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={isLoading ? "답변 생성 중 — 미리 입력해두면 완료 후 Enter로 전송돼요" : "게임 기획 질문 또는 이미지 첨부/붙여넣기(Ctrl+V)... (Enter 전송 / Alt+Enter 줄바꿈)"}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            rows={1}
            className="flex-1 px-4 py-3 rounded-xl text-sm outline-none resize-none"
            style={{
              backgroundColor: "rgba(255,255,255,0.07)",
              border: `1px solid ${SILVER_FAINT}`,
              color: "#e0e8f0",
              maxHeight: "160px",
              overflowY: "auto",
              lineHeight: "1.5",
              scrollbarWidth: "thin",
              scrollbarColor: `${SILVER_DIM} transparent`,
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 160) + "px";
            }}
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || (!input.trim() && !attachedImage)}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-base flex-shrink-0 font-bold disabled:opacity-40"
            style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.3)` }}
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
}
