"use client";

// 모바일 전용 챗 페이지
// 데스크톱과 동일한 백엔드(/api/agent, Supabase)를 호출 — 데이터 자동 공유
// 기존 모달 컴포넌트(DecisionPanel·DocumentView)는 재사용

import { useState, useRef, useEffect, memo, type ReactNode, type ClipboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm"; // GFM 지원 — 표(table)·취소선 등 마크다운 확장 렌더링
import dynamic from "next/dynamic";
import DecisionPanel from "@/components/DecisionPanel";
import DocumentView from "@/components/DocumentView";
import DocPickerModal from "@/components/DocPickerModal";
import DocRevisePreview, { type RevisePreview } from "@/components/DocRevisePreview";
import { REFERENCE_GAMES } from "@/lib/reference-games";

// 안드로이드 크롬의 PWA 설치 이벤트 타입 (표준 DOM 타입에 없어 직접 선언)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// 홈 화면 설치 아이콘 — 인라인 SVG(폰트 폴백 영향 없이 정중앙). 트레이로 내려받는 모양
function InstallIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" />
    </svg>
  );
}
import ExtractedReviewCard, { type ExtractedItem } from "@/components/ExtractedReviewCard";
import { useSpeechRecognition, applyVoiceCommands } from "@/hooks/useSpeechRecognition";

// WireframeEditor·MockupGenerator는 DocumentView 안에서 호출 (📄 기획서 → 🎨 화면 설계)

const SILVER = "#c0c8d8";
const SILVER_DIM = "rgba(192,200,216,0.5)";
const SILVER_FAINT = "rgba(192,200,216,0.15)";
const DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001";

type Message = { role: "user" | "assistant"; content: string; image_id?: string };  // image_id: 첨부 이미지 (doc_images id) — /api/img/<id>로 표시
type Pair = {
  pair_id: string;
  user: Message;
  assistant: Message;
  timestamp?: string;
  detail_content?: string;
  detail_loading?: boolean;
  detail_shown?: boolean;
  detail_failed?: boolean; // 자세히 불러오기 실패 → 재시도 버튼 표시용
};

// 마크다운 렌더는 비용이 큼(매번 파싱). 내용(text)이 바뀔 때만 다시 그리도록 메모이즈.
// → 입력창 타이핑으로 부모가 리렌더돼도, 쌓인 메시지 마크다운은 재파싱하지 않음 (타이핑 끊김 해결).
const MemoMarkdown = memo(function MemoMarkdown({ text }: { text: string }) {
  return <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{text}</ReactMarkdown>;
});

export default function MobileChatPage({ simulateKeyboard = false }: { simulateKeyboard?: boolean }) {
  const [nickname, setNickname] = useState("");
  const [nicknameInput, setNicknameInput] = useState("");
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const sessionId = nickname ? `agent:${nickname}` : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("jordan_agent_nickname");
    if (saved) setNickname(saved);
    else setShowNicknameModal(true);
  }, []);

  function confirmNickname() {
    const v = nicknameInput.trim();
    if (!v) return;
    localStorage.setItem("jordan_agent_nickname", v);
    setNickname(v);
    setShowNicknameModal(false);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: "linear-gradient(160deg, #0a0e1a 0%, #0d1525 50%, #0a1020 100%)" }}>
      {showNicknameModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl p-6 w-full max-w-xs shadow-2xl" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}>
            <p className="text-sm font-bold mb-1" style={{ color: SILVER }}>입장하기</p>
            <p className="text-xs mb-4" style={{ color: SILVER_DIM }}>닉네임을 입력하면 대화 기록이 저장돼요</p>
            <input
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmNickname()}
              placeholder="닉네임"
              autoFocus
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none mb-3"
              // fontSize 16px: iOS 자동 확대(줌인) 방지
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", fontSize: "16px" }}
            />
            <button
              onClick={confirmNickname}
              disabled={!nicknameInput.trim()}
              className="w-full py-2.5 rounded-lg text-sm font-bold disabled:opacity-40"
              style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
            >
              입장
            </button>
          </div>
        </div>
      )}

      {sessionId && <MobileChat sessionId={sessionId} nickname={nickname} simulateKeyboard={simulateKeyboard} />}
    </div>
  );
}

