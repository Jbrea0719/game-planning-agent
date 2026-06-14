"use client";

// 탭 간 실시간 동기화 — 같은 사이트의 여러 탭이 공유 자산/설정 변경을 즉시 반영
// 한 탭에서 바이블·기획서·카테고리·전역 토글을 바꾸면, 다른 탭이 해당 데이터를 다시 불러오거나 토글을 맞춤.
// BroadcastChannel("jordan_sync") 사용 (미지원 브라우저는 조용히 무시).

import { useEffect, useRef } from "react";

export type SyncMessage =
  | { kind: "decisions" }     // 기획 바이블 결정사항 변경
  | { kind: "categories" }    // 카테고리(대/중/소) 변경
  | { kind: "docs" }          // 기획서 추가/수정/삭제
  | { kind: "toggle"; key: string; value: boolean };  // 전역 토글

interface Handlers {
  onDecisions?: () => void;
  onCategories?: () => void;
  onDocs?: () => void;
  onToggle?: (key: string, value: boolean) => void;
}

export function useCrossTabSync(handlers: Handlers): (msg: SyncMessage) => void {
  const chRef = useRef<BroadcastChannel | null>(null);
  const hRef = useRef(handlers);
  hRef.current = handlers;

  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel("jordan_sync");
    chRef.current = ch;
    ch.onmessage = (e: MessageEvent<SyncMessage>) => {
      const d = e.data;
      if (!d) return;
      if (d.kind === "decisions") hRef.current.onDecisions?.();
      else if (d.kind === "categories") hRef.current.onCategories?.();
      else if (d.kind === "docs") hRef.current.onDocs?.();
      else if (d.kind === "toggle") hRef.current.onToggle?.(d.key, d.value);
    };
    return () => { ch.close(); chRef.current = null; };
  }, []);

  // 다른 탭으로 변경 신호 전송
  return (msg: SyncMessage) => { chRef.current?.postMessage(msg); };
}
