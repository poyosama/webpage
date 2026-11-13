-- =========================================================================
-- EL TABLERO // MIGRACIÓN: pases de invitación del lado del servidor
-- Correr UNA vez en Supabase > SQL Editor. Es idempotente (se puede re-correr).
--
-- Qué hace:
--  1. Tabla public.invite_codes: los pases viven en el servidor (no en el navegador).
--     Nadie puede insertar/editar pases directo: solo vía las funciones de abajo.
--  2. public.invite_admins: emails con pases ILIMITADOS (solo jpizarrograndinetti@gmail.com).
--     La tabla no tiene policies → no se puede leer ni editar desde la app.
--  3. Funciones (security definer):
--       invite_is_unlimited()          → ¿la cuenta logueada es admin?
--       create_invite_codes(p_count)   → genera pases (3 cada 14 días; admin: hasta 20 por vez, sin límite)
--       validate_invite_code(p_code)   → ¿existe y está sin usar? (pública, para el link /invite/…)
--       consume_invite_code(p_code)    → lo gasta para la cuenta logueada (un solo uso)
--       invite_can_create_profile()    → admin, cuenta previa a esta migración, o con pase gastado
--  4. Traba de registro: policy RESTRICTIVA de INSERT en profiles → una cuenta nueva
--     no puede crear su perfil si no gastó un pase. Las cuentas que ya existían quedan habilitadas.
--  5. Importa los pases viejos guardados en profiles.invite_codes (si la columna existe) y
--     la vacía, porque esa columna era legible por cualquiera.
-- =========================================================================

-- 1. Tabla de pases ------------------------------------------------------
create table if not exists public.invite_codes (
  code text primary key check (code = lower(code)),
  creator_id uuid references auth.users(id) on delete set null,
  creator_handle text,
  creator_name text,
  created_at timestamptz not null default now(),
  used boolean not null default false,
  used_by uuid references auth.users(id) on delete set null,
  used_by_handle text,
  used_at timestamptz
);
-- Vencimiento (14 días) y reemplazo al generar una tanda nueva
alter table public.invite_codes add column if not exists expires_at timestamptz;
alter table public.invite_codes add column if not exists revoked boolean not null default false;
update public.invite_codes set expires_at = created_at + interval '14 days' where expires_at is null;
alter table public.invite_codes alter column expires_at set default (now() + interval '14 days');

create index if not exists invite_codes_creator_idx on public.invite_codes (creator_id, created_at desc);
create index if not exists invite_codes_used_by_idx on public.invite_codes (used_by);

alter table public.invite_codes enable row level security;
drop policy if exists "Ver mis pases" on public.invite_codes;
create policy "Ver mis pases" on public.invite_codes
  for select using (auth.uid() = creator_id);
-- (sin policies de insert/update/delete: solo las funciones security definer escriben)

-- 2. Admins con pases ilimitados -----------------------------------------
create table if not exists public.invite_admins (
  email text primary key check (email = lower(email))
);
alter table public.invite_admins enable row level security;
insert into public.invite_admins (email) values ('jpizarrograndinetti@gmail.com')
  on conflict do nothing;

-- Fecha de corte: cuentas creadas antes de correr esta migración quedan habilitadas.
create table if not exists public.invite_settings (
  id int primary key default 1 check (id = 1),
  grandfather_before timestamptz not null default now()
);
alter table public.invite_settings enable row level security;
insert into public.invite_settings (id) values (1) on conflict do nothing;

-- 3. Funciones ------------------------------------------------------------
create or replace function public.invite_is_unlimited()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    join public.invite_admins a on a.email = lower(u.email)
    where u.id = auth.uid()
  );
$$;

create or replace function public.invite_new_slug()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  chars constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  slug text := 'board-';
  i int;
begin
  for i in 1..6 loop
    slug := slug || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return slug;
end;
$$;

create or replace function public.create_invite_codes(p_count int default 3)
returns setof public.invite_codes
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  unlimited boolean := public.invite_is_unlimited();
  n int;
  latest timestamptz;
  v_handle text;
  v_name text;
  v_code text;
  i int;
begin
  if uid is null then
    raise exception 'Tenés que iniciar sesión' using errcode = '28000';
  end if;

  if unlimited then
    n := 5; -- tanda de 5 (la lista nunca pasa de 5)
  else
    select max(created_at) into latest from public.invite_codes where creator_id = uid;
    if latest is not null and latest > now() - interval '14 days' then
      raise exception 'Todavía no se recargaron tus pases (cada 14 días)' using errcode = 'P0001';
    end if;
    n := 3;
  end if;

  select p.handle, p.name into v_handle, v_name from public.profiles p where p.id = uid;

  -- La tanda nueva reemplaza a la anterior: los pases sin usar quedan inválidos
  update public.invite_codes set revoked = true
   where creator_id = uid and used = false and revoked = false;

  for i in 1..n loop
    loop
      v_code := public.invite_new_slug();
      begin
        insert into public.invite_codes (code, creator_id, creator_handle, creator_name, expires_at)
        values (v_code, uid, v_handle, v_name, now() + interval '14 days');
        exit;
      exception when unique_violation then
        -- colisión (muy improbable): probar otro código
      end;
    end loop;
  end loop;

  return query
    select * from public.invite_codes
     where creator_id = uid and used = false and revoked = false and expires_at > now()
     order by created_at desc, code
     limit 5;