// ── 본 챗 영역 ────────────────────────────────────────────────────
function MobileChat({ sessionId, nickname, simulateKeyboard }: { sessionId: string; nickname: string; simulateKeyboard?: boolean }) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [streaming, setStreaming] = useState<{ user: string; assistant: string; userImageId?: string } | null>(null);
  // 첨부 이미지 (전송 전 미리보기) + 업로드 상태
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; mime: string; base64: string } | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  // 답변 스트림 실패(네트워크 끊김·백그라운드 등) 상태 — 재시도 버튼·자동 재시도용
  const [streamFailed, setStreamFailed] = useState(false);
  const streamCancelledRef = useRef(false); // 사용자가 직접 '취소'한 경우 구분(자동 재시도 안 함)
  const lastReqRef = useRef<{ allMessages: { role: string; content: string }[]; pairId: string; userText: string; imageId?: string } | null>(null);
  const autoRetryRef = useRef(0);            // 답변 자동 재시도 횟수(무한루프 방지)
  const detailRetryRef = useRef<Record<string, number>>({}); // 자세히 pair별 자동 재시도 횟수
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [generatingConvIds, setGeneratingConvIds] = useState<Set<string>>(new Set());  // 방별 생성 중

  // UI 상태
  const [showMenu, setShowMenu] = useState(false);
  const [showBible, setShowBible] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // ── PWA 홈 화면 설치 (안드로이드 크롬 beforeinstallprompt 활용) ──
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false); // 이미 앱으로 설치돼 실행 중인지
  const [isIosDevice, setIsIosDevice] = useState(false);   // iOS(사파리)는 이벤트 미지원 → 안내만
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    setIsIosDevice(/iphone|ipad|ipod/i.test(window.navigator.userAgent));
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallPrompt(e as BeforeInstallPromptEvent); };
    const onInstalled = () => { setInstallPrompt(null); setIsStandalone(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  const handleInstall = async () => {
    if (!installPrompt) return;
    setShowMenu(false);
    await installPrompt.prompt();
    try { await installPrompt.userChoice; } catch { /* 사용자가 취소해도 무시 */ }
    setInstallPrompt(null);
  };
  // 화면 설계는 기획서 뷰에서 진입 (📄 → 🎨 화면 설계)

  // 설정 상태
  const [showCitations, setShowCitations] = useState(false);
  const [contextAnchorPairId, setContextAnchorPairId] = useState<string | null>(null);
  const [contextAnchorTimestamp, setContextAnchorTimestamp] = useState<string | null>(null);
  // 참고 기획서(다중) — 답변 시 교차 참고·충돌 점검. 방별 유지(localStorage)
  const [refDocIds, setRefDocIds] = useState<string[]>([]);
  const [showRefPicker, setShowRefPicker] = useState(false);
  // 대화 기반 기획서 수정 — 수정 대상(단일) + 미리보기
  const [reviseTargetDocId, setReviseTargetDocId] = useState<string | null>(null);
  const [reviseTargetTitle, setReviseTargetTitle] = useState<string>("");
  const [showReviseTargetPicker, setShowReviseTargetPicker] = useState(false);
  const [revisePreview, setRevisePreview] = useState<RevisePreview | null>(null);
  const [reviseGenLoading, setReviseGenLoading] = useState(false);
  // 대화방 (병렬 작업)
  const [conversations, setConversations] = useState<{ id: string; title: string }[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);
  const [showConvList, setShowConvList] = useState(false);
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);
  const [convRenameInput, setConvRenameInput] = useState("");
  const currentConvIdRef = useRef<string | null>(null);
  const pendingAutoAnchorRef = useRef(false); // 기획서 작성/수정 진입 시 다음 새 대화에 맥락선 자동 설정

  // 바이블 카운트 + 리로드
  const [decisionCount, setDecisionCount] = useState(0);
  const [decisionReloadKey, setDecisionReloadKey] = useState(0);
  const [docReloadKey, setDocReloadKey] = useState(0);
  // 카테고리 변경 시 증가 → 바이블 패널 카테고리 실시간 동기화
  const [categoryReloadKey, setCategoryReloadKey] = useState(0);

  // 기획서 신규 알림
  const [docNewDot, setDocNewDot] = useState(false);
  // 바이블 신규 알림
  const [bibleNewDot, setBibleNewDot] = useState(false);
  const prevCountRef = useRef(0);

  // 답변 피드백
  const [feedbacks, setFeedbacks] = useState<Record<string, "accurate" | "inaccurate">>({});
  const [reasonInputPairId, setReasonInputPairId] = useState<string | null>(null);
  const [reasonInputText, setReasonInputText] = useState("");

  // 기획서 작성 — 대화 선택 모드
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPairIds, setSelectedPairIds] = useState<Set<string>>(new Set());
  const [docBackgroundGenerating, setDocBackgroundGenerating] = useState(false);
  const [docCompletedNotice, setDocCompletedNotice] = useState<{ title: string } | null>(null);
  const docGenAbortRef = useRef<AbortController | null>(null);

  // 메시지 액션 시트 (모바일에서는 메시지 탭 시 액션 메뉴)
  const [actionForPair, setActionForPair] = useState<string | null>(null);

  // 자동 추출 검토 카드
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [showExtractedReview, setShowExtractedReview] = useState(false);

  // 조던 인터뷰
  const [interviewLoading, setInterviewLoading] = useState(false);

  async function startInterview() {
    if (interviewLoading) return;
    setInterviewLoading(true);
    try {
      const recentTopics = pairs.slice(-10).map(p => p.user.content.slice(0, 40)).filter(c => c.length < 50);
      const res = await fetch("/api/jordan-interview/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: DEFAULT_PROJECT_ID, recent_topics: recentTopics }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { alert(`질문 생성 실패: ${data.error ?? "오류"}`); return; }

      const pairId = crypto.randomUUID();
      const userMsg = "🎤 결정 안 된 영역 점검해줘";
      const question = `**🎤 조던 인터뷰** — ${data.category_hint ? `\`${data.category_hint}\` 영역.` : ""}\n\n${data.question}\n\n_답변해주시면 자동으로 바이블에 추가돼요._`;

      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { session_id: sessionId, pair_id: pairId, role: "user", content: userMsg },
            { session_id: sessionId, pair_id: pairId, role: "assistant", content: question },
          ],
        }),
      }).catch(() => {});

      setPairs(prev => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: userMsg },
        assistant: { role: "assistant", content: question },
      }]);
      setShowMenu(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      alert(`인터뷰 실패: ${String(err)}`);
    } finally {
      setInterviewLoading(false);
    }
  }

  // 특정 소분류 기획서 작성 시작 — 기획서 리스트의 '작성하기' 버튼에서 호출
  async function startInterviewForCategory(subCategoryId: string, label: string) {
    if (interviewLoading) return;
    setInterviewLoading(true);
    try {
      const res = await fetch("/api/jordan-interview/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: DEFAULT_PROJECT_ID, target_sub_category_id: subCategoryId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) { alert(`기획서 작성 질문 생성 실패: ${data.error ?? "오류"}`); return; }

      const pairId = crypto.randomUUID();
      const userMsg = `✍️ "${label}" 기획서 작성 시작`;
      const question = `**✍️ 기획서 작성 — \`${data.category_hint ?? label}\`**\n\n이 항목을 채우기 위해 하나씩 정해볼게요.\n\n${data.question}\n\n_답변을 쌓아가면 이 내용으로 기획서를 작성해드려요._`;

      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { session_id: sessionId, pair_id: pairId, role: "user", content: userMsg },
            { session_id: sessionId, pair_id: pairId, role: "assistant", content: question },
          ],
        }),
      }).catch(() => {});

      setPairs(prev => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: userMsg },
        assistant: { role: "assistant", content: question },
      }]);
      // 자동 맥락선 — 기획서 작성 시작 시점부터 맥락선을 찍어 이후 대화만 작성 근거로
      setContextAnchor(pairId, new Date().toISOString());
      setShowMenu(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    } catch (err) {
      alert(`기획서 작성 시작 실패: ${String(err)}`);
    } finally {
      setInterviewLoading(false);
    }
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);  // 스트리밍 중 사용자가 위로 올렸는지
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);  // 이미지 첨부용 숨김 input
  const abortRef = useRef<AbortController | null>(null);
  // 방별 백그라운드 생성 추적
  const genAbortRef = useRef<Map<string, AbortController>>(new Map());
  const genStateRef = useRef<Map<string, { user: string; raw: string; imageId?: string }>>(new Map());
  const streamingConvIdRef = useRef<string | null>(null);
  // 음성 입력 — 받아쓰기 시작 시점의 기존 입력값을 보관 → 인식 결과를 그 뒤에 이어붙임
  const voiceBaseRef = useRef("");
  const { supported: voiceSupported, listening: voiceListening, start: startVoice } = useSpeechRecognition({
    lang: "ko-KR",
    onTranscript: (sessionText) => {
      // "줄바꿈/다음 줄/엔터" 음성 명령을 실제 줄바꿈으로 변환
      const spoken = applyVoiceCommands(sessionText);
      // 기존 입력 + 이번 발화 누적 텍스트 (말하는 도중 실시간 갱신)
      const base = voiceBaseRef.current;
      setInput(base ? `${base} ${spoken}` : spoken);
    },
    onError: (err) => {
      if (err === "not-allowed" || err === "service-not-allowed") {
        alert("마이크 권한이 필요해요. 브라우저 설정에서 마이크를 허용해 주세요.");
      }
      // no-speech·aborted 등은 조용히 무시
    },
  });
  function toggleVoice() {
    if (!voiceListening) voiceBaseRef.current = input.trim();
    startVoice();  // 듣는 중이면 훅 내부에서 토글로 중지됨
  }

  // 자세한 답변 로드
  // 자세한 답변 본문·표시상태를 DB(assistant row)에 영속화 — 다음 진입 시 펼친 상태 복원
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

  async function loadDetail(pairId: string) {
    const pair = pairs.find(p => p.pair_id === pairId);
    if (!pair) return;
    // 이미 불러온 자세한 답변이 있으면 → 펼침/접힘 토글만 (재요청 X) + 상태 저장
    if (pair.detail_content) {
      const nextShown = !pair.detail_shown;
      setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_shown: nextShown } : p));
      void persistDetail(pairId, { detail_shown: nextShown });
      return;
    }
    setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_loading: true, detail_shown: true, detail_failed: false } : p));
    try {
      const ctx = [
        { role: "user" as const, content: pair.user.content },
        { role: "assistant" as const, content: pair.assistant.content },
        { role: "user" as const, content: "위 답변을 더 자세하고 풍부하게 설명해줘." },
      ];
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: ctx, detailed: true }),
      });
      if (!res.ok || !res.body) throw new Error("err");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_content: text.replace("__TRUNCATED__", "") } : p));
      }
      const finalDetailText = text.replace("__TRUNCATED__", "");
      setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_content: finalDetailText } : p));
      if (!finalDetailText.trim()) throw new Error("empty");
      delete detailRetryRef.current[pairId]; // 성공 → 재시도 카운트 리셋
      // DB에 영속화 — 다음번 진입 시 펼친 상태로 복원
      void persistDetail(pairId, { detail_content: finalDetailText, detail_shown: true });
    } catch {
      // 실패 → 에러문구 대신 플래그로 표시(내용은 비워둬 재시도 가능) → 재시도 버튼·자동 재시도 대상
      setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_content: "", detail_failed: true } : p));
    } finally {
      setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, detail_loading: false } : p));
    }
  }

  // 피드백 저장
  async function submitFeedback(pairId: string, type: "accurate" | "inaccurate", reason?: string) {
    const pair = pairs.find(p => p.pair_id === pairId);
    if (!pair) return;
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
          question: pair.user.content,
          answer: pair.assistant.content?.slice(0, 1000),
        }),
      });
    } catch (err) {
      console.error("[feedback] 저장 실패:", err);
    }
  }
  async function submitReason() {
    if (!reasonInputPairId) return;
    await submitFeedback(reasonInputPairId, "inaccurate", reasonInputText.trim() || undefined);
    setReasonInputPairId(null);
    setReasonInputText("");
  }

  // 토글 localStorage 복원
  // 맥락선(anchor)은 여기서 복원하지 않음 — 마운트 시 currentConvId가 null이라 잘못된 키(sessionId)를 읽게 됨.
  // anchor 복원은 loadConversation이 단일 소스(룸 키 기준).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("jordan_show_citations") === "true") setShowCitations(true);
    if (localStorage.getItem("jordan_doc_new_dot") === "true") setDocNewDot(true);
  }, [sessionId]);

  // 출처 표시 저장
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("jordan_show_citations", String(showCitations));
  }, [showCitations]);

  // 바이블 카운트 증가 → 빨간 점
  useEffect(() => {
    const prev = prevCountRef.current;
    if (decisionCount > prev && prev !== 0) {
      setBibleNewDot(true);
      const t = setTimeout(() => setBibleNewDot(false), 2 * 60 * 1000);
      return () => clearTimeout(t);
    }
    prevCountRef.current = decisionCount;
  }, [decisionCount]);

  // 메시지를 pair로 파싱 (detail 복원 포함)
  function parsePairs(messages: Array<{ role: "user" | "assistant"; content: string; pair_id?: string; is_deleted?: boolean; detail_content?: string; detail_shown?: boolean; image_id?: string }>): Pair[] {
    const pairMap = new Map<string, { user?: Message; assistant?: Message; detail_content?: string; detail_shown?: boolean }>();
    const order: string[] = [];
    for (const m of messages) {
      if (m.is_deleted) continue;
      const pid = m.pair_id ?? "unknown";
      if (!pairMap.has(pid)) { pairMap.set(pid, {}); order.push(pid); }
      const entry = pairMap.get(pid)!;
      if (m.role === "user") { entry.user = m; }
      else {
        entry.assistant = m;
        if (m.detail_content) entry.detail_content = m.detail_content;
        if (m.detail_shown) entry.detail_shown = m.detail_shown;
      }
    }
    return order.map(pid => {
      const e = pairMap.get(pid)!;
      if (!e.user || !e.assistant) return null;
      return { pair_id: pid, user: e.user, assistant: e.assistant, detail_content: e.detail_content, detail_shown: e.detail_shown };
    }).filter(Boolean) as Pair[];
  }

  // 대화방 부트스트랩 — 목록 로드, 없으면 기본방 생성(기존 메시지 흡수), 마지막 방 열기
  async function bootstrapConversations() {
    try {
      const res = await fetch(`/api/conversations?session_id=${encodeURIComponent(sessionId)}`);
      const data = await res.json();
      let convs: { id: string; title: string; created_at?: string }[] = data.conversations ?? [];
      if (convs.length === 0) {
        const cr = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, title: "기본 대화", adopt_orphans: true }) });
        const cd = await cr.json();
        if (cd.conversation) convs = [cd.conversation];
      }
      setConversations(convs.map(c => ({ id: c.id, title: c.title })));
      // 복구: 미배정(숨겨진) 기존 메시지를 가장 오래된 방으로 흡수
      let recoveredInto: string | null = null;
      if (convs.length > 0) {
        const oldest = [...convs].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))[0];
        try {
          const ar = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, adopt_into: oldest.id }) });
          const ad = await ar.json();
          if (ad.adopted > 0) recoveredInto = oldest.id;
        } catch { /* 무시 */ }
      }
      // 마지막에 보던 방을 최우선 복원 (복구는 백그라운드로만)
      const lastUsed = localStorage.getItem(`jordan_current_conv:${sessionId}`);
      const target = (lastUsed && convs.find(c => c.id === lastUsed)) ? lastUsed : (recoveredInto ?? convs[0]?.id ?? null);
      if (target) { await loadConversation(target); return; }
      throw new Error("대화방 셋업 불가 — 폴백");
    } catch (err) {
      // 대화방 테이블 미생성/오류 시 → 기존 방식(전체 메시지)으로 폴백
      console.error("[대화방] 부트스트랩 — 기존 방식 폴백:", err);
      try {
        const r = await fetch(`/api/messages?session_id=${encodeURIComponent(sessionId)}`);
        const d = await r.json();
        if (d.messages?.length) setPairs(parsePairs(d.messages));
        // 폴백 경로에서도 맥락선 복원 (세션 키)
        setContextAnchorPairId(localStorage.getItem(`jordan_context_anchor_pair:${sessionId}`));
        setContextAnchorTimestamp(localStorage.getItem(`jordan_context_anchor_time:${sessionId}`));
      } catch { /* 무시 */ }
    }
  }

  async function loadConversation(convId: string) {
    setCurrentConvId(convId);
    currentConvIdRef.current = convId;
    localStorage.setItem(`jordan_current_conv:${sessionId}`, convId);
    setShowConvList(false);
    setPairs([]);
    try {
      const res = await fetch(`/api/messages?session_id=${encodeURIComponent(sessionId)}&conversation_id=${encodeURIComponent(convId)}`);
      const data = await res.json();
      setPairs(data.messages?.length ? parsePairs(data.messages) : []);
    } catch { setPairs([]); }
    // 맥락선 복원 — 룸 키 우선, 없으면 세션 키로 폴백 (룸 기능 이전에 저장된 anchor 보존)
    const apair = localStorage.getItem(`jordan_context_anchor_pair:${convId}`) ?? localStorage.getItem(`jordan_context_anchor_pair:${sessionId}`);
    const atime = localStorage.getItem(`jordan_context_anchor_time:${convId}`) ?? localStorage.getItem(`jordan_context_anchor_time:${sessionId}`);
    setContextAnchorPairId(apair);
    setContextAnchorTimestamp(atime);
    // 세션 키에만 있던 레거시 anchor를 룸 키로 이관 (다음부턴 룸 키로 일관 저장)
    if (apair && !localStorage.getItem(`jordan_context_anchor_pair:${convId}`)) {
      localStorage.setItem(`jordan_context_anchor_pair:${convId}`, apair);
      if (atime) localStorage.setItem(`jordan_context_anchor_time:${convId}`, atime);
    }
    // 참고 기획서 복원 (방별)
    try {
      const rd = localStorage.getItem(`jordan_ref_docs:${convId}`);
      setRefDocIds(rd ? (JSON.parse(rd) as string[]) : []);
    } catch { setRefDocIds([]); }
    // 이 방에 진행 중인 백그라운드 생성이 있으면 라이브 스트림 복원
    const g = genStateRef.current.get(convId);
    if (g) {
      let disp = g.raw;
      const i = disp.indexOf("__JORDAN_ANSWER_START__");
      if (i !== -1) disp = disp.slice(i + "__JORDAN_ANSWER_START__".length).trimStart();
      disp = disp.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__$/, "").replace(/__DECISIONS_(EXTRACTED|HELD)__\d+/g, "").replace("__TRUNCATED__", "");
      streamingConvIdRef.current = convId;
      setStreaming({ user: g.user, assistant: disp, userImageId: g.imageId });
    } else {
      streamingConvIdRef.current = null;
      setStreaming(null);
    }
  }

  async function createConversation() {
    try {
      const res = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, title: "새 대화" }) });
      const data = await res.json();
      if (data.conversation) { setConversations(prev => [data.conversation, ...prev]); await loadConversation(data.conversation.id); }
    } catch (err) { console.error("[대화방] 생성 실패:", err); }
  }

  async function renameConversation(id: string, title: string) {
    const t = title.trim(); setRenamingConvId(null); setConvRenameInput(""); if (!t) return;
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title: t } : c));
    await fetch("/api/conversations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, title: t }) }).catch(() => {});
  }

  async function deleteConversation(id: string) {
    if (!confirm("이 대화방과 그 안의 모든 대화를 삭제할까요?")) return;
    await fetch("/api/conversations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {});
    const remaining = conversations.filter(c => c.id !== id);
    setConversations(remaining);
    if (currentConvId === id) { if (remaining.length > 0) await loadConversation(remaining[0].id); else await createConversation(); }
  }

  // 메시지 로드 — 대화방 부트스트랩
  useEffect(() => {
    void bootstrapConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // 자동 스크롤 — 사용자가 위로 올렸으면 멈춤(유지)
  useEffect(() => {
    if (userScrolledUpRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pairs, streaming]);

  // 스크롤 감지 — 스트리밍 중 살짝만 올려도 자동스크롤 멈춤, 바닥 근처로 오면 재개
  function handleMobileScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
    if (isLoading || streaming !== null) {
      if (distFromBottom > 60) userScrolledUpRef.current = true;
      else if (distFromBottom < 24) userScrolledUpRef.current = false;
    }
  }

  // isLoading = 지금 보고 있는 방이 생성 중인지 (다른 방 생성은 백그라운드로 계속)
  useEffect(() => {
    setIsLoading(!!currentConvId && generatingConvIds.has(currentConvId));
  }, [generatingConvIds, currentConvId]);

  // 기존 피드백 복원
  useEffect(() => {
    if (pairs.length === 0) return;
    const targets = pairs.filter(p => feedbacks[p.pair_id] === undefined);
    if (targets.length === 0) return;
    Promise.all(targets.map(async p => {
      try {
        const res = await fetch(`/api/feedback?pair_id=${encodeURIComponent(p.pair_id)}`);
        const data = await res.json();
        return data.feedback ? { pid: p.pair_id, type: data.feedback.feedback_type } : null;
      } catch { return null; }
    })).then(results => {
      const updates: Record<string, "accurate" | "inaccurate"> = {};
      for (const r of results) { if (r) updates[r.pid] = r.type; }
      if (Object.keys(updates).length > 0) setFeedbacks(prev => ({ ...prev, ...updates }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairs]);

  // 맥락선 설정/해제
  // 키는 ref 기반(currentConvIdRef)으로 통일 — state 클로저 지연·키 불일치로 새로고침 시 사라지던 문제 방지
  function setContextAnchor(pairId: string, timestamp: string) {
    const roomKey = currentConvIdRef.current ?? sessionId;
    pendingAutoAnchorRef.current = false;  // 수동 설정 시 자동 맥락선 대기 해제
    setContextAnchorPairId(pairId);
    setContextAnchorTimestamp(timestamp);
    localStorage.setItem(`jordan_context_anchor_pair:${roomKey}`, pairId);
    localStorage.setItem(`jordan_context_anchor_time:${roomKey}`, timestamp);
  }
  function clearContextAnchor() {
    const roomKey = currentConvIdRef.current ?? sessionId;
    pendingAutoAnchorRef.current = false;  // 수동 해제 시 자동 맥락선 대기 해제
    setContextAnchorPairId(null);
    setContextAnchorTimestamp(null);
    localStorage.removeItem(`jordan_context_anchor_pair:${roomKey}`);
    localStorage.removeItem(`jordan_context_anchor_time:${roomKey}`);
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
          e.preventDefault();  // 이미지 붙여넣기 시 텍스트 삽입 방지
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
    } catch (e) {
      console.warn("[image] 처리 실패:", e);
    } finally {
      setImageUploading(false);
    }
  }

  // 참고 기획서 적용 + 방별 localStorage 저장 (비면 키 삭제)
  function applyRefDocs(ids: string[]) {
    setRefDocIds(ids);
    const key = `jordan_ref_docs:${currentConvId ?? sessionId}`;
    if (ids.length > 0) localStorage.setItem(key, JSON.stringify(ids));
    else localStorage.removeItem(key);
  }

  // 맥락선 범위 대화 → {role,content}[] (수정 근거)
  // 모바일 pairs는 is_deleted 개념 없이 활성 페어만 보관하므로 pairs를 그대로 사용
  function getAnchorRangeMessages() {
    let range = pairs;
    if (contextAnchorPairId) {
      const idx = pairs.findIndex(p => p.pair_id === contextAnchorPairId);
      if (idx >= 0) range = pairs.slice(idx);
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

  // DocumentView "대화를 통한 수정" 진입 → 수정 대상 지정 + 기획서 뷰 닫기
  function enterReviseViaChat(docId: string, docTitle: string) {
    setReviseTargetDocId(docId);
    setReviseTargetTitle(docTitle);
    setShowDocs(false);
    // 수정 진입 시점 이후의 대화만 근거가 되도록, 다음 새 대화 페어를 맥락선으로 자동 설정
    pendingAutoAnchorRef.current = true;
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function sendMessage() {
    const trimmed = input.trim();
    const img = attachedImage;  // 전송 시점 고정
    if ((!trimmed && !img) || isLoading || imageUploading) return;
    const question = trimmed || "첨부한 이미지를 보고 분석·평가해줘.";
    const pairId = crypto.randomUUID();

    const visiblePairs = pairs;
    let relevantPairs = visiblePairs;
    if (contextAnchorPairId) {
      const idx = visiblePairs.findIndex(p => p.pair_id === contextAnchorPairId);
      if (idx >= 0) relevantPairs = visiblePairs.slice(idx);
    }
    const allMessages = [
      ...relevantPairs.flatMap(p => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]),
      { role: "user" as const, content: question },
    ];
    setInput("");
    setAttachedImage(null);  // 첨부 미리보기 즉시 비우기 (UX)
    if (inputRef.current) { inputRef.current.style.height = "auto"; }

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

    // 재시도·자동 재시도에서 같은 요청을 다시 보낼 수 있도록 보관
    lastReqRef.current = { allMessages, pairId, userText: question, imageId: uploadedImageId ?? undefined };
    autoRetryRef.current = 0;
    await runAgentStream(allMessages, pairId, question, uploadedImageId ?? undefined);
  }

  // 실제 네트워크 스트리밍 — sendMessage·retryStream(재시도)·자동 재시도가 공용으로 호출
  async function runAgentStream(allMessages: { role: string; content: string }[], pairId: string, userText: string, imageId?: string) {
    const genConvId = currentConvIdRef.current;  // 이 답변이 속한 방 (시작 시점 고정)
    setStreaming({ user: userText, assistant: "", userImageId: imageId });
    streamingConvIdRef.current = genConvId;
    setStreamFailed(false);
    userScrolledUpRef.current = false;  // 새 답변 시작 시 자동스크롤 재개
    streamCancelledRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;
    if (genConvId) {
      genAbortRef.current.set(genConvId, controller);
      genStateRef.current.set(genConvId, { user: userText, raw: "", imageId });
      setGeneratingConvIds(prev => new Set(prev).add(genConvId));  // 이 방 생성 중
    }

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          session_id: sessionId,
          pair_id: pairId,
          agentContext: "",
          show_citations: showCitations,
          context_anchor_time: contextAnchorTimestamp,
          conversation_id: genConvId,  // 이 답변이 속한 대화방
          image_id: imageId ?? null,   // 첨부 이미지 (조던이 보고 응답)
          reference_doc_ids: refDocIds,  // 참고 기획서 — 교차 참고·충돌 점검
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("err");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value);
        const _st = genConvId ? genStateRef.current.get(genConvId) : null;
        if (_st) _st.raw = text;  // 백그라운드 누적 (방 전환해도 유지)
        if (genConvId === currentConvIdRef.current) {
          let display = text;
          const idx = display.indexOf("__JORDAN_ANSWER_START__");
          if (idx !== -1) display = display.slice(idx + "__JORDAN_ANSWER_START__".length).trimStart();
          display = display.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__$/, "");
          display = display.replace(/__DECISIONS_(EXTRACTED|HELD)__\d+/g, "");
          display = display.replace("__TRUNCATED__", "");
          setStreaming({ user: userText, assistant: display, userImageId: imageId });
        }
      }
      let clean = text;
      const extractedMatch = text.match(/__DECISIONS_EXTRACTED__(\d+)/);
      if (extractedMatch && parseInt(extractedMatch[1], 10) > 0) {
        setDecisionReloadKey(k => k + 1);
      }
      // 추출 데이터 파싱 → 검토 카드 (지금 보고 있는 방일 때만 모달)
      const dataMatch = text.match(/__DECISIONS_DATA__([\s\S]+?)__END__/);
      if (dataMatch && genConvId === currentConvIdRef.current) {
        try {
          const items = JSON.parse(dataMatch[1]) as ExtractedItem[];
          if (items.length > 0) { setExtractedItems(items); setShowExtractedReview(true); }
        } catch { /* 무시 */ }
      }
      const startIdx = clean.indexOf("__JORDAN_ANSWER_START__");
      if (startIdx !== -1) clean = clean.slice(startIdx + "__JORDAN_ANSWER_START__".length).trimStart();
      clean = clean.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__/, "");
      clean = clean.replace(/__DECISIONS_DATA__[\s\S]+?__END__/, "");
      clean = clean.replace(/__DECISIONS_(EXTRACTED|HELD)__\d+/g, "");
      clean = clean.replace("__TRUNCATED__", "").trimEnd();

      if (!clean) throw new Error("empty"); // 빈 응답도 실패로 처리(재시도 가능)
      // 지금 그 방을 보고 있으면 즉시 반영. 다른 방이면 DB에 저장됐으니 그 방 다시 열 때 표시됨
      if (genConvId === currentConvIdRef.current) {
        const newPair = {
          pair_id: pairId,
          user: { role: "user" as const, content: userText, image_id: imageId ?? undefined },
          assistant: { role: "assistant" as const, content: clean },
        };
        setPairs(prev => [...prev, newPair]);
        setStreaming(null);
        // 기획서 작성/수정 진입 시 대기 중이던 자동 맥락선을 이 새 페어에 적용
        if (pendingAutoAnchorRef.current) {
          pendingAutoAnchorRef.current = false;
          setContextAnchor(newPair.pair_id, new Date().toISOString());
        }
      }
      setStreamFailed(false);
      lastReqRef.current = null; // 성공 → 보관 요청 비움
    } catch {
      // 사용자가 직접 취소한 게 아니라면 '실패' 표시 (지금 보고 있는 방일 때만)
      if (!streamCancelledRef.current && genConvId === currentConvIdRef.current) setStreamFailed(true);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (genConvId) {
        genAbortRef.current.delete(genConvId);
        genStateRef.current.delete(genConvId);
        setGeneratingConvIds(prev => { const n = new Set(prev); n.delete(genConvId); return n; });
      }
    }
  }

  // 멈춘 답변 다시 진행 (재시도 버튼·자동 재시도 공용)
  function retryStream() {
    const req = lastReqRef.current;
    if (!req || abortRef.current) return; // 보관 요청 없거나 이미 진행 중이면 무시
    void runAgentStream(req.allMessages, req.pairId, req.userText, req.imageId);
  }

  function cancelStream() {
    streamCancelledRef.current = true;
    const cid = currentConvIdRef.current;
    if (cid) genAbortRef.current.get(cid)?.abort();  // 현재 방 생성만 중단
    abortRef.current?.abort();
    setStreaming(null);
    setStreamFailed(false);
    lastReqRef.current = null;
  }

  // ── 자동 재시도 (네트워크 복귀·앱 복귀 시) ──────────────────────────
  // 최신 값/함수를 이벤트 핸들러에서 참조하기 위한 ref 미러
  const pairsRef = useRef(pairs); pairsRef.current = pairs;
  const retryStreamRef = useRef<() => void>(() => {}); retryStreamRef.current = retryStream;
  const loadDetailRef = useRef<(id: string) => void>(() => {}); loadDetailRef.current = loadDetail;

  // 답변 스트림 실패 시: 온라인·포그라운드면 잠시 후 자동 재시도(최대 3회). 오프라인/백그라운드면 복귀 이벤트 때 재시도.
  useEffect(() => {
    if (!streamFailed) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tryResume = () => {
      if (timer) return;
      if (navigator.onLine && document.visibilityState === "visible" && !abortRef.current && autoRetryRef.current < 3) {
        timer = setTimeout(() => { timer = null; autoRetryRef.current += 1; retryStreamRef.current(); }, 700);
      }
    };
    tryResume();
    window.addEventListener("online", tryResume);
    document.addEventListener("visibilitychange", tryResume);
    return () => { if (timer) clearTimeout(timer); window.removeEventListener("online", tryResume); document.removeEventListener("visibilitychange", tryResume); };
  }, [streamFailed]);

  // 자세히 실패 시: 동일하게 자동 재시도(항목당 최대 2회)
  const anyDetailFailed = pairs.some(p => p.detail_failed);
  useEffect(() => {
    if (!anyDetailFailed) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tryResume = () => {
      if (timer) return;
      if (navigator.onLine && document.visibilityState === "visible") {
        timer = setTimeout(() => {
          timer = null;
          for (const p of pairsRef.current) {
            if (p.detail_failed && !p.detail_loading) {
              const n = detailRetryRef.current[p.pair_id] ?? 0;
              if (n < 2) { detailRetryRef.current[p.pair_id] = n + 1; loadDetailRef.current(p.pair_id); }
            }
          }
        }, 700);
      }
    };
    tryResume();
    window.addEventListener("online", tryResume);
    document.addEventListener("visibilitychange", tryResume);
    return () => { if (timer) clearTimeout(timer); window.removeEventListener("online", tryResume); document.removeEventListener("visibilitychange", tryResume); };
  }, [anyDetailFailed]);

  // 기획서 작성 모드 진입 — 기본 선택값: 맥락선 이하 또는 전체
  function enterSelectMode() {
    let defaultIds: string[];
    if (contextAnchorPairId) {
      const idx = pairs.findIndex(p => p.pair_id === contextAnchorPairId);
      defaultIds = idx >= 0 ? pairs.slice(idx).map(p => p.pair_id) : pairs.map(p => p.pair_id);
    } else {
      defaultIds = pairs.map(p => p.pair_id);
    }
    setSelectedPairIds(new Set(defaultIds));
    setSelectMode(true);
    setShowMenu(false);
  }
  function togglePairSelect(pid: string) {
    setSelectedPairIds(prev => {
      const n = new Set(prev);
      if (n.has(pid)) n.delete(pid); else n.add(pid);
      return n;
    });
  }
  function cancelSelectMode() {
    setSelectMode(false);
    setSelectedPairIds(new Set());
  }

  async function generateDocument() {
    const selectedMsgs = pairs
      .filter(p => selectedPairIds.has(p.pair_id))
      .flatMap(p => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]);
    if (selectedMsgs.length === 0) return;

    setSelectMode(false);
    setSelectedPairIds(new Set());
    setDocBackgroundGenerating(true);
    const controller = new AbortController();
    docGenAbortRef.current = controller;

    try {
      const res = await fetch("/api/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: selectedMsgs,
          project_id: DEFAULT_PROJECT_ID,
          nickname,
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "fail");
      const title = data.doc?.title ?? "새 기획서";
      setDocCompletedNotice({ title });
      setDocNewDot(true);
      localStorage.setItem("jordan_doc_new_dot", "true");
      setDocReloadKey(k => k + 1);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") { /* 취소 */ }
      else alert(`기획서 작성 실패: ${String(err)}`);
    } finally {
      docGenAbortRef.current = null;
      setDocBackgroundGenerating(false);
    }
  }
  function cancelDocGen() {
    docGenAbortRef.current?.abort();
    docGenAbortRef.current = null;
    setDocBackgroundGenerating(false);
  }

  // 메시지 삭제·복사
  async function deletePair(pid: string) {
    if (!confirm("이 대화를 삭제할까요?")) return;
    setPairs(prev => prev.filter(p => p.pair_id !== pid));
    setActionForPair(null);
    try {
      await fetch("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair_id: pid, is_deleted: true }),
      });
    } catch { /* 무시 */ }
  }
  async function copyMessage(text: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* 무시 */ }
    setActionForPair(null);
  }

  function openMenu(key: "bible" | "docs" | "settings" | "guide") {
    setShowMenu(false);
    if (key === "bible") { setShowBible(true); setBibleNewDot(false); }
    if (key === "docs") {
      setShowDocs(true);
      setDocNewDot(false);
      if (typeof window !== "undefined") localStorage.removeItem("jordan_doc_new_dot");
    }
    if (key === "settings") setShowSettings(true);
    if (key === "guide") setShowGuide(true);
  }

  const isAdmin = nickname === "정민";

  return (
    <>
      {/* 선택 모드 헤더 (기획서 작성용) */}
      {selectMode && (
        <header className="px-3 py-2.5 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.5)", borderBottom: `1px solid rgba(100,180,255,0.4)` }}>
          <span className="text-xs font-medium flex-1" style={{ color: SILVER }}>
            <b style={{ color: "rgba(180,210,255,1)" }}>{selectedPairIds.size}개</b> 선택됨
          </span>
          <button
            onClick={generateDocument}
            disabled={selectedPairIds.size === 0}
            className="text-xs px-3 py-1.5 rounded-lg font-bold disabled:opacity-40"
            style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
          >✓ 작성</button>
          <button
            onClick={cancelSelectMode}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ backgroundColor: SILVER_FAINT, color: SILVER }}
          >취소</button>
        </header>
      )}

      {/* 일반 헤더 */}
      {!selectMode && (
      <header className="px-3 py-2.5 flex items-center gap-2 flex-shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.4)", borderBottom: `1px solid ${SILVER_FAINT}` }}>
        <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}>
          <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
        </div>
        <button onClick={() => setShowConvList(v => !v)} className="flex-1 min-w-0 text-left" title="대화방 전환">
          <p className="font-bold text-sm truncate flex items-center gap-1" style={{ color: SILVER }}>조던 <span style={{ fontSize: "9px", color: SILVER_DIM }}>▾</span></p>
          <p className="text-[10px] truncate" style={{ color: "rgba(180,210,255,0.9)" }}>💬 {conversations.find(c => c.id === currentConvId)?.title ?? "대화방"}</p>
        </button>

        {/* 핵심 버튼 — 책(바이블) + 기획서 */}
        <button
          onClick={() => openMenu("bible")}
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 relative"
          style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER, fontSize: "14px" }}
          aria-label="기획 바이블"
        >
          <span style={{ lineHeight: 1, display: "block" }}>📚</span>
          {bibleNewDot && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: "rgba(255,80,80,0.95)" }} />
          )}
        </button>
        <button
          onClick={() => openMenu("docs")}
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 relative"
          style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER, fontSize: "14px" }}
          aria-label="기획서"
        >
          <span style={{ lineHeight: 1, display: "block" }}>📄</span>
          {docNewDot && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: "rgba(255,80,80,0.95)" }} />
          )}
        </button>
        {docBackgroundGenerating && (
          <button
            onClick={cancelDocGen}
            className="flex items-center justify-center px-2 h-9 rounded-lg flex-shrink-0 gap-1"
            title="기획서 작성 중 — 누르면 취소"
            style={{ backgroundColor: "rgba(100,180,255,0.18)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)", fontSize: "10px" }}
          >
            <span className="inline-block w-2.5 h-2.5 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(180,210,255,0.3)", borderTopColor: "rgba(180,210,255,1)" }} />
            작성중
          </button>
        )}
        <button
          onClick={() => setShowMenu(v => !v)}
          className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
          style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
          aria-label="메뉴"
        >
          <span style={{ fontSize: "16px", lineHeight: 1 }}>☰</span>
        </button>
      </header>
      )}

      {/* 대화방 목록 (모바일) */}
      {showConvList && (
        <div className="fixed inset-0 z-40" onClick={() => setShowConvList(false)}>
          <div className="absolute top-14 left-2 right-2 rounded-xl shadow-2xl py-1 max-h-[60vh] overflow-y-auto" style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }} onClick={e => e.stopPropagation()}>
            <button onClick={createConversation} className="block w-full text-left text-sm px-4 py-2.5 font-bold" style={{ color: "#7dd3fc", borderBottom: `1px solid ${SILVER_FAINT}` }}>+ 새 대화방</button>
            {conversations.map(c => (
              <div key={c.id} className="flex items-center gap-1 px-2 py-1" style={{ backgroundColor: c.id === currentConvId ? "rgba(100,180,255,0.12)" : "transparent" }}>
                {renamingConvId === c.id ? (
                  <input value={convRenameInput} onChange={e => setConvRenameInput(e.target.value)} onBlur={() => renameConversation(c.id, convRenameInput)} onKeyDown={e => { if (e.key === "Enter") renameConversation(c.id, convRenameInput); if (e.key === "Escape") { setRenamingConvId(null); setConvRenameInput(""); } }} autoFocus className="flex-1 min-w-0 text-sm px-2 py-1.5 rounded outline-none" style={{ backgroundColor: "rgba(0,0,0,0.4)", border: "1px solid rgba(100,180,255,0.5)", color: "#e0e8f0" }} />
                ) : (
                  <button onClick={() => loadConversation(c.id)} className="flex-1 min-w-0 text-left text-sm px-2 py-2 truncate" style={{ color: c.id === currentConvId ? "rgba(180,210,255,1)" : "#d0d8e0" }}>{c.title}</button>
                )}
                <button onClick={() => { setRenamingConvId(c.id); setConvRenameInput(c.title); }} className="px-2 py-1 flex-shrink-0" style={{ color: SILVER_DIM, fontSize: "13px" }}>✏️</button>
                <button onClick={() => deleteConversation(c.id)} className="px-2 py-1 flex-shrink-0" style={{ color: "rgba(255,160,160,0.7)", fontSize: "13px" }}>🗑️</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 햄버거 드로어 */}
      {showMenu && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setShowMenu(false)}>
          <div
            className="w-3/4 max-w-xs h-full flex flex-col"
            style={{ backgroundColor: "#0a0e1a", borderLeft: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <p className="text-sm font-bold" style={{ color: SILVER }}>메뉴</p>
              <button onClick={() => setShowMenu(false)} className="text-xs px-2 py-1 rounded" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>✕</button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {/* 홈 화면 설치 — 아직 앱으로 설치 안 됐고 설치 가능할 때만 노출 */}
              {!isStandalone && installPrompt && (
                <MenuBtn icon={<InstallIcon />} label="홈 화면에 앱 설치" subtitle="한 번 탭하면 앱 아이콘으로 추가" onClick={handleInstall} />
              )}
              {!isStandalone && !installPrompt && isIosDevice && (
                <MenuBtn icon={<InstallIcon />} label="홈 화면에 추가" subtitle="사파리 공유 → '홈 화면에 추가'"
                  onClick={() => alert("사파리 하단의 공유 버튼(□↑)을 누른 뒤 '홈 화면에 추가'를 선택하면 조던이 앱으로 설치됩니다.")} />
              )}
              <MenuBtn icon="🎤" label={interviewLoading ? "분석 중..." : "조던에게 질문 받기"} subtitle="빈 영역 자동 분석 → 다음 결정 질문" onClick={startInterview} />
              <MenuBtn icon="📌" label={contextAnchorPairId ? "맥락선 해제" : "맥락선"} subtitle={contextAnchorPairId ? "이 시점부터 조던에게 전달 중" : "설정 안 됨"}
                onClick={() => { setShowMenu(false); if (contextAnchorPairId) clearContextAnchor(); }} />
              <MenuBtn icon="📚" label="기획 바이블" subtitle={`현재 ${decisionCount}개 누적`} onClick={() => openMenu("bible")} />
              {pairs.length > 0 && !docBackgroundGenerating && (
                <MenuBtn icon="📝" label="기획서 작성" subtitle="대화 선택해서 기획서 생성" onClick={enterSelectMode} />
              )}
              <MenuBtn icon="📄" label="기획서" subtitle="작성·열람·수정" onClick={() => openMenu("docs")} />
              {/* 화면 설계는 📄 기획서 뷰의 [🎨 화면 설계] 버튼으로 통합됨 */}
              <MenuBtn icon={<GearIcon />} label="설정" subtitle="출처표시·참고게임·관리도구" onClick={() => openMenu("settings")} />
              <MenuBtn icon="📖" label="가이드" subtitle="조던 사용법" onClick={() => openMenu("guide")} />
              <div className="px-4 py-3 mt-2" style={{ borderTop: `1px solid ${SILVER_FAINT}` }}>
                <p className="text-[10px]" style={{ color: SILVER_DIM }}>
                  닉네임: <b style={{ color: SILVER }}>{nickname}</b>{isAdmin && " (관리자)"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메시지 영역 */}
      <div ref={scrollRef} onScroll={handleMobileScroll} className="flex-1 overflow-y-auto px-3 py-4" style={{ scrollbarWidth: "thin" }}>
        <div className="space-y-4 max-w-xl mx-auto">
          {pairs.length === 0 && !streaming && (
            <div className="text-center mt-12 px-4">
              <div className="w-14 h-14 rounded-full mx-auto overflow-hidden mb-3" style={{ border: `1px solid ${SILVER_DIM}` }}>
                <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
              </div>
              <p className="text-sm font-medium mb-1" style={{ color: SILVER }}>조던</p>
              <p className="text-xs px-3 py-1.5 rounded-full inline-block" style={{ backgroundColor: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", color: "#34d399" }}>
                ✨ 다양한 수집형 게임 경험
              </p>
              <p className="text-xs mt-3" style={{ color: SILVER_DIM }}>
                AFK Arena · 세븐나이츠 · 니케 · 원신<br />무엇이든 물어봐
              </p>
            </div>
          )}
          {pairs.map(pair => {
            const isAnchor = pair.pair_id === contextAnchorPairId;
            const anchorIdx = contextAnchorPairId ? pairs.findIndex(p => p.pair_id === contextAnchorPairId) : -1;
            const myIdx = pairs.findIndex(p => p.pair_id === pair.pair_id);
            const isBeforeAnchor = anchorIdx >= 0 && myIdx < anchorIdx;
            const isSelected = selectedPairIds.has(pair.pair_id);
            return (
              <div
                key={pair.pair_id}
                onClick={selectMode ? () => togglePairSelect(pair.pair_id) : undefined}
                className={`space-y-2 ${selectMode ? "cursor-pointer rounded-lg p-1" : ""}`}
                style={{
                  opacity: isBeforeAnchor ? 0.4 : 1,
                  backgroundColor: selectMode && isSelected ? "rgba(100,180,255,0.08)" : undefined,
                  border: selectMode ? `1px solid ${isSelected ? "rgba(100,180,255,0.4)" : "transparent"}` : undefined,
                }}>
                {isAnchor && (
                  <div className="flex items-center gap-2 py-1" style={{ color: "rgba(255,200,100,0.9)" }}>
                    <div className="flex-1" style={{ borderTop: "1px dashed rgba(255,200,100,0.6)" }} />
                    <span className="text-[10px] font-medium flex items-center gap-1">
                      📌 맥락선
                      <button onClick={clearContextAnchor} className="px-1 rounded hover:bg-white/10" style={{ color: "rgba(255,200,100,0.8)" }}>✕</button>
                    </span>
                    <div className="flex-1" style={{ borderTop: "1px dashed rgba(255,200,100,0.6)" }} />
                  </div>
                )}
                {/* 내 질문 */}
                <div className="flex justify-end items-end gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); setContextAnchor(pair.pair_id, pair.timestamp ?? new Date().toISOString()); }}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: isAnchor ? "rgba(255,200,100,0.3)" : "rgba(255,200,100,0.1)",
                      color: "rgba(255,220,150,0.9)",
                    }}
                    title="이 시점에 맥락선 설정"
                  >📌</button>
                  {!selectMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setActionForPair(pair.pair_id); }}
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        backgroundColor: "rgba(192,200,216,0.12)",
                        border: "1px solid rgba(192,200,216,0.3)",
                        color: SILVER_DIM,
                      }}
                      title="이 대화 복사·삭제 도구"
                      aria-label="메시지 도구"
                    >🛠️</button>
                  )}
                  <div className="flex flex-col items-end gap-1.5 max-w-[78%]">
                    {pair.user.image_id && (
                      <img src={`/api/img/${pair.user.image_id}`} alt="첨부 이미지"
                        className="rounded-xl max-h-72 w-auto cursor-pointer"
                        style={{ border: `1px solid ${SILVER_FAINT}` }}
                        onClick={(e) => { e.stopPropagation(); window.open(`/api/img/${pair.user.image_id}`, "_blank"); }} />
                    )}
                    <div
                      onClick={(e) => { if (!selectMode) { e.stopPropagation(); setActionForPair(pair.pair_id); } }}
                      className="px-3 py-2 rounded-2xl rounded-tr-sm text-sm whitespace-pre-wrap"
                      style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
                    >
                      {pair.user.content}
                    </div>
                  </div>
                </div>
                {/* 조던 답변 */}
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}>
                    <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="px-3 py-2 rounded-2xl rounded-tl-sm text-sm prose prose-sm max-w-none"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                      <MemoMarkdown text={pair.assistant.content} />
                    </div>
                    {/* 답변 도구 — 자세한 답변 + 피드백 */}
                    <div className="flex items-center gap-3 mt-1.5 ml-1">
                      <button
                        onClick={() => loadDetail(pair.pair_id)}
                        className="text-[10px]"
                        style={{ color: pair.detail_failed ? "rgba(255,180,180,0.95)" : SILVER_DIM }}
                      >
                        {pair.detail_loading ? "⏳ 불러오는 중" : pair.detail_failed ? "⚠️ 자세히 실패 — ↻ 재시도" : pair.detail_shown ? "▲ 접기" : "▼ 자세히"}
                      </button>
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          onClick={() => submitFeedback(pair.pair_id, "accurate")}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: feedbacks[pair.pair_id] === "accurate" ? "rgba(100,220,160,0.2)" : "transparent",
                            color: feedbacks[pair.pair_id] === "accurate" ? "rgba(150,255,200,1)" : SILVER_DIM,
                            opacity: feedbacks[pair.pair_id] === "inaccurate" ? 0.3 : 1,
                          }}
                        >👍</button>
                        <button
                          onClick={() => { setReasonInputPairId(pair.pair_id); setReasonInputText(""); }}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: feedbacks[pair.pair_id] === "inaccurate" ? "rgba(255,140,140,0.2)" : "transparent",
                            color: feedbacks[pair.pair_id] === "inaccurate" ? "rgba(255,180,180,1)" : SILVER_DIM,
                            opacity: feedbacks[pair.pair_id] === "accurate" ? 0.3 : 1,
                          }}
                        >👎</button>
                      </div>
                    </div>
                    {/* 자세한 답변 본문 */}
                    {pair.detail_shown && pair.detail_content && (
                      <div className="px-3 py-2 rounded-2xl text-sm prose prose-sm max-w-none mt-1.5"
                        style={{ backgroundColor: "rgba(192,200,216,0.07)", border: `1px solid rgba(192,200,216,0.25)`, color: "#e0e8f0" }}>
                        <MemoMarkdown text={pair.detail_content} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {streaming && (
            <div className="space-y-2">
              <div className="flex justify-end items-end gap-2">
                {streamFailed && (
                  <button
                    onClick={retryStream}
                    className="text-[10px] px-2 py-1 rounded font-medium"
                    style={{ backgroundColor: "rgba(100,180,255,0.15)", color: "rgba(180,210,255,1)", border: "1px solid rgba(100,180,255,0.45)" }}
                  >↻ 재시도</button>
                )}
                <button
                  onClick={cancelStream}
                  className="text-[10px] px-2 py-1 rounded"
                  style={{ backgroundColor: "rgba(255,80,80,0.12)", color: "#f87171", border: "1px solid rgba(255,80,80,0.35)" }}
                >취소</button>
                <div className="flex flex-col items-end gap-1.5 max-w-[80%]">
                  {streaming.userImageId && (
                    <img src={`/api/img/${streaming.userImageId}`} alt="첨부 이미지"
                      className="rounded-xl max-h-72 w-auto" style={{ border: `1px solid ${SILVER_FAINT}` }} />
                  )}
                  <div className="px-3 py-2 rounded-2xl rounded-tr-sm text-sm" style={{ backgroundColor: SILVER, color: "#0a0e1a" }}>
                    {streaming.user}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0" style={{ border: `1px solid ${SILVER_DIM}` }}>
                  <img src="/avatar.jpg" alt="조던" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="px-3 py-2 rounded-2xl rounded-tl-sm text-sm prose prose-sm max-w-none"
                    style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0" }}>
                    {streaming.assistant
                      ? <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }]]}>{streaming.assistant}</ReactMarkdown>
                      : streamFailed
                        ? <span style={{ color: "rgba(255,180,180,0.95)" }}>⚠️ 연결이 끊겼어요. 잠시 후 자동으로 다시 시도하거나, 위 <b>↻ 재시도</b>를 눌러주세요.</span>
                        : <span style={{ color: SILVER_DIM }} className="animate-pulse">···</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 아래로 스크롤 — 누르면 자동스크롤 재개 */}
      {showScrollBtn && (
        <button
          onClick={() => { userScrolledUpRef.current = false; const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; setShowScrollBtn(false); }}
          className="fixed right-4 bottom-20 w-10 h-10 rounded-full flex items-center justify-center text-base shadow-lg z-30"
          style={{ backgroundColor: SILVER, color: "#0a0e1a", boxShadow: "0 4px 15px rgba(192,200,216,0.4)" }}
          aria-label="맨 아래로"
        >↓</button>
      )}

      {/* 입력창 */}
      <div className="flex-shrink-0" style={{ backgroundColor: "rgba(0,0,0,0.5)", borderTop: `1px solid ${SILVER_FAINT}` }}>
        {/* 참고/수정 도구 바 */}
        <div className="px-3 pt-2 flex items-center gap-1.5 flex-wrap">
          <button onClick={() => setShowRefPicker(true)}
            className="text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1"
            style={{ backgroundColor: refDocIds.length ? "rgba(100,180,255,0.18)" : "rgba(255,255,255,0.05)", border: `1px solid ${refDocIds.length ? "rgba(100,180,255,0.4)" : SILVER_FAINT}`, color: refDocIds.length ? "rgba(180,210,255,1)" : SILVER_DIM }}>
            📑 참고 기획서{refDocIds.length ? ` ${refDocIds.length}` : ""}
          </button>
          <button onClick={() => startConversationRevise()}
            disabled={reviseGenLoading}
            className="text-[11px] px-2.5 py-1 rounded-full flex items-center gap-1 disabled:opacity-50"
            style={{ backgroundColor: reviseTargetDocId ? "rgba(180,140,255,0.2)" : "rgba(255,255,255,0.05)", border: `1px solid ${reviseTargetDocId ? "rgba(180,140,255,0.45)" : SILVER_FAINT}`, color: reviseTargetDocId ? "rgba(210,190,255,1)" : SILVER_DIM }}>
            {reviseGenLoading ? "🛠️ 수정본 생성 중..." : reviseTargetDocId ? "🛠️ 이 대화로 수정" : "🛠️ 대화로 기획서 수정"}
          </button>
          {reviseTargetDocId && (
            <span className="text-[11px] flex items-center gap-1" style={{ color: SILVER_DIM }}>
              {reviseTargetTitle ? `대상: ${reviseTargetTitle}` : "대상 지정됨"}
              <button onClick={() => { setReviseTargetDocId(null); setReviseTargetTitle(""); }} style={{ color: "#f08a8a" }}>✕</button>
            </span>
          )}
        </div>
        {/* 첨부 이미지 미리보기 */}
        {(attachedImage || imageUploading) && (
          <div className="px-3 pt-2.5 flex items-center gap-2">
            {imageUploading && !attachedImage ? (
              <span className="text-xs animate-pulse" style={{ color: SILVER_DIM }}>🖼️ 이미지 처리 중...</span>
            ) : attachedImage && (
              <div className="relative inline-block">
                <img src={attachedImage.dataUrl} alt="첨부 미리보기" className="h-16 w-auto rounded-lg" style={{ border: `1px solid ${SILVER_FAINT}` }} />
                <button onClick={() => setAttachedImage(null)}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                  style={{ backgroundColor: "rgba(20,28,44,0.95)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}>✕</button>
              </div>
            )}
          </div>
        )}
        <div className="px-3 py-2.5 flex gap-2 items-end">
        {/* 숨김 파일 input + 첨부 버튼 */}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { handleImagePick(e.target.files?.[0]); e.currentTarget.value = ""; }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          title="이미지 첨부"
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40"
          style={{ backgroundColor: "rgba(255,255,255,0.07)", border: `1px solid ${SILVER_FAINT}`, color: SILVER }}
        >
          📎
        </button>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          // 모바일은 Enter=줄바꿈(기본 동작), 전송은 ➤ 버튼만 담당 (자판 엔터로 실수 전송 방지)
          onFocus={() => simulateKeyboard && setKeyboardOpen(true)}
          onBlur={() => simulateKeyboard && setKeyboardOpen(false)}
          placeholder={isLoading ? "답변 생성 중 — 미리 입력해두면 완료 후 ➤로 전송" : "질문해줘..."}
          rows={1}
          className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none resize-none"
          // fontSize 16px: iOS 사파리는 16px 미만 입력칸에 포커스 시 화면을 자동 확대하므로 16px로 고정해 줌인 방지
          style={{ backgroundColor: "rgba(255,255,255,0.07)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", maxHeight: "120px", lineHeight: "1.45", fontSize: "16px" }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 120) + "px";
          }}
        />
        {voiceSupported && (
          <button
            onClick={toggleVoice}
            disabled={isLoading}
            title={voiceListening ? "음성 입력 중지" : "음성으로 입력"}
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 disabled:opacity-40"
            style={{
              backgroundColor: voiceListening ? "rgba(255,90,90,0.85)" : "rgba(255,255,255,0.07)",
              border: `1px solid ${voiceListening ? "rgba(255,120,120,0.9)" : SILVER_FAINT}`,
              color: voiceListening ? "#fff" : SILVER,
              animation: voiceListening ? "voicePulse 1.2s ease-in-out infinite" : undefined,
            }}
          >
            🎤
          </button>
        )}
        <button
          onClick={sendMessage}
          disabled={isLoading || (!input.trim() && !attachedImage)}
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold disabled:opacity-40"
          style={{ backgroundColor: SILVER, color: "#0a0e1a" }}
        >
          ➤
        </button>
        </div>
      </div>

      {/* PC 프레임 모드 — 가짜 키보드 시뮬레이션 (실제 모바일에선 진짜 키보드가 뜸) */}
      {simulateKeyboard && keyboardOpen && (
        <div
          className="flex-shrink-0 flex flex-col"
          style={{
            height: "280px",
            backgroundColor: "#1c1c1e",
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {/* 키보드 상단 toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5" style={{ backgroundColor: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <button
              onMouseDown={(e) => { e.preventDefault(); inputRef.current?.blur(); }}
              className="text-xs"
              style={{ color: "#8e8e93" }}
            >완료</button>
            <p className="text-[10px]" style={{ color: "#6e6e73" }}>🎹 가짜 키보드 (시뮬레이션)</p>
          </div>
          {/* 자판 (단순 시각화) */}
          <div className="flex-1 p-2 grid grid-cols-10 gap-1">
            {["ㅂ","ㅈ","ㄷ","ㄱ","ㅅ","ㅛ","ㅕ","ㅑ","ㅐ","ㅔ",
              "ㅁ","ㄴ","ㅇ","ㄹ","ㅎ","ㅗ","ㅓ","ㅏ","ㅣ",".",
              "ㅋ","ㅌ","ㅊ","ㅍ","ㅠ","ㅜ","ㅡ","","",""].map((k, i) => (
              <div
                key={i}
                className="flex items-center justify-center rounded-md text-xs"
                style={{
                  backgroundColor: k ? "rgba(255,255,255,0.12)" : "transparent",
                  color: "#fff",
                  minHeight: "32px",
                }}
              >{k}</div>
            ))}
          </div>
          {/* 키보드 하단 */}
          <div className="flex items-center justify-around px-3 py-2" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
            <span className="text-[10px]" style={{ color: "#8e8e93" }}>한/영</span>
            <span className="text-[10px]" style={{ color: "#8e8e93" }}>스페이스</span>
            <span className="text-[10px]" style={{ color: "#8e8e93" }}>↵</span>
          </div>
        </div>
      )}

      {/* 모달들 — 기존 컴포넌트 재사용 */}
      <DecisionPanel
        open={showBible}
        onClose={() => setShowBible(false)}
        projectId={DEFAULT_PROJECT_ID}
        nickname={nickname}
        onCountChange={setDecisionCount}
        reloadKey={decisionReloadKey}
        categoryReloadKey={categoryReloadKey}
      />
      <DocumentView
        open={showDocs}
        onClose={() => setShowDocs(false)}
        projectId={DEFAULT_PROJECT_ID}
        nickname={nickname}
        reloadKey={docReloadKey}
        onCategoriesChanged={() => setCategoryReloadKey(k => k + 1)}
        onDecisionsChanged={() => setDecisionReloadKey(k => k + 1)}
        onStartWriting={(subId, label) => startInterviewForCategory(subId, label)}
        onReviseViaChat={(docId, docTitle) => enterReviseViaChat(docId, docTitle)}
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
      {/* 대화 기반 수정 — 색상 diff 미리보기 + 적용 */}
      <DocRevisePreview
        open={!!revisePreview}
        preview={revisePreview}
        nickname={nickname}
        onClose={() => setRevisePreview(null)}
        onApplied={() => {
          setRevisePreview(null);
          setReviseTargetDocId(null);
          setReviseTargetTitle("");
          setDocReloadKey(k => k + 1);
          setDocNewDot(true);
          localStorage.setItem("jordan_doc_new_dot", "true");
        }}
      />

      {/* 설정 모달 */}
      {showSettings && (
        <MobileSettings
          isAdmin={isAdmin}
          showCitations={showCitations}
          setShowCitations={setShowCitations}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 가이드 모달 */}
      {showGuide && <MobileGuide onClose={() => setShowGuide(false)} />}

      {/* 화면 설계는 DocumentView 안으로 통합됨 */}

      {/* 자동 추출 검토 카드 */}
      {showExtractedReview && extractedItems.length > 0 && (
        <ExtractedReviewCard
          items={extractedItems}
          onClose={() => { setShowExtractedReview(false); setExtractedItems([]); }}
          onChanged={() => setDecisionReloadKey(k => k + 1)}
        />
      )}

      {/* 메시지 액션 시트 (bottom sheet) */}
      {actionForPair && (() => {
        const p = pairs.find(p => p.pair_id === actionForPair);
        if (!p) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setActionForPair(null)}>
            <div
              className="w-full rounded-t-2xl flex flex-col"
              style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
                <p className="text-xs" style={{ color: SILVER_DIM }}>메시지 동작</p>
              </div>
              <button
                onClick={() => copyMessage(p.user.content)}
                className="px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-2"
                style={{ color: SILVER }}
              >
                <span>⎘</span> 내 질문 복사
              </button>
              <button
                onClick={() => copyMessage(p.assistant.content)}
                className="px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-2"
                style={{ color: SILVER }}
              >
                <span>⎘</span> 조던 답변 복사
              </button>
              <button
                onClick={() => deletePair(p.pair_id)}
                className="px-4 py-3 text-left text-sm hover:bg-white/5 flex items-center gap-2"
                style={{ color: "rgba(255,180,180,0.9)" }}
              >
                <span>🗑️</span> 이 대화 삭제
              </button>
              <button
                onClick={() => setActionForPair(null)}
                className="px-4 py-3 text-center text-sm font-medium"
                style={{ backgroundColor: SILVER_FAINT, color: SILVER, borderTop: `1px solid ${SILVER_FAINT}` }}
              >취소</button>
            </div>
          </div>
        );
      })()}

      {/* 기획서 작성 완료 알림 */}
      {docCompletedNotice && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-sm max-w-[90vw]"
          style={{ backgroundColor: "rgba(15,25,40,0.97)", border: "1px solid rgba(100,180,255,0.6)", color: "rgba(180,210,255,1)" }}>
          <span style={{ fontSize: "16px" }}>📄</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs">기획서 완료</p>
            <p className="text-[10px] truncate" style={{ color: "rgba(180,210,255,0.7)" }}>{docCompletedNotice.title}</p>
          </div>
          <button
            onClick={() => { setDocCompletedNotice(null); setShowDocs(true); setDocNewDot(false); localStorage.removeItem("jordan_doc_new_dot"); }}
            className="text-[10px] px-2 py-1 rounded-lg font-medium"
            style={{ backgroundColor: "rgba(100,180,255,0.25)", border: "1px solid rgba(100,180,255,0.5)", color: "rgba(180,210,255,1)" }}
          >바로 보기</button>
          <button onClick={() => setDocCompletedNotice(null)} className="text-[10px] px-1.5" style={{ color: "rgba(180,210,255,0.6)" }}>✕</button>
        </div>
      )}

      {/* 부정확 사유 입력 */}
      {reasonInputPairId && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4" onClick={() => setReasonInputPairId(null)}>
          <div
            className="w-full rounded-2xl shadow-2xl flex flex-col"
            style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
              <p className="text-sm font-bold" style={{ color: "rgba(255,180,180,1)" }}>👎 부정확한 부분</p>
              <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>구체적으로 알려주면 다음 답변에 반영돼요</p>
            </div>
            <div className="px-4 py-3 flex flex-col gap-3">
              <textarea
                value={reasonInputText}
                onChange={(e) => setReasonInputText(e.target.value)}
                placeholder="예: 5월 14일 업데이트 정보가 틀림"
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                // fontSize 16px: iOS 자동 확대(줌인) 방지
                style={{ backgroundColor: "rgba(255,255,255,0.05)", border: `1px solid ${SILVER_FAINT}`, color: "#e0e8f0", fontSize: "16px" }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setReasonInputPairId(null)} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER }}>취소</button>
                <button onClick={submitReason} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: "rgba(255,180,180,0.2)", border: "1px solid rgba(255,180,180,0.5)", color: "rgba(255,200,200,1)" }}>전송</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── 메뉴 버튼 ──────────────────────────────────────────────────────
