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
  registerTopHeadingGetter,
  scrollToText,
  height = "70vh",
}: {
  initialValue: string;
  registerGetter: (fn: () => string) => void;
  registerTopHeadingGetter?: (fn: () => string | null) => void;  // 현재 상단에 보이는 제목 (복귀 위치용)
  scrollToText?: string | null;   // 이 제목이 보이도록 스크롤 (보던 위치에서 편집)
  height?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elRef.current) return;
    // 현재 스킨이 밝은 계열이면 라이트 에디터, 어두운 계열이면 다크 에디터
    const theme = document.documentElement.getAttribute("data-theme");
    const isLight = theme === "light" || theme === "sepia";

    // 표 행/열 추가·삭제 버튼 — 셀에 커서가 있을 때 동작 (기본 셀-모서리 메뉴가 모달에서 잘 안 떠서 툴바에 직접 노출)
    const tableCmds: Array<{ label: string; title: string; cmd: string; danger?: boolean }> = [
      { label: "＋행", title: "행 추가 (현재 행 아래)", cmd: "addRowToDown" },
      { label: "－행", title: "현재 행 삭제", cmd: "removeRow", danger: true },
      { label: "＋열", title: "열 추가 (현재 열 오른쪽)", cmd: "addColumnToRight" },
      { label: "－열", title: "현재 열 삭제", cmd: "removeColumn", danger: true },
    ];
    const tableButtons = tableCmds.map(({ label, title, cmd, danger }) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.title = title;
      b.className = "tui-tablebtn" + (danger ? " tui-tablebtn--danger" : "");
      // mousedown 기본동작을 막아 표 셀 선택(커서)이 유지되도록 — 안 그러면 어느 행/열인지 잃음
      b.addEventListener("mousedown", (e) => e.preventDefault());
      return { b, cmd };
    });

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
        tableButtons.map(({ b, cmd }) => ({ name: `tbl-${cmd}`, el: b })),  // 표 행/열 그룹
        ["code", "codeblock"],
      ],
    });

    // 표 버튼 클릭 → 해당 명령 실행 (WYSIWYG·표 안일 때만; 표 밖이면 조용히 무시)
    for (const { b, cmd } of tableButtons) {
      b.addEventListener("click", () => {
        try {
          if (editor.isWysiwygMode()) editor.exec(cmd);
        } catch { /* 표 밖에서 누르면 무시 */ }
      });
    }

    registerGetter(() => editor.getMarkdown());

    // 현재 상단에 보이는 제목 (WYSIWYG 모드일 때만; 마크다운 모드면 null → 호출측 폴백)
    registerTopHeadingGetter?.(() => {
      const root = elRef.current;
      const cont = root?.querySelector(".toastui-editor-ww-container") as HTMLElement | null;
      if (!cont || cont.offsetParent === null) return null;
      const ctop = cont.getBoundingClientRect().top;
      const heads = Array.from(cont.querySelectorAll("h1,h2,h3,h4")) as HTMLElement[];
      for (const h of heads) {
        if (h.getBoundingClientRect().top >= ctop - 12) return (h.textContent || "").trim();
      }
      return heads.length ? (heads[heads.length - 1].textContent || "").trim() : null;
    });

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
