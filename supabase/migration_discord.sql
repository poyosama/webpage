-- =========================================================================
-- EL TABLERO // MIGRACIÓN: avisos de lanzamientos en Discord
-- Cuando un proyecto queda PÚBLICO y con al menos un track con audio, se manda un mensaje
-- (una sola vez por proyecto) al webhook de Discord guardado en Vault como "discord_webhook_url".
-- El secreto lo carga el dueño en Supabase → Project Settings → Vault. Idempotente.
-- =========================================================================
create extension if not exists pg_net with schema extensions;

create table if not exists public.discord_announcements (
  project_id uuid primary key references public.projects(id) on delete cascade,
  announced_at timestamptz not null default now()
);
alter table public.discord_announcements enable row level security;
revoke all on public.discord_announcements from anon, authenticated;

create or replace function public.discord_announce_if_ready(p_project uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  hook text;
  pj record;
  n_tracks int;
  inserted uuid;
begin
  select decrypted_secret into hook from vault.decrypted_secrets where name = 'discord_webhook_url' limit 1;
  if hook is null or hook = '' then return; end if;

  select p.id, p.title, p.type, p.cover_url, p.visibility, p.is_public, pr.handle, pr.name, pr.avatar_url
    into pj
    from public.projects p left join public.profiles pr on pr.id = p.user_id
   where p.id = p_project;
  if pj.id is null then return; end if;
  if not (pj.visibility = 'public' or pj.is_public = true) then return; end if;

  select count(*) into n_tracks from public.tracks where project_id = p_project and audio_url is not null;
  if n_tracks = 0 then return; end if;

  insert into public.discord_announcements (project_id) values (p_project)
  on conflict do nothing returning project_id into inserted;
  if inserted is null then return; end if; -- ya se anunció

  perform net.http_post(
    url := hook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'username', 'El tablero.',
      'avatar_url', 'https://www.eltablero.blog/icon.png',
      'embeds', jsonb_build_array(jsonb_build_object(
        'title', pj.title,
        'url', 'https://www.eltablero.blog/project/' || pj.id::text,
        'description', '**' || coalesce(pj.handle, pj.name, 'Alguien') || '** subió ' ||
                       lower(coalesce(pj.type, 'un proyecto')) || ' · ' || n_tracks || ' ' ||
                       case when n_tracks = 1 then 'track' else 'tracks' end ||
                       E'\n[Escuchalo en El tablero →](https://www.eltablero.blog/project/' || pj.id::text || ')',
        'color', 14753096,
        'thumbnail', case when pj.cover_url is not null then jsonb_build_object('url', pj.cover_url) else null end,
        'author', jsonb_build_object('name', coalesce(pj.handle, pj.name, 'El tablero'), 'icon_url', pj.avatar_url),
        'footer', jsonb_build_object('text', 'El tablero. · nuevo lanzamiento'),
        'timestamp', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      ))
    )
  );
end $$;
revoke all on function public.discord_announce_if_ready(uuid) from public, anon, authenticated;

create or replace function public.trg_discord_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.discord_announce_if_ready(new.id);
  return new;
end $$;
create or replace function public.trg_discord_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.audio_url is not null then perform public.discord_announce_if_ready(new.project_id); end if;
  return new;
end $$;

drop trigger if exists trg_discord_project on public.projects;
create trigger trg_discord_project after insert or update of visibility, is_public on public.projects
  for each row execute function public.trg_discord_project();
drop trigger if exists trg_discord_track on public.tracks;
create trigger trg_discord_track after insert or update of audio_url on public.tracks
  for each row execute function public.trg_discord_track();

-- Lo que ya era público antes de esto no se anuncia de golpe
insert into public.discord_announcements (project_id)
select id from public.projects where visibility = 'public' or is_public = true
on conflict do nothing;

-- Mensaje de prueba (lo corre un admin desde el SQL editor: select public.discord_test();)
create or replace function public.discord_test() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare hook text;
begin
  select decrypted_secret into hook from vault.decrypted_secrets where name = 'discord_webhook_url' limit 1;
  if hook is null then return 'Falta el secreto discord_webhook_url en Vault'; end if;
  perform net.http_post(url := hook, headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('username', 'El tablero.', 'avatar_url', 'https://www.eltablero.blog/icon.png',
      'content', '👋 El tablero. ya está conectado: acá van a caer los lanzamientos nuevos.'));
  return 'enviado';
end $$;
revoke all on function public.discord_test() from public, anon, authenticated;