// 톱니바퀴 — 인라인 SVG(폰트 폴백 영향 없이 정중앙 정렬). 이모지 ⚙️는 Twemoji 서브셋 누락으로 어긋남
function GearIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
    </svg>
  );
}

function MenuBtn({ icon, label, subtitle, onClick }: {
  icon: ReactNode; label: string; subtitle?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2.5 text-left flex items-center gap-3 hover:bg-white/5"
      style={{ color: SILVER }}
    >
      {/* 아이콘 고정폭·중앙정렬 — 이모지 폭이 제각각이어도 라벨 시작점이 일정하게 정렬됨 */}
      <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: "22px", fontSize: "16px", lineHeight: 1 }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {subtitle && <p className="text-[10px] truncate" style={{ color: SILVER_DIM }}>{subtitle}</p>}
      </div>
    </button>
  );
}

// ── 모바일 설정 모달 ──────────────────────────────────────────────
function MobileSettings({
  isAdmin, showCitations, setShowCitations, onClose,
}: {
  isAdmin: boolean;
  showCitations: boolean;
  setShowCitations: (v: boolean) => void;
  onClose: () => void;
}) {
  const [showGameModal, setShowGameModal] = useState(false);
  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[85dvh] flex flex-col rounded-t-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <div>
            <p className="text-sm font-bold flex items-center gap-2" style={{ color: SILVER }}>⚙️ 설정</p>
            <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>{isAdmin ? "관리자 모드" : "뷰어 모드"}</p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] space-y-4">
          {/* 출처 표시 */}
          <section>
            <p className="text-xs font-bold mb-2" style={{ color: "rgba(150,255,200,1)" }}>🏷️ 답변 표시</p>
            <div className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex-1">
                <p className="text-xs font-medium" style={{ color: SILVER }}>출처 표시</p>
                <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>답변에 [공식 인용] 같은 라벨</p>
              </div>
              <button
                onClick={() => setShowCitations(!showCitations)}
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
          </section>

          {/* 참고 게임 — 데스크톱과 동일(공용 REFERENCE_GAMES). 탭하면 라이브러리 모달 */}
          <section>
            <p className="text-xs font-bold mb-2" style={{ color: "rgba(180,210,255,1)" }}>🎮 참고 게임</p>
            <div className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium" style={{ color: SILVER }}>등록된 게임 라이브러리</p>
                <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>조던이 분석에 활용하는 신뢰 게임 {REFERENCE_GAMES.length}종</p>
              </div>
              <button
                onClick={() => setShowGameModal(true)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium ml-2 flex-shrink-0"
                style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
              >자세히 →</button>
            </div>
          </section>

          {/* 관리 도구 */}
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
                <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>{isAdmin ? "신뢰 사이트 등록" : "정민만 접근 가능"}</p>
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

          {/* 화면 모드 */}
          <section>
            <p className="text-xs font-bold mb-2" style={{ color: "rgba(180,210,255,1)" }}>📱 화면 모드</p>
            <div className="px-3 py-2.5 rounded-lg flex items-center justify-between" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex-1">
                <p className="text-xs font-medium" style={{ color: SILVER }}>PC 뷰로 강제 전환</p>
                <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>현재 모바일 자동 감지</p>
              </div>
              <button
                onClick={() => { window.location.href = "/chat?view=desktop"; }}
                className="text-xs px-3 py-1.5 rounded-lg font-medium ml-2 flex-shrink-0"
                style={{ backgroundColor: SILVER_FAINT, border: `1px solid ${SILVER_DIM}`, color: SILVER }}
              >🖥️ 전환</button>
            </div>
          </section>

          {/* 답변 모델 */}
          <section>
            <p className="text-xs font-bold mb-2" style={{ color: "rgba(200,180,255,1)" }}>🤖 답변 모델</p>
            <div className="px-3 py-2.5 rounded-lg flex flex-col gap-1.5" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: `1px solid ${SILVER_FAINT}` }}>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: SILVER }}>최종 답변</p>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ backgroundColor: "rgba(200,180,255,0.18)", color: "rgba(220,200,255,1)" }}>Opus 4.7</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: SILVER }}>기획서 작성</p>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ backgroundColor: "rgba(200,180,255,0.18)", color: "rgba(220,200,255,1)" }}>Opus 4.7</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: SILVER }}>내부 분석</p>
                <span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{ backgroundColor: "rgba(100,180,255,0.15)", color: "rgba(180,210,255,1)" }}>Sonnet 4.5</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    {/* 참고 게임 라이브러리 모달 — 설정 위에 표시(z-[60]). 데스크톱과 동일 데이터 */}
    {showGameModal && (
      <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setShowGameModal(false)}>
        <div
          className="w-full max-h-[85dvh] flex flex-col rounded-t-2xl"
          style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
            <div>
              <p className="text-sm font-bold" style={{ color: SILVER }}>🎮 참고 게임 라이브러리 ({REFERENCE_GAMES.length}개)</p>
              <p className="text-[10px] mt-0.5" style={{ color: SILVER_DIM }}>조던이 검증된 신뢰 출처로 분석하는 등록 게임</p>
            </div>
            <button onClick={() => setShowGameModal(false)} className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] space-y-3">
            {REFERENCE_GAMES.map((game) => (
              <div key={game.name} className="rounded-xl p-3" style={{ backgroundColor: "rgba(192,200,216,0.05)", border: `1px solid ${SILVER_FAINT}` }}>
                <div className="mb-2">
                  <p className="text-sm font-bold" style={{ color: SILVER }}>{game.name}</p>
                  <p className="text-[10px]" style={{ color: SILVER_DIM }}>{game.studio}</p>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {game.tags.map((tag) => (
                      <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(192,200,216,0.1)", border: `1px solid ${SILVER_FAINT}`, color: SILVER_DIM }}>{tag}</span>
                    ))}
                  </div>
                </div>
                <ul className="space-y-1 mb-2">
                  {game.items.map((item, i) => (
                    <li key={i} className="text-[11px] flex gap-2" style={{ color: "#b8c4d4" }}>
                      <span style={{ color: SILVER_DIM, flexShrink: 0 }}>•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="pt-2 mt-2" style={{ borderTop: `1px dashed ${SILVER_FAINT}` }}>
                  <p className="text-[10px] mb-1.5" style={{ color: SILVER_DIM }}>🔎 검색 신뢰 출처</p>
                  <div className="flex flex-wrap gap-1">
                    {game.sources.map((src) => (
                      <span key={src} className="text-[10px] px-2 py-0.5 rounded" style={{ backgroundColor: "rgba(100,180,255,0.08)", border: "1px solid rgba(100,180,255,0.25)", color: "rgba(180,210,255,0.9)" }}>{src}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

// ── 모바일 가이드 모달 ────────────────────────────────────────────
function MobileGuide({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full max-h-[85dvh] flex flex-col rounded-t-2xl"
        style={{ backgroundColor: "#0f1628", border: `1px solid ${SILVER_FAINT}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: `1px solid ${SILVER_FAINT}` }}>
          <p className="text-sm font-bold flex items-center gap-2" style={{ color: SILVER }}>📖 사용 가이드</p>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ backgroundColor: SILVER_FAINT, color: SILVER_DIM }}>닫기</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] space-y-3 text-xs" style={{ color: "#b8c4d4", lineHeight: 1.55 }}>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(150,255,200,1)" }}>🤖 조던이란?</p>
            <p>영웅수집형 게임 디렉터 AI. 분석부터 기획까지 같이 풀어가자.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(100,210,255,1)" }}>💬 대화방 (병렬 작업)</p>
            <p>상단 <b>조던 ▾</b>(또는 💬)을 탭하면 대화방 목록. <b>새 대화방</b>으로 주제별 병렬 작업 — 방마다 대화·맥락이 독립이라 안 섞여요. 단 <b>기획 바이블·기획서는 전 방 공유</b>. 이름변경·삭제 가능. (기존 대화는 "기본 대화" 방에 보존)</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(150,255,200,1)" }}>🖼️ 이미지 첨부 분석</p>
            <p>입력창 <b>📎</b>로 게임 UI 스크린샷·와이어프레임·경쟁작 화면을 첨부하면, 조던이 <b>직접 보고</b> UX 평가·개선점·의견을 줘요. (Opus 비전)</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(150,255,200,1)" }}>📑 참고 기획서 / 🛠️ 대화로 수정</p>
            <p>입력창 위 <b>📑 참고 기획서</b>로 기존 기획서를 체크하면 조던이 보고 답해요(교차 참고·충돌 감지). <b>🛠️ 대화로 기획서 수정</b>은 맥락선 범위 대화로 기존 기획서를 수정 — 색상 미리보기(🟢추가/🟡수정/🔴삭제) 확인 후 적용(자동 백업).</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(180,210,255,1)" }}>📚 기획 바이블</p>
            <p>대화하면서 결정한 내용을 자동으로 누적·저장. 모든 기획서 작성 시 참조됨.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(180,210,255,1)" }}>📄 기획서</p>
            <p>대화 기반·바이블 기반 기획서 생성. 자연어로 수정 요청 가능. MD/HTML/PDF 내보내기.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(255,220,150,1)" }}>📌 맥락선</p>
            <p>메시지 옆 압정(📌) 탭 → 이 시점 이후만 조던에게 전달. 토큰 절약 + 새 주제 집중.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(200,180,255,1)" }}>⚙️ 설정</p>
            <p>출처 표시 토글, 참고 게임 라이브러리, 게임 도메인 큐레이션(관리자), 답변 모델 정보 확인.</p>
          </section>
          <section>
            <p className="font-bold mb-1.5" style={{ color: "rgba(150,255,200,1)" }}>💡 팁</p>
            <p>모바일과 PC는 같은 데이터를 공유해요. 둘 다 같은 닉네임으로 입장하면 대화·바이블·기획서가 자동 동기화됩니다.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
