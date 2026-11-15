"use client";

/**
 * Importar proyectos desde carpetas o .zip (ej. lo que bajás de [untitled], Drive o Dropbox).
 * Regla: cada carpeta que tiene audios adentro = un proyecto (nombre de la carpeta);
 * los audios = tracks (título limpio del nombre del archivo); una imagen en la carpeta = portada.
 */

export type ImportEntry = { path: string; file: File };

export type ImportTrackDraft = {
  file: File;
  title: string;
  order: number;
};

export type ImportProjectDraft = {
  key: string;
  title: string;
  cover?: File;
  coverPreview?: string;
  tracks: ImportTrackDraft[];
  include: boolean;
};

const AUDIO_RE = /\.(wav|wave|mp3|m4a|aac|flac|aif|aiff|aifc|ogg|opus|alac|caf)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif|heic)$/i;
const JUNK_RE = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)|(^|\/)\._/i;
const COVER_NAME_RE = /(cover|artwork|art|front|folder|portada|tapa)/i;

export const isAudioName = (n: string) => AUDIO_RE.test(n);
export const isZipName = (n: string) => /\.zip$/i.test(n);

const MIME_BY_EXT: Record<string, string> = {
  wav: "audio/wav", wave: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac",
  flac: "audio/flac", aif: "audio/aiff", aiff: "audio/aiff", aifc: "audio/aiff", ogg: "audio/ogg",
  opus: "audio/ogg", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  gif: "image/gif", avif: "image/avif",
};
const mimeFor = (name: string) => MIME_BY_EXT[(name.split(".").pop() || "").toLowerCase()] || "";

/** "01 - Mi Tema (master).wav" → "Mi Tema (master)"; devuelve también el número si lo tenía */
export function cleanTrackTitle(fileName: string): { title: string; num: number | null } {
  let base = fileName.replace(/\.[^/.]+$/, "").replace(/_/g, " ").trim();
  let num: number | null = null;
  const m = base.match(/^(\d{1,3})\s*[-.)_\s]\s*(.+)$/);
  if (m && m[2].trim().length > 0) {
    num = parseInt(m[1], 10);
    base = m[2];
  }
  base = base.replace(/\s{2,}/g, " ").trim();
  return { title: base || fileName, num };
}

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const lastSeg = (p: string) => p.split("/").filter(Boolean).pop() || "";

/** Abre un .zip en el navegador y devuelve sus archivos con la ruta adentro del zip */
export async function expandZip(zip: File): Promise<ImportEntry[]> {
  const { unzip } = await import("fflate");
  const buf = new Uint8Array(await zip.arrayBuffer());
  const files: Record<string, Uint8Array> = await new Promise((resolve, reject) =>
    unzip(
      buf,
      { filter: (f) => !JUNK_RE.test(f.name) && (AUDIO_RE.test(f.name) || IMAGE_RE.test(f.name)) },
      (err, data) => (err ? reject(err) : resolve(data))
    )
  );
  const root = zip.name.replace(/\.zip$/i, "");
  return Object.entries(files)
    .filter(([name, data]) => !name.endsWith("/") && data.length > 0)
    .map(([name, data]) => {
      const fileName = lastSeg(name);
      const copy = new Uint8Array(data.length);
      copy.set(data);
      return { path: `${root}/${name}`, file: new File([copy], fileName, { type: mimeFor(fileName) }) };
    });
}

/** Lo que se suelta arrastrando (carpetas incluidas) → lista de archivos con su ruta */
export async function entriesFromDataTransfer(dt: DataTransfer): Promise<ImportEntry[]> {
  const out: ImportEntry[] = [];
  type FsEntry = {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
    fullPath: string;
    file?: (ok: (f: File) => void, err: (e: unknown) => void) => void;
    createReader?: () => { readEntries: (ok: (e: FsEntry[]) => void, err: (e: unknown) => void) => void };
  };
  const walk = async (entry: FsEntry): Promise<void> => {
    if (entry.isFile && entry.file) {
      const f: File = await new Promise((ok, err) => entry.file!(ok, err));
      out.push({ path: entry.fullPath.replace(/^\//, ""), file: f });
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      // readEntries devuelve de a tandas: leer hasta que venga vacío
      for (;;) {
        const batch: FsEntry[] = await new Promise((ok, err) => reader.readEntries(ok, err));
        if (!batch.length) break;
        for (const e of batch) await walk(e);
      }
    }
  };
  const items = Array.from(dt.items || []);
  const roots = items
    .map((it) => (it as DataTransferItem & { webkitGetAsEntry?: () => FsEntry | null }).webkitGetAsEntry?.() || null)
    .filter(Boolean) as FsEntry[];
  if (roots.length) {
    for (const r of roots) await walk(r);
  } else {
    for (const f of Array.from(dt.files || [])) out.push({ path: f.name, file: f });
  }
  return out;
}

/** Archivos elegidos con el selector (carpeta con webkitRelativePath, o sueltos) */
export function entriesFromFileList(list: FileList | File[]): ImportEntry[] {
  return Array.from(list).map((f) => ({
    path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
    file: f,
  }));
}

/** Expande los .zip y arma un borrador de proyecto por carpeta con audios */
export async function buildImportDrafts(raw: ImportEntry[], looseTitle = "Importado"): Promise<ImportProjectDraft[]> {
  const entries: ImportEntry[] = [];
  for (const e of raw) {
    if (JUNK_RE.test(e.path)) continue;
    if (isZipName(e.file.name)) {
      try {
        entries.push(...(await expandZip(e.file)));
      } catch (err) {
        console.warn("No se pudo abrir el zip:", e.file.name, err);
      }
    } else if (AUDIO_RE.test(e.file.name) || IMAGE_RE.test(e.file.name)) {
      entries.push(e);
    }
  }

  const byDir = new Map<string, { audios: ImportEntry[]; images: ImportEntry[] }>();
  for (const e of entries) {
    const d = dirOf(e.path);
    if (!byDir.has(d)) byDir.set(d, { audios: [], images: [] });
    const g = byDir.get(d)!;
    if (AUDIO_RE.test(e.file.name)) g.audios.push(e);
    else g.images.push(e);
  }

  const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
  const drafts: ImportProjectDraft[] = [];
  for (const [dir, g] of byDir) {
    if (!g.audios.length) continue;
    // Portada: imagen de la misma carpeta (o de la carpeta de arriba), preferí "cover/artwork/front"
    let images = g.images;
    if (!images.length && dir) images = byDir.get(dirOf(dir))?.images || [];
    const cover = [...images].sort((a, b) => Number(COVER_NAME_RE.test(b.file.name)) - Number(COVER_NAME_RE.test(a.file.name)))[0]?.file;

    const tracks = g.audios
      .map((a) => {
        const { title, num } = cleanTrackTitle(a.file.name);
        return { file: a.file, title, num, name: a.file.name };
      })
      .sort((a, b) => {
        if (a.num != null && b.num != null && a.num !== b.num) return a.num - b.num;
        if (a.num != null && b.num == null) return -1;
        if (a.num == null && b.num != null) return 1;
        return collator.compare(a.name, b.name);
      })
      .map((t, i) => ({ file: t.file, title: t.title, order: i }));

    const title = (lastSeg(dir) || looseTitle).replace(/_/g, " ").trim();
    drafts.push({ key: dir || "__loose__", title, cover, coverPreview: cover ? URL.createObjectURL(cover) : undefined, tracks, include: true });
  }
  return drafts.sort((a, b) => collator.compare(a.title, b.title));
}
