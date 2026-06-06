"use client";

// 기획서 본문/미리보기에서 쓰는 이미지·다이어그램 렌더 컴포넌트
import { useState, useEffect } from "react";

// Mermaid 다이어그램 렌더 (dynamic import로 번들 지연 로딩)
export function MermaidDiagram({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            primaryColor: "#1e3a5f",
            primaryTextColor: "#c0c8d8",
            lineColor: "#7dd3fc",
            background: "#0d1525",
            mainBkg: "#0d1525",
          },
        });
        const id = `m${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        const result = await mermaid.render(id, code);
        if (active) setSvg(result.svg);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => { active = false; };
  }, [code]);

  if (error) return null;
  if (!svg) {
    return (
      <div
        className="animate-pulse"
        style={{
          height: "120px",
          margin: "16px 0",
          borderRadius: "8px",
          background: "rgba(192,200,216,0.06)",
          border: "1px solid rgba(192,200,216,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ color: "rgba(192,200,216,0.4)", fontSize: "12px" }}>📊 다이어그램 렌더링 중...</span>
      </div>
    );
  }
  return (
    <div
      style={{
        margin: "16px 0",
        overflowX: "auto",
        background: "rgba(10,14,26,0.8)",
        borderRadius: "8px",
        padding: "16px",
        border: "1px solid rgba(192,200,216,0.15)",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// 외부 생성 이미지 — 로드 전 shimmer, 실패 시 표시 안 함
export function DocImage({ src, alt }: { src?: string; alt?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed || !src) return null;
  return (
    <figure style={{ margin: "16px 0", textAlign: "center" }}>
      {!loaded && (
        <div
          className="animate-pulse"
          style={{
            height: "180px",
            borderRadius: "8px",
            background: "rgba(192,200,216,0.08)",
            border: "1px solid rgba(192,200,216,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ color: "rgba(192,200,216,0.4)", fontSize: "12px" }}>🎨 이미지 생성 중...</span>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        style={{
          display: loaded ? "block" : "none",
          maxWidth: "100%",
          borderRadius: "8px",
          border: "1px solid rgba(192,200,216,0.2)",
          margin: "0 auto",
        }}
      />
      {loaded && alt && (
        <figcaption style={{ fontSize: "11px", color: "rgba(192,200,216,0.5)", marginTop: "6px" }}>{alt}</figcaption>
      )}
    </figure>
  );
}
