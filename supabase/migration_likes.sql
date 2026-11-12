-- =========================================================================
-- EL TABLERO // MIGRACIÓN: me gusta sincronizados entre dispositivos
-- Correr en Supabase > SQL Editor. Es idempotente.
-- =========================================================================
create table if not exists public.track_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, track_id)
);
create index if not exists track_likes_user_idx on public.track_likes (user_id, created_at);

alter table public.track_likes enable row level security;
drop policy if exists "Mis me gusta" on public.track_likes;
create policy "Mis me gusta" on public.track_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, delete on public.track_likes to authenticated;