end;
$$;

create or replace function public.validate_invite_code(p_code text)
returns table (valid boolean, creator_handle text, creator_name text, reason text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r public.invite_codes;
begin
  select * into r from public.invite_codes where code = lower(trim(p_code));
  if not found then
    return query select false, null::text, null::text, 'Ese código no existe. Revisá que esté bien escrito (board-xxxxxx).'::text;
  elsif r.used then
    return query select false, r.creator_handle, r.creator_name,
      ('Este pase ya se usó' || coalesce(' (lo usó ' || r.used_by_handle || ')', '') || '. Pedile uno nuevo a quien te invitó.')::text;
  elsif r.revoked then
    return query select false, r.creator_handle, r.creator_name,
      'Este pase ya no sirve: quien te invitó generó pases nuevos. Pedile uno nuevo.'::text;
  elsif r.expires_at <= now() then
    return query select false, r.creator_handle, r.creator_name,
      ('Este pase venció el ' || to_char(r.expires_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM') || ' (duran 14 días). Pedile uno nuevo.')::text;
  else
    return query select true, r.creator_handle, r.creator_name, null::text;
  end if;
end;
$$;

create or replace function public.consume_invite_code(p_code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_handle text;
begin
  if uid is null then
    return false;
  end if;
  -- ya tiene uno gastado: listo
  if exists (select 1 from public.invite_codes where used_by = uid) then
    return true;
  end if;
  select handle into v_handle from public.profiles where id = uid;
  update public.invite_codes
     set used = true, used_by = uid, used_by_handle = v_handle, used_at = now()
   where code = lower(trim(p_code))
     and used = false
     and revoked = false
     and expires_at > now()
     and creator_id is distinct from uid;
  return found;
end;
$$;

create or replace function public.invite_can_create_profile()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null and (
    public.invite_is_unlimited()
    or exists (select 1 from public.invite_codes where used_by = auth.uid())
    or exists (
      select 1 from auth.users u, public.invite_settings s
      where u.id = auth.uid() and u.created_at < s.grandfather_before
    )
  );
$$;

revoke all on function public.invite_is_unlimited() from public;
revoke all on function public.invite_new_slug() from public;
revoke all on function public.create_invite_codes(int) from public;
revoke all on function public.validate_invite_code(text) from public;
revoke all on function public.consume_invite_code(text) from public;
revoke all on function public.invite_can_create_profile() from public;
grant execute on function public.invite_is_unlimited() to authenticated;
grant execute on function public.create_invite_codes(int) to authenticated;
grant execute on function public.validate_invite_code(text) to anon, authenticated;
grant execute on function public.consume_invite_code(text) to authenticated;
grant execute on function public.invite_can_create_profile() to authenticated;

-- 4. Traba de registro ---------------------------------------------------
-- Restrictiva: se suma (AND) a la policy existente "Usuarios editan su propio perfil".
-- Aplica a INSERT (incluye el insert de un upsert). Updates de perfiles existentes no se tocan.
drop policy if exists "Perfil nuevo solo con invitacion" on public.profiles;
create policy "Perfil nuevo solo con invitacion" on public.profiles
  as restrictive
  for insert
  with check (public.invite_can_create_profile());

-- Cuando se crea el perfil (después de gastar el pase) se completa el handle en el pase gastado
create or replace function public.invite_fill_used_handle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invite_codes
     set used_by_handle = new.handle
   where used_by = new.id and used_by_handle is null;
  return new;
end;
$$;
drop trigger if exists invite_fill_used_handle on public.profiles;
create trigger invite_fill_used_handle
  after insert on public.profiles
  for each row execute function public.invite_fill_used_handle();

-- 5. Importar pases viejos de profiles.invite_codes ----------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'invite_codes'
  ) then
    insert into public.invite_codes (code, creator_id, creator_handle, creator_name, created_at, used, used_by_handle, used_at)
    select
      lower(trim(e->>'code')),
      p.id,
      coalesce(e->>'creatorHandle', p.handle),
      coalesce(e->>'creatorName', p.name),
      coalesce(nullif(e->>'createdAt', '')::timestamptz, now()),
      coalesce((e->>'used')::boolean, false),
      e->>'usedByHandle',
      nullif(e->>'usedAt', '')::timestamptz
    from public.profiles p,
         lateral jsonb_array_elements(
           case when jsonb_typeof(to_jsonb(p.invite_codes)) = 'array' then to_jsonb(p.invite_codes) else '[]'::jsonb end
         ) e
    where coalesce(e->>'code', '') ~ '^board-[a-z0-9]{4,10}$'
    on conflict (code) do nothing;

    -- La columna vieja era legible por cualquiera (policy de select = true): se vacía.
    execute 'update public.profiles set invite_codes = null where invite_codes is not null';
  end if;
end;
$$;
