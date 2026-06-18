"use client";

// 조던 사용 가이드 — 기능 타입별 탭으로 묶은 가독성 중심 모달 (데스크탑·모바일 공용).
// ※ 기능이 바뀌면 이 파일의 GUIDE만 갱신하면 됩니다 (단일 출처).
//   기존엔 한 화면에 모든 섹션이 길게 쌓여 정신없었음 → 탭 + 카드로 분리.

import { useState } from "react";

type Item = { t: string; d: string };
type Tab = { id: string; label: string; emoji: string; intro?: string; items: Item[] };

const GUIDE: Tab[] = [
  {
    id: "start",
    label: "시작하기",
    emoji: "🚀",
    intro: "조던이 어떻게 답하고, 무엇을 보고 판단하는지",
    items: [
      { t: "다단계 에이전트", d: "분석 → 설계 → 검토 → 답변. 단순 챗봇이 아니라 디렉터급 의사결정 과정을 거쳐요." },
      { t: "실시간 게임 데이터 분석", d: "등록된 게임들의 신뢰 출처(공식·라운지·인벤·디시·나무위키 등)를 실시간 검색해 근거 기반으로 답해요." },
      { t: "🖼️ 이미지 첨부 분석", d: "입력창 📎로 게임 UI 스크린샷·와이어프레임·경쟁작 화면을 첨부하면, 조던이 이미지를 직접 보고 UX 평가·개선점을 제시해요." },
      { t: "📑 참고 기획서", d: "헤더 📑로 기존 기획서를 체크해두면 그 내용을 보고 답해요. 다른 기획과의 교차 참고·충돌 감지에 활용. 대화방마다 따로 저장돼요." },
      { t: "스트리밍 응답", d: "답변이 작성되는 과정을 실시간으로 보여줘요." },
    ],
  },
  {
    id: "header",
    label: "헤더 도구",
    emoji: "🛠️",
    intro: "화면 맨 위 줄의 버튼들 (좌 → 우)",
    items: [
      { t: "💬 대화방 (병렬 작업)", d: "주제별로 여러 대화방을 만들어 병렬로 작업. 방마다 대화·맥락이 독립이라 안 섞여요. 단, 기획 바이블·기획서는 전 방 공유라 자산은 하나로 쌓여요." },
      { t: "📌 맥락선", d: "클릭하면 현재 맥락 시작점으로 스크롤 + 하이라이트. 이 지점 이후 대화만 조던에게 전달돼요. 설정/해제는 본문 안에서." },
      { t: "📚 기획 바이블", d: "누적된 모든 기획 결정 자산. [전체] / [현재 맥락] 탭으로 보기. 모든 기획서 작성에 자동 참조돼요." },
      { t: "📄 기획서 ▾", d: "한 버튼에 [리스트 이동 / 현재 맥락으로 작성 / 현재 맥락으로 수정]이 묶여 있어요." },
      { t: "🎨 스킨 (테마)", d: "헤더 스킨 버튼으로 다크 실버 / 라이트 / 세피아 / 딥오션을 전환. 고른 스킨은 저장되어 다음에 와도 유지돼요." },
      { t: "⚙️ 설정", d: "출처 표시, 참고 게임 라이브러리, 관리 도구·답변 모델(관리자 전용)이 한곳에. 비관리자는 일부만 보기." },
      { t: "📖 가이드", d: "지금 보고 있는 이 화면. 기능이 바뀌면 자동으로 갱신돼요." },
      { t: "📱 모바일", d: "같은 URL을 폰에서 열면 자동으로 모바일 전용 뷰. 햄버거 메뉴(☰)에 모든 도구. 닉네임만 같으면 데이터가 자동 동기화돼요." },
    ],
  },
  {
    id: "docs",
    label: "기획서",
    emoji: "📄",
    intro: "기획서 리스트·작성·수정·화면 설계",
    items: [
      { t: "리스트 트리", d: "대 > 중 > 소 > 기획서 4단계. 단계마다 +/− 토글, 기획서 옆 ✏️로 이름 변경 · 📂로 분류 변경." },
      { t: "사이드바 접기", d: "헤더 ⇤로 리스트를 접어 본문을 넓게. 모바일은 좌→우 스와이프로 펼치고 우→좌로 접어요. (설정은 기억됨)" },
      { t: "⚙️ 카테고리 관리", d: "대/중/소 추가·수정·삭제. 각 카테고리 아래 최하위 기획서(📄)도 표시돼 🗑️로 삭제 가능." },
      { t: "🪄 수정 요청", d: "자연어 지시로 같은 기획서를 그 자리에서 갱신. 적용 전 색상 미리보기(🟢추가 / 🟡수정 / 🔴삭제)로 확인. 수정 전 원본은 7일간 자동 백업." },
      { t: "🎨 화면 설계", d: "와이어프레임(직접 그리기) · AI 시안 생성(자연어 → HTML) · 📐 스크린샷 → 텍스트 UI 프레임. 만든 결과는 📎로 기획서에 첨부." },
      { t: "📥 내보내기", d: "MD · TXT · HTML · PDF 4가지 형식으로 저장." },
      { t: "빨간 점", d: "아직 안 본 새 기획서 표시. 클릭하면 해제돼요." },
    ],
  },
  {
    id: "answer",
    label: "답변 도구",
    emoji: "💬",
    intro: "답변마다 붙는 도구와 능동 질문",
    items: [
      { t: "▼ 자세한 답변 보기", d: "같은 질문을 더 깊이 확장 설명. 최고 품질 모델(Opus)로 작성돼요. 설정에서 매번 자동 펼침도 가능(대신 비용↑)." },
      { t: "📋 디렉터 검토 의견", d: "검토 에이전트가 본 답변에 대해 짚은 보완점·우려 사항." },
      { t: "👍 정확함 / 👎 부정확", d: "피드백 저장. 부정확은 사유를 적을 수 있고, 차후 품질 개선에 쓰여요." },
      { t: "📌 호버 압정", d: "답변 좌측에 호버하면 나타남. 맥락선 시점을 언제든 다른 답변으로 옮길 수 있어요." },
      { t: "복사 · 삭제", d: "답변 우상단 ⎘로 복사 / 호버 시 삭제. 삭제한 대화는 하단에서 복원 가능." },
      { t: "🎤 후속 질문", d: "답변 끝에 조던이 다음 결정에 도움될 질문을 1~2개 제안해요. 선택지가 있어 답하기 부담이 적어요." },
    ],
  },
  {
    id: "auto",
    label: "자동·팁",
    emoji: "💡",
    intro: "알아서 돌아가는 것들 + 잘 쓰는 요령",
    items: [
      { t: "바이블 자동 추출", d: "대화에서 결정·검토된 사항을 조던이 자동으로 뽑아 바이블에 추가하고 카테고리도 자동 분류해요." },
      { t: "충돌 항목 보류", d: "조던이 반대·우려를 표한 결정은 자동 등록을 보류. \"그래도 등록해줘\"라고 해야 등록돼요." },
      { t: "대화 자동 저장", d: "모든 대화는 자동 저장돼 새로고침·다른 기기에서도 복원돼요." },
      { t: "팁 · 긴 프로젝트", d: "주제가 바뀌면 맥락선(📌)을 새로 찍어 이전 맥락을 제외하세요. 핵심 결정은 바이블에 남아 손실 없어요." },
      { t: "팁 · 기획서 만들기", d: "충분히 대화로 발산 → 결정이 바이블에 쌓이면 → [📄 기획서 작성]으로 한 번에 정리." },
      { t: "팁 · 모바일", d: "헤더 버튼을 길게 누르면 설명 팝업, 떼면 실행돼요." },
    ],
  },
];

