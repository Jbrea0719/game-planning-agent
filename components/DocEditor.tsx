"use client";

// 기획서 WYSIWYG 편집기 — 뷰어처럼 렌더된 상태로 편집(마크다운 기호 안 보임).
// 하단 [Markdown | WYSIWYG] 탭으로 원문 직접 편집도 가능(표·ASCII 프레임 정밀 수정용).
// React 래퍼 대신 바닐라 @toast-ui/editor를 직접 마운트 → React 19/Next 16 호환 안전.
//
// 저장은 registerGetter로 넘긴 함수로 현재 마크다운을 가져감(키 입력마다 리렌더 방지).

import { useEffect, useRef } from "react";
import "@toast-ui/editor/dist/toastui-editor.css";
import "@toast-ui/editor/dist/theme/toastui-editor-dark.css";
import Editor from "@toast-ui/editor";

export default function DocEditor({
  initialValue,
  registerGetter,
  scrollToText,
  height = "70vh",
}: {
  initialValue: string;
  registerGetter: (fn: () => string) => void;
  scrollToText?: string | null;   // 이 제목이 보이도록 스크롤 (보던 위치에서 편집)
  height?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elRef.current) return;
    // 현재 스킨이 밝은 계열이면 라이트 에디터, 어두운 계열이면 다크 에디터
    const theme = document.documentElement.getAttribute("data-theme");
    const isLight = theme === "light" || theme === "sepia";

    const editor = new Editor({
      el: elRef.current,
      height,
      initialEditType: "wysiwyg",   // 기본 = 뷰어처럼 보이는 편집
      previewStyle: "tab",
      initialValue: initialValue || "",
      usageStatistics: false,
      theme: isLight ? "default" : "dark",
      autofocus: true,
      toolbarItems: [
        ["heading", "bold", "italic", "strike"],
        ["hr", "quote"],
        ["ul", "ol", "task", "indent", "outdent"],
        ["table", "image", "link"],
        ["code", "codeblock"],
      ],
    });

    registerGetter(() => editor.getMarkdown());

    // 보던 위치로 이동 — WYSIWYG 본문에서 같은 제목을 찾아 스크롤
    if (scrollToText && scrollToText.trim()) {
      const target = scrollToText.trim();
      const key = target.slice(0, 14);
      setTimeout(() => {
        const root = elRef.current;
        if (!root) return;
        const heads = Array.from(
          root.querySelectorAll(".toastui-editor-ww-container h1, .toastui-editor-ww-container h2, .toastui-editor-ww-container h3, .toastui-editor-ww-container h4"),
        ) as HTMLElement[];
        const hit = heads.find((h) => (h.textContent || "").trim() === target)
          ?? heads.find((h) => (h.textContent || "").trim().startsWith(key));
        if (hit) hit.scrollIntoView({ block: "start" });
      }, 180);
    }

    return () => {
      editor.destroy();
      registerGetter(() => initialValue);
    };
    // 마운트 시 1회만 — initialValue는 시작값으로만 사용
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={elRef} />;
}
