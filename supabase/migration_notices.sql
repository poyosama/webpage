-- ==================== AVISOS PARA UN USUARIO (pop-up al entrar) — 19/11/2026 ====================
-- Para contarle a alguien algo puntual (ej. "borramos tracks que se importaron sin audio").
create table if not exists public.user_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  seen_at timestamptz
);
create index if not exists user_notices_user_idx on public.user_notices (user_id) where seen_at is null;
alter table public.user_notices enable row level security;
drop policy if exists "Mis avisos" on public.user_notices;
create policy "Mis avisos" on public.user_notices for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Marcar aviso visto" on public.user_notices;
create policy "Marcar aviso visto" on public.user_notices for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select on public.user_notices to authenticated;
grant update (seen_at) on public.user_notices to authenticated;
