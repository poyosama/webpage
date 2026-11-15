-- =========================================================================
-- EL TABLERO // MIGRACIÓN: audio para escuchar (MP3) + original para descargar
-- Los tracks se escuchan en MP3 192 kbps (audio_url) y el WAV/AIFF/FLAC original
-- queda en original_audio_url para la descarga. Idempotente.
-- =========================================================================
alter table public.tracks add column if not exists original_audio_url text;
