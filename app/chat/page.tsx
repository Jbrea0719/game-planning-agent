"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import React from "react";
import ReactMarkdown from "react-markdown";
import DecisionPanel from "@/components/DecisionPanel";
import DocumentView from "@/components/DocumentView";

// 단일 프로젝트 고정 ID (Phase A — 추후 다중 프로젝트 지원 시 변경)
const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

type Message = {
  role: "user" | "assistant";
  content: string;
  pair_id?: string;
  is_deleted?: boolean;
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
  td: ({ children, ...props }: MdProps) => <td {...props}>{processChildrenForCitations(children)}</td>,
  blockquote: ({ children, ...props }: MdProps) => <blockquote {...props}>{processChildrenForCitations(children)}</blockquote>,
};

// 어시스턴트 메시지 렌더러 — 출처 라벨 스타일 자동 적용
function AssistantMarkdown({ text }: { text: string }) {
  return <ReactMarkdown components={citationComponents}>{fixMarkdown(text)}</ReactMarkdown>;
}

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
  const [pairs, setPairs] = useState<MessagePair[]>([]);
  const [streamingPair, setStreamingPair] = useState<{ user: string; assistant: string } | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [showGameModal, setShowGameModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  // 맥락선 없을 때 안내 토스트
  const [noAnchorNotice, setNoAnchorNotice] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showAnswerCompleteBtn, setShowAnswerCompleteBtn] = useState(false);
  // 롤링 맥락 카드 — 항상 3줄, 새 답변마다 백그라운드로 교체
  const [agentContext, setAgentContext] = useState("");
  const [showContextModal, setShowContextModal] = useState(false);
  // 인라인 신뢰도 라벨 토글 (기본 OFF — 가독성 우선, localStorage에 저장)
  const [showCitations, setShowCitations] = useState(false);
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
  // 보류된 결정 알림 (조던이 반대·우려)
  const [heldNotice, setHeldNotice] = useState<number | null>(null);
  // 기획서 뷰
  const [showDocumentView, setShowDocumentView] = useState(false);
  const [docReloadKey, setDocReloadKey] = useState(0);
  const [generatingDoc, setGeneratingDoc] = useState(false);
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
  }, []);

  // 토글 변경 시 localStorage에 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("jordan_show_citations", String(showCitations));
  }, [showCitations]);

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
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingRawRef = useRef<string>("");
  const userScrolledUpRef = useRef(false);
  const isSubLoadingRef = useRef(false); // loadDetail / loadFeedbackSummary 중 여부

  useEffect(() => {
    // jordan_agent_nickname 키로 닉네임 저장
    const saved = localStorage.getItem("jordan_agent_nickname");
    if (saved) setSessionId("agent:" + saved);
    else setShowModal(true);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/messages?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length > 0) setPairs(groupIntoPairs(data.messages));
      })
      .catch(() => {});
    // 저장된 맥락 카드 복원 (세션별로 관리)
    const savedCtx = localStorage.getItem(`jordan_agent_context:${sessionId}`);
    if (savedCtx) setAgentContext(savedCtx);
    // 저장된 맥락 anchor 복원
    const savedAnchorPair = localStorage.getItem(`jordan_context_anchor_pair:${sessionId}`);
    const savedAnchorTime = localStorage.getItem(`jordan_context_anchor_time:${sessionId}`);
    if (savedAnchorPair) setContextAnchorPairId(savedAnchorPair);
    if (savedAnchorTime) setContextAnchorTimestamp(savedAnchorTime);
  }, [sessionId]);

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
        localStorage.setItem(`jordan_agent_context:${sessionId}`, data.context);
      }
    } catch (err) {
      console.error("[맥락 카드 재생성] 실패:", err);
    }
  }

  // anchor 설정·해제 함수 — 맥락 카드도 함께 재생성
  function setContextAnchor(pairId: string, timestamp: string) {
    if (!sessionId) return;
    setContextAnchorPairId(pairId);
    setContextAnchorTimestamp(timestamp);
    localStorage.setItem(`jordan_context_anchor_pair:${sessionId}`, pairId);
    localStorage.setItem(`jordan_context_anchor_time:${sessionId}`, timestamp);

    // 맥락 카드 리셋 + anchor 이후 페어 기준으로 재생성
    setAgentContext("");
    localStorage.removeItem(`jordan_agent_context:${sessionId}`);
    const anchorIdx = pairs.findIndex(p => p.pair_id === pairId);
    if (anchorIdx >= 0) {
      const afterAnchor = pairs.slice(anchorIdx).filter(p => !p.is_deleted);
      void rebuildContextCard(afterAnchor);
    }
  }
  function clearContextAnchor() {
    if (!sessionId) return;
    setContextAnchorPairId(null);
    setContextAnchorTimestamp(null);
    localStorage.removeItem(`jordan_context_anchor_pair:${sessionId}`);
    localStorage.removeItem(`jordan_context_anchor_time:${sessionId}`);

    // 맥락 카드 리셋 + 전체 활성 페어 기준으로 재생성
    setAgentContext("");
    localStorage.removeItem(`jordan_agent_context:${sessionId}`);
    const allActive = pairs.filter(p => !p.is_deleted);
    void rebuildContextCard(allActive);
  }

  // 스트리밍 중 + 사용자가 스크롤 올리지 않았을 때만 자동 하단 이동
  useEffect(() => {
    if (streamingPair !== null && !userScrolledUpRef.current) {
      scrollToBottom();
    }
  }, [streamingPair]);

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
    setShowScrollBtn(distFromBottom > 200);
    // 기본 답변 or 자세한 답변 / 피드백 스트리밍 중 사용자 스크롤 감지
    if (isLoading || isSubLoadingRef.current) {
      if (distFromBottom > 200) {
        userScrolledUpRef.current = true;
      } else if (distFromBottom < 50) {
        userScrolledUpRef.current = false;
      }
    }
  }

  function groupIntoPairs(messages: Message[]): MessagePair[] {
    const pairMap = new Map<string, { user?: Message; assistant?: Message; is_deleted: boolean }>();
    const order: string[] = [];
    for (const msg of messages) {
      const pid = msg.pair_id ?? "unknown";
      if (!pairMap.has(pid)) { pairMap.set(pid, { is_deleted: msg.is_deleted ?? false }); order.push(pid); }
      const entry = pairMap.get(pid)!;
      if (msg.role === "user") entry.user = msg;
      else entry.assistant = msg;
      if (msg.is_deleted) entry.is_deleted = true;
    }
    return order.map((pid) => {
      const entry = pairMap.get(pid)!;
      if (!entry.user || !entry.assistant) return null;
      return { pair_id: pid, user: entry.user, assistant: entry.assistant, is_deleted: entry.is_deleted };
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

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    const pairId = crypto.randomUUID();
    const time = getTime();

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
      { role: "user" as const, content: trimmed },
    ];
    setStreamingPair({ user: trimmed, assistant: "" });
    setInput("");
    setIsLoading(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    streamingRawRef.current = "";
    userScrolledUpRef.current = false; // 새 질문 시작 시 초기화

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
        streamingRawRef.current = assistantText;
        // 화면에는 진행 상태/메타데이터 마커 제외, 조던 답변 부분만 표시
        let displayText = assistantText.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__$/, "");
        const dispAnswerIdx = displayText.indexOf("__JORDAN_ANSWER_START__");
        if (dispAnswerIdx !== -1) {
          displayText = displayText.slice(dispAnswerIdx + "__JORDAN_ANSWER_START__".length).trimStart();
        }
        displayText = displayText.replace("__TRUNCATED__", "");
        setStreamingPair({ user: trimmed, assistant: displayText });
      }

      // 메타데이터 파싱 및 분리
      const criticMatch = assistantText.match(/__JORDAN_CRITIC_START__([\s\S]*?)__JORDAN_CRITIC_END__/);
      let criticHistory: CriticEntry[] | undefined;
      let cleanText = assistantText;
      if (criticMatch) {
        try { criticHistory = JSON.parse(criticMatch[1]); } catch { /* 무시 */ }
        cleanText = assistantText.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__/, "");
      }

      // 자동 추출 마커 감지 → 트래커 새로고침 + 알림
      const extractedMatch = assistantText.match(/__DECISIONS_EXTRACTED__(\d+)/);
      if (extractedMatch) {
        const cnt = parseInt(extractedMatch[1], 10);
        if (cnt > 0) {
          setDecisionReloadKey(k => k + 1);    // DecisionPanel 자동 새로고침
          setExtractedNotice(cnt);              // 알림 표시
          setTimeout(() => setExtractedNotice(null), 5000);  // 5초 후 자동 숨김
        }
        cleanText = cleanText.replace(/__DECISIONS_EXTRACTED__\d+/, "");
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
      // 진행 상태 텍스트 제거: __JORDAN_ANSWER_START__ 이후만 답변으로 사용
      const answerStartIdx = cleanText.indexOf("__JORDAN_ANSWER_START__");
      if (answerStartIdx !== -1) {
        cleanText = cleanText.slice(answerStartIdx + "__JORDAN_ANSWER_START__".length).trimStart();
      }
      if (cleanText.includes("__TRUNCATED__")) {
        cleanText = cleanTruncated(cleanText);
      }

      const hadScrolledUp = userScrolledUpRef.current;
      userScrolledUpRef.current = false;
      setPairs((prev) => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: trimmed, pair_id: pairId },
        assistant: { role: "assistant", content: cleanText, pair_id: pairId },
        is_deleted: false,
        timestamp: time,
        critic_history: criticHistory,
      }]);
      setStreamingPair(null);
      // 맥락 카드 백그라운드 업데이트 (UI 블로킹 없음)
      updateContextCard(trimmed, cleanText);
      if (hadScrolledUp) {
        setShowAnswerCompleteBtn(true);
      } else {
        scrollToBottom();
      }
    } catch {
      // AbortError면 조용히 처리
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }

  // 질문 실수: 답변 중단 + 질문·답변 모두 삭제
  function cancelAndDiscard() {
    abortControllerRef.current?.abort();
    setStreamingPair(null);
    setInput("");
    userScrolledUpRef.current = false;
    setShowAnswerCompleteBtn(false);
  }

  // 질문 수정: 답변 중단 + 질문을 입력창에 복원
  function cancelAndEdit() {
    const question = streamingPair?.user ?? "";
    abortControllerRef.current?.abort();
    setStreamingPair(null);
    setInput(question);
    userScrolledUpRef.current = false;
    setShowAnswerCompleteBtn(false);
  }

  async function loadDetail(pairId: string) {
    const pair = pairs.find((p) => p.pair_id === pairId);
    if (!pair) return;
    if (pair.detail_content) {
      setPairs((prev) => prev.map((p) => p.pair_id === pairId ? { ...p, detail_shown: !p.detail_shown } : p));
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
          localStorage.setItem(`jordan_agent_context:${sessionId}`, data.context);
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

  async function generateDocument() {
    const selectedMsgs = activePairs
      .filter((p) => selectedPairIds.has(p.pair_id))
      .flatMap((p) => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]);
    if (selectedMsgs.length === 0) return;

    setSelectMode(false);
    setDocContent("");
    setDocLoading(true);
    setShowDocModal(true);

    try {
      const response = await fetch("/api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: selectedMsgs,
          project_id: DEFAULT_PROJECT_ID,  // 서버에서 기획 바이블 전체를 불러와 교차 검증
        }),
      });
      if (!response.ok || !response.body) throw new Error("오류");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        setDocContent(text);
      }
    } catch {
      setDocContent("기획서 생성 중 오류가 발생했습니다.");
    } finally {
      setDocLoading(false);
    }
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
        setDocReloadKey(k => k + 1);
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
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1525 50%, #0a1020 100%)" }}>

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
                  <ReactMarkdown>{fixMarkdown(docContent)}</ReactMarkdown>
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
        onGenerateDoc={handleGenerateDoc}
      />

      {/* 기획서 보기 모드 (전체 화면) */}
      <DocumentView
        open={showDocumentView}
        onClose={() => setShowDocumentView(false)}
        projectId={DEFAULT_PROJECT_ID}
        nickname={sessionId?.replace(/^agent:/, "") ?? ""}
        reloadKey={docReloadKey}
      />

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

      {/* 맥락 카드 팝업 */}
      {showContextModal && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-end z-50 p-4 pt-16" onClick={() => setShowContextModal(false)}>
          <div className="rounded-2xl w-72 shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex items-center gap-2">
                <span style={{ color: "rgba(100,220,160,0.9)", fontSize: "12px" }}>🧠</span>
                <p className="text-xs font-bold" style={{ color: SILVER }}>현재 맥락 카드</p>
              </div>
              <button onClick={() => setShowContextModal(false)} className="text-xs px-2 py-1 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
            </div>
            <div className="px-4 py-4">
              {agentContext ? (
                <div className="space-y-2">
                  {agentContext.split("\n").filter(Boolean).map((line, i) => {
                    const [label, ...rest] = line.split(":");
                    const value = rest.join(":").trim();
                    return (
                      <div key={i} className="flex flex-col gap-0.5">
                        <span className="text-xs font-semibold" style={{ color: SILVER_DIM }}>{label}</span>
                        <span className="text-xs" style={{ color: "#e0e8f0" }}>{value}</span>
                      </div>
                    );
                  })}
                  <p className="text-xs mt-3 pt-3" style={{ color: SILVER_DIM, borderTop: `1px solid ${SILVER_FAINT}` }}>
                    매 답변 후 자동 갱신 · 항상 이 크기 유지
                  </p>
                </div>
              ) : (
                <p className="text-xs text-center py-4" style={{ color: SILVER_DIM }}>
                  아직 대화 기록이 없어요.<br />첫 질문 후 자동으로 생성돼요.
                </p>
              )}
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
                </div>
              </section>

              {/* 섹션 2 — 헤더 도구 */}
              <section>
                <p className="text-xs font-bold mb-2" style={{ color: "rgba(180,210,255,1)" }}>🛠️ 헤더 도구 (좌 → 우)</p>
                <div className="space-y-2 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
                  <p><b style={{ color: SILVER }}>🧠 대화 맥락</b> — 지금까지 대화의 핵심을 3줄 요약. 답변마다 자동 갱신돼서 조던이 일관성을 유지해요.</p>
                  <p><b style={{ color: SILVER }}>📄 기획서 작성</b> — 맥락선 이하 대화를 중심으로 + 기획 바이블 전체와 교차 검증해서 새 기획서 생성. 체크박스로 대상 대화 가감 가능.</p>
                  <p><b style={{ color: SILVER }}>📄 기획서</b> — 지금까지 생성한 기획서 버전 열람·편집·다운로드 (MD/TXT).</p>
                  <p><b style={{ color: SILVER }}>📌 맥락 시작점</b> — 답변 옆 호버 시 나타나는 압정으로 설정. 이 시점 이후 대화·바이블만 조던에게 전달돼 토큰 절약 + 새 주제 집중. 헤더 ✕로 해제.</p>
                  <p><b style={{ color: SILVER }}>🏷️ 출처 표시</b> — 답변에 [공식 인용 — 4개 일치] 같은 신뢰도 라벨 표시 ON/OFF.</p>
                  <p><b style={{ color: SILVER }}>🎮 참고 게임</b> — 조던이 검색·분석할 때 신뢰하는 등록 게임 11종과 각 게임의 신뢰 출처 목록.</p>
                  <p><b style={{ color: SILVER }}>📚 기획 바이블</b> — 누적된 모든 기획 결정 자산. 모든 기획서 작성에 자동 참조. 신규 항목 추가 시 빨간 점.</p>
                </div>
              </section>

              {/* 섹션 3 — 답변별 도구 */}
              <section>
                <p className="text-xs font-bold mb-2" style={{ color: "rgba(255,220,150,1)" }}>💬 답변별 도구</p>
                <div className="space-y-2 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
                  <p><b style={{ color: SILVER }}>▼ 자세한 답변 보기</b> — 같은 질문에 대해 더 깊이 있는 확장 설명 요청.</p>
                  <p><b style={{ color: SILVER }}>📋 디렉터 검토 의견</b> — 검토 에이전트가 본 답변에 대해 짚은 보완점·우려 사항.</p>
                  <p><b style={{ color: SILVER }}>👍 정확함 / 👎 부정확</b> — 피드백 저장. 부정확은 사유 입력 가능 → 차후 품질 개선에 활용.</p>
                  <p><b style={{ color: SILVER }}>📌 호버 압정</b> — 이 시점부터 맥락 시작점으로 지정.</p>
                  <p><b style={{ color: SILVER }}>복사·삭제</b> — 답변 우상단 ⎘ 복사 / 호버 시 삭제. 삭제된 대화는 하단에서 복원 가능.</p>
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

      {/* 참고 게임 팝업 */}
      {showGameModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={() => setShowGameModal(false)}>
          <div className="rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }} onClick={(e) => e.stopPropagation()}>
            {/* 팝업 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div>
                <p className="text-sm font-bold" style={{ color: SILVER }}>🎮 참고 게임 라이브러리 (11개)</p>
                <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>에이전트가 검증된 신뢰 출처로 분석하는 등록 게임 목록</p>
              </div>
              <button onClick={() => setShowGameModal(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
            </div>
            {/* 팝업 내용 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
              {[
                {
                  name: "세븐나이츠 리버스", studio: "넷마블넥서스",
                  tags: ["원작 리메이크", "1주년 운영", "신규 영웅"],
                  items: [
                    "원작 IP 계승: 2014년 원작 세븐나이츠 캐릭터·세계관 리메이크",
                    "성장 시스템: 영웅 등급·초월·각성 다단계 구조",
                    "운영 사이클: 정기 업데이트(월 1~2회), 신규 전설 영웅 출시",
                    "수익화: 영웅 가챠, 장비 가챠, 시즌 패스, 코스튬",
                  ],
                  sources: ["네이버 라운지", "인벤 세나리", "디시 마이너갤", "카페 배돈", "게임메카", "네이버 e스포츠", "나무위키"],
                },
                {
                  name: "원신", studio: "호요버스 (HoYoverse)",
                  tags: ["가챠 구조", "PLC 설계", "오픈 월드"],
                  items: [
                    "오픈 월드: 지역별 스토리, 탐험, 수집 요소",
                    "가챠 구조: 소프트 천장(74번), 하드 천장(90번), 보장 시스템",
                    "PLC 설계: 버전 6주 업데이트 사이클, 신규 캐릭터·지역 정기 추가",
                    "수익화: 결정(가챠재화), 배틀패스, 웰킨문 월정액",
                  ],
                  sources: ["공식 (genshin.hoyoverse.com)", "네이버 카페", "인벤 원신", "디시 (원신 프로젝트)", "나무위키", "영문 팬덤위키"],
                },
                {
                  name: "승리의 여신: 니케", studio: "시프트업 (퍼블리셔: 레벨 인피니트)",
                  tags: ["캐릭터 정체성", "세계관", "수집 동기"],
                  items: [
                    "세계관: 포스트 아포칼립스, 기계 적군 \"랩처\"와의 전쟁",
                    "캐릭터 정체성: 각 니케별 개별 스토리·관계성·배경 서사",
                    "수집 동기: 캐릭터 스킨, 우정도 시스템, 오디오 콘텐츠",
                    "수익화: 가챠(SSR 4%), 아웃포스트 패스, 프리미엄 패스",
                  ],
                  sources: ["네이버 라운지", "공식 (nikke-kr.com)", "인벤 니케", "디시 (gov)", "아카라이브", "나무위키", "공식 트위터"],
                },
                {
                  name: "에픽세븐", studio: "슈퍼크리에이티브 (퍼블리셔: 스마일게이트)",
                  tags: ["아트 퀄리티", "장기 운영", "스토리"],
                  items: [
                    "아트 퀄리티: 라이브 2D 애니메이션, 고퀄 일러스트",
                    "스토리 활용: 챕터별 메인 스토리, 각 캐릭터 사이드 스토리",
                    "장기 운영: 시즌 콘텐츠, 이벤트 스토리로 월드 빌딩 확장",
                    "전투: 턴제 + 속도 스탯 기반 선공 시스템",
                  ],
                  sources: ["스토브 (page.onstove.com/epicseven)", "공식 (epic7.onstove.com)", "공식 유튜브", "디시 (epicseven)", "아카라이브", "나무위키"],
                },
                {
                  name: "서머너즈워: 천공의 아레나", studio: "컴투스",
                  tags: ["룬 시스템", "메타 사이클", "길드"],
                  items: [
                    "던전 시스템: 카이로스 던전 13종 (다양한 성장 재화 분산)",
                    "룬 시스템: 6부위 장비, 세트 효과, 전략 다양성의 핵심",
                    "레이드: 길드 콘텐츠, 협력 보상",
                    "메타 사이클: 분기별 신규 몬스터 → 메타 교란 → 과금 유도",
                  ],
                  sources: ["공식 (summonerswar.com/ko)", "디시 (smonwar)", "나무위키"],
                },
                {
                  name: "붕괴: 스타레일", studio: "호요버스 (HoYoverse)",
                  tags: ["턴제 전략", "메타 사이클", "광추 시스템"],
                  items: [
                    "턴제 전략: 원소·약점 속성 상성, 카운터 시스템",
                    "메타 사이클: 망각의 정원·순허·이고현전 등 PvE 도전 중심 순환",
                    "캐릭터 설계: 패스(스킬 트리), 광추(전용 장비), 유물 시스템",
                  ],
                  sources: ["공식 (hsr.hoyoverse.com)", "네이버 카페", "인벤 스타레일", "디시 (staraiload)", "나무위키"],
                },
                {
                  name: "명일방주 (Arknights)", studio: "하이퍼그리프 (한국 배급: 요스타)",
                  tags: ["타워 디펜스", "니치 타겟팅", "전략"],
                  items: [
                    "타워 디펜스 전략: 오퍼레이터 배치, 라인 설계",
                    "니치 타겟팅: 전략 게이머, 로어 덕후 특화",
                    "수익화: 가챠(6성 2%), 스킨, 이벤트 패스",
                  ],
                  sources: ["공식 (arknights.kr)", "네이버 카페", "아카라이브", "디시 (mibj)", "루리웹", "나무위키"],
                },
                {
                  name: "블루아카이브", studio: "넥슨게임즈",
                  tags: ["세계관 구축", "총력전", "스토리"],
                  items: [
                    "IP 구축: 고유 세계관 \"키보토스\", 학원 배경",
                    "스토리 몰입도: 코믹+시리어스 혼합 서사",
                    "수익화: 가챠(3%), 학교 방문 이벤트, 총력전(레이드) 중심",
                  ],
                  sources: ["공식 (bluearchive.nexon.com)", "넥슨 공식 포럼", "인벤 블아", "인벤 뉴스", "디시 (projectmx)", "아카라이브", "루리웹", "나무위키"],
                },
                {
                  name: "Fate/Grand Order (FGO)", studio: "딜라이트웍스 / 아니플렉스 (한국 배급: 넷마블)",
                  tags: ["IP 활용", "스토리 몰입도"],
                  items: [
                    "IP 활용: 타입문 세계관, 역사·신화 영웅 의인화",
                    "스토리 몰입도: 중편 소설 수준의 챕터 스토리",
                    "수익화: 성배(재화) 가챠, 이벤트 파밍 중심",
                  ],
                  sources: ["네이버 카페 (페그오 카페)", "공식 (fgo.netmarble.com)", "공식 트위터", "디시 페마갤 (mfgo)", "나무위키"],
                },
                {
                  name: "AFK Arena", studio: "릴리스 게임즈 (Lilith Games)",
                  tags: ["방치형", "수익화", "영웅 등급"],
                  items: [
                    "AFK 메카닉: 오프라인 방치 수익 시스템 — 접속 빈도 낮은 유저 잔존율 극대화",
                    "영웅 등급: E~A~S~SS~SSS급 상향 구조, 등급별 스킬 해금",
                    "수익화: 월정액(문라이트 케이크), 시즌 패스, 영웅 소환(배너), 성유물 가챠",
                    "핵심 루프: 방치 → 재화 수집 → 영웅 강화 → 스테이지 진행 → 반복",
                  ],
                  sources: ["공식 (afk-kr.lilith.com)", "네이버 카페", "디시 (afk)", "나무위키"],
                },
                {
                  name: "AFK 저니 (AFK: 새로운 여정)", studio: "릴리스 게임즈 → Farlight Games (스핀오프)",
                  tags: ["방치형 진화", "3D 그래픽", "오픈필드"],
                  items: [
                    "AFK Arena의 후속작 — 3D 그래픽으로 시각적 진화",
                    "오픈필드 요소 추가, 탐험·자원 채집 도입",
                    "방치 시스템은 유지하되 액티브 플레이 비중 확대",
                    "수익화: AFK Arena와 유사하나 신규 IP로 분리 운영",
                  ],
                  sources: ["공식 (afkjourney-kr.farlightgames.com)", "네이버 카페", "디시 (newafk)", "나무위키", "공식 페이스북"],
                },
              ].map((game) => (
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
            {/* 에이전트 이름: 조던 (에이전트) */}
            <p className="font-bold text-sm" style={{ color: SILVER }}>조던 (에이전트)</p>
            {/* 검색 가능 뱃지: 게임 분석 기반 */}
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", color: "#34d399" }}>🔍 게임 분석 기반</span>
          </div>
          {/* 헤더 설명 */}
          <p className="text-xs" style={{ color: SILVER_DIM }}>영웅수집형 게임 기획 전문가 · 다양한 영웅수집형 게임 분석 기반</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* ① 대화 맥락 — 헤더 맨 앞 */}
          <Tooltip text="지금까지 대화의 핵심 맥락 요약. 답변마다 자동 갱신돼요">
            <button
              onClick={() => setShowContextModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
            >
              🧠 대화 맥락
            </button>
          </Tooltip>

          {/* ② 기획서 작성 + ③ 기획서 — 나란히 */}
          {activePairs.length > 0 && !selectMode && (
            <Tooltip text="맥락선 이하 대화를 중심으로, 기획 바이블도 교차 검증해서 새 기획서 생성">
              <button
                onClick={enterSelectMode}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
              >
                📄 기획서 작성
              </button>
            </Tooltip>
          )}
          {/* 선택 모드 (기획서 작성 위치) */}
          {selectMode && (
            <>
              <span className="text-xs" style={{ color: SILVER_DIM }}>{selectedPairIds.size}개 선택됨</span>
              <button
                onClick={generateDocument}
                disabled={selectedPairIds.size === 0}
                className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-40"
                style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
              >
                ✓ 작성 시작
              </button>
              <button
                onClick={cancelSelectMode}
                className="text-xs px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}
              >
                취소
              </button>
            </>
          )}
          <Tooltip text="생성된 기획서 버전을 열람·편집·내보내기">
            <button
              onClick={() => setShowDocumentView(v => !v)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{
                backgroundColor: showDocumentView ? "rgba(100,180,255,0.18)" : SILVER_FAINT,
                border: `1px solid ${showDocumentView ? "rgba(100,180,255,0.6)" : SILVER_DIM}`,
                color: showDocumentView ? "rgba(180,210,255,1)" : SILVER,
              }}
            >
              📄 기획서
            </button>
          </Tooltip>

          {/* ④ 맥락 시작점 — 현재 위치로 스크롤 (없으면 안내 토스트) */}
          <Tooltip text={contextAnchorPairId ? "현재 맥락 시작점 위치로 이동" : "맥락 시작점이 설정돼 있지 않아요"}>
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
                  // 짧게 하이라이트 효과
                  el.style.transition = "background-color 0.3s";
                  const orig = el.style.backgroundColor;
                  el.style.backgroundColor = "rgba(255,200,100,0.1)";
                  setTimeout(() => { el.style.backgroundColor = orig; }, 1200);
                } else {
                  // anchor pair가 화면에서 사라진 경우 (예: 삭제됨)
                  setNoAnchorNotice(true);
                  setTimeout(() => setNoAnchorNotice(false), 2000);
                }
              }}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{
                backgroundColor: contextAnchorPairId ? "rgba(255,200,100,0.15)" : SILVER_FAINT,
                border: `1px solid ${contextAnchorPairId ? "rgba(255,200,100,0.5)" : SILVER_DIM}`,
                color: contextAnchorPairId ? "rgba(255,220,150,1)" : SILVER_DIM,
              }}
            >
              📌 맥락 시작점
            </button>
          </Tooltip>

          {/* ⑤ 출처 표시 */}
          <Tooltip text="답변 문장에 [공식 인용 — N개 일치] 같은 신뢰도 라벨 표시 여부">
            <button
              onClick={() => setShowCitations(v => !v)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{
                backgroundColor: showCitations ? "rgba(100,220,160,0.18)" : SILVER_FAINT,
                border: `1px solid ${showCitations ? "rgba(100,220,160,0.7)" : SILVER_DIM}`,
                color: showCitations ? "rgba(150,255,200,1)" : SILVER,
              }}
            >
              {showCitations ? "✅ 출처 표시 ON" : "🏷️ 출처 표시 OFF"}
            </button>
          </Tooltip>

          {/* ⑥ 참고 게임 */}
          <Tooltip text="조던이 분석에 활용하는 등록된 게임 라이브러리 (현재 11개)">
            <button
              onClick={() => setShowGameModal(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
            >
              🎮 참고 게임
            </button>
          </Tooltip>

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

          {/* ⑧ 큐레이션 (관리자 전용) */}
          {sessionId?.replace(/^agent:/, "") === "정민" && (
            <Tooltip text="게임 도메인 큐레이션 (관리자 전용)">
              <button
                onClick={() => window.open("/admin/curation", "_blank")}
                className="flex items-center justify-center w-8 h-8 rounded-lg"
                style={{
                  backgroundColor: "rgba(255,200,100,0.15)",
                  border: "1px solid rgba(255,200,100,0.5)",
                  color: "rgba(255,220,150,1)",
                  fontSize: "14px",
                }}
              >
                ⚙️
              </button>
            </Tooltip>
          )}
          {sessionId && (
            <span className="text-xs px-3 py-1 rounded-full" style={{ backgroundColor: SILVER_FAINT, border: `1px solid rgba(192,200,216,0.3)`, color: SILVER }}>{sessionId.replace(/^agent:/, "")}</span>
          )}
        </div>
      </header>

      {/* 대화 영역 */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-6" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
        <div className={`max-w-2xl mx-auto space-y-6 ${selectMode ? "pl-8" : ""}`}>

          {/* 빈 상태 */}
          {activePairs.length === 0 && !streamingPair && (
            <div className="text-center mt-20">
              <div className="w-16 h-16 rounded-full mx-auto overflow-hidden mb-4" style={{ border: `1px solid ${SILVER_DIM}` }}><img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" /></div>
              <p className="text-sm font-medium" style={{ color: SILVER }}>조던 (에이전트 버전)</p>
              <p className="text-xs mt-1" style={{ color: SILVER_DIM }}>AFK Arena · 세븐나이츠 · 서머너즈워 · 니케 · 에픽세븐 · 원신 — 무엇이든 물어보세요</p>
              <p className="text-xs mt-3 px-4 py-2 rounded-full inline-block" style={{ backgroundColor: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399" }}>
                🔍 실제 게임 데이터 기반으로 분석하고 설계해요
              </p>
            </div>
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
                    📌 맥락 시작점 (이 시점부터 조던에게 전달됨)
                    <button
                      onClick={(e) => { e.stopPropagation(); clearContextAnchor(); }}
                      className="text-xs px-1.5 py-0.5 rounded hover:bg-white/10"
                      style={{ color: "rgba(255,200,100,0.8)" }}
                      title="맥락 시작점 해제"
                    >
                      ✕
                    </button>
                  </span>
                  <div className="flex-1" style={{ borderTop: "1px dashed rgba(255,200,100,0.6)" }} />
                </div>
              )}
              {/* 호버 시 anchor 설정 버튼 (이미 anchor면 표시 안 함) */}
              {!isAnchor && !selectMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); setContextAnchor(pair.pair_id, pair.timestamp ?? new Date().toISOString()); }}
                  className="absolute -left-7 top-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs rounded-full w-6 h-6 flex items-center justify-center"
                  style={{ backgroundColor: "rgba(255,200,100,0.15)", border: "1px solid rgba(255,200,100,0.4)", color: "rgba(255,220,150,0.9)" }}
                  title="이 시점부터 맥락 시작 (이전 대화·결정사항은 조던 컨텍스트에서 제외)"
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
                  {/* 2000자 초과 시 다운로드 버튼 */}
                  {pair.assistant.content.length > 2000 && (
                    <div className="flex items-center gap-2 ml-1 mt-1">
                      <span className="text-xs" style={{ color: SILVER_DIM }}>다운로드:</span>
                      <button onClick={() => downloadFile(pair.assistant.content, "txt")} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>📄 TXT</button>
                      <button onClick={() => downloadFile(pair.assistant.content, "md")} className="text-xs px-2.5 py-1 rounded-lg" style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>📝 MD</button>
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
                      <ReactMarkdown>{pair.feedback_summary}</ReactMarkdown>
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
                          <div className="flex flex-col gap-1 ml-1">
                            <p className="text-xs" style={{ color: SILVER_DIM }}>📎 전체 내용이 길어 요약본을 표시했어요. 전체 답변은 다운로드로 확인하세요.</p>
                            <div className="flex gap-2">
                              <button onClick={() => downloadFile(fullText, "txt")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "rgba(192,200,216,0.15)", border: `1px solid ${SILVER_DIM}`, color: SILVER }}>📄 TXT 전체 다운로드</button>
                              <button onClick={() => downloadFile(fullText, "md")} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "rgba(192,200,216,0.15)", border: `1px solid ${SILVER_DIM}`, color: SILVER }}>📝 MD 전체 다운로드</button>
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
                <div className="max-w-[70%] px-4 py-3 rounded-2xl rounded-tr-sm text-sm font-medium" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
                  {streamingPair.user}
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
      {/* 수동 스크롤 버튼 — 답변 완료 버튼 있을 때 숨김 (겹침 방지) */}
      {showScrollBtn && !showAnswerCompleteBtn && (
        <button onClick={scrollToBottom} className="fixed bottom-24 right-6 w-10 h-10 rounded-full flex items-center justify-center text-base shadow-lg z-40"
          style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.4)` }}>↓</button>
      )}

      {/* 입력창 */}
      <div className="px-4 py-3 flex gap-3 items-end" style={{ backgroundColor: "rgba(0,0,0,0.5)", borderTop: `1px solid ${SILVER_FAINT}` }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="게임 기획에 대해 질문하세요... (Enter 전송 / Alt+Enter 줄바꿈)"
          disabled={isLoading}
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
          disabled={isLoading || !input.trim()}
          className="w-11 h-11 rounded-xl flex items-center justify-center text-base flex-shrink-0 font-bold disabled:opacity-40"
          style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: `0 4px 15px rgba(192,200,216,0.3)` }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
