-- 기획서 UI 목업 이미지 저장 테이블 (Gemini 생성 이미지)
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 실행하세요. (조던 Supabase: cgplll…)

create table if not exists doc_images (
  id uuid primary key default gen_random_uuid(),
  doc_id text,                         -- 연결된 기획서 id (정리용, 느슨한 참조)
  mime text not null default 'image/png',
  data text not null,                  -- base64 인코딩된 이미지
  prompt text,                         -- 생성 프롬프트 (재현·디버그용)
  created_at timestamptz not null default now()
);

create index if not exists doc_images_doc_idx on doc_images (doc_id, created_at desc);

-- RLS: 다른 테이블과 동일하게 anon 키 접근 허용
alter table doc_images enable row level security;
drop policy if exists "doc_images_all_access" on doc_images;
create policy "doc_images_all_access" on doc_images
  for all using (true) with check (true);
