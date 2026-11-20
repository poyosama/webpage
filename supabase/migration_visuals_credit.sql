-- ==================== CRÉDITO DE VISUALES (ej. 2kolorstudio) — 20/11/2026 ====================
-- Quién hizo los visuales del proyecto (tapa, canvas, video). Lo marca el dueño al editar el proyecto.
alter table public.projects add column if not exists visuals_by text check (visuals_by is null or char_length(visuals_by) <= 40);
create index if not exists projects_visuals_by_idx on public.projects (visuals_by) where visuals_by is not null;