export default function GuideModal({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState(GUIDE[0].id);
  const tab = GUIDE.find((t) => t.id === active) ?? GUIDE[0];

  return (
    <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl"
        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--card-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--card-border)" }}>
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--accent-2)" }}>📖 조던 사용 가이드</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-mute)" }}>기능을 종류별로 묶었어요 — 탭을 눌러 살펴보세요</p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-lg font-medium" style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)", color: "var(--text)" }}>닫기</button>
        </div>

        {/* 탭 바 (가로 스크롤) */}
        <div className="flex gap-1.5 px-4 pt-3 pb-2 overflow-x-auto flex-shrink-0" style={{ borderBottom: "1px solid var(--card-border)", scrollbarWidth: "none" }}>
          {GUIDE.map((t) => {
            const on = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className="text-xs px-3 py-1.5 rounded-full font-bold whitespace-nowrap transition-colors"
                style={{
                  backgroundColor: on ? "var(--accent)" : "var(--surface-2)",
                  color: on ? "var(--on-accent)" : "var(--text-dim)",
                  border: `1px solid ${on ? "var(--accent)" : "var(--card-border)"}`,
                }}
              >
                {t.emoji} {t.label}
              </button>
            );
          })}
        </div>

        {/* 내용 — 활성 탭의 카드 목록 */}
        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--text-mute) transparent" }}>
          {tab.intro && (
            <p className="text-xs mb-3 px-1" style={{ color: "var(--text-mute)" }}>{tab.intro}</p>
          )}
          <div className="space-y-2">
            {tab.items.map((it, i) => (
              <div
                key={i}
                className="rounded-xl px-3.5 py-3"
                style={{ backgroundColor: "var(--surface-2)", border: "1px solid var(--card-border)" }}
              >
                <p className="text-[13px] font-bold mb-1" style={{ color: "var(--text)" }}>{it.t}</p>
                <p className="text-xs" style={{ color: "var(--text-dim)", lineHeight: 1.62 }}>{it.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
