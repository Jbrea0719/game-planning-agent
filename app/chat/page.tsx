"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";

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
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showAnswerCompleteBtn, setShowAnswerCompleteBtn] = useState(false);
  // 롤링 맥락 카드 — 항상 3줄, 새 답변마다 백그라운드로 교체
  const [agentContext, setAgentContext] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docLoading, setDocLoading] = useState(false);
  const [showDocModal, setShowDocModal] = useState(false);
  const [docCopied, setDocCopied] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
  }, [sessionId]);

  // 스트리밍 중 + 사용자가 스크롤 올리지 않았을 때만 자동 하단 이동
  useEffect(() => {
    if (streamingPair !== null && !userScrolledUpRef.current) {
      scrollToBottom();
    }
  }, [streamingPair]);

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
    const allMessages = [
      ...pairs.filter(p => !p.is_deleted).flatMap(p => [
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
    // 선택 모드 진입 시 활성 대화 전체 기본 선택
    const allIds = new Set(activePairs.map((p) => p.pair_id));
    setSelectedPairIds(allIds);
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
        body: JSON.stringify({ messages: selectedMsgs }),
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

      {/* 참고 게임 팝업 */}
      {showGameModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={() => setShowGameModal(false)}>
          <div className="rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }} onClick={(e) => e.stopPropagation()}>
            {/* 팝업 헤더 */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <div>
                <p className="text-sm font-bold" style={{ color: SILVER }}>🎮 참고 게임 데이터베이스</p>
                <p className="text-xs mt-0.5" style={{ color: SILVER_DIM }}>에이전트가 분석에 활용하는 실제 게임 데이터</p>
              </div>
              <button onClick={() => setShowGameModal(false)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
            </div>
            {/* 팝업 내용 */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" style={{ scrollbarWidth: "thin", scrollbarColor: `${SILVER_DIM} transparent` }}>
              {[
                {
                  name: "AFK Arena / AFK2", studio: "릴리스 게임즈",
                  tags: ["방치형", "수익화", "영웅 등급"],
                  items: [
                    "AFK 메카닉: 오프라인 방치 수익 시스템 — 접속 빈도 낮은 유저 잔존율 극대화",
                    "영웅 등급: E~A~S~SS~SSS급 상향 구조, 등급별 스킬 해금",
                    "수익화: 월정액(문라이트 케이크), 시즌 패스, 영웅 소환(배너), 성유물 가챠",
                    "핵심 루프: 방치 → 재화 수집 → 영웅 강화 → 스테이지 진행 → 반복",
                  ],
                },
                {
                  name: "세븐나이츠 시리즈", studio: "넷마블넥서스",
                  tags: ["콜라보", "PvP", "성장 단계"],
                  items: [
                    "콜라보 전략: 마블, 원피스, DC 등 IP 콜라보로 신규 유입",
                    "PvP 구조: 아레나(실시간 PvP), 길드전(7v7)",
                    "성장 단계: 각성 → 초월 → 럭키 각성 (장기 성장 곡선 설계)",
                    "수익화: 루비 가챠, 패스 상품, 코스튬",
                  ],
                },
                {
                  name: "서머너즈워", studio: "컴투스",
                  tags: ["룬 시스템", "메타 사이클", "길드"],
                  items: [
                    "던전 시스템: 카이로스 던전 13종 (다양한 성장 재화 분산)",
                    "룬 시스템: 6부위 장비, 세트 효과, 전략 다양성의 핵심",
                    "레이드: 길드 콘텐츠, 협력 보상",
                    "메타 사이클: 분기별 신규 몬스터 → 메타 교란 → 과금 유도",
                  ],
                },
                {
                  name: "니케: 승리의 여신", studio: "시프트업",
                  tags: ["캐릭터 정체성", "세계관", "수집 동기"],
                  items: [
                    "세계관: 포스트 아포칼립스, 기계 적군 \"랩처\"와의 전쟁",
                    "캐릭터 정체성: 각 니케별 개별 스토리, 관계성, 배경 서사",
                    "수집 동기: 캐릭터 스킨, 우정도 시스템, 오디오 콘텐츠",
                    "수익화: 가챠(SSR 2%), 아웃포스트 패스, 프리미엄 패스",
                  ],
                },
                {
                  name: "에픽세븐", studio: "슈퍼크리에이티브",
                  tags: ["아트 퀄리티", "장기 운영", "스토리"],
                  items: [
                    "아트 퀄리티: 라이브 2D 애니메이션, 고퀄 일러스트",
                    "스토리 활용: 챕터별 메인 스토리, 각 캐릭터 사이드 스토리",
                    "장기 운영: 시즌 콘텐츠, 이벤트 스토리로 월드 빌딩 확장",
                    "전투: 턴제 + 속도 스탯 기반 선공 시스템",
                  ],
                },
                {
                  name: "원신", studio: "호요버스",
                  tags: ["가챠 구조", "PLC 설계", "오픈 월드"],
                  items: [
                    "오픈 월드: 지역별 스토리, 탐험, 수집 요소",
                    "가챠 구조: 소프트 천장(74번), 하드 천장(90번), 보장 시스템",
                    "PLC 설계: 버전 6주 업데이트 사이클, 신규 캐릭터/지역 추가",
                    "수익화: 결정(가챠재화), 배틀패스, 웰킨문 월정액",
                  ],
                },
                {
                  name: "붕괴: 스타레일", studio: "호요버스",
                  tags: ["턴제 전략", "메타 사이클", "광추 시스템"],
                  items: [
                    "턴제 전략: 원소 상성, 카운터 시스템",
                    "메타 사이클: 이고현전(PvE 도전) 중심 콘텐츠 순환",
                    "캐릭터 설계: 패스(스킬 트리), 광추(전용 장비) 시스템",
                  ],
                },
                {
                  name: "아크나이츠", studio: "하이퍼그리프",
                  tags: ["타워 디펜스", "니치 타겟팅", "전략"],
                  items: [
                    "타워 디펜스 전략: 오퍼레이터 배치, 라인 설계",
                    "니치 타겟팅: 전략 게이머, 로어 덕후 특화",
                    "수익화: 가챠(6성 2%), 스킨, 이벤트 패스",
                  ],
                },
                {
                  name: "FGO", studio: "딜라이트웍스 / 아니플렉스",
                  tags: ["IP 활용", "스토리 몰입도"],
                  items: [
                    "IP 활용: 타입문 세계관, 역사/신화 영웅 의인화",
                    "스토리 몰입도: 중편 소설 수준의 챕터 스토리",
                    "수익화: 성배(재화) 가챠, 이벤트 파밍",
                  ],
                },
                {
                  name: "블루아카이브", studio: "넥슨게임즈",
                  tags: ["세계관 구축", "총력전", "스토리"],
                  items: [
                    "IP 구축: 고유 세계관 \"키보토스\", 학원 배경",
                    "스토리 몰입도: 코믹+시리어스 혼합 서사",
                    "수익화: 가챠(3%), 학교 방문 이벤트, 총력전(레이드) 중심",
                  ],
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
                  <ul className="space-y-1">
                    {game.items.map((item, i) => (
                      <li key={i} className="text-xs flex gap-2" style={{ color: "#b8c4d4" }}>
                        <span style={{ color: SILVER_DIM, flexShrink: 0 }}>•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
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
          {/* 기획서 작성 버튼 — 활성 대화가 있을 때만 표시 */}
          {activePairs.length > 0 && !selectMode && (
            <button
              onClick={enterSelectMode}
              className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0"
              style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
            >
              📄 기획서 작성
            </button>
          )}
          {/* 선택 모드 */}
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
          <button
            onClick={() => setShowGameModal(true)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium flex-shrink-0"
            style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
          >
            🎮 참고 게임
          </button>
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
          {activePairs.map((pair) => (
            <div
              key={pair.pair_id}
              className={`space-y-3 group relative ${selectMode ? "cursor-pointer" : ""}`}
              onClick={selectMode ? () => togglePairSelect(pair.pair_id) : undefined}
            >
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
                      <ReactMarkdown>{fixMarkdown(pair.assistant.content)}</ReactMarkdown>
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

                  {/* 버튼 행: 자세한 답변 보기 + 설계 피드백 내용 */}
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
                          <ReactMarkdown>{fixMarkdown(bubbleText)}</ReactMarkdown>
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
          ))}

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
                      ? <ReactMarkdown>{fixMarkdown(streamingPair.assistant)}</ReactMarkdown>
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="게임 기획에 대해 질문하세요... (Enter 전송 / Alt+Enter 줄바꿈)"
          disabled={isLoading}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
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
