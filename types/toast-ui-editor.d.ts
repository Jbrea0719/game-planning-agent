// @toast-ui/editor 타입 선언 — 패키지 exports가 types 경로를 안 열어줘서 직접 최소 선언.
// 우리가 쓰는 옵션·메서드만 정의.
declare module "@toast-ui/editor" {
  // 커스텀 툴바 버튼 (el 직접 지정 — 표 행/열 버튼에 사용)
  interface ToolbarCustomItem {
    name: string;
    el?: HTMLElement;
    tooltip?: string;
    command?: string;
    text?: string;
    className?: string;
  }
  interface EditorOptions {
    el: HTMLElement;
    height?: string;
    initialEditType?: "markdown" | "wysiwyg";
    previewStyle?: "tab" | "vertical";
    initialValue?: string;
    usageStatistics?: boolean;
    theme?: string;
    autofocus?: boolean;
    hideModeSwitch?: boolean;
    toolbarItems?: (string | ToolbarCustomItem)[][];
  }
  export default class Editor {
    constructor(options: EditorOptions);
    getMarkdown(): string;
    setMarkdown(markdown: string): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
    exec(command: string, payload?: Record<string, unknown>): void;  // 표 행/열 추가·삭제 등 명령 실행
    isWysiwygMode(): boolean;
    destroy(): void;
  }
}
