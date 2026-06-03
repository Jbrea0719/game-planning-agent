"use client";

// 브라우저 음성 인식(Web Speech API) 훅 — 백엔드 불필요, 기기 자체 받아쓰기 사용
// 지원: Chrome·안드로이드, iOS Safari 14.5+ (webkitSpeechRecognition)
// 미지원 브라우저에서는 supported=false → 버튼 자체를 숨기면 됨

import { useCallback, useEffect, useRef, useState } from "react";

// ── Web Speech API 최소 타입 (표준 lib.dom에 webkit 버전이 없어 직접 정의) ──
interface SpeechAlternative { transcript: string }
interface SpeechResult { isFinal: boolean; 0: SpeechAlternative }
interface SpeechResultList { length: number; [index: number]: SpeechResult }
interface SpeechEvent { resultIndex: number; results: SpeechResultList }
interface SpeechErrorEvent { error: string }
interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognizerCtor = new () => SpeechRecognizer;

function getCtor(): SpeechRecognizerCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognizerCtor;
    webkitSpeechRecognition?: SpeechRecognizerCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// 음성 받아쓰기는 줄바꿈을 만들 수 없어, 말한 명령어("줄바꿈"·"다음 줄"·"엔터")를 실제 줄바꿈(\n)으로 변환.
// (PC·모바일 입력창이 공용으로 사용)
export function applyVoiceCommands(text: string): string {
  return text.replace(/\s*(줄바꿈|다음\s*줄|엔터)\s*/g, "\n");
}

export function useSpeechRecognition(opts: {
  lang?: string;
  // 현재 발화 세션의 누적 텍스트를 넘겨줌 (말하는 동안 계속 갱신 → 입력창 실시간 반영)
  onTranscript: (sessionText: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
}) {
  const { lang = "ko-KR", onTranscript, onError } = opts;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognizer | null>(null);
  // 콜백을 ref로 보관 → 인식 객체 재생성 없이 항상 최신 콜백 사용
  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    setSupported(getCtor() !== null);
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* 이미 종료된 경우 무시 */ }
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    // 이미 듣고 있으면 토글로 중지
    if (recRef.current) { stop(); return; }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = false;     // 한 번의 발화(문장 단위), 침묵 시 자동 종료
    rec.interimResults = true;  // 말하는 도중에도 중간 결과 반영

    rec.onresult = (e) => {
      // 이번 세션의 모든 결과를 합쳐 누적 텍스트 구성.
      // 확정된 조각(final)끼리는 공백으로 이어붙여 단어가 붙는 현상을 방지 (긴 발화 시 띄어쓰기 깨짐 해결).
      let finalText = "";
      let interim = "";
      let isFinal = false;
      for (let i = 0; i < e.results.length; i++) {
        const seg = e.results[i][0].transcript;
        if (e.results[i].isFinal) { finalText += (finalText ? " " : "") + seg.trim(); isFinal = true; }
        else interim += seg;
      }
      const text = `${finalText}${finalText && interim ? " " : ""}${interim}`.replace(/ {2,}/g, " ");
      onTranscriptRef.current(text, isFinal);
    };
    rec.onerror = (e) => {
      onErrorRef.current?.(e.error);
      setListening(false);
      recRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (err) {
      console.error("[speech] 시작 실패:", err);
      recRef.current = null;
      setListening(false);
    }
  }, [lang, stop]);

  // 언마운트 시 정리
  useEffect(() => () => { try { recRef.current?.abort(); } catch { /* noop */ } }, []);

  return { supported, listening, start, stop };
}
