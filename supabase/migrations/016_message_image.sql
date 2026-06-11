-- 채팅 메시지 첨부 이미지 — messages 행에 이미지 참조(doc_images.id) 추가
-- 첨부 이미지 자체는 기존 doc_images 테이블에 저장되고, /api/img/<id>로 서빙됨.
-- 이 컬럼은 "이 메시지에 어떤 이미지가 붙었는지"를 가리켜 재진입 시 재표시용.
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. (조던 Supabase: cgplll…)

alter table messages add column if not exists image_id uuid;
