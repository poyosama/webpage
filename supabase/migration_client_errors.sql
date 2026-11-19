-- ==================== REGISTRO DE ERRORES DE LA APP + "REPORTAR UN PROBLEMA" (19/11/2026) ====================
-- La app manda acá los errores que le pasan a la gente (y los reportes a mano). Solo el admin los lee.
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  kind text not null default 'error' check (kind in ('error', 'report')),
  message text not null check (char_length(message) <= 2000),
  stack text check (stack is null or char_length(stack) <= 6000),
  url text check (url is null or char_length(url) <= 500),
  ua text check (ua is null or char_length(ua) <= 400),
  fingerprint text check (fingerprint is null or char_length(fingerprint) <= 200)
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
drop policy if exists "Mandar error" on public.client_errors;
create policy "Mandar error" on public.client_errors for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());
grant insert on public.client_errors to anon, authenticated;

-- Anti-spam: la misma persona no puede mandar más de 60 por hora
create or replace function public.client_errors_rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null and (select count(*) from public.client_errors
       where user_id = new.user_id and created_at > now() - interval '1 hour') >= 60 then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists client_errors_rate_limit on public.client_errors;
create trigger client_errors_rate_limit before insert on public.client_errors for each row execute function public.client_errors_rate_limit();

-- Panel del admin: errores agrupados (cuántas veces, a cuánta gente, último) + reportes
create or replace function public.admin_client_errors(p_days int default 7)
returns table (kind text, message text, fingerprint text, veces int, personas int, ultimo timestamptz,
               ejemplo_url text, ejemplo_ua text, ejemplo_stack text, handles text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is distinct from '927df5ff-0c13-4088-abc7-52dbf9dbd41b'::uuid then raise exception 'solo admin'; end if;
  return query
    select e.kind, max(e.message), coalesce(e.fingerprint, left(e.message, 120)), count(*)::int, count(distinct e.user_id)::int, max(e.created_at),
           (array_agg(e.url order by e.created_at desc))[1], (array_agg(e.ua order by e.created_at desc))[1],
           (array_agg(e.stack order by e.created_at desc))[1],
           string_agg(distinct p.handle, ', ')
      from public.client_errors e left join public.profiles p on p.id = e.user_id
     where e.created_at > now() - make_interval(days => greatest(1, least(p_days, 60)))
     group by e.kind, coalesce(e.fingerprint, left(e.message, 120)), case when e.kind = 'report' then e.id end
     order by max(e.created_at) desc
     limit 200;
end $$;
revoke all on function public.admin_client_errors(int) from public, anon;
grant execute on function public.admin_client_errors(int) to authenticated;
