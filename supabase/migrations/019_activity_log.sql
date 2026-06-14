create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  scope text not null,            -- 'jordan' | 'doc'
  action text not null,           -- 'create' | 'update' | 'delete'
  entity text,                    -- 'decision' | 'category' | 'doc' 등 세부 종류
  title text,                     -- 사람이 읽는 대상 이름/요약
  detail text,                    -- 부가 설명(선택)
  target_id text,                 -- 연결 대상 id(느슨한 참조)
  nickname text,
  created_at timestamptz not null default now()
);
create index if not exists activity_log_scope_idx on activity_log (scope, created_at desc);
alter table activity_log enable row level security;
drop policy if exists "activity_log_all" on activity_log;
create policy "activity_log_all" on activity_log for all using (true) with check (true);
