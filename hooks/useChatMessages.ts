"use client";

// 채팅 메시지 송수신 hook — 데스크톱·모바일 공유
// page.tsx에서 추출

import { useState, useRef, useEffect, useCallback } from "react";
import type { ExtractedItem } from "@/components/ExtractedReviewCard";

export type Message = { role: "user" | "assistant"; content: string };
export type CriticEntry = { round: number; approved: boolean; feedback: string };

export type MessagePair = {
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

interface SendMessageOpts {
  showCitations?: boolean;
  contextAnchorPairId?: string | null;
  contextAnchorTimestamp?: string | null;
  agentContext?: string;
}

// 토큰 한도 초과로 잘린 경우 불완전한 마지막 줄 제거
function cleanTruncated(text: string): string {
  const clean = text.replace("__TRUNCATED__", "").trimEnd();
  if (/([요다죠네해)]|[!?.。！？])\s*$/.test(clean)) return clean;
  const lastNL = clean.lastIndexOf("\n");
  if (lastNL > 0) return clean.slice(0, lastNL).trimEnd();
  return clean;
}

export function useChatMessages(sessionId: string | null) {
  const [pairs, setPairs] = useState<MessagePair[]>([]);
  const [streamingPair, setStreamingPair] = useState<{ user: string; assistant: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingRawRef = useRef<string>("");

  // 추출된 결정 데이터 (UI에서 ExtractedReviewCard로 사용)
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [extractedNoticeCount, setExtractedNoticeCount] = useState<number | null>(null);
  const [heldNoticeCount, setHeldNoticeCount] = useState<number | null>(null);

  // 메시지 로드
  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/messages?session_id=${encodeURIComponent(sessionId)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.messages?.length) return;
        const pairMap = new Map<string, { user?: Message; assistant?: Message; is_deleted: boolean }>();
        const order: string[] = [];
        for (const m of data.messages) {
          const pid = m.pair_id ?? "unknown";
          if (!pairMap.has(pid)) { pairMap.set(pid, { is_deleted: m.is_deleted ?? false }); order.push(pid); }
          const e = pairMap.get(pid)!;
          if (m.role === "user") e.user = m;
          else e.assistant = m;
          if (m.is_deleted) e.is_deleted = true;
        }
        setPairs(order.map(pid => {
          const e = pairMap.get(pid)!;
          if (!e.user || !e.assistant) return null;
          return { pair_id: pid, user: e.user, assistant: e.assistant, is_deleted: e.is_deleted };
        }).filter(Boolean) as MessagePair[]);
      })
      .catch(() => {});
  }, [sessionId]);

  // 메시지 전송
  const sendMessage = useCallback(async (text: string, opts: SendMessageOpts = {}): Promise<{ pair_id: string; cleanText: string } | null> => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || !sessionId) return null;
    const pairId = crypto.randomUUID();
    const now = new Date();
    const timestamp = `${now.getHours() >= 12 ? "오후" : "오전"} ${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, "0")}`;

    // 맥락 anchor 적용
    const visiblePairs = pairs.filter(p => !p.is_deleted);
    let relevantPairs = visiblePairs;
    if (opts.contextAnchorPairId) {
      const idx = visiblePairs.findIndex(p => p.pair_id === opts.contextAnchorPairId);
      if (idx >= 0) relevantPairs = visiblePairs.slice(idx);
    }
    const allMessages: Message[] = [
      ...relevantPairs.flatMap(p => [
        { role: p.user.role, content: p.user.content },
        { role: p.assistant.role, content: p.assistant.content },
      ]),
      { role: "user" as const, content: trimmed },
    ];

    setStreamingPair({ user: trimmed, assistant: "" });
    setIsLoading(true);
    streamingRawRef.current = "";
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: allMessages,
          session_id: sessionId,
          pair_id: pairId,
          agentContext: opts.agentContext ?? "",
          show_citations: opts.showCitations ?? false,
          context_anchor_time: opts.contextAnchorTimestamp ?? null,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error("error");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value);
        streamingRawRef.current = assistantText;
        let display = assistantText.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__$/, "");
        const idx = display.indexOf("__JORDAN_ANSWER_START__");
        if (idx !== -1) display = display.slice(idx + "__JORDAN_ANSWER_START__".length).trimStart();
        display = display.replace(/__DECISIONS_DATA__[\s\S]+?__END__/g, "");
        display = display.replace(/__DECISIONS_(EXTRACTED|HELD)__\d+/g, "");
        display = display.replace("__TRUNCATED__", "");
        setStreamingPair({ user: trimmed, assistant: display });
      }

      // 메타데이터 파싱
      const criticMatch = assistantText.match(/__JORDAN_CRITIC_START__([\s\S]*?)__JORDAN_CRITIC_END__/);
      let criticHistory: CriticEntry[] | undefined;
      let cleanText = assistantText;
      if (criticMatch) {
        try { criticHistory = JSON.parse(criticMatch[1]); } catch { /* 무시 */ }
        cleanText = cleanText.replace(/\n__JORDAN_CRITIC_START__[\s\S]*?__JORDAN_CRITIC_END__/, "");
      }

      // 추출 카운트
      const extractedMatch = assistantText.match(/__DECISIONS_EXTRACTED__(\d+)/);
      if (extractedMatch && parseInt(extractedMatch[1], 10) > 0) {
        const cnt = parseInt(extractedMatch[1], 10);
        setExtractedNoticeCount(cnt);
        setTimeout(() => setExtractedNoticeCount(null), 7000);
      }
      cleanText = cleanText.replace(/__DECISIONS_EXTRACTED__\d+/, "");

      // 추출 데이터
      const dataMatch = assistantText.match(/__DECISIONS_DATA__([\s\S]+?)__END__/);
      if (dataMatch) {
        try {
          const items = JSON.parse(dataMatch[1]) as ExtractedItem[];
          if (items.length > 0) setExtractedItems(items);
        } catch { /* 무시 */ }
        cleanText = cleanText.replace(/__DECISIONS_DATA__[\s\S]+?__END__/, "");
      }

      // 보류
      const heldMatch = assistantText.match(/__DECISIONS_HELD__(\d+)/);
      if (heldMatch) {
        const cnt = parseInt(heldMatch[1], 10);
        if (cnt > 0) {
          setHeldNoticeCount(cnt);
          setTimeout(() => setHeldNoticeCount(null), 7000);
        }
        cleanText = cleanText.replace(/__DECISIONS_HELD__\d+/, "");
      }

      const startIdx = cleanText.indexOf("__JORDAN_ANSWER_START__");
      if (startIdx !== -1) cleanText = cleanText.slice(startIdx + "__JORDAN_ANSWER_START__".length).trimStart();
      if (cleanText.includes("__TRUNCATED__")) cleanText = cleanTruncated(cleanText);

      setPairs(prev => [...prev, {
        pair_id: pairId,
        user: { role: "user", content: trimmed, pair_id: pairId } as unknown as Message,
        assistant: { role: "assistant", content: cleanText, pair_id: pairId } as unknown as Message,
        is_deleted: false,
        timestamp,
        critic_history: criticHistory,
      }]);
      setStreamingPair(null);
      return { pair_id: pairId, cleanText };
    } catch {
      // AbortError 등
      return null;
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  }, [pairs, isLoading, sessionId]);

  const cancelAndDiscard = useCallback(() => {
    abortControllerRef.current?.abort();
    setStreamingPair(null);
  }, []);

  const cancelAndEdit = useCallback((): string => {
    const q = streamingPair?.user ?? "";
    abortControllerRef.current?.abort();
    setStreamingPair(null);
    return q;
  }, [streamingPair]);

  const deletePair = useCallback(async (pairId: string) => {
    setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, is_deleted: true } : p));
    await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: pairId, is_deleted: true }) });
  }, []);

  const restorePair = useCallback(async (pairId: string) => {
    setPairs(prev => prev.map(p => p.pair_id === pairId ? { ...p, is_deleted: false } : p));
    await fetch("/api/messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: pairId, is_deleted: false }) });
  }, []);

  const permanentDeletePair = useCallback(async (pairId: string) => {
    setPairs(prev => prev.filter(p => p.pair_id !== pairId));
    await fetch("/api/messages", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pair_id: pairId }) });
  }, []);

  return {
    // state
    pairs, setPairs,
    streamingPair,
    isLoading,
    streamingRawRef,

    // 추출 관련
    extractedItems, setExtractedItems,
    extractedNoticeCount, setExtractedNoticeCount,
    heldNoticeCount, setHeldNoticeCount,

    // actions
    sendMessage,
    cancelAndDiscard,
    cancelAndEdit,
    deletePair,
    restorePair,
    permanentDeletePair,
  };
}
