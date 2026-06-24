// @toast-ui/editor 타입 선언 — 패키지 exports가 types 경로를 안 열어줘서 직접 최소 선언.
// 우리가 쓰는 옵션·메서드만 정의.
declare module "@toast-ui/editor" {
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
    toolbarItems?: string[][];
  }
  export default class Editor {
    constructor(options: EditorOptions);
    getMarkdown(): string;
    setMarkdown(markdown: string): void;
    on(event: string, handler: (...args: unknown[]) => void): void;
    destroy(): void;
  }
}
