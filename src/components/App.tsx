"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import PullToRefresh from "./PullToRefresh";
import {
  DEMO_PROJECTS,
  EMPTY_ME_PROFILE,
  INITIAL_PRODUCER_DROPS,
  SCENE_ARTISTS,
  STANDBY_PROJECT,
  STANDBY_TRACK,
  type ArtistProfile,
  type ProducerDropItem,
  type ProducerDropKind,
  type Project,
  type ProjectType,
  type ProjectVideoClip,
  type Track,
} from "@/lib/mock";
import { sfx } from "@/lib/sfx";
import type { QueueEntry, RepeatMode } from "./PerformativePlayer";
import {
  supabase,
  isSupabaseConfigured,
  fetchUserProjectsFromSupabase,
  fetchCommunityProfilesFromSupabase,
  purgeJaimeMartinezProfile,
  saveUserProfileToSupabase,
  saveProjectToSupabase,
  deleteTrackFromSupabase,
  deleteProjectFromSupabase,
  uploadMediaToSupabase,
  toggleSavedProjectInSupabase,
  fetchSavedProjectIdsFromSupabase,
  mergePersistedUrls,
  hasTransientMedia,
  fastCacheGet,
  fastCacheSet,
  resolveTrackAudioUrl,
  hydrateProjectsAudioInBackground,
  makeProjectInviteToken,
  verifyProjectInviteToken,
  type ProjectInviteRole,
} from "@/lib/supabase";
import {
  validateInviteCode,
  consumeInviteCode,
  getPendingInviteCode,
  setPendingInviteCode,
  getOrGenerateUserInvites,
} from "@/lib/invites";
import { InviteFriendsModal, WelcomeInviteModal } from "./InviteFriendsModal";
import { analyzeAudioFile, downloadTrackAudio } from "@/lib/audioAnalysis";
import "./board-polish.css";

const MacInstallerUpload = dynamic(() => import("./MacInstallerUpload"), { ssr: false });
const DiscSpinner3D = dynamic(() => import("./DiscSpinner3D"), { ssr: false });
const PerformativePlayer = dynamic(() => import("./PerformativePlayer"), { ssr: false });
const ManifoldLibrary3D = dynamic(() => import("./ManifoldLibrary3D"), { ssr: false });
const CreateProjectScreen = dynamic(() => import("./CreateProjectScreen"), { ssr: false });
const LandingScene = dynamic(() => import("./LandingScene"), { ssr: false });

type ScreenTab = "inicio" | "subir" | "biblioteca" | "perfil" | "crear-proyecto";

const PROJECT_TYPES: ProjectType[] = [
  "Mixtape",
  "EP",
  "LP",
  "Album",
  "Single",
  "Beatpost",
  "Soundkit",
  "Drumkit",
  "Loopkit",
  "Catálogo de Beats",
  "WIP",
];

const PRODUCER_DROP_KINDS: ("Todos" | ProducerDropKind)[] = [
  "Todos",
  "Beatpost",
  "Soundkit",
  "Drumkit",
  "Loopkit",
  "Catálogo de Beats",
];

const STORAGE_PROJECTS_KEY = "eltablero_real_projects_v1";
const STORAGE_PROFILE_KEY = "eltablero_real_profile_v1";
const STORAGE_DROPS_KEY = "eltablero_real_drops_v1";

function GoogleCircleIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}

function TrashIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function DiscIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function App({ initialInviteCode }: { initialInviteCode?: string } = {}) {
  const [tab, setTab] = useState<ScreenTab>("inicio");
  const [meProfile, setMeProfile] = useState<ArtistProfile>(EMPTY_ME_PROFILE);
  const [projects, setProjects] = useState<Project[]>([]);
  const [communityArtists, setCommunityArtists] = useState<ArtistProfile[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [producerDrops, setProducerDrops] = useState<ProducerDropItem[]>([]);
  const [producerFilter, setProducerFilter] = useState<"Todos" | ProducerDropKind>("Todos");
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [cloudReady, setCloudReady] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "error">("idle");
  const [artistSort, setArtistSort] = useState<"recientes" | "populares">("recientes");
  const lastUserIdRef = useRef<string | null>(null);
  const syncedSigRef = useRef<Record<string, string>>({});

  // Sistema de invitaciones exclusivas de board. (3 códigos cada 2 semanas)
  const [inviteFriendsModalOpen, setInviteFriendsModalOpen] = useState(false);
  const [welcomeInvite, setWelcomeInvite] = useState<{
    code: string;
    creatorHandle?: string;
    creatorName?: string;
  } | null>(null);

  // Modo oscuro / Modo claro global para todas las pantallas
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    try {
      const savedTheme = (localStorage.getItem("el-tablero-theme") as "dark" | "light") || "dark";
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
    } catch {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }, []);

  // Detección automática de enlaces de invitación (/invite/:code o ?invite=:code) + purga Jaime Martinez
  useEffect(() => {
    void purgeJaimeMartinezProfile();

    let code = initialInviteCode;
    if (!code && typeof window !== "undefined") {
      const match = window.location.pathname.match(/\/invite\/([^\/?#]+)/i);
      if (match && match[1]) {
        code = match[1];
      } else {
        const q = new URLSearchParams(window.location.search).get("invite");
        if (q) code = q;
      }
    }

    if (code) {
      const clean = code.trim().toLowerCase();
      setPendingInviteCode(clean);
      void validateInviteCode(clean).then((res) => {
        if (res.valid) {
          setWelcomeInvite({
            code: clean,
            creatorHandle: res.creatorHandle,
            creatorName: res.creatorName,
          });
        }
      });
    }
  }, [initialInviteCode]);

  const toggleTheme = () => {
    sfx.tap();
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("el-tablero-theme", next);
    } catch {
      // ignore
    }
  };

  // Mini reproductor slider de progreso en tiempo real (sincronizado con el motor sfx)
  const [miniPlayback, setMiniPlayback] = useState<{ currentSec: number; durationSec: number }>({
    currentSec: 0,
    durationSec: 174,
  });

  // Estado del reproductor persistente + pantalla completa (con funciones completas de Spotify)
  const [currentTrack, setCurrentTrack] = useState<Track>(STANDBY_TRACK);
  const [currentProject, setCurrentProject] = useState<Project>(STANDBY_PROJECT);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playerExpanded, setPlayerExpanded] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.85);
  const [shuffle, setShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>("off");
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>([]);
  const [userQueue, setUserQueue] = useState<QueueEntry[]>([]);
  const [customAudioMap, setCustomAudioMap] = useState<Record<string, string>>({});

  const onTrackEndedRef = useRef<() => void>(() => {});
  const miniPlayerTouchRef = useRef<{ startY: number; startX: number } | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      const st = sfx.getPlaybackState();
      setMiniPlayback((prev) => {
        const nextDur = st.durationSec || currentTrack.durationSec || 174;
        if (Math.abs(prev.currentSec - st.currentSec) < 0.1 && prev.durationSec === nextDur) {
          return prev;
        }
        return { currentSec: st.currentSec, durationSec: nextDur };
      });
      return;
    }
    const id = window.setInterval(() => {
      const st = sfx.getPlaybackState();
      setMiniPlayback((prev) => {
        const nextDur = st.durationSec || currentTrack.durationSec || 174;
        if (Math.abs(prev.currentSec - st.currentSec) < 0.25 && prev.durationSec === nextDur) {
          return prev;
        }
        return {
          currentSec: st.currentSec,
          durationSec: nextDur,
        };
      });
      if (st.ended && isPlaying) {
        onTrackEndedRef.current();
      }
    }, 250);
    return () => clearInterval(id);
  }, [currentTrack.durationSec, isPlaying]);

  // Input temporal para agregar atributos personalizados a un proyecto en Biblioteca
  const [newAttrInput, setNewAttrInput] = useState<string>("");

  // Vista 3D en Mis Proyectos: Vinilos 3D en arco fijo
  const [libraryViewMode, setLibraryViewMode] = useState<"manifold" | "disc-row">("disc-row");
  // Modo de display en Biblioteca: 1 (default) "inside" (Por defecto) o 2 "side-by-side" (Lado a Lado)
  const [libraryLayoutMode, setLibraryLayoutMode] = useState<"inside" | "side-by-side">("inside");
  const [insideCubeOpen, setInsideCubeOpen] = useState<boolean>(false);

  // Modales: Editar Track, Editar Proyecto, Editar Perfil y Login/Register con Google
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editProfileOpen, setEditProfileOpen] = useState<boolean>(false);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [googleConnected, setGoogleConnected] = useState<boolean>(false);

  // Landing Page con micro vinilos y referral invite (estilo HeySpace)
  const [showLanding, setShowLanding] = useState<boolean>(false);

  // Proyectos guardados en la biblioteca ("Guardados") para oyentes y artistas
  const [savedProjectIds, setSavedProjectIds] = useState<string[]>([]);
  const [librarySubTab, setLibrarySubTab] = useState<"proyectos" | "guardados">("proyectos");
  const [shareCopiedId, setShareCopiedId] = useState<string | null>(null);
  const [uploadingTrackProjectId, setUploadingTrackProjectId] = useState<string | null>(null);
  // Invitaciones a proyectos privados ("listen" = Solo escuchar, "edit" = Permitir editar el proyecto)
  const [projectInvites, setProjectInvites] = useState<Record<string, ProjectInviteRole>>({});
  const [invitingProjectId, setInvitingProjectId] = useState<string | null>(null);
  // Estados de la vista móvil estilo [untitled] adentro del proyecto
  const [projectSearchOpen, setProjectSearchOpen] = useState<boolean>(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState<string>("");
  const [projectMenuOpen, setProjectMenuOpen] = useState<boolean>(false);
  const [mobileTrackMenuId, setMobileTrackMenuId] = useState<string | null>(null);

  // Edición rápida / inline del título del proyecto directamente desde la vista del proyecto
  const [editingTitleProjectId, setEditingTitleProjectId] = useState<string | null>(null);
  const [inlineTitleValue, setInlineTitleValue] = useState<string>("");

  const handleSaveInlineTitle = (projectId: string, newTitle: string) => {
    const clean = newTitle.trim();
    if (clean) {
      updateProjectMeta(projectId, { title: clean });
      sfx.drop();
    }
    setEditingTitleProjectId(null);
  };

  const formatProjectTotalDuration = (tracksList: Track[]): string => {
    const totalSec = tracksList.reduce((acc, tr) => {
      if (typeof tr.durationSec === "number" && tr.durationSec > 0) {
        return acc + tr.durationSec;
      }
      const parts = (tr.duration || "0:00").split(":").map((n) => parseInt(n, 10) || 0);
      if (parts.length === 2) return acc + parts[0] * 60 + parts[1];
      return acc + 150;
    }, 0);
    const mins = Math.floor(totalSec / 60);
    const secs = Math.round(totalSec % 60);
    return `${mins}m ${String(secs).padStart(2, "0")}s`;
  };

  // ==================== TRACK FORCEFIELD DRAG & TRANSFER ====================
  const [draggedTrack, setDraggedTrack] = useState<{
    track: Track;
    sourceProjectId: string;
    sourceIndex: number;
  } | null>(null);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dropTargetTrackIndex, setDropTargetTrackIndex] = useState<number | null>(null);
  const [dropTargetProjectId, setDropTargetProjectId] = useState<string | null>(null);
  const [transferAnimation, setTransferAnimation] = useState<{
    track: Track;
    targetProjectId: string;
    active: boolean;
  } | null>(null);
  const [isOverLeftExitPortal, setIsOverLeftExitPortal] = useState<boolean>(false);
  const dragEndedRecentlyRef = useRef<boolean>(false);

  const startDraggingTrack = (
    e: React.PointerEvent,
    track: Track,
    index: number
  ) => {
    e.preventDefault();
    e.stopPropagation();
    sfx.open();

    const startX = e.clientX;
    const startY = e.clientY;

    setDraggedTrack({
      track,
      sourceProjectId: activeProject?.id || "",
      sourceIndex: index,
    });
    setDragPointer({ x: startX, y: startY });
    setDropTargetTrackIndex(index);
    setDropTargetProjectId(null);
    setIsOverLeftExitPortal(false);
  };

  const handleReorderTracks = (
    projectId: string,
    fromIndex: number,
    toIndex: number
  ) => {
    if (fromIndex === toIndex) return;
    sfx.drop();
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const copy = [...p.tracks];
        const [moved] = copy.splice(fromIndex, 1);
        copy.splice(toIndex, 0, moved);
        const updated = { ...p, tracks: copy };
        if (currentProject.id === p.id) setCurrentProject(updated);
        return updated;
      })
    );
  };

  const handleTransferTrackToProject = (
    sourceProjectId: string,
    trackId: string,
    targetProjectId: string
  ) => {
    const source = projects.find((p) => p.id === sourceProjectId);
    const target = projects.find((p) => p.id === targetProjectId);
    if (!source || !target || source.id === target.id) return;

    const trackToMove = source.tracks.find((t) => t.id === trackId);
    if (!trackToMove) return;

    // Feedback auditivo: tick y drop
    sfx.tick();
    setTimeout(() => sfx.drop(), 120);

    // Activar animación visual: entra por la derecha y salta tick popeando
    setTransferAnimation({
      track: trackToMove,
      targetProjectId: target.id,
      active: true,
    });

    setTimeout(() => {
      setTransferAnimation((curr) =>
        curr?.targetProjectId === target.id ? null : curr
      );
    }, 2400);

    // Mover track en el estado
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === source.id) {
          const updated = {
            ...p,
            tracks: p.tracks.filter((t) => t.id !== trackId),
          };
          if (currentProject.id === p.id) setCurrentProject(updated);
          return updated;
        }
        if (p.id === target.id) {
          const updated = {
            ...p,
            tracks: [...p.tracks, trackToMove],
          };
          if (currentProject.id === p.id) setCurrentProject(updated);
          return updated;
        }
        return p;
      })
    );
  };

  useEffect(() => {
    if (!draggedTrack) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      setDragPointer({ x, y });

      // Acción B: Si está adentro del proyecto y arrastra hacia la izquierda de la tapa
      // Salimos a la biblioteca de proyectos!
      if (insideCubeOpen) {
        const isDesktop = window.innerWidth > 720;
        const leftThreshold = isDesktop ? 440 : 110;
        const exitTriggerX = isDesktop ? 360 : 85;

        if (x < leftThreshold) {
          setIsOverLeftExitPortal(true);
        } else {
          setIsOverLeftExitPortal(false);
        }

        if (x < exitTriggerX) {
          sfx.close();
          setInsideCubeOpen(false);
          setIsOverLeftExitPortal(false);
          return;
        }

        // Si sigue dentro de la lista de pistas, detectar índice de destino para reordenar
        const elem = document.elementFromPoint(x, y);
        const rowElem = elem?.closest("[data-track-index]") as HTMLElement | null;
        if (rowElem) {
          const idx = Number(rowElem.getAttribute("data-track-index"));
          if (!isNaN(idx)) {
            setDropTargetTrackIndex(idx);
          }
        }
      } else {
        // Afuera en la biblioteca de proyectos:
        // Detectar proyecto bajo el puntero
        const elem = document.elementFromPoint(x, y);
        const projectElem = elem?.closest("[data-project-id]") as HTMLElement | null;
        if (projectElem) {
          const targetId = projectElem.getAttribute("data-project-id");
          if (targetId && targetId !== draggedTrack.sourceProjectId) {
            setDropTargetProjectId(targetId);
          } else {
            setDropTargetProjectId(null);
          }
        } else {
          setDropTargetProjectId(null);
        }
      }
    };

    const handleWindowPointerUp = () => {
      if (!insideCubeOpen && dropTargetProjectId && dropTargetProjectId !== draggedTrack.sourceProjectId) {
        handleTransferTrackToProject(draggedTrack.sourceProjectId, draggedTrack.track.id, dropTargetProjectId);
      } else if (insideCubeOpen && dropTargetTrackIndex !== null && dropTargetTrackIndex !== draggedTrack.sourceIndex) {
        handleReorderTracks(draggedTrack.sourceProjectId, draggedTrack.sourceIndex, dropTargetTrackIndex);
      } else {
        sfx.release();
      }

      dragEndedRecentlyRef.current = true;
      setTimeout(() => {
        dragEndedRecentlyRef.current = false;
      }, 260);

      setDraggedTrack(null);
      setDropTargetTrackIndex(null);
      setDropTargetProjectId(null);
      setIsOverLeftExitPortal(false);
    };

    window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
    };
  }, [draggedTrack, insideCubeOpen, dropTargetTrackIndex, dropTargetProjectId, projects]);

  // Bloqueo total de scroll del navegador en todas las pantallas excepto "inicio"
  // (evita que la pantalla se desplace o rebote al interactuar en web y celular)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isAppTabLocked = tab !== "inicio";
    document.documentElement.classList.toggle("app-no-scroll", isAppTabLocked);
    document.body.classList.toggle("app-no-scroll", isAppTabLocked);
    document.body.classList.toggle("mobile-vinyl-wheel-locked", isAppTabLocked);
    return () => {
      document.documentElement.classList.remove("app-no-scroll");
      document.body.classList.remove("app-no-scroll");
      document.body.classList.remove("mobile-vinyl-wheel-locked");
    };
  }, [tab]);

  const readStoredProjectInvites = (): Record<string, ProjectInviteRole> => {
    if (typeof window === "undefined") return {};
    try {
      const raw = localStorage.getItem("eltablero_project_invites_v1");
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  // Limpiar tokens de OAuth (#access_token=...) y sincronizar URLs limpias (/library, /profile, /upload, /project/:id?invite=...)
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.location.hash.includes("access_token") || window.location.hash.includes("error")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    const storedInvites = readStoredProjectInvites();
    const path = window.location.pathname;
    if (path === "/landing") {
      setShowLanding(true);
    } else if (path === "/library" || path === "/guardados") {
      setTab("biblioteca");
      if (path === "/guardados") setLibrarySubTab("guardados");
    } else if (path === "/upload" || path === "/subir") {
      setTab("subir");
    } else if (path === "/profile" || path === "/perfil") {
      setTab("perfil");
    } else if (path === "/create" || path === "/crear-proyecto") {
      setTab("crear-proyecto");
    } else if (path.startsWith("/project/")) {
      const pId = decodeURIComponent(path.replace("/project/", "")).trim();
      if (pId) {
        const inviteParam = new URLSearchParams(window.location.search).get("invite");
        const verifiedRole = verifyProjectInviteToken(pId, inviteParam);
        if (verifiedRole) {
          storedInvites[pId] = verifiedRole;
          try {
            localStorage.setItem("eltablero_project_invites_v1", JSON.stringify(storedInvites));
          } catch {}
        }
        setSelectedProjectId(pId);
        setLibrarySubTab("proyectos");
        setTab("biblioteca");
        setInsideCubeOpen(true);
      }
    }
    setProjectInvites(storedInvites);

    const onPop = () => {
      const cur = window.location.pathname;
      if (cur === "/landing") setShowLanding(true);
      else if (cur === "/library") {
        setShowLanding(false);
        setTab("biblioteca");
      } else if (cur === "/upload") {
        setShowLanding(false);
        setTab("subir");
      } else if (cur === "/profile") {
        setShowLanding(false);
        setTab("perfil");
      } else if (cur === "/create") {
        setShowLanding(false);
        setTab("crear-proyecto");
      } else {
        setShowLanding(false);
        setTab("inicio");
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Hidratar proyectos guardados
  useEffect(() => {
    try {
      const raw = localStorage.getItem("eltablero_saved_project_ids");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setSavedProjectIds(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("eltablero_saved_project_ids", JSON.stringify(savedProjectIds));
    } catch {}
  }, [savedProjectIds]);

  const toggleSaveProject = (projectId: string) => {
    sfx.tap();
    setSavedProjectIds((prev) => {
      const exists = prev.includes(projectId);
      const next = exists ? prev.filter((id) => id !== projectId) : [...prev, projectId];
      if (googleConnected && meProfile.id) {
        toggleSavedProjectInSupabase(meProfile.id, projectId, !exists);
      }
      return next;
    });
  };

  const handleUpdateProjectCover = (projectId: string, newCoverUrl: string) => {
    updateProjectMeta(projectId, { coverUrl: newCoverUrl });
    sfx.drop();
  };

  // Abre el modal estilo [untitled] de "Invitación al EP / Proyecto" (sin hacer público el proyecto privado)
  const handleCopyProjectLink = (projectId: string) => {
    sfx.open();
    setInvitingProjectId(projectId);
  };

  // Hidratar solo preferencias locales (las novedades de productores). Proyectos y perfil viven en la nube.
  // Hidratación instantánea (0ms Stale-While-Revalidate) desde localStorage + IndexedDB al apretar F5
  useEffect(() => {
    try {
      const savedDrops = localStorage.getItem(STORAGE_DROPS_KEY);
      if (savedDrops) {
        const parsedDrops = JSON.parse(savedDrops) as ProducerDropItem[];
        if (Array.isArray(parsedDrops)) setProducerDrops(parsedDrops);
      }

      const rawSnap = localStorage.getItem("eltablero_fast_snapshot_v2");
      if (rawSnap) {
        const snap = JSON.parse(rawSnap);
        if (snap?.meProfile?.id) {
          setMeProfile(snap.meProfile);
          setGoogleConnected(true);
        }
        if (Array.isArray(snap?.communityArtists) && snap.communityArtists.length > 0) {
          setCommunityArtists(snap.communityArtists);
        }
        if (Array.isArray(snap?.projects) && snap.projects.length > 0) {
          setProjects(snap.projects);
          const first = snap.projects[0];
          if (first) {
            setSelectedProjectId((prev) => prev || first.id);
          }
        }
      }
    } catch {
      // ignore storage errors
    } finally {
      setHydrated(true);
    }

    // Restaurar desde IndexedDB local (~3ms) cualquier portada/canvas pesado sin esperar a la red
    void fastCacheGet<Project[]>("eltablero_full_projects_v2").then((cachedProjs) => {
      if (Array.isArray(cachedProjs) && cachedProjs.length > 0) {
        const cachedMap = new Map(cachedProjs.map((cp) => [cp.id, cp]));
        setProjects((prev) => {
          if (prev.length === 0) return cachedProjs;
          return prev.map((p) => {
            const full = cachedMap.get(p.id);
            if (!full) return p;
            return {
              ...p,
              coverUrl: p.coverUrl || full.coverUrl,
              tracks: p.tracks.map((t) => {
                const ft = full.tracks.find((x) => x.id === t.id);
                return ft
                  ? {
                      ...t,
                      customAudioUrl: t.customAudioUrl || ft.customAudioUrl,
                      coverUrl: t.coverUrl || ft.coverUrl,
                    }
                  : t;
              }),
              videos:
                p.videos.some((v) => Boolean(v.url))
                  ? p.videos.map((v) => {
                      const fv = full.videos.find((x) => x.id === v.id);
                      return { ...v, url: v.url || fv?.url };
                    })
                  : full.videos,
            };
          });
        });
        setSelectedProjectId((prev) => prev || cachedProjs[0].id);
      }
    });
  }, []);

  // Guardar snapshot ultra-liviano en localStorage + copia completa en IndexedDB para F5 instantáneo
  useEffect(() => {
    if (!hydrated || !googleConnected || !meProfile.id) return;
    try {
      const stripHeavy = (u?: string) => (u && u.length > 90000 ? undefined : u);
      const lightProjects = projects.map((p) => ({
        ...p,
        coverUrl: stripHeavy(p.coverUrl),
        tracks: p.tracks.map((t) => ({
          ...t,
          customAudioUrl: stripHeavy(t.customAudioUrl),
          coverUrl: stripHeavy(t.coverUrl),
        })),
        videos: p.videos.map((v) => ({
          ...v,
          url: stripHeavy(v.url),
        })),
      }));
      localStorage.setItem(
        "eltablero_fast_snapshot_v2",
        JSON.stringify({
          meProfile: { ...meProfile, avatarUrl: stripHeavy(meProfile.avatarUrl) },
          projects: lightProjects,
          communityArtists: communityArtists.slice(0, 30).map((a) => ({
            ...a,
            avatarUrl: stripHeavy(a.avatarUrl),
          })),
        })
      );
    } catch {
      // ignore quota errors
    }
    void fastCacheSet("eltablero_full_projects_v2", projects);
  }, [projects, meProfile, communityArtists, hydrated, googleConnected]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_DROPS_KEY, JSON.stringify(producerDrops));
    } catch {
      // ignore
    }
  }, [producerDrops, hydrated]);

  // Restauración de reproducción ininterrumpida tras F5 / recarga
  const playbackRestoredRef = useRef<boolean>(false);
  useEffect(() => {
    if (playbackRestoredRef.current) return;
    try {
      const rawPlayback = localStorage.getItem("eltablero_playback_v1");
      if (!rawPlayback) return;
      const pb = JSON.parse(rawPlayback);
      if (!pb?.trackId) return;
      const allAvailable = [...projects, ...DEMO_PROJECTS];
      const p =
        allAvailable.find((x) => x.id === pb.projectId) ||
        allAvailable.find((x) => x.tracks.some((t) => t.id === pb.trackId));
      if (!p) return;
      const t = p.tracks.find((x) => x.id === pb.trackId);
      if (!t) return;
      playbackRestoredRef.current = true;
      setCurrentProject(p);
      setCurrentTrack(t);
      if (typeof pb.currentSec === "number" && pb.currentSec > 0) {
        sfx.setTrackDuration(t.durationSec || 174);
        sfx.seekGroove(pb.currentSec);
      }
    } catch {}
  }, [projects]);

  // Guardado periódico y en beforeunload para persistir segundos y track en F5
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saveCurrentPlayback = () => {
      if (!currentTrack || currentTrack.id === "standby-track") return;
      const prog = sfx.getGrooveProgress();
      try {
        localStorage.setItem(
          "eltablero_playback_v1",
          JSON.stringify({
            trackId: currentTrack.id,
            projectId: currentProject?.id || "",
            currentSec: prog.currentSec || 0,
            wasPlaying: isPlaying,
          })
        );
      } catch {}
    };

    window.addEventListener("beforeunload", saveCurrentPlayback);
    const interval = setInterval(saveCurrentPlayback, 2000);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentPlayback);
      clearInterval(interval);
    };
  }, [currentTrack, currentProject, isPlaying]);

  // Carga (o crea) el perfil de la cuenta + todos los proyectos en PARALELO (Stale-While-Revalidate)
  const applySession = async (u: any, mounted: () => boolean, fresh: boolean) => {
    if (!u || !mounted()) return;
    const meta = u.user_metadata || {};
    const defaultName = meta.full_name || meta.name || u.email?.split("@")[0] || "Artista";
    const rawH = (meta.user_name || u.email?.split("@")[0] || "artista").replace(/[^a-zA-Z0-9_]/g, "");

    let pendingRole: "artista" | "oyente" | null = null;
    try {
      pendingRole = (localStorage.getItem("eltablero_pending_role") as "artista" | "oyente") || null;
      const stored = localStorage.getItem(`eltablero_role_${u.id}`) as "artista" | "oyente" | null;
      if (pendingRole) {
        localStorage.setItem(`eltablero_role_${u.id}`, pendingRole);
        localStorage.removeItem("eltablero_pending_role");
      } else {
        pendingRole = stored;
      }
    } catch {}

    try {
      // 1 sola ronda de red: pedimos perfil, proyectos, artistas y guardados TODOS EN PARALELO
      const [profileRes, allProjs, profiles, savedIds] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.id).maybeSingle(),
        fetchUserProjectsFromSupabase(),
        fetchCommunityProfilesFromSupabase(),
        fetchSavedProjectIdsFromSupabase(u.id),
      ]);

      const existing = profileRes.data;
      let base: ArtistProfile;
      if (existing) {
        base = {
          ...EMPTY_ME_PROFILE,
          id: u.id,
          email: u.email,
          name: existing.name || defaultName,
          handle: existing.handle?.startsWith("@") ? existing.handle : `@${existing.handle}`,
          role: existing.role || EMPTY_ME_PROFILE.role,
          zone: existing.zone || "",
          crew: existing.crew || "",
          bio: existing.bio || "",
          color: existing.color || EMPTY_ME_PROFILE.color,
          avatarUrl: existing.avatar_url || meta.avatar_url || undefined,
          stickers: existing.stickers || [],
          createdAt: existing.created_at,
        };
      } else {
        // Cuenta nueva: perfil vacío (solo nombre y handle de Google)
        let handle = `@${rawH.toLowerCase()}`;
        let res = await saveUserProfileToSupabase({ id: u.id, handle, name: defaultName, avatarUrl: meta.avatar_url });
        if (!res.success) {
          handle = `@${rawH.toLowerCase()}${Math.floor(100 + Math.random() * 900)}`;
          res = await saveUserProfileToSupabase({ id: u.id, handle, name: defaultName, avatarUrl: meta.avatar_url });
        }
        base = {
          ...EMPTY_ME_PROFILE,
          id: u.id,
          email: u.email,
          name: defaultName,
          handle: res.cleanHandle || handle,
          avatarUrl: meta.avatar_url || undefined,
        };

        // Si se registró con un link de invitación, consumirlo inmediatamente
        const pendingInvite = getPendingInviteCode();
        if (pendingInvite) {
          void consumeInviteCode(pendingInvite, u.id, base.handle);
        }
        void getOrGenerateUserInvites(u.id, base.handle, base.name);
      }
      if (existing) {
        void getOrGenerateUserInvites(u.id, base.handle, base.name);
      }
      setWelcomeInvite(null);
      if (pendingRole) base.accountType = pendingRole;
      if (!mounted()) return;
      setMeProfile(base);
      setGoogleConnected(true);
      if (fresh) {
        setShowLanding(false);
        if (typeof window !== "undefined" && window.location.pathname.startsWith("/project/")) {
          setTab("biblioteca");
          setInsideCubeOpen(true);
        } else {
          setTab("inicio");
        }
      }

      setCommunityArtists(profiles);
      if (savedIds.length) setSavedProjectIds((prev) => Array.from(new Set([...prev, ...savedIds])));
      if (allProjs) {
        const storedInvites = readStoredProjectInvites();
        // Privacidad estilo [untitled]: un proyecto privado SOLO lo ve su creador o quien recibió el link de Invitación
        const visible = allProjs.filter(
          (p) => p.artistId === u.id || p.visibility === "public" || Boolean(storedInvites[p.id])
        );
        const sigs: Record<string, string> = {};
        visible.forEach((p) => (sigs[p.id] = JSON.stringify(p)));
        syncedSigRef.current = sigs;
        setProjects((prev) => {
          const prevMap = new Map(prev.map((x) => [x.id, x]));
          return visible.map((p) => {
            const loc = prevMap.get(p.id);
            if (!loc) return p;
            return {
              ...p,
              coverUrl: p.coverUrl || loc.coverUrl,
              videos: p.videos.some((v) => Boolean(v.url)) ? p.videos : loc.videos,
            };
          });
        });
        if (visible.length > 0) {
          const mine = visible.find((p) => p.artistId === u.id) || visible[0];
          setSelectedProjectId((prev) => prev || mine.id);
        }

        // Hidratar en segundo plano los audios desde IndexedDB / Supabase sin bloquear la UI
        void hydrateProjectsAudioInBackground(visible, (trackId, audioUrl) => {
          if (!mounted()) return;
          setCustomAudioMap((prev) => (prev[trackId] === audioUrl ? prev : { ...prev, [trackId]: audioUrl }));
        });
      }
      setCloudReady(true);
    } catch (e) {
      console.warn("Fallo sincronizar la cuenta con Supabase:", e);
      if (mounted()) setGoogleConnected(true);
    }
  };

  // Escuchar sesión activa de Supabase Auth
  useEffect(() => {
    let alive = true;
    const mounted = () => alive;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user && alive) {
          lastUserIdRef.current = session.user.id;
          setGoogleConnected(true);
          setAuthChecked(true);
          await applySession(session.user, mounted, false);
          return;
        }
      } catch (err) {
        console.warn("Supabase session check:", err);
      }
      if (alive) {
        setGoogleConnected(false);
        setAuthChecked(true);
        // Si entró por un link directo /project/:id?invite=... sin sesión iniciada, cargar el proyecto invitado
        if (typeof window !== "undefined" && window.location.pathname.startsWith("/project/")) {
          const storedInvites = readStoredProjectInvites();
          const allProjs = await fetchUserProjectsFromSupabase();
          if (allProjs && alive) {
            const visible = allProjs.filter(
              (p) => p.visibility === "public" || Boolean(storedInvites[p.id])
            );
            const sigs: Record<string, string> = {};
            visible.forEach((p) => (sigs[p.id] = JSON.stringify(p)));
            syncedSigRef.current = sigs;
            setProjects(visible);
            setCloudReady(true);
            void hydrateProjectsAudioInBackground(visible, (trackId, audioUrl) => {
              if (!alive) return;
              setCustomAudioMap((prev) => (prev[trackId] === audioUrl ? prev : { ...prev, [trackId]: audioUrl }));
            });
          }
        }
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "SIGNED_OUT") {
        lastUserIdRef.current = null;
        syncedSigRef.current = {};
        try {
          localStorage.removeItem("eltablero_fast_snapshot_v2");
        } catch {}
        void fastCacheSet("eltablero_full_projects_v2", []);
        setGoogleConnected(false);
        setCloudReady(false);
        setProjects([]);
        setMeProfile(EMPTY_ME_PROFILE);
        setSavedProjectIds([]);
        setCurrentProject(STANDBY_PROJECT);
        setCurrentTrack(STANDBY_TRACK);
        setIsPlaying(false);
        setShowLanding(false);
        setAuthChecked(true);
        return;
      }
      const u = session?.user;
      if (!u) return;
      // Refrescos de token / foco de pestaña no deben reiniciar la app: solo reaccionar a un usuario nuevo
      if (lastUserIdRef.current === u.id) return;
      lastUserIdRef.current = u.id;
      setAuthChecked(true);
      setGoogleConnected(true);
      setTimeout(() => {
        applySession(u, mounted, true);
      }, 0);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El tipo de proyecto se detecta solo: 1 track = Single, 2-6 = EP, 7+ = LP
  useEffect(() => {
    const AUTO = ["Single", "EP", "LP", "Album"];
    const wanted = (n: number) => (n <= 1 ? "Single" : n <= 6 ? "EP" : "LP");
    const needs = projects.some(
      (p) =>
        ((meProfile.id && p.artistId === meProfile.id) || projectInvites[p.id] === "edit") &&
        AUTO.includes(p.type) &&
        p.type !== wanted(p.tracks.length)
    );
    if (!needs) return;
    setProjects((prev) =>
      prev.map((p) =>
        ((meProfile.id && p.artistId === meProfile.id) || projectInvites[p.id] === "edit") &&
        AUTO.includes(p.type) &&
        p.type !== wanted(p.tracks.length)
          ? { ...p, type: wanted(p.tracks.length) as ProjectType }
          : p
      )
    );
  }, [projects, meProfile.id, projectInvites]);

  // Sincronización automática con la nube: sube archivos temporales y guarda proyectos propios o con invitación de edición
  useEffect(() => {
    const hasEditInvite = Object.values(projectInvites).includes("edit");
    if (!cloudReady || (!googleConnected && !hasEditInvite)) return;
    const editable = projects.filter(
      (p) => (meProfile.id && p.artistId === meProfile.id) || projectInvites[p.id] === "edit"
    );
    const pending = editable.filter((p) => syncedSigRef.current[p.id] !== JSON.stringify(p));
    if (pending.length === 0) return;

    let aborted = false;
    const safetyTimer = setTimeout(() => {
      // Guard de seguridad: si pasaron 12s, no dejar la UI clavada en "Guardando…"
      setSyncStatus((s) => (s === "saving" ? "idle" : s));
    }, 12000);

    const timer = setTimeout(async () => {
      setSyncStatus("saving");
      let failed = false;
      for (const proj of pending) {
        if (aborted) break;
        const sig = JSON.stringify(proj);
        const ownerUserId = proj.artistId || meProfile.id || "";
        const saved = await saveProjectToSupabase(proj, ownerUserId);
        if (!saved) {
          failed = true;
          // Marcamos como intentado para NO entrar en bucle infinito cada 900ms
          syncedSigRef.current[proj.id] = sig;
          continue;
        }
        const merged = mergePersistedUrls(proj, saved);
        // Siempre registramos la firma del resultado para evitar el loop infinito
        syncedSigRef.current[proj.id] = JSON.stringify(merged);
        if (JSON.stringify(merged) !== sig) {
          setProjects((prev) => prev.map((x) => (x.id === proj.id ? mergePersistedUrls(x, saved) : x)));
        }
      }
      if (!aborted) {
        clearTimeout(safetyTimer);
        if (failed) {
          setSyncStatus("error");
          // Revertir a idle tras 3.5 segundos para que la pill no quede pegada
          setTimeout(() => {
            setSyncStatus((s) => (s === "error" ? "idle" : s));
          }, 3500);
        } else {
          setSyncStatus("idle");
        }
      }
    }, 900);

    return () => {
      aborted = true;
      clearTimeout(timer);
      clearTimeout(safetyTimer);
    };
  }, [projects, googleConnected, cloudReady, meProfile.id, projectInvites]);

  const activeProject: Project | null =
    projects.find((p) => p.id === selectedProjectId) ||
    DEMO_PROJECTS.find((p) => p.id === selectedProjectId) ||
    projects.find((p) => p.artistId === meProfile.id) ||
    projects[0] ||
    null;

  const playTrack = (track: Track, project: Project, openFull = false) => {
    const isDifferentTrack = track.id !== currentTrack.id;
    if (!isDifferentTrack && isPlaying) {
      if (openFull) setPlayerExpanded(true);
      return;
    }
    if (!isDifferentTrack && !isPlaying) {
      togglePlay();
      if (openFull) setPlayerExpanded(true);
      return;
    }
    setCurrentTrack(track);
    setCurrentProject(project);
    setIsPlaying(true);
    sfx.play();
    const knownAudio = track.customAudioUrl || customAudioMap[track.id];
    if (knownAudio) {
      sfx.startGroove(
        track.bpm,
        track.audioFreq,
        knownAudio,
        track.durationSec,
        isDifferentTrack
      );
    } else {
      // Resolver desde IndexedDB (1ms) o Supabase bajo demanda si el usuario tocó Play enseguida
      void resolveTrackAudioUrl(track.id).then((resolved) => {
        if (resolved) {
          setCustomAudioMap((prev) => ({ ...prev, [track.id]: resolved }));
        }
        sfx.startGroove(
          track.bpm,
          track.audioFreq,
          resolved,
          track.durationSec,
          isDifferentTrack
        );
      });
    }
    if (openFull) setPlayerExpanded(true);
  };

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      sfx.pause();
      sfx.pauseGroove();
    } else {
      if (currentTrack.id === "standby-track") {
        const firstProj =
          projects.find((p) => p.tracks.length > 0) ||
          DEMO_PROJECTS.find((p) => p.tracks.length > 0);
        if (firstProj && firstProj.tracks[0]) {
          playTrack(firstProj.tracks[0], firstProj, false);
          return;
        }
      }
      setIsPlaying(true);
      sfx.play();
      const knownAudio = currentTrack.customAudioUrl || customAudioMap[currentTrack.id];
      if (knownAudio) {
        sfx.resumeGroove(
          currentTrack.bpm,
          currentTrack.audioFreq,
          knownAudio,
          currentTrack.durationSec
        );
      } else {
        void resolveTrackAudioUrl(currentTrack.id).then((resolved) => {
          if (resolved) {
            setCustomAudioMap((prev) => ({ ...prev, [currentTrack.id]: resolved }));
          }
          sfx.resumeGroove(
            currentTrack.bpm,
            currentTrack.audioFreq,
            resolved,
            currentTrack.durationSec
          );
        });
      }
    }
  };

  const handleVolumeChange = (nextVol: number) => {
    const clamped = Math.max(0, Math.min(1, nextVol));
    setVolume(clamped);
    if (clamped > 0 && muted) {
      setMuted(false);
      sfx.setMuted(false);
    }
    sfx.setVolume(clamped);
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    sfx.setMuted(next);
  };

  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  const hasEnteredInspectorRef = useRef(false);
  const inspectorTouchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    hasEnteredInspectorRef.current = false;
  }, [insideCubeOpen, selectedProjectId]);

  useEffect(() => {
    const INTERACTIVE_SELECTOR =
      'button, a, label, select, summary, input[type="range"], input[type="color"], [role="button"], .clean-track-row, .artist-dir-item, .filmstrip-thumb, .mini-art, .mini-meta, .prop-card, .upload-dropzone, .quick-proj-pill, .video-clip-remove-btn, .ios-seg-control button, .seg-pills button, .ios-icon-btn, .apple-btn, .mini-btn, .mini-play-btn';

    let pressedEl: Element | null = null;
    let hoveredEl: Element | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        sfx.press();
        togglePlayRef.current();
      } else if (e.key === "Escape" || e.key === "Backspace") {
        sfx.close();
        setEditingTrack(null);
        setEditProfileOpen(false);
        setAuthModalOpen(false);
        setInsideCubeOpen(false);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const match = target?.closest?.(INTERACTIVE_SELECTOR) || null;
      if (match) {
        pressedEl = match;
        sfx.press();
      }
    };

    const onPointerUp = () => {
      if (pressedEl) {
        pressedEl = null;
        sfx.release();
      }
    };

    const onPointerOver = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      const match = target?.closest?.(INTERACTIVE_SELECTOR) || null;
      if (match && match !== hoveredEl) {
        hoveredEl = match;
        sfx.hover();
      } else if (!match) {
        hoveredEl = null;
      }
    };

    const onInputOrChange = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (
        target.tagName === "SELECT" ||
        (target.tagName === "INPUT" && (target as HTMLInputElement).type === "range")
      ) {
        sfx.tick();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    window.addEventListener("pointerover", onPointerOver, { passive: true });
    window.addEventListener("input", onInputOrChange, { passive: true });
    window.addEventListener("change", onInputOrChange, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      window.removeEventListener("pointerover", onPointerOver);
      window.removeEventListener("input", onInputOrChange);
      window.removeEventListener("change", onInputOrChange);
    };
  }, []);

  const stepTrack = (dir: 1 | -1) => {
    // Si va hacia adelante y hay canciones en la cola del usuario, reproducir la primera de la cola
    if (dir === 1 && userQueue.length > 0) {
      const [nextItem, ...rest] = userQueue;
      setUserQueue(rest);
      playTrack(nextItem.track, nextItem.project, playerExpanded);
      return;
    }

    const list = currentProject.tracks;
    if (shuffle && list.length > 1) {
      const candidates = list.filter((t) => t.id !== currentTrack.id);
      const randomTrack = candidates[Math.floor(Math.random() * candidates.length)] || list[0];
      playTrack(randomTrack, currentProject, playerExpanded);
      return;
    }

    const idx = list.findIndex((t) => t.id === currentTrack.id);
    const nextIdx = (idx + dir + list.length) % list.length;
    const nextTrack = list[nextIdx] || list[0];
    playTrack(nextTrack, currentProject, playerExpanded);
  };

  // Widget nativo de iPhone / Android (pantalla de bloqueo, Control Center, AirPods):
  // título, artistas y tapa del track actual, igual que [untitled] / Spotify.
  const mediaSessionCtlRef = useRef({ toggle: () => {}, step: (_d: 1 | -1) => {}, playing: false });
  mediaSessionCtlRef.current = { toggle: togglePlay, step: stepTrack, playing: isPlaying };

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    if (currentTrack.id === "standby-track") {
      ms.metadata = null;
      return;
    }
    const artists = [currentTrack.artist, currentTrack.feat && `feat. ${currentTrack.feat}`]
      .filter(Boolean)
      .join(" ");
    const rawCover = currentTrack.coverUrl || currentProject.coverUrl || "/icon.png";
    const cover = rawCover.startsWith("/") ? `${window.location.origin}${rawCover}` : rawCover;
    const prodLine =
      currentTrack.prod && currentTrack.prod !== currentTrack.artist
        ? `${artists} · prod. ${currentTrack.prod}`
        : artists;
    try {
      ms.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: prodLine,
        album: currentProject.title,
        artwork: [96, 192, 256, 384, 512].map((s) => ({ src: cover, sizes: `${s}x${s}` })),
      });
    } catch {
      /* algunos navegadores rechazan data URLs enormes: dejamos solo título */
      ms.metadata = new MediaMetadata({ title: currentTrack.title, artist: prodLine, album: currentProject.title });
    }
  }, [
    currentTrack.id,
    currentTrack.title,
    currentTrack.artist,
    currentTrack.feat,
    currentTrack.prod,
    currentTrack.coverUrl,
    currentProject.title,
    currentProject.coverUrl,
  ]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {}
    };
    set("play", () => {
      if (!mediaSessionCtlRef.current.playing) mediaSessionCtlRef.current.toggle();
    });
    set("pause", () => {
      if (mediaSessionCtlRef.current.playing) mediaSessionCtlRef.current.toggle();
    });
    set("previoustrack", () => mediaSessionCtlRef.current.step(-1));
    set("nexttrack", () => mediaSessionCtlRef.current.step(1));
    set("seekto", (d) => {
      if (typeof d.seekTime === "number") sfx.seek(d.seekTime);
    });
    return () => {
      (["play", "pause", "previoustrack", "nexttrack", "seekto"] as MediaSessionAction[]).forEach((a) =>
        set(a, null)
      );
    };
  }, []);

  onTrackEndedRef.current = () => {
    if (repeatMode === "one") {
      sfx.seek(0);
      sfx.resumeGroove(
        currentTrack.bpm,
        currentTrack.audioFreq,
        currentTrack.customAudioUrl || customAudioMap[currentTrack.id],
        currentTrack.durationSec
      );
      return;
    }

    if (userQueue.length > 0) {
      const [nextItem, ...rest] = userQueue;
      setUserQueue(rest);
      playTrack(nextItem.track, nextItem.project, playerExpanded);
      return;
    }

    const list = currentProject.tracks;
    const idx = list.findIndex((t) => t.id === currentTrack.id);

    // Si el proyecto tiene más canciones después de la actual, pasa a la siguiente
    if (list.length > 1 && idx >= 0 && idx < list.length - 1) {
      playTrack(list[idx + 1], currentProject, playerExpanded);
      return;
    }

    // Si tiene activado repetir todo el álbum y hay más de 1 track, vuelve al primero
    if (repeatMode === "all" && list.length > 1) {
      playTrack(list[0], currentProject, playerExpanded);
      return;
    }

    // Cuando una canción sola termina (o termina el proyecto sin repeat), termina ahí y se frena limpio
    setIsPlaying(false);
    sfx.stopGroove(false);
    sfx.seek(0);
    setMiniPlayback((prev) => ({ ...prev, currentSec: 0 }));
  };

  // Actualizar metadata completable del proyecto (tipo, atributos, zona, año, estado, etc.)
  const updateProjectMeta = (projectId: string, patch: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const updated = { ...p, ...patch };
        if (currentProject.id === p.id) setCurrentProject(updated);
        return updated;
      })
    );
  };

  const handleAddAttribute = (projectId: string, rawAttr: string) => {
    const clean = rawAttr.trim();
    if (!clean) return;
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const existing = target.attributes || [target.zone, target.year];
    if (existing.includes(clean)) return;
    updateProjectMeta(projectId, { attributes: [...existing, clean] });
    setNewAttrInput("");
    sfx.tap();
  };

  const handleRemoveAttribute = (projectId: string, attrToRemove: string) => {
    const target = projects.find((p) => p.id === projectId);
    if (!target) return;
    const existing = target.attributes || [target.zone, target.year];
    updateProjectMeta(projectId, {
      attributes: existing.filter((a) => a !== attrToRemove),
    });
    sfx.tap();
  };

  const handleAddTrackToProject = async (
    projectId: string,
    newTrack: Track,
    insertIndex: number,
    customAudioUrl?: string
  ) => {
    if (customAudioUrl) {
      setCustomAudioMap((prev) => ({ ...prev, [newTrack.id]: customAudioUrl }));
    }
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const copy = [...p.tracks];
        const safeIdx = Math.max(0, Math.min(copy.length, insertIndex));
        copy.splice(safeIdx, 0, newTrack);
        const updated = { ...p, tracks: copy };
        if (currentProject.id === p.id) setCurrentProject(updated);
        return updated;
      })
    );
    setSelectedProjectId(projectId);
    // La sincronización con la nube (archivos incluidos) la hace el efecto de sync
  };

  const handleUploadProjectVideo = (projectId: string, file: File) => {
    const url = URL.createObjectURL(file);
    const isImage =
      file.type.startsWith("image/") || /\.(gif|png|jpe?g|webp|avif)$/i.test(file.name);
    const newClip: ProjectVideoClip = {
      id: `clip-${Date.now()}`,
      label: file.name,
      kind: "uploaded",
      stylePreset: "vhs-grain",
      url,
      mediaType: isImage ? "image" : "video",
      c1: "#111111",
      c2: "#e11d48",
    };
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const updated = { ...p, videos: [newClip, ...p.videos] };
        if (currentProject.id === p.id || currentProject.id === "standby-project") {
          setCurrentProject(updated);
        }
        return updated;
      })
    );
  };

  const handleRemoveProjectVideo = (projectId: string, clipId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const updated = {
          ...p,
          videos: p.videos.filter((v) => v.id !== clipId),
        };
        if (currentProject.id === p.id) {
          setCurrentProject(updated);
        }
        return updated;
      })
    );
  };

  const handleDeleteProject = (projectId: string) => {
    if (googleConnected) {
      deleteProjectFromSupabase(projectId).then();
    }
    delete syncedSigRef.current[projectId];
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== projectId);
      if (next.length === 0) {
        setSelectedProjectId("");
        setInsideCubeOpen(false);
        setCurrentProject(STANDBY_PROJECT);
        setCurrentTrack(STANDBY_TRACK);
        setIsPlaying(false);
        sfx.stopGroove();
        return [];
      }
      if (selectedProjectId === projectId && next[0]) {
        setSelectedProjectId(next[0].id);
      }
      if (currentProject.id === projectId && next[0]) {
        setCurrentProject(next[0]);
        if (next[0].tracks[0]) setCurrentTrack(next[0].tracks[0]);
      }
      return next;
    });
    sfx.close();
  };

  const handleDeleteTrack = (projectId: string, trackId: string) => {
    if (googleConnected) {
      deleteTrackFromSupabase(trackId).then();
    }
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const nextTracks = p.tracks.filter((t) => t.id !== trackId);
        const updated = { ...p, tracks: nextTracks };
        if (currentProject.id === p.id) {
          setCurrentProject(updated);
          if (currentTrack.id === trackId && nextTracks[0]) {
            setCurrentTrack(nextTracks[0]);
          }
        }
        return updated;
      })
    );
    if (editingTrack?.id === trackId) setEditingTrack(null);
    sfx.close();
  };

  const handleDeleteTrackById = (trackId: string) => {
    const owner = projects.find((p) => p.tracks.some((t) => t.id === trackId));
    if (owner) {
      handleDeleteTrack(owner.id, trackId);
    }
  };

  const handleSaveEditedTrack = (updatedTrack: Track) => {
    setProjects((prev) =>
      prev.map((p) => {
        const hasTrack = p.tracks.some((t) => t.id === updatedTrack.id);
        if (!hasTrack) return p;
        const nextTracks = p.tracks.map((t) => (t.id === updatedTrack.id ? updatedTrack : t));
        const nextProj = { ...p, tracks: nextTracks };
        if (currentProject.id === p.id) setCurrentProject(nextProj);
        return nextProj;
      })
    );
    if (currentTrack.id === updatedTrack.id) {
      setCurrentTrack(updatedTrack);
      if (isPlaying) {
        sfx.startGroove(
          updatedTrack.bpm,
          updatedTrack.audioFreq,
          updatedTrack.customAudioUrl || customAudioMap[updatedTrack.id],
          updatedTrack.durationSec,
          false
        );
      }
    }
    setEditingTrack(null);
    sfx.drop();
  };

  const handleSaveTrackAndClip = (updatedTrack: Track, updatedClip?: ProjectVideoClip) => {
    setProjects((prev) =>
      prev.map((p) => {
        const hasTrack = p.tracks.some((t) => t.id === updatedTrack.id);
        if (!hasTrack) return p;
        const nextTracks = p.tracks.map((t) => (t.id === updatedTrack.id ? updatedTrack : t));
        let nextVideos = p.videos;
        if (updatedClip) {
          if (p.videos && p.videos.some((v) => v.url === updatedClip.url)) {
            nextVideos = p.videos.map((v) => (v.url === updatedClip.url ? updatedClip : v));
          } else {
            nextVideos = [updatedClip, ...(p.videos || [])];
          }
        }
        const nextProj = { ...p, tracks: nextTracks, videos: nextVideos };
        if (currentProject.id === p.id) setCurrentProject(nextProj);
        if (googleConnected) {
          saveProjectToSupabase(nextProj).catch(() => {});
        }
        return nextProj;
      })
    );
    if (currentTrack.id === updatedTrack.id) {
      setCurrentTrack(updatedTrack);
      sfx.initTrackModifiers(updatedTrack.pitchShift ?? 0, updatedTrack.tempoMultiplier ?? 1.0);
    }
  };

  const handleUploadProjectTrack = async (projectId: string, file: File) => {
    setUploadingTrackProjectId(projectId);
    try {
      const objectUrl = URL.createObjectURL(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, "");
      const [analysis, cloudAudioUrl] = await Promise.all([
        analyzeAudioFile(file),
        googleConnected ? uploadMediaToSupabase(file, "tracks") : Promise.resolve(null),
      ]);
      const finalAudioUrl = cloudAudioUrl || objectUrl;
      const newTrack: Track = {
        id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: cleanName,
        artist: meProfile.name || meProfile.handle,
        prod: meProfile.name || meProfile.handle,
        bpm: analysis.bpm,
        key: analysis.key,
        duration: analysis.duration,
        durationSec: analysis.durationSec,
        version: 1,
        glyph: "01",
        c1: "#ffffff",
        c2: "#888888",
        accent: "#ffffff",
        audioFreq: 80,
        customAudioUrl: finalAudioUrl,
      };
      if (finalAudioUrl) {
        setCustomAudioMap((prev) => ({ ...prev, [newTrack.id]: finalAudioUrl }));
      }
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          const nextTracks = [
            ...p.tracks,
            {
              ...newTrack,
              glyph: String(p.tracks.length + 1).padStart(2, "0"),
            },
          ];
          const nextProj = { ...p, tracks: nextTracks };
          if (currentProject.id === p.id) setCurrentProject(nextProj);
          return nextProj;
        })
      );
      sfx.drop();
    } finally {
      setUploadingTrackProjectId((prev) => (prev === projectId ? null : prev));
    }
  };

  const handleUploadMultipleProjectTracks = async (
    projectId: string,
    fileList: FileList | File[]
  ) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUploadingTrackProjectId(projectId);
    try {
      const createdTracks: Track[] = [];
      const newAudioEntries: Record<string, string> = {};
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const objectUrl = URL.createObjectURL(file);
        const cleanName = file.name.replace(/\.[^/.]+$/, "");
        const [analysis, cloudAudioUrl] = await Promise.all([
          analyzeAudioFile(file),
          googleConnected ? uploadMediaToSupabase(file, "tracks") : Promise.resolve(null),
        ]);
        const finalAudioUrl = cloudAudioUrl || objectUrl;
        const tr: Track = {
          id: `tr-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          title: cleanName,
          artist: meProfile.name || meProfile.handle,
          prod: meProfile.name || meProfile.handle,
          bpm: analysis.bpm,
          key: analysis.key,
          duration: analysis.duration,
          durationSec: analysis.durationSec,
          version: 1,
          glyph: String(i + 1).padStart(2, "0"),
          c1: "#ffffff",
          c2: "#888888",
          accent: "#ffffff",
          audioFreq: 80,
          customAudioUrl: finalAudioUrl,
        };
        createdTracks.push(tr);
        if (finalAudioUrl) {
          newAudioEntries[tr.id] = finalAudioUrl;
        }
      }
      if (Object.keys(newAudioEntries).length > 0) {
        setCustomAudioMap((prev) => ({ ...prev, ...newAudioEntries }));
      }
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p;
          const baseLen = p.tracks.length;
          const nextTracks = [
            ...p.tracks,
            ...createdTracks.map((tr, idx) => ({
              ...tr,
              glyph: String(baseLen + idx + 1).padStart(2, "0"),
            })),
          ];
          const nextProj = { ...p, tracks: nextTracks };
          if (currentProject.id === p.id) setCurrentProject(nextProj);
          return nextProj;
        })
      );
      sfx.drop();
    } finally {
      setUploadingTrackProjectId((prev) => (prev === projectId ? null : prev));
    }
  };

  const handleSaveEditedProject = (updatedProject: Project) => {
    setProjects((prev) =>
      prev.map((p) => (p.id === updatedProject.id ? updatedProject : p))
    );
    if (currentProject.id === updatedProject.id) {
      setCurrentProject(updatedProject);
    }
    setEditingProject(null);
    sfx.drop();
  };

  const handleSaveProfileAndHandle = async (
    updated: Partial<ArtistProfile> & { name: string; handle: string; email?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    let userId = meProfile.id;
    if (!userId) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) userId = session.user.id;
    }

    if (!userId) {
      const rawH = updated.handle
        .replace(/^@+/, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9._]/g, "");
      const cleanHandle = `@${rawH || "artista"}`;
      setMeProfile((prev) => ({
        ...prev,
        ...updated,
        handle: cleanHandle,
      }));
      return { success: true };
    }

    const res = await saveUserProfileToSupabase({
      id: userId,
      handle: updated.handle,
      name: updated.name,
      role: updated.role ?? meProfile.role,
      zone: updated.zone ?? meProfile.zone,
      crew: updated.crew ?? meProfile.crew,
      bio: updated.bio ?? meProfile.bio,
      color: updated.color || meProfile.color,
      stickers: updated.stickers ?? meProfile.stickers,
      avatarUrl: updated.avatarUrl || meProfile.avatarUrl,
    });

    if (res.success && res.cleanHandle) {
      setMeProfile((prev) => ({
        ...prev,
        ...updated,
        handle: res.cleanHandle!,
      }));
      const fresh = await fetchCommunityProfilesFromSupabase();
      setCommunityArtists(fresh);
      return { success: true };
    }

    return { success: false, error: res.error || "No se pudo guardar el perfil." };
  };

  const navigate = (nextTab: ScreenTab) => {
    sfx.nav();
    setTab(nextTab);
    setShowLanding(false);
    window.scrollTo({ top: 0, behavior: "smooth" });

    if (typeof window !== "undefined") {
      const pathToTab: Record<ScreenTab, string> = {
        inicio: "/",
        biblioteca: "/library",
        subir: "/upload",
        perfil: "/profile",
        "crear-proyecto": "/create",
      };
      const cleanPath = pathToTab[nextTab] || "/";
      window.history.pushState({ tab: nextTab }, "", cleanPath);
    }
  };

  const navigateToProject = (projId: string) => {
    sfx.open();
    setSelectedProjectId(projId);
    setLibrarySubTab("proyectos");
    setInsideCubeOpen(true);
    navigate("biblioteca");
  };

  const navigateToArtist = (artistName: string) => {
    sfx.tap();
    const clean = (artistName || "").trim().toLowerCase();
    const isMe =
      clean === "poyo" ||
      clean.includes("poyo") ||
      (meProfile.name && clean.includes(meProfile.name.toLowerCase())) ||
      (meProfile.handle && clean.includes(meProfile.handle.toLowerCase().replace("@", "")));

    if (isMe) {
      navigate("perfil");
      return;
    }

    const allList = [...boardProjects, ...DEMO_PROJECTS];
    const matchProj = allList.find(
      (p) =>
        p.artist?.toLowerCase().includes(clean) ||
        p.artistId?.toLowerCase() === clean ||
        p.tracks.some((t) => t.artist?.toLowerCase().includes(clean))
    );

    // Si tiene link de Spotify (artistas que todavía no están en el foro), abrir su Spotify directo
    if (matchProj?.spotifyUrl) {
      window.open(matchProj.spotifyUrl, "_blank", "noopener,noreferrer");
      return;
    }

    if (matchProj) {
      setSelectedProjectId(matchProj.id);
      setInsideCubeOpen(true);
      navigate("biblioteca");
    } else {
      navigate("perfil");
    }
  };

  const activeIsMine = Boolean(activeProject && meProfile.id && activeProject.artistId === meProfile.id);
  const activeInviteRole: ProjectInviteRole | null = activeProject ? projectInvites[activeProject.id] || null : null;
  const canEditActive = Boolean(activeProject && (activeIsMine || activeInviteRole === "edit"));
  const myProjects = projects.filter(
    (p) => (meProfile.id && p.artistId === meProfile.id) || Boolean(projectInvites[p.id])
  );

  // Proyectos ordenados por lo más nuevo que se va subiendo en tiempo real (excluyendo proyectos privados)
  const userProjectsRecent = [...projects]
    .filter((p) => p.visibility !== "private" && p.status !== "Privado")
    .sort((a, b) => {
      const tA = new Date(a.createdAt || 0).getTime();
      const tB = new Date(b.createdAt || 0).getTime();
      return tB - tA;
    });

  // board. Inicio muestra lo que se va subiendo en tiempo real + catálogo base curado (exclusivamente proyectos públicos)
  const boardProjects: Project[] = [
    ...userProjectsRecent,
    ...DEMO_PROJECTS.filter(
      (d) =>
        d.visibility !== "private" &&
        d.status !== "Privado" &&
        !userProjectsRecent.some(
          (p) =>
            p.id.toLowerCase() === d.id.toLowerCase() ||
            p.title.trim().toLowerCase() === d.title.trim().toLowerCase()
        )
    ),
  ];
  const allAccessibleProjects: Project[] = [
    ...projects,
    ...DEMO_PROJECTS.filter(
      (d) =>
        !projects.some(
          (p) =>
            p.id.toLowerCase() === d.id.toLowerCase() ||
            p.title.trim().toLowerCase() === d.title.trim().toLowerCase()
        )
    ),
  ];
  const invitingProject: Project | null = invitingProjectId
    ? allAccessibleProjects.find((p) => p.id === invitingProjectId) || null
    : null;
  const projectTypeByCount = (n: number): ProjectType => (n <= 1 ? "Single" : n <= 6 ? "EP" : "LP");

  // Artistas en board.: ÚNICAMENTE las personas reales que se van logueando / registrando (excluyendo a Jaime Martinez)
  const loggedInArtists = communityArtists.filter((ca) => {
    const h = (ca.handle || "").toLowerCase();
    const n = (ca.name || "").toLowerCase();
    return !h.includes("jm2100553") && !n.includes("jaime martinez");
  });

  const allArtists = [
    ...(meProfile.id && !loggedInArtists.some((a) => a.id === meProfile.id || a.handle === meProfile.handle)
      ? [meProfile]
      : []),
    ...loggedInArtists,
  ];
  const sortedArtists = allArtists
    .map((a) => {
      const owned = boardProjects.filter(
        (p) => p.artistId === a.id || p.artist.toLowerCase().includes(a.name.toLowerCase())
      );
      return {
        artist: a,
        owned,
        trackCount: owned.reduce((acc, p) => acc + p.tracks.length, 0) || a.tracksCount || 0,
      };
    })
    .sort((x, y) =>
      artistSort === "populares"
        ? (y.trackCount + y.owned.length * 3) - (x.trackCount + x.owned.length * 3)
        : (y.artist.createdAt || "").localeCompare(x.artist.createdAt || "")
    );
  const savedProjectsList = allAccessibleProjects.filter((p) => savedProjectIds.includes(p.id));
  const activeAttributes = activeProject
    ? activeProject.attributes || [activeProject.zone, activeProject.year]
    : [];
  const filteredProducerDrops =
    producerFilter === "Todos"
      ? producerDrops
      : producerDrops.filter((d) => d.kind === producerFilter);

  const findProjectById = (id: string): Project | undefined => {
    const clean = id.toLowerCase().replace(/^proj-/, "");
    return (
      projects.find(
        (p) =>
          p.id.toLowerCase() === id.toLowerCase() ||
          p.id.toLowerCase() === clean ||
          p.id.toLowerCase() === `proj-${clean}` ||
          p.title.toLowerCase().replace(/[^a-z0-9]/g, "").includes(clean.replace(/[^a-z0-9]/g, ""))
      ) ||
      DEMO_PROJECTS.find(
        (p) =>
          p.id.toLowerCase() === id.toLowerCase() ||
          p.id.toLowerCase() === clean ||
          p.id.toLowerCase() === `proj-${clean}` ||
          p.title.toLowerCase().replace(/[^a-z0-9]/g, "").includes(clean.replace(/[^a-z0-9]/g, ""))
      )
    );
  };

  const hasGuestInviteAccess = Boolean(selectedProjectId && projectInvites[selectedProjectId]);

  if (!authChecked) return <div className="auth-splash" aria-hidden />;
  if (!googleConnected && !hasGuestInviteAccess) {
    return (
      <>
        <LandingScene
          onOpenGoogleAuth={() => setAuthModalOpen(true)}
          onSetAccountRole={(role) => {
            try {
              localStorage.setItem("eltablero_pending_role", role);
            } catch {}
          }}
        />
        <AnimatePresence>
          {authModalOpen && (
            <GoogleAuthModal
              profile={meProfile}
              connected={false}
              onClose={() => setAuthModalOpen(false)}
              onSaveProfile={handleSaveProfileAndHandle}
              onSignOut={() => setAuthModalOpen(false)}
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="apple-shell">
      <div className="paper-grain" aria-hidden />

      {/* Top Navigation Bar */}
      <header className="ios-navbar">
        <button
          type="button"
          className="ios-brand-title"
          onMouseEnter={() => sfx.hover()}
          onClick={() => navigate("inicio")}
        >
          <span className="brand-dot" />
          <strong>El tablero.</strong>
        </button>

        <nav className="ios-seg-control" aria-label="Navegación principal">
          {(
            (meProfile.accountType === "oyente"
              ? [
                  ["inicio", "Inicio"],
                  ["biblioteca", "Guardados"],
                  ["perfil", googleConnected ? meProfile.handle : "Iniciar sesión"],
                ]
              : [
                  ["inicio", "Inicio"],
                  ["subir", "Subir"],
                  ["biblioteca", "Biblioteca"],
                  ["perfil", googleConnected ? meProfile.handle : "Iniciar sesión"],
                ]) as [ScreenTab, string][]
          ).map(([id, label]) => {
            const isActive =
              tab === id || (id === "biblioteca" && tab === "crear-proyecto");
            return (
              <button
                key={id}
                type="button"
                className={isActive ? "active" : ""}
                onMouseEnter={() => sfx.hover()}
                onClick={() => {
                  if (id === "perfil" && !googleConnected) {
                    sfx.open();
                    setAuthModalOpen(true);
                    return;
                  }
                  if (id === "biblioteca") {
                    setInsideCubeOpen(false);
                    if (meProfile.accountType === "oyente") setLibrarySubTab("guardados");
                  }
                  navigate(id);
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="iosSegPill"
                    className="seg-pill-bg"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="seg-label">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="ios-nav-right">
          {/* Theme Toggle Button (Dark / Light) */}
          <button
            type="button"
            className="ios-icon-btn theme-toggle-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={toggleTheme}
            title={theme === "dark" ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
            aria-label="Alternar modo oscuro / claro"
          >
            {theme === "dark" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <button
            type="button"
            className="ios-icon-btn"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            onMouseEnter={() => sfx.hover()}
            onClick={() => {
              sfx.open();
              setAuthModalOpen(true);
            }}
          >
            {googleConnected ? (
              <>
                {meProfile.avatarUrl ? (
                  <img
                    src={meProfile.avatarUrl}
                    alt={meProfile.name}
                    style={{ width: 17, height: 17, borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ width: 17, height: 17, borderRadius: "50%", background: meProfile.color, display: "grid", placeItems: "center", fontSize: 9, color: "#fff", fontWeight: 700 }}>
                    {meProfile.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span>{meProfile.handle}</span>
              </>
            ) : (
              <>
                <GoogleCircleIcon size={14} />
                <span>Iniciar sesión</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="ios-icon-btn"
            onMouseEnter={() => sfx.hover()}
            onClick={handleToggleMute}
            aria-label={muted ? "Activar sonido" : "Silenciar"}
          >
            {muted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            )}
          </button>
        </div>
      </header>

      <PullToRefresh />

      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          className="ios-main"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* ==================== 1. INICIO ==================== */}
          {tab === "inicio" && (
            <div className="explore-page">
              <section className="secondstory-strip-card">
                <div className="strip-top-meta">
                  <span>EL TABLERO // UG SCENE</span>
                  <span className="spine-badge-static">El tablero.</span>
                </div>

                {/* 1º: EL RUIDO EN EL MEDIO DE LA PANTALLA (TIPOGRAFÍA LIMPIA Y UNIFICADA + TAPAS REALES) */}
                <div className="corecore-stage">
                  <div className="neon-spine" aria-hidden />

                  <div className="Roster-collage">
                    {/* Fila 1: LA PLAGA (eyebags) + blablabla (bbbrvno) */}
                    <div className="collage-line">
                      <span className="cluster-dots">
                        <i style={{ background: "#e11d48" }} />
                        <i style={{ background: "#0284c7" }} />
                        <i style={{ background: "#ca8a04" }} />
                      </span>
                      <span className="pixel-tag coral-badge">MIXTAPE // 01</span>
                      <button
                        type="button"
                        className="collage-item clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("la-plaga");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <img
                          src="/covers/la-plaga.png"
                          alt="LA PLAGA"
                          className="collage-cover-thumb"
                        />
                        <span className="roster-word">
                          LA <span className="inline-swatch coral">PLAGA</span>
                        </span>
                        <sup className="sup-tag">mixtape · eyebags</sup>
                      </button>

                      <button
                        type="button"
                        className="collage-item clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("blablabla");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <img
                          src="/covers/blablabla.png"
                          alt="blablabla"
                          className="collage-cover-thumb"
                        />
                        <span className="roster-word">
                          bla<span className="inline-swatch red">blabla</span>
                        </span>
                        <sup className="sup-tag">ep · bbbrvno</sup>
                      </button>
                      <span className="cutout-pill">Mendoza</span>
                    </div>

                    {/* Fila 2: PERDÓN LA DEMORA (Tizianolased) */}
                    <div className="collage-line">
                      <button
                        type="button"
                        className="collage-item clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("perdon-la-demora");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <img
                          src="/covers/perdon-la-demora.png"
                          alt="PERDÓN LA DEMORA"
                          className="collage-cover-thumb"
                        />
                        <span className="roster-word">
                          PERDÓN <span className="inline-swatch cyan">LA DEMORA</span>
                        </span>
                        <sup className="sup-tag">mixtape · Tizianolased</sup>
                      </button>
                      <span className="cutout-pill dark">8 tracks · 23 min</span>
                    </div>

                    {/* Fila 3: chickenNugget (poyo · dorkke) + ESTO ES ESTAR EN SONIDO (V4lentin0) */}
                    <div className="collage-line">
                      <button
                        type="button"
                        className="collage-item clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("chickennugget");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <img
                          src="/covers/chickennugget.png"
                          alt="chickenNugget"
                          className="collage-cover-thumb"
                        />
                        <span className="roster-word">
                          chicken<span className="inline-swatch gold">Nugget</span>
                        </span>
                        <sup className="sup-tag">ep · poyo × dorkke</sup>
                      </button>

                      <button
                        type="button"
                        className="collage-item clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("esto-es-estar-en-sonido");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <img
                          src="/covers/esto-es-estar-en-sonido.png"
                          alt="ESTO ES ESTAR EN SONIDO"
                          className="collage-cover-thumb"
                        />
                        <span className="roster-word">
                          <span className="inline-swatch blue">ESTO ES ESTAR</span> EN SONIDO
                        </span>
                        <sup className="sup-tag">lp · V4lentin0</sup>
                      </button>
                    </div>

                    {/* Fila 4: #MA7IAS (Ma7imza) + Love2Hate (Icylucki) + AMORIO CLUB 2 (Máximo) */}
                    <div className="collage-line">
                      <button
                        type="button"
                        className="collage-item clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("ma7ias");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <img
                          src="/covers/ma7ias.png"
                          alt="#MA7IAS"
                          className="collage-cover-thumb"
                        />
                        <span className="roster-word">
                          <span className="inline-swatch lime">#MA7IAS</span>
                        </span>
                        <sup className="sup-tag">lp · Ma7imza</sup>
                      </button>

                      <button
                        type="button"
                        className="collage-item clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("love2hate");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <img
                          src="/covers/love2hate.png"
                          alt="Love2Hate"
                          className="collage-cover-thumb"
                        />
                        <span className="roster-word">
                          Love<span className="inline-swatch purple">2Hate</span>
                        </span>
                        <sup className="sup-tag">ep · Icylucki</sup>
                      </button>

                      <button
                        type="button"
                        className="collage-item clean-editorial-word"
                        onMouseEnter={() => sfx.hover()}
                        onClick={() => {
                          const p = findProjectById("amorio-club") || findProjectById("amorio-club-2");
                          if (p && p.tracks[0]) playTrack(p.tracks[0], p, false);
                        }}
                      >
                        <img
                          src="/covers/amorio-club.png"
                          alt="AMORIO CLUB"
                          className="collage-cover-thumb"
                        />
                        <span className="roster-word">
                          <span className="inline-swatch red">AMORIO CLUB</span>
                        </span>
                        <sup className="sup-tag">ep · Máximo</sup>
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2º: NOMBRE DE LA WEB ("El tablero.") */}
                <div className="secondstory-mega-footer">
                  <p className="micro-editorial-copy">
                    Tus proyectos. Tu identidad. Tu gente. Tu música.
                  </p>
                  <h1 className="mega-display-title">El tablero.</h1>
                </div>

                {/* 3º: TIRA HORIZONTAL DE MINIPORTADAS (con tapas reales y sin scrollbar fantasma) */}
                <div className="filmstrip-row">
                  {boardProjects.map((p, idx) => (
                    <motion.button
                      key={p.id}
                      type="button"
                      whileHover={{ y: -3, scale: 1.01 }}
                      whileTap={{ scale: 0.985 }}
                      className="filmstrip-thumb"
                      onMouseEnter={() => sfx.hover()}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setLibrarySubTab("proyectos");
                        setInsideCubeOpen(true);
                        navigate("biblioteca");
                      }}
                    >
                      <div
                        className="filmstrip-art"
                        style={{
                          background: p.coverUrl
                            ? `linear-gradient(180deg, rgba(10,10,14,0.45) 0%, rgba(10,10,14,0.12) 45%, rgba(10,10,14,0.75) 100%), url(${p.coverUrl}) center / cover no-repeat`
                            : `linear-gradient(145deg, ${p.c1} 0%, ${p.c2} 100%)`,
                        }}
                      >
                        <span className="thumb-index">{String(idx + 1).padStart(2, "0")}</span>
                        {!p.coverUrl && (
                          <strong className="thumb-glyph">{p.tracks[0]?.glyph}</strong>
                        )}
                        <small>{p.type} · {p.tracks.length} tracks</small>
                      </div>
                      <div className="filmstrip-caption">
                        <b>{p.title}</b>
                        <span
                          className="track-artist-link-btn"
                          title={`Ver perfil de ${p.artist}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateToArtist(p.artist);
                          }}
                        >
                          {p.artist}
                        </span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </section>

              {/* Grilla de proyectos fijados y artistas (Primero) */}
              <section className="explore-bottom-grid">
                <div className="apple-card">
                  <div className="card-head">
                    <span className="mono-tag">PROYECTOS // ROTACIÓN DE BOARD.</span>
                    <h3>Lo último subido & Rotación</h3>
                  </div>
                  <div className="track-list-clean">
                    {boardProjects
                      .flatMap((p) => p.tracks.map((t) => ({ track: t, proj: p })))
                      .slice(0, 10)
                      .map(({ track, proj }, i) => {
                          const active = currentTrack.id === track.id;
                          return (
                            <div
                              key={track.id}
                              className={`clean-track-row ${active ? "is-playing" : ""}`}
                              onMouseEnter={() => sfx.hover()}
                              onClick={() => playTrack(track, proj, false)}
                            >
                              <span className="row-num">{String(i + 1).padStart(2, "0")}</span>
                              <div
                                className="row-swatch"
                                style={{
                                  background: proj.coverUrl
                                    ? `linear-gradient(rgba(0,0,0,0.28), rgba(0,0,0,0.28)), url(${proj.coverUrl}) center / cover no-repeat`
                                    : `linear-gradient(135deg, ${track.c1}, ${track.c2})`,
                                }}
                              >
                                {active && isPlaying ? "❚❚" : "▶"}
                              </div>
                              <div className="row-main">
                                <b>{track.title}</b>
                                <span className="row-meta-subline">
                                  <button
                                    type="button"
                                    className="track-artist-link-btn"
                                    title={`Ver perfil de ${track.artist}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigateToArtist(track.artist);
                                    }}
                                  >
                                    {track.artist}
                                  </button>
                                  {track.feat && (
                                    <>
                                      {" feat. "}
                                      <button
                                        type="button"
                                        className="track-artist-link-btn"
                                        title={`Ver perfil de ${track.feat}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigateToArtist(track.feat!);
                                        }}
                                      >
                                        {track.feat}
                                      </button>
                                    </>
                                  )}
                                  {" · "}
                                  <button
                                    type="button"
                                    className="track-project-link-btn"
                                    title={`Ir al proyecto ${proj.title}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigateToProject(proj.id);
                                    }}
                                  >
                                    {proj.title}
                                  </button>
                                </span>
                              </div>
                              <div className="row-pills">
                                <span className="meta-chip">{track.bpm} BPM</span>
                                <span className="meta-chip">{track.key}</span>
                              </div>
                              <div className="row-inline-actions">
                                {proj.spotifyUrl && (
                                  <a
                                    href={proj.spotifyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="row-snippet-btn spotify-track-link-btn"
                                    title={`Abrir ${proj.title} en Spotify`}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: "4px 8px",
                                      textDecoration: "none",
                                    }}
                                  >
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#1DB954">
                                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                    </svg>
                                  </a>
                                )}
                                <button
                                  type="button"
                                  className="row-snippet-btn track-download-btn"
                                  title={`Descargar ${track.title}`}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    sfx.tap();
                                    const url =
                                      track.customAudioUrl ||
                                      customAudioMap[track.id] ||
                                      (await resolveTrackAudioUrl(track.id));
                                    await downloadTrackAudio(track.title, track.artist, url);
                                  }}
                                >
                                  ⬇
                                </button>
                                {((meProfile.id && proj.artistId === meProfile.id) ||
                                  projectInvites[proj.id] === "edit") && (
                                  <>
                                    <button
                                      type="button"
                                      className="row-snippet-btn"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingTrack(track);
                                      }}
                                    >
                                      Editar
                                    </button>
                                    <button
                                      type="button"
                                      className="trash-icon-btn"
                                      title={`Eliminar track ${track.title}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteTrack(proj.id, track.id);
                                      }}
                                    >
                                      <TrashIcon />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                  </div>
                </div>

                <div className="apple-card">
                  <div className="card-head card-head-with-filter">
                    <div>
                      <span className="mono-tag">ARTISTAS // ROTACIÓN DE EL TABLERO</span>
                      <h3>Artistas en El tablero</h3>
                    </div>
                    <div className="seg-pills artist-sort-pills">
                      {(["recientes", "populares"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          className={artistSort === k ? "on" : ""}
                          onClick={() => {
                            sfx.tap();
                            setArtistSort(k);
                          }}
                        >
                          {k === "recientes" ? "Más recientes" : "Populares"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="artist-directory-list">
                    {sortedArtists.length > 0 ? (
                      sortedArtists.map(({ artist: a, owned, trackCount }) => (
                        <div
                          key={a.id}
                          className="artist-dir-item"
                          onMouseEnter={() => sfx.hover()}
                          onClick={() => {
                            const found = owned[0];
                            if (found) {
                              setSelectedProjectId(found.id);
                              setInsideCubeOpen(true);
                              navigate("biblioteca");
                            }
                          }}
                        >
                          <div className="artist-dir-avatar" style={{ background: a.color, overflow: "hidden" }}>
                            {a.avatarUrl ? (
                              <img
                                src={a.avatarUrl}
                                alt={a.name}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              />
                            ) : (
                              a.name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className="artist-dir-info">
                            <b>
                              {a.name} <em>{a.handle}</em>
                            </b>
                            <span>{[a.role, a.zone].filter(Boolean).join(" · ")}</span>
                          </div>
                          <div className="artist-dir-stats">
                            <b>{trackCount}</b>
                            <small>tracks</small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ padding: "40px 16px", textAlign: "center" }}>
                        <span className="mono-tag" style={{ display: "inline-block", marginBottom: 6 }}>
                          0 ARTISTAS REGISTRADOS
                        </span>
                        <p style={{ color: "var(--ink-secondary)", fontSize: "0.86rem", margin: "4px 0 14px" }}>
                          No hay cuentas creadas todavía. Conectate con Google para registrar tu perfil.
                        </p>
                        <button
                          type="button"
                          className="apple-btn primary"
                          onClick={() => setAuthModalOpen(true)}
                        >
                          Iniciar Sesión con Google
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* ==================== ROTACIÓN DE PRODUCTORES (Abajo de proyectos y artistas) ==================== */}
              <section className="apple-card producer-drops-section">
                <div className="producer-drops-header">
                  <div>
                    <span className="mono-tag">ROTACIÓN DE PRODUCTORES</span>
                    <h3>Herramientas, Kits &amp; Beats de los Productores</h3>
                  </div>

                  <div className="producer-filter-pills">
                    {PRODUCER_DROP_KINDS.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={producerFilter === k ? "on" : ""}
                        onClick={() => {
                          sfx.tap();
                          setProducerFilter(k);
                        }}
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="producer-drops-grid">
                  {filteredProducerDrops.length > 0 ? (
                    filteredProducerDrops.map((drop) => {
                      const isPlayingDrop =
                        currentTrack.id === drop.previewTrack.id && isPlaying;
                      const linkedProj =
                        projects.find((p) => p.id === drop.projectId) ||
                        STANDBY_PROJECT;
                      return (
                        <div
                          key={drop.id}
                          className={`producer-drop-card ${isPlayingDrop ? "is-playing" : ""}`}
                          onClick={() => playTrack(drop.previewTrack, linkedProj, false)}
                        >
                          <div className="producer-drop-top">
                            <span
                              className="producer-kind-badge"
                              style={{ background: drop.accent }}
                            >
                              {drop.kind}
                            </span>
                            <span className="mono-tag">{drop.itemsCountLabel}</span>
                            <button
                              type="button"
                              className="trash-icon-btn"
                              title="Eliminar publicación"
                              onClick={(e) => {
                                e.stopPropagation();
                                sfx.tap();
                                setProducerDrops((prev) =>
                                  prev.filter((item) => item.id !== drop.id)
                                );
                              }}
                            >
                              <TrashIcon />
                            </button>
                          </div>

                          <div className="producer-drop-main">
                            <div
                              className="producer-drop-swatch"
                              style={{
                                background: `linear-gradient(135deg, ${drop.c1}, ${drop.c2})`,
                              }}
                            >
                              <span>{isPlayingDrop ? "❚❚" : "▶"}</span>
                            </div>
                            <div>
                              <h4>{drop.title}</h4>
                              <span className="producer-byline">
                                por <b>{drop.producer}</b> ({drop.producerHandle})
                              </span>
                            </div>
                          </div>

                          <p className="producer-drop-desc">{drop.description}</p>

                          <div className="producer-drop-foot">
                            <span className="meta-chip">{drop.bpmLabel}</span>
                            <span className="meta-chip">{drop.keyLabel}</span>
                            <span className="producer-listen-cta">
                              {isPlayingDrop ? "Sonando demo..." : "▶ Escuchar preview"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ gridColumn: "1 / -1", padding: "36px 20px", textAlign: "center", border: "1px dashed var(--line-strong)", borderRadius: 12 }}>
                      <span className="mono-tag" style={{ display: "inline-block", marginBottom: 6 }}>
                        0 NOVEDADES DE PRODUCTORES
                      </span>
                      <p style={{ color: "var(--ink-secondary)", fontSize: "0.85rem", margin: "4px 0 0" }}>
                        Los beatmakers registrados publicarán sus beatposts, drumkits y soundkits en esta sección.
                      </p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {/* ==================== 2. BIBLIOTECA / GUARDADOS ==================== */}
          {tab === "biblioteca" && (
            <div
              className={`library-page ${
                meProfile.accountType !== "oyente" && librarySubTab === "proyectos" ? "library-clean" : ""
              }`}
            >
              <div className="section-header-row">
                <div className="library-title-block">
                  <span className="mono-tag">
                    {meProfile.accountType === "oyente"
                      ? "COLECCIÓN PERSONAL // GUARDADOS"
                      : "BIBLIOTECA 3D // BOARD."}
                  </span>
                  <h1 className="editorial-h1">
                    {meProfile.accountType === "oyente" ? "Guardados" : "Mis Proyectos"}
                  </h1>
                </div>

                {/* Sub-pestañas para Artistas (Mis Proyectos vs Guardados) + Botones de vista */}
                <div className="row-actions">
                  {meProfile.accountType !== "oyente" && (
                    <div className="seg-pills">
                      <button
                        type="button"
                        className={librarySubTab === "proyectos" ? "on" : ""}
                        onClick={() => {
                          sfx.tap();
                          setLibrarySubTab("proyectos");
                        }}
                      >
                        Mis Proyectos ({myProjects.length})
                      </button>
                      <button
                        type="button"
                        className={librarySubTab === "guardados" ? "on" : ""}
                        onClick={() => {
                          sfx.tap();
                          setLibrarySubTab("guardados");
                        }}
                      >
                        Guardados ({savedProjectsList.length})
                      </button>
                    </div>
                  )}

                  {meProfile.accountType !== "oyente" && (
                    <div className="layout-switch" role="group" aria-label="Vista de la biblioteca">
                      <button
                        type="button"
                        className={`layout-icon-btn ${libraryLayoutMode === "inside" && librarySubTab === "proyectos" ? "active" : ""}`}
                        aria-label="Una ventana"
                        title="Una ventana"
                        onClick={() => {
                          sfx.tap();
                          setLibrarySubTab("proyectos");
                          setLibraryLayoutMode("inside");
                          setInsideCubeOpen(false);
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="4" y="5" width="16" height="14" rx="2" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`layout-icon-btn ${libraryLayoutMode === "side-by-side" && librarySubTab === "proyectos" ? "active" : ""}`}
                        aria-label="Dos ventanas"
                        title="Dos ventanas"
                        onClick={() => {
                          sfx.tap();
                          setLibrarySubTab("proyectos");
                          setLibraryLayoutMode("side-by-side");
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="3" y="5" width="8" height="14" rx="2" />
                          <rect x="13" y="5" width="8" height="14" rx="2" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Si es oyente o eligió la pestaña Guardados, se muestran los proyectos guardados */}
              {(meProfile.accountType === "oyente" || librarySubTab === "guardados") ? (
                <div className="saved-library-section">
                  {savedProjectsList.length === 0 ? (
                    <div className="manifold-empty-cluster-overlay" style={{ position: "relative", inset: "auto", margin: "40px auto", textAlign: "center" }}>
                      <span className="mono-tag">0 PROYECTOS GUARDADOS // TU COLECCIÓN</span>
                      <h3 style={{ fontSize: "1.4rem", margin: "10px 0" }}>Todavía no guardaste ningún proyecto</h3>
                      <p style={{ maxWidth: 460, margin: "0 auto 20px", color: "var(--ink-secondary)", fontSize: "0.85rem" }}>
                        Abrí cualquier link compartido de un proyecto o explorá el Inicio y tocá &ldquo;+ Guardar en Biblioteca&rdquo; para tenerlo siempre en tu colección.
                      </p>
                      <button type="button" className="apple-btn primary" onClick={() => navigate("inicio")}>
                        Explorar música de la escena →
                      </button>
                    </div>
                  ) : (
                    <div className="saved-projects-grid">
                      {savedProjectsList.map((sp) => (
                        <div key={sp.id} className="saved-project-card">
                          <div
                            className="saved-card-header"
                            style={{ cursor: "pointer" }}
                            onClick={() => {
                              setSelectedProjectId(sp.id);
                              setLibrarySubTab("proyectos");
                              setInsideCubeOpen(true);
                            }}
                          >
                            <img
                              src={sp.coverUrl || "/covers/perdon-la-demora.png"}
                              alt={sp.title}
                              className="saved-card-thumb"
                            />
                            <div className="saved-card-meta">
                              <span className="mono-tag" style={{ fontSize: "0.68rem" }}>
                                {sp.type.toUpperCase()} · {sp.tracks.length} TRACKS
                              </span>
                              <h3>{sp.title}</h3>
                              <p>{sp.artist} · {sp.zone}</p>
                            </div>
                          </div>

                          <div className="saved-card-actions">
                            <button
                              type="button"
                              className="apple-btn primary"
                              style={{ fontSize: "0.8rem", padding: "6px 14px", flex: 1, justifyContent: "center" }}
                              onClick={() => {
                                if (sp.tracks[0]) playTrack(sp.tracks[0], sp, false);
                              }}
                            >
                              ▶ Reproducir ({sp.tracks.length})
                            </button>
                            <button
                              type="button"
                              className="apple-btn ghost"
                              style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                              onClick={() => {
                                setSelectedProjectId(sp.id);
                                setLibrarySubTab("proyectos");
                                setInsideCubeOpen(true);
                              }}
                            >
                              Abrir
                            </button>
                            <button
                              type="button"
                              className="apple-btn ghost"
                              style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                              onClick={() => toggleSaveProject(sp.id)}
                              title="Quitar de Guardados"
                            >
                              ✕ Quitar
                            </button>
                            <button
                              type="button"
                              className="apple-btn ghost"
                              style={{ fontSize: "0.8rem", padding: "6px 10px" }}
                              onClick={() => handleCopyProjectLink(sp.id)}
                              title="Copiar link para compartir"
                            >
                              {shareCopiedId === sp.id ? "✓" : "🔗"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={
                    libraryLayoutMode === "side-by-side" && activeProject
                      ? "library-side-by-side-grid"
                      : "library-inside-stack"
                  }
                  onPointerMove={(e) => {
                    if (libraryLayoutMode !== "inside" || !insideCubeOpen) return;
                    if (e.clientX > 110) {
                      hasEnteredInspectorRef.current = true;
                    } else if (hasEnteredInspectorRef.current && e.clientX <= 12) {
                      hasEnteredInspectorRef.current = false;
                      sfx.close();
                      setInsideCubeOpen(false);
                    }
                  }}
                >
                  {/* Escena 3D de Mis Proyectos (se muestra siempre en Lado a Lado, o cuando estás afuera del cubo en modo Por defecto) */}
                  {(libraryLayoutMode === "side-by-side" || !insideCubeOpen || !activeProject) && (
                    <ManifoldLibrary3D
                      projects={myProjects}
                      selectedProjectId={activeProject?.id || ""}
                      viewMode={libraryViewMode}
                      onChangeViewMode={(m) => setLibraryViewMode(m)}
                      onSelectProject={(proj) => setSelectedProjectId(proj.id)}
                      onDiveIntoProject={
                        libraryLayoutMode === "inside"
                          ? (proj) => {
                              setSelectedProjectId(proj.id);
                              setInsideCubeOpen(true);
                            }
                          : undefined
                      }
                      onOpenCreateProject={() => navigate("crear-proyecto")}
                      onDeleteProject={handleDeleteProject}
                      onUploadProjectVideo={handleUploadProjectVideo}
                      onRemoveProjectVideo={handleRemoveProjectVideo}
                      onUploadProjectTrack={handleUploadProjectTrack}
                      onUpdateProjectCover={handleUpdateProjectCover}
                      dropTargetProjectId={dropTargetProjectId}
                      transferAnimation={
                        transferAnimation?.active
                          ? {
                              trackTitle: transferAnimation.track.title,
                              targetProjectId: transferAnimation.targetProjectId,
                            }
                          : null
                      }
                    />
                  )}

                {/* Capa ergonómica para volver haciendo click en cualquier costado vacío o llevando el mouse al borde izquierdo */}
                {activeProject && libraryLayoutMode === "inside" && insideCubeOpen && (
                  <>
                    <div
                      className="inspector-outside-dismiss-layer"
                      title="Click afuera para volver a Mis proyectos"
                      onClick={() => {
                        sfx.close();
                        setInsideCubeOpen(false);
                      }}
                    />
                    <button
                      type="button"
                      className="inspector-left-edge-sensor"
                      title="Llevá el cursor al borde izquierdo o hacé click para volver"
                      onClick={() => {
                        sfx.close();
                        setInsideCubeOpen(false);
                      }}
                    >
                      <span className="edge-back-pill">‹ Volver</span>
                    </button>
                  </>
                )}

                {/* Interior del Proyecto / Inspector con Spinner 3D (se muestra al entrar al cubo en Modo Por defecto, o al lado en Modo 2) */}
                {activeProject && (libraryLayoutMode === "side-by-side" || insideCubeOpen) && (
                  <MobileSheetPortal>
                  <motion.section
                    key={`inspector-${libraryLayoutMode}-${activeProject.id}`}
                    className="project-inspector-sheet"
                    onClick={(e) => e.stopPropagation()}
                    onTouchStart={(e) => {
                      const t = e.touches[0];
                      if (t) inspectorTouchStartRef.current = { x: t.clientX, y: t.clientY };
                    }}
                    onTouchEnd={(e) => {
                      if (libraryLayoutMode !== "inside" || !insideCubeOpen) return;
                      const start = inspectorTouchStartRef.current;
                      const end = e.changedTouches[0];
                      inspectorTouchStartRef.current = null;
                      if (!start || !end) return;
                      const dx = end.clientX - start.x;
                      const dy = end.clientY - start.y;
                      if (dx > 75 && Math.abs(dy) < 55) {
                        sfx.close();
                        setInsideCubeOpen(false);
                      }
                    }}
                    initial={
                      libraryLayoutMode === "inside"
                        ? { opacity: 0, scale: 0.96, y: 12 }
                        : { opacity: 1, scale: 1, y: 0 }
                    }
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {/* ==================== UI MÓVIL ESTILO [untitled] (IDÉNTICA A IMG_3888.png EN CELULAR) ==================== */}
                    <div className="untitled-mobile-project-view">
                      <div className="untitled-mobile-topbar">
                        <button
                          type="button"
                          className="untitled-icon-squircle"
                          aria-label="Volver a Mis proyectos"
                          onClick={() => {
                            sfx.close();
                            setProjectSearchOpen(false);
                            setProjectSearchQuery("");
                            setProjectMenuOpen(false);
                            setMobileTrackMenuId(null);
                            setInsideCubeOpen(false);
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                          </svg>
                        </button>

                        <div className="untitled-top-right-group">
                          {activeProject.spotifyUrl && (
                            <a
                              href={activeProject.spotifyUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="untitled-icon-squircle"
                              aria-label="Abrir en Spotify"
                              title="Abrir en Spotify"
                              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="#1DB954">
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                              </svg>
                            </a>
                          )}
                          <button
                            type="button"
                            className={`untitled-icon-squircle ${shareCopiedId === activeProject.id ? "is-active" : ""}`}
                            aria-label="Invitar o compartir link del proyecto"
                            onClick={() => {
                              setProjectMenuOpen(false);
                              handleCopyProjectLink(activeProject.id);
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            className={`untitled-icon-squircle ${projectSearchOpen ? "is-active" : ""}`}
                            aria-label="Buscar track en el proyecto"
                            onClick={() => {
                              sfx.tap();
                              setProjectMenuOpen(false);
                              setProjectSearchOpen((s) => !s);
                              if (projectSearchOpen) setProjectSearchQuery("");
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="7" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                          </button>

                          <button
                            type="button"
                            className={`untitled-icon-squircle ${projectMenuOpen ? "is-active" : ""}`}
                            aria-label="Más opciones del proyecto"
                            onClick={() => {
                              sfx.tap();
                              setProjectSearchOpen(false);
                              setProjectMenuOpen((m) => !m);
                            }}
                          >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                              <circle cx="5" cy="12" r="2" />
                              <circle cx="12" cy="12" r="2" />
                              <circle cx="19" cy="12" r="2" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {projectSearchOpen && (
                        <div className="untitled-mobile-search-bar">
                          <input
                            type="text"
                            value={projectSearchQuery}
                            onChange={(e) => setProjectSearchQuery(e.target.value)}
                            placeholder="Buscar track, productor, BPM o Key..."
                            className="untitled-mobile-search-input"
                          />
                          {projectSearchQuery && (
                            <button
                              type="button"
                              className="untitled-search-clear"
                              onClick={() => setProjectSearchQuery("")}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}

                      {projectMenuOpen && (
                        <>
                          <div
                            className="apple-popover-backdrop"
                            onClick={() => setProjectMenuOpen(false)}
                          />
                          <div className="untitled-mobile-menu-sheet">
                            {canEditActive && (
                              <>
                                <button
                                  type="button"
                                  className="untitled-menu-item"
                                  onClick={() => {
                                    setProjectMenuOpen(false);
                                    setEditingTitleProjectId(activeProject.id);
                                    setInlineTitleValue(activeProject.title);
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                  </svg>
                                  <span>Cambiar nombre</span>
                                </button>
                                <label className="untitled-menu-item">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                  </svg>
                                  <span>Añadir tracks</span>
                                  <input
                                    type="file"
                                    multiple
                                    accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/x-m4a,audio/aac,audio/flac,audio/ogg"
                                    hidden
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files.length > 0) {
                                        void handleUploadMultipleProjectTracks(
                                          activeProject.id,
                                          e.target.files
                                        );
                                        setProjectMenuOpen(false);
                                        e.target.value = "";
                                      }
                                    }}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="untitled-menu-item"
                                  onClick={() => {
                                    setProjectMenuOpen(false);
                                    setEditingProject(activeProject);
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                  </svg>
                                  <span>Editar detalles</span>
                                </button>
                                <label className="untitled-menu-item">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                  </svg>
                                  <span>Cambiar portada</span>
                                  <input
                                    type="file"
                                    accept="image/*,image/gif"
                                    hidden
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) {
                                        handleUpdateProjectCover(
                                          activeProject.id,
                                          URL.createObjectURL(f)
                                        );
                                        setProjectMenuOpen(false);
                                        e.target.value = "";
                                      }
                                    }}
                                  />
                                </label>
                                <label className="untitled-menu-item">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polygon points="23 7 16 12 23 17 23 7" />
                                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                  </svg>
                                  <span>
                                    {activeProject.videos.some((v) => Boolean(v.url))
                                      ? "Cambiar Canvas"
                                      : "Subir Canvas"}
                                  </span>
                                  <input
                                    type="file"
                                    accept="video/mp4,video/webm,image/gif,image/*,video/*"
                                    hidden
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        handleUploadProjectVideo(activeProject.id, file);
                                        setProjectMenuOpen(false);
                                        e.target.value = "";
                                      }
                                    }}
                                  />
                                </label>
                              </>
                            )}
                            {activeIsMine && (
                              <button
                                type="button"
                                className="untitled-menu-item"
                                onClick={() => {
                                  sfx.tick();
                                  updateProjectMeta(activeProject.id, {
                                    visibility:
                                      activeProject.visibility === "public"
                                        ? "private"
                                        : "public",
                                  });
                                  setProjectMenuOpen(false);
                                }}
                              >
                                {activeProject.visibility === "public" ? (
                                  <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                    <span>Hacer privado</span>
                                  </>
                                ) : (
                                  <>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <circle cx="12" cy="12" r="10" />
                                      <line x1="2" y1="12" x2="22" y2="12" />
                                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" />
                                    </svg>
                                    <span>Publicar en Inicio</span>
                                  </>
                                )}
                              </button>
                            )}
                            <button
                              type="button"
                              className="untitled-menu-item"
                              onClick={() => {
                                handleCopyProjectLink(activeProject.id);
                                setProjectMenuOpen(false);
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                                <polyline points="16 6 12 2 8 6" />
                                <line x1="12" y1="2" x2="12" y2="15" />
                              </svg>
                              <span>Compartir invitación</span>
                            </button>
                            {!activeIsMine && (
                              <button
                                type="button"
                                className="untitled-menu-item"
                                onClick={() => {
                                  toggleSaveProject(activeProject.id);
                                  setProjectMenuOpen(false);
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill={savedProjectIds.includes(activeProject.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                </svg>
                                <span>
                                  {savedProjectIds.includes(activeProject.id)
                                    ? "Quitar de Biblioteca"
                                    : "Guardar en Biblioteca"}
                                </span>
                              </button>
                            )}
                            {activeProject.spotifyUrl && (
                              <a
                                href={activeProject.spotifyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="untitled-menu-item"
                                onClick={() => setProjectMenuOpen(false)}
                                style={{ textDecoration: "none" }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="#1DB954">
                                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                </svg>
                                <span>Escuchar en Spotify</span>
                              </a>
                            )}
                            {activeIsMine && (
                              <>
                                <div className="untitled-menu-divider" />
                                <button
                                  type="button"
                                  className="untitled-menu-item danger"
                                  onClick={() => {
                                    setProjectMenuOpen(false);
                                    if (
                                      window.confirm(
                                        `¿Eliminar "${activeProject.title}"? No se puede deshacer.`
                                      )
                                    ) {
                                      handleDeleteProject(activeProject.id);
                                    }
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                  <span>Eliminar proyecto</span>
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}

                      {/* Portada en rueda de vinilo idéntica a la selección de proyectos */}
                      <div className="project-view-vinyl-stage">
                        <div className="vinyl-fan-sleeve-card is-focused">
                          <div
                            className={`vinyl-fan-record-disc ${
                              isPlaying && currentProject.id === activeProject.id ? "spin-slow" : ""
                            }`}
                            style={{
                              borderColor: activeProject.c2 || "rgba(255, 255, 255, 0.2)",
                            }}
                          >
                            <div
                              className="vinyl-fan-record-label"
                              style={{
                                background: activeProject.coverUrl
                                  ? `url(${activeProject.coverUrl}) center / cover no-repeat`
                                  : `radial-gradient(circle, ${activeProject.c2 || "#fff"} 0%, ${activeProject.c1 || "#111"} 85%)`,
                              }}
                            >
                              <span className="vinyl-fan-record-hole" />
                            </div>
                          </div>

                          <div
                            className={`vinyl-fan-sleeve-body ${activeProject.coverUrl ? "has-cover-art" : ""}`}
                            style={{
                              background: activeProject.coverUrl
                                ? `url(${activeProject.coverUrl}) center / cover no-repeat`
                                : `linear-gradient(135deg, ${activeProject.c1 || "#1c1c1e"} 0%, ${activeProject.c2 || "#2c2c2e"} 135%)`,
                            }}
                          >
                            {!activeProject.coverUrl && (
                              <div className="vinyl-fan-center-crest">
                                <div className="crest-ring">
                                  <strong>{activeProject.tracks[0]?.glyph || "01"}</strong>
                                  <small>{activeProject.type}</small>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Fila de Título + Subtítulo + Botón Play Blanco Squircle */}
                      <div className="untitled-mobile-title-row">
                        <div className="untitled-mobile-title-copy">
                          {editingTitleProjectId === activeProject.id ? (
                            <form
                              className="inline-project-title-form mobile"
                              onSubmit={(e) => {
                                e.preventDefault();
                                handleSaveInlineTitle(activeProject.id, inlineTitleValue);
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                className="inline-project-title-input mobile"
                                value={inlineTitleValue}
                                autoFocus
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setInlineTitleValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditingTitleProjectId(null);
                                }}
                                onBlur={() => handleSaveInlineTitle(activeProject.id, inlineTitleValue)}
                                placeholder="Nombre del proyecto..."
                                maxLength={80}
                              />
                              <div className="inline-title-btn-group">
                                <button
                                  type="submit"
                                  className="inline-title-confirm-btn"
                                  title="Guardar nombre"
                                  onMouseDown={(e) => e.preventDefault()}
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  className="inline-title-cancel-btn"
                                  onClick={() => setEditingTitleProjectId(null)}
                                >
                                  ✕
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div
                              className={`untitled-mobile-title-wrap ${canEditActive ? "is-editable" : ""}`}
                              onClick={() => {
                                if (canEditActive) {
                                  setEditingTitleProjectId(activeProject.id);
                                  setInlineTitleValue(activeProject.title);
                                }
                              }}
                              title={canEditActive ? "Tocá para cambiar el nombre del proyecto" : undefined}
                            >
                              <h1 className="untitled-mobile-title">{activeProject.title}</h1>
                              {canEditActive && (
                                <button
                                  type="button"
                                  className="inline-title-edit-trigger"
                                  aria-label="Cambiar nombre del proyecto"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTitleProjectId(activeProject.id);
                                    setInlineTitleValue(activeProject.title);
                                  }}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          )}
                          <p className="untitled-mobile-subtitle">
                            {activeProject.artist} · {activeProject.tracks.length}{" "}
                            {activeProject.tracks.length === 1 ? "track" : "tracks"} ·{" "}
                            {formatProjectTotalDuration(activeProject.tracks)}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="untitled-mobile-play-btn"
                          aria-label="Reproducir proyecto"
                          onClick={() => {
                            const isProjectPlaying =
                              isPlaying &&
                              activeProject.tracks.some((tr) => tr.id === currentTrack.id);
                            if (isProjectPlaying) {
                              togglePlay();
                            } else if (activeProject.tracks[0]) {
                              playTrack(activeProject.tracks[0], activeProject, false);
                            }
                          }}
                        >
                          {isPlaying &&
                          activeProject.tracks.some((tr) => tr.id === currentTrack.id) ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="5" width="4" height="14" rx="1.2" />
                              <rect x="14" y="5" width="4" height="14" rx="1.2" />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                              <polygon points="6 4 20 12 6 20 6 4" />
                            </svg>
                          )}
                        </button>
                      </div>

                      {/* Botón ancho + Add tracks (idéntico a IMG_3888.png) */}
                      {canEditActive ? (
                        <label className="untitled-mobile-add-btn">
                          <span>
                            {uploadingTrackProjectId === activeProject.id
                              ? "Analizando Key y BPM..."
                              : "+ Add tracks"}
                          </span>
                          <input
                            type="file"
                            multiple
                            accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/x-m4a,audio/aac,audio/flac,audio/ogg"
                            hidden
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                void handleUploadMultipleProjectTracks(
                                  activeProject.id,
                                  e.target.files
                                );
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                      ) : (
                        <button
                          type="button"
                          className="untitled-mobile-add-btn"
                          onClick={() => toggleSaveProject(activeProject.id)}
                        >
                          <span>
                            {savedProjectIds.includes(activeProject.id)
                              ? "★ Guardado en Biblioteca"
                              : "+ Guardar en Biblioteca"}
                          </span>
                        </button>
                      )}

                      {/* Lista de tracks numerada limpia */}
                      <div className="untitled-mobile-tracklist">
                        {draggedTrack && (
                          <div
                            className={`inspector-drag-left-portal mobile ${
                              isOverLeftExitPortal ? "is-hovered" : ""
                            }`}
                          >
                            <span className="left-portal-arrow">‹</span>
                            <span className="left-portal-title">Llevá acá para proyectos</span>
                          </div>
                        )}
                        {activeProject.tracks
                          .filter((t) => {
                            if (!projectSearchQuery.trim()) return true;
                            const q = projectSearchQuery.toLowerCase();
                            return (
                              t.title.toLowerCase().includes(q) ||
                              t.artist.toLowerCase().includes(q) ||
                              (t.prod && t.prod.toLowerCase().includes(q)) ||
                              String(t.bpm).includes(q) ||
                              t.key.toLowerCase().includes(q)
                            );
                          })
                          .map((t, idx) => {
                            const isCurrent = currentTrack.id === t.id;
                            const menuOpen = mobileTrackMenuId === t.id;
                            const isDragged = draggedTrack?.track.id === t.id;
                            const isDropBefore = dropTargetTrackIndex === idx && draggedTrack && draggedTrack.sourceIndex > idx;
                            const isDropAfter = dropTargetTrackIndex === idx && draggedTrack && draggedTrack.sourceIndex < idx;
                            return (
                              <div
                                key={t.id}
                                data-track-index={idx}
                                data-track-id={t.id}
                                className={`untitled-mobile-track-item ${
                                  isDragged ? "is-drag-source" : ""
                                } ${isDropBefore ? "is-drop-target-before" : ""} ${
                                  isDropAfter ? "is-drop-target-after" : ""
                                }`}
                              >
                                <div
                                  className={`untitled-mobile-track-row ${
                                    isCurrent ? "is-playing" : ""
                                  }`}
                                  onClick={() => {
                                    if (!draggedTrack && !dragEndedRecentlyRef.current) playTrack(t, activeProject, false);
                                  }}
                                >
                                  {canEditActive && (
                                    <button
                                      type="button"
                                      className="track-drag-handle mobile"
                                      title="Arrastrá para reordenar o mover de proyecto"
                                      onPointerDown={(e) => startDraggingTrack(e, t, idx)}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="9" cy="6" r="2.2" />
                                        <circle cx="15" cy="6" r="2.2" />
                                        <circle cx="9" cy="12" r="2.2" />
                                        <circle cx="15" cy="12" r="2.2" />
                                        <circle cx="9" cy="18" r="2.2" />
                                        <circle cx="15" cy="18" r="2.2" />
                                      </svg>
                                    </button>
                                  )}
                                  <span className="untitled-mobile-track-num">
                                    {isCurrent && isPlaying ? "▶" : idx + 1}
                                  </span>

                                  <div className="untitled-mobile-track-info">
                                    <b>{t.title}</b>
                                    <span>
                                      {t.artist}
                                      {t.feat ? ` · ft. ${t.feat}` : ""} · {t.bpm} BPM · {t.key}
                                    </span>
                                  </div>

                                  <div className="untitled-mobile-track-actions">
                                    {activeProject.visibility === "public" && (
                                      <span className="untitled-globe-badge" aria-hidden="true">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                          <circle cx="12" cy="12" r="10" />
                                          <line x1="2" y1="12" x2="22" y2="12" />
                                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                        </svg>
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      className="untitled-mobile-track-dots"
                                      aria-label={`Opciones de ${t.title}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        sfx.tap();
                                        setMobileTrackMenuId(menuOpen ? null : t.id);
                                      }}
                                    >
                                      •••
                                    </button>
                                  </div>
                                </div>

                                {menuOpen && (
                                  <div
                                    className="untitled-track-inline-menu"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className="untitled-track-menu-btn"
                                      onClick={async () => {
                                        sfx.tap();
                                        setMobileTrackMenuId(null);
                                        const url =
                                          t.customAudioUrl ||
                                          customAudioMap[t.id] ||
                                          (await resolveTrackAudioUrl(t.id));
                                        await downloadTrackAudio(t.title, t.artist, url);
                                      }}
                                    >
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                      </svg>
                                      <span>Descargar audio</span>
                                    </button>
                                    {canEditActive && (
                                      <>
                                        <button
                                          type="button"
                                          className="untitled-track-menu-btn"
                                          onClick={() => {
                                            sfx.open();
                                            setMobileTrackMenuId(null);
                                            setEditingTrack(t);
                                          }}
                                        >
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                          </svg>
                                          <span>Editar ({t.bpm} BPM · {t.key})</span>
                                        </button>
                                        <button
                                          type="button"
                                          className="untitled-track-menu-btn danger"
                                          onClick={() => {
                                            sfx.tap();
                                            setMobileTrackMenuId(null);
                                            handleDeleteTrack(activeProject.id, t.id);
                                          }}
                                        >
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                          </svg>
                                          <span>Eliminar track</span>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>



                    <div
                      className={`inspector-unified-stage ${
                        activeProject.videos.length > 0 && activeProject.videos[0].url
                          ? "has-canvas-bg"
                          : ""
                      }`}
                    >
                      {/* ==================== CANVAS DETRÁS DE TODO ==================== */}
                      {activeProject.videos.length > 0 && activeProject.videos[0].url && (
                        <div className="inspector-canvas-backdrop" aria-hidden="true">
                          {activeProject.videos[0].mediaType === "image" ||
                          /^data:image\//i.test(activeProject.videos[0].url) ||
                          /\.(gif|png|jpe?g|webp|avif)(\?|$)/i.test(activeProject.videos[0].url) ||
                          /\.(gif|png|jpe?g|webp|avif)$/i.test(activeProject.videos[0].label) ? (
                            <>
                              <img
                                src={activeProject.videos[0].url}
                                alt=""
                                className="canvas-backdrop-ambient"
                              />
                              <img
                                src={activeProject.videos[0].url}
                                alt={activeProject.videos[0].label}
                                className="canvas-backdrop-media"
                              />
                            </>
                          ) : (
                            <>
                              <video
                                key={`amb-${activeProject.videos[0].url}`}
                                src={activeProject.videos[0].url}
                                autoPlay
                                loop
                                muted
                                playsInline
                                disablePictureInPicture
                                onLoadedMetadata={(e) => {
                                  e.currentTarget.play().catch(() => {});
                                }}
                                className="canvas-backdrop-ambient"
                              />
                              <video
                                key={`med-${activeProject.videos[0].url}`}
                                src={activeProject.videos[0].url}
                                autoPlay
                                loop
                                muted
                                playsInline
                                disablePictureInPicture
                                controlsList="nodownload noplaybackrate nofullscreen"
                                onLoadedMetadata={(e) => {
                                  e.currentTarget.play().catch(() => {});
                                }}
                                className="canvas-backdrop-media"
                              />
                            </>
                          )}
                          <div className="canvas-backdrop-scrim" />
                        </div>
                      )}

                      {/* ==================== SPLIT PRINCIPAL: VINILO A LA IZQUIERDA + TÍTULO Y TRACKS A LA DERECHA ==================== */}
                      <div className="inspector-split">
                        {draggedTrack && (
                          <div
                            className={`inspector-drag-left-portal ${
                              isOverLeftExitPortal ? "is-hovered" : ""
                            }`}
                          >
                            <span className="left-portal-arrow">‹</span>
                            <span className="left-portal-title">Llevá acá para proyectos</span>
                            <small className="left-portal-sub">Soltá en otro proyecto</small>
                          </div>
                        )}
                        <DiscSpinner3D
                          project={activeProject}
                          currentTrackId={currentTrack.id}
                          onPlayTrack={(tr, pr) => playTrack(tr, pr, false)}
                          onDeleteTrack={canEditActive ? handleDeleteTrack : undefined}
                        />

                        <div className="inspector-tracklist">
                          <div className="inspector-project-head">
                            <div className="inspector-top-badges-row">
                              <div className="inspector-top-badges-left">
                                {libraryLayoutMode === "inside" && (
                                  <button
                                    type="button"
                                    className="compact-back-pill-btn"
                                    onClick={() => {
                                      sfx.close();
                                      setInsideCubeOpen(false);
                                    }}
                                    title="Volver a Mis proyectos"
                                  >
                                    <span className="back-arrow-icon">←</span>
                                    <span>Volver a Mis proyectos</span>
                                  </button>
                                )}
                                <div className="project-editable-meta-bar">
                                  <div className="meta-pill-static">
                                    <b>{activeProject.type}</b>
                                  </div>
                                  <div className="meta-pill-static">
                                    <b>{activeProject.tracks.length} tracks</b>
                                  </div>
                                {activeIsMine ? (
                                  <button
                                    type="button"
                                    className={`visibility-toggle ${
                                      activeProject.visibility === "public" ? "on" : ""
                                    }`}
                                    onClick={() => {
                                      sfx.tick();
                                      updateProjectMeta(activeProject.id, {
                                        visibility:
                                          activeProject.visibility === "public"
                                            ? "private"
                                            : "public",
                                      });
                                    }}
                                    title={
                                      activeProject.visibility === "public"
                                        ? "Visible para toda la plataforma. Tocá para hacerlo privado."
                                        : "Solo lo ve quien tenga el link de invitación. Tocá para publicarlo."
                                    }
                                  >
                                    {activeProject.visibility === "public" ? (
                                      <>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
                                          <circle cx="12" cy="12" r="10" />
                                          <line x1="2" y1="12" x2="22" y2="12" />
                                          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1 4-10z" />
                                        </svg>
                                        <span>Público</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
                                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                        </svg>
                                        <span>Privado</span>
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <>
                                    <div className="meta-pill-static">
                                      <b>{activeProject.visibility === "public" ? "Público" : "Privado"}</b>
                                    </div>
                                    {activeInviteRole === "edit" && (
                                      <div className="meta-pill-static invite-role-pill edit">
                                        <b>Invitación · Podés editar</b>
                                      </div>
                                    )}
                                    {activeInviteRole === "listen" && (
                                      <div className="meta-pill-static invite-role-pill listen">
                                        <b>Invitación · Solo escuchar</b>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                              <div className="inspector-compact-actions" style={{ position: "relative" }}>
                                {canEditActive && (
                                  <label className="apple-btn primary compact-pill-btn" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <line x1="12" y1="5" x2="12" y2="19" />
                                      <line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                    <span>Añadir tracks</span>
                                    <input
                                      type="file"
                                      multiple
                                      accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/x-m4a,audio/aac,audio/flac,audio/ogg"
                                      hidden
                                      onChange={(e) => {
                                        if (e.target.files && e.target.files.length > 0) {
                                          void handleUploadMultipleProjectTracks(
                                            activeProject.id,
                                            e.target.files
                                          );
                                          e.target.value = "";
                                        }
                                      }}
                                    />
                                  </label>
                                )}
                                <button
                                  type="button"
                                  className={`apple-btn ghost compact-pill-btn ${
                                    shareCopiedId === activeProject.id ? "copied-ok" : ""
                                  }`}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                  onClick={() => handleCopyProjectLink(activeProject.id)}
                                  title={`Generar link de Invitación al ${activeProject.type}`}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                                    <polyline points="16 6 12 2 8 6" />
                                    <line x1="12" y1="2" x2="12" y2="15" />
                                  </svg>
                                  <span>{shareCopiedId === activeProject.id ? "Link copiado" : "Invitar"}</span>
                                </button>
                                {activeProject.spotifyUrl && (
                                  <a
                                    href={activeProject.spotifyUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="apple-btn ghost compact-pill-btn spotify-pill-btn"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
                                    title="Abrir álbum en Spotify"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#1DB954">
                                      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                    </svg>
                                    <span>Spotify</span>
                                  </a>
                                )}
                                <button
                                  type="button"
                                  className={`untitled-icon-squircle ${projectMenuOpen ? "is-active" : ""}`}
                                  style={{ width: 34, height: 34, borderRadius: 10 }}
                                  aria-label="Más opciones del proyecto"
                                  onClick={() => {
                                    sfx.tap();
                                    setProjectMenuOpen((m) => !m);
                                  }}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="5" cy="12" r="2" />
                                    <circle cx="12" cy="12" r="2" />
                                    <circle cx="19" cy="12" r="2" />
                                  </svg>
                                </button>

                                {projectMenuOpen && (
                                  <>
                                    <div
                                      className="apple-popover-backdrop"
                                      onClick={() => setProjectMenuOpen(false)}
                                    />
                                    <div
                                      className="untitled-mobile-menu-sheet desktop-popover-menu"
                                    >
                                      {canEditActive && (
                                        <>
                                          <button
                                            type="button"
                                            className="untitled-menu-item"
                                            onClick={() => {
                                              setProjectMenuOpen(false);
                                              setEditingTitleProjectId(activeProject.id);
                                              setInlineTitleValue(activeProject.title);
                                            }}
                                          >
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M12 20h9" />
                                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                            </svg>
                                            <span>Cambiar nombre</span>
                                          </button>
                                          <button
                                            type="button"
                                            className="untitled-menu-item"
                                            onClick={() => {
                                              setProjectMenuOpen(false);
                                              setEditingProject(activeProject);
                                            }}
                                          >
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M12 20h9" />
                                              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                            </svg>
                                            <span>Editar detalles</span>
                                          </button>
                                          <label className="untitled-menu-item">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                              <circle cx="8.5" cy="8.5" r="1.5" />
                                              <polyline points="21 15 16 10 5 21" />
                                            </svg>
                                            <span>Cambiar portada</span>
                                            <input
                                              type="file"
                                              accept="image/*,image/gif"
                                              hidden
                                              onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) {
                                                  handleUpdateProjectCover(
                                                    activeProject.id,
                                                    URL.createObjectURL(f)
                                                  );
                                                  setProjectMenuOpen(false);
                                                  e.target.value = "";
                                                }
                                              }}
                                            />
                                          </label>
                                          <label className="untitled-menu-item">
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <polygon points="23 7 16 12 23 17 23 7" />
                                              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                                            </svg>
                                            <span>
                                              {activeProject.videos.some((v) => Boolean(v.url))
                                                ? "Cambiar Canvas"
                                                : "Subir Canvas"}
                                            </span>
                                            <input
                                              type="file"
                                              accept="video/mp4,video/webm,image/gif,image/*,video/*"
                                              hidden
                                              onChange={(e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                  handleUploadProjectVideo(activeProject.id, file);
                                                  setProjectMenuOpen(false);
                                                  e.target.value = "";
                                                }
                                              }}
                                            />
                                          </label>
                                          {activeProject.videos.some((v) => Boolean(v.url)) && (
                                            <button
                                              type="button"
                                              className="untitled-menu-item danger"
                                              onClick={() => {
                                                handleRemoveProjectVideo(
                                                  activeProject.id,
                                                  activeProject.videos[0].id
                                                );
                                                setProjectMenuOpen(false);
                                              }}
                                            >
                                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <line x1="18" y1="6" x2="6" y2="18" />
                                                <line x1="6" y1="6" x2="18" y2="18" />
                                              </svg>
                                              <span>Quitar Canvas</span>
                                            </button>
                                          )}
                                        </>
                                      )}
                                      {!activeIsMine && (
                                        <button
                                          type="button"
                                          className="untitled-menu-item"
                                          onClick={() => {
                                            toggleSaveProject(activeProject.id);
                                            setProjectMenuOpen(false);
                                          }}
                                        >
                                          <svg width="15" height="15" viewBox="0 0 24 24" fill={savedProjectIds.includes(activeProject.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                          </svg>
                                          <span>
                                            {savedProjectIds.includes(activeProject.id)
                                              ? "Quitar de Biblioteca"
                                              : "Guardar en Biblioteca"}
                                          </span>
                                        </button>
                                      )}
                                      {activeProject.spotifyUrl && (
                                        <a
                                          href={activeProject.spotifyUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="untitled-menu-item"
                                          onClick={() => setProjectMenuOpen(false)}
                                          style={{ textDecoration: "none" }}
                                        >
                                          <svg width="15" height="15" viewBox="0 0 24 24" fill="#1DB954">
                                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
                                          </svg>
                                          <span>Escuchar en Spotify</span>
                                        </a>
                                      )}
                                      {activeIsMine && (
                                        <>
                                          <div className="untitled-menu-divider" />
                                          <button
                                            type="button"
                                            className="untitled-menu-item danger"
                                            onClick={() => {
                                              setProjectMenuOpen(false);
                                              if (
                                                window.confirm(
                                                  `¿Eliminar "${activeProject.title}"? No se puede deshacer.`
                                                )
                                              ) {
                                                handleDeleteProject(activeProject.id);
                                              }
                                            }}
                                          >
                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <polyline points="3 6 5 6 21 6" />
                                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                            <span>Eliminar proyecto</span>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="inspector-title-row">
                              <div className="inspector-title-col">
                                {editingTitleProjectId === activeProject.id ? (
                                  <form
                                    className="inline-project-title-form"
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      handleSaveInlineTitle(activeProject.id, inlineTitleValue);
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="text"
                                      className="inline-project-title-input"
                                      value={inlineTitleValue}
                                      autoFocus
                                      onFocus={(e) => e.target.select()}
                                      onChange={(e) => setInlineTitleValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") setEditingTitleProjectId(null);
                                      }}
                                      onBlur={() => handleSaveInlineTitle(activeProject.id, inlineTitleValue)}
                                      placeholder="Nombre del proyecto..."
                                      maxLength={80}
                                    />
                                    <div className="inline-title-btn-group">
                                      <button
                                        type="submit"
                                        className="inline-title-confirm-btn"
                                        title="Guardar nombre (Enter)"
                                        onMouseDown={(e) => e.preventDefault()}
                                      >
                                        ✓
                                      </button>
                                      <button
                                        type="button"
                                        className="inline-title-cancel-btn"
                                        onClick={() => setEditingTitleProjectId(null)}
                                        title="Cancelar (Esc)"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  <div
                                    className={`inspector-project-title-wrap ${canEditActive ? "is-editable" : ""}`}
                                    onClick={() => {
                                      if (canEditActive) {
                                        setEditingTitleProjectId(activeProject.id);
                                        setInlineTitleValue(activeProject.title);
                                      }
                                    }}
                                    title={canEditActive ? "Hacé click para cambiar el nombre del proyecto" : undefined}
                                  >
                                    <h2 className="inspector-project-title">{activeProject.title}</h2>
                                    {canEditActive && (
                                      <button
                                        type="button"
                                        className="inline-title-edit-trigger"
                                        aria-label="Cambiar nombre del proyecto"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingTitleProjectId(activeProject.id);
                                          setInlineTitleValue(activeProject.title);
                                        }}
                                        title="Cambiar nombre"
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M12 20h9" />
                                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                )}
                                <span className="inspector-project-artist">
                                  {activeProject.artist}
                                  {activeProject.description ? ` · ${activeProject.description}` : ""}
                                </span>
                              </div>
                              <div className="inspector-title-ctas">
                                {!activeIsMine && (
                                  <button
                                    type="button"
                                    className="apple-btn ghost"
                                    onClick={() => toggleSaveProject(activeProject.id)}
                                    title="Guardar este proyecto en tu biblioteca"
                                  >
                                    {savedProjectIds.includes(activeProject.id)
                                      ? "★ Guardado en Biblioteca"
                                      : "+ Guardar en Biblioteca"}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  className="apple-btn primary"
                                  onClick={() =>
                                    activeProject.tracks[0] &&
                                    playTrack(activeProject.tracks[0], activeProject, true)
                                  }
                                >
                                  ▶ Reproducir
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="inspector-tracks-list-scroll">
                            {activeProject.tracks.map((t, idx) => {
                              const isCurrent = currentTrack.id === t.id;
                              const isDragged = draggedTrack?.track.id === t.id;
                              const isDropBefore = dropTargetTrackIndex === idx && draggedTrack && draggedTrack.sourceIndex > idx;
                              const isDropAfter = dropTargetTrackIndex === idx && draggedTrack && draggedTrack.sourceIndex < idx;
                              const art = t.coverUrl || activeProject.coverUrl;
                              return (
                                <div
                                  key={t.id}
                                  data-track-index={idx}
                                  data-track-id={t.id}
                                  className={`clean-track-row ${isCurrent ? "is-playing" : ""} ${
                                    isDragged ? "is-drag-source" : ""
                                  } ${isDropBefore ? "is-drop-target-before" : ""} ${
                                    isDropAfter ? "is-drop-target-after" : ""
                                  }`}
                                  onMouseEnter={() => sfx.hover()}
                                  onClick={() => {
                                    if (!draggedTrack && !dragEndedRecentlyRef.current) playTrack(t, activeProject, false);
                                  }}
                                >
                                  {canEditActive && (
                                    <button
                                      type="button"
                                      className="track-drag-handle"
                                      title="Arrastrá para reordenar o mover de proyecto"
                                      onPointerDown={(e) => startDraggingTrack(e, t, idx)}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="9" cy="6" r="2.2" />
                                        <circle cx="15" cy="6" r="2.2" />
                                        <circle cx="9" cy="12" r="2.2" />
                                        <circle cx="15" cy="12" r="2.2" />
                                        <circle cx="9" cy="18" r="2.2" />
                                        <circle cx="15" cy="18" r="2.2" />
                                      </svg>
                                    </button>
                                  )}
                                  <span className="inspector-track-num">{idx + 1}</span>
                                  <div className="track-row-art-wrap">
                                    {art ? (
                                      <img
                                        src={art}
                                        alt={t.title}
                                        className="track-row-img-thumb"
                                      />
                                    ) : (
                                      <span className="track-row-art-fallback">
                                        {idx + 1}
                                      </span>
                                    )}
                                  </div>
                                  <div className="row-main">
                                    <b>{t.title}</b>
                                    <span>
                                      {t.artist}
                                      {t.feat ? ` feat. ${t.feat}` : ""}
                                      {t.prod ? ` · prod. ${t.prod}` : ""}
                                    </span>
                                  </div>
                                  <div
                                    className="row-pills"
                                    title={canEditActive ? "Tocá para editar Key y BPM" : undefined}
                                    style={canEditActive ? { cursor: "pointer" } : undefined}
                                    onClick={(e) => {
                                      if (!canEditActive) return;
                                      e.stopPropagation();
                                      setEditingTrack(t);
                                    }}
                                  >
                                    <span className="meta-chip">{t.bpm} BPM</span>
                                    <span className="meta-chip">{t.key}</span>
                                  </div>
                                  <div className="row-inline-actions">
                                    <button
                                      type="button"
                                      className="row-snippet-btn track-download-btn"
                                      title={`Descargar ${t.title}`}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        sfx.tap();
                                        const url =
                                          t.customAudioUrl ||
                                          customAudioMap[t.id] ||
                                          (await resolveTrackAudioUrl(t.id));
                                        await downloadTrackAudio(t.title, t.artist, url);
                                      }}
                                    >
                                      ⬇
                                    </button>
                                    {canEditActive && (
                                      <>
                                        <button
                                          type="button"
                                          className="row-snippet-btn"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingTrack(t);
                                          }}
                                        >
                                          Editar
                                        </button>
                                        <button
                                          type="button"
                                          className="trash-icon-btn"
                                          title={`Eliminar ${t.title}`}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteTrack(activeProject.id, t.id);
                                          }}
                                        >
                                          <TrashIcon />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Botón inferior siempre visible para agregar tracks al proyecto */}
                          {canEditActive && (
                            <div className="inspector-bottom-add-bar">
                              <label className="inspector-bottom-add-tracks-btn">
                                <span className="add-plus-circle">+</span>
                                <div className="add-tracks-copy">
                                  <b>
                                    {uploadingTrackProjectId === activeProject.id
                                      ? "Analizando Key y BPM de los tracks..."
                                      : "+ Agregar tracks al proyecto"}
                                  </b>
                                  <small>WAV · MP3 · Detecta Key y BPM automáticamente</small>
                                </div>
                                <input
                                  type="file"
                                  multiple
                                  accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/x-m4a,audio/aac,audio/flac,audio/ogg"
                                  hidden
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                      void handleUploadMultipleProjectTracks(
                                        activeProject.id,
                                        e.target.files
                                      );
                                      e.target.value = "";
                                    }
                                  }}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.section>
                  </MobileSheetPortal>
                )}
              </div>
              )}
            </div>
          )}

          {/* ==================== 3. SUBIR ==================== */}
          {tab === "subir" && (
            <MacInstallerUpload
              meProfile={meProfile}
              projects={myProjects.filter(
                (p) =>
                  !p.artistId ||
                  (meProfile.id && p.artistId === meProfile.id) ||
                  projectInvites[p.id] === "edit" ||
                  p.artist.toLowerCase() === meProfile.name.toLowerCase()
              )}
              onAddTrackToProject={handleAddTrackToProject}
              onPlayTrack={(tr, pr) => playTrack(tr, pr, false)}
              onOpenCreateProject={() => navigate("crear-proyecto")}
              onGoToProject={(projId) => {
                setSelectedProjectId(projId);
                setInsideCubeOpen(true);
                navigate("biblioteca");
              }}
            />
          )}

          {/* ==================== 3B. CREAR PROYECTO (PARTÍCULAS SENTIENTES + LOGO 3D "board.") ==================== */}
          {tab === "crear-proyecto" && (
            <CreateProjectScreen
              meProfile={meProfile}
              existingCount={projects.length}
              onCancel={() => navigate("biblioteca")}
              onCreateProject={(newProj) => {
                const proj: Project = {
                  ...newProj,
                  artistId: meProfile.id,
                  visibility: newProj.visibility || "private",
                  createdAt: new Date().toISOString(),
                };
                setProjects((prev) => [proj, ...prev]);
                setSelectedProjectId(proj.id);
                setInsideCubeOpen(false);
                navigate("biblioteca");
              }}
            />
          )}

          {/* ==================== 4. PERFIL ==================== */}
          {tab === "perfil" && (
            <div className="profile-page">
              <section className="profile-hero-card">
                <div className="profile-hero-top">
                  <div
                    className="profile-avatar-large"
                    style={{ background: meProfile.color, cursor: "pointer", position: "relative", overflow: "hidden" }}
                    onClick={() => {
                      sfx.open();
                      setEditProfileOpen(true);
                    }}
                    title="Tocá para cambiar tu foto de perfil"
                  >
                    {meProfile.avatarUrl ? (
                      <img
                        src={meProfile.avatarUrl}
                        alt={meProfile.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span>{meProfile.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="profile-main-copy">
                    <div className="profile-badges">
                      <span className="mono-tag">{meProfile.role}</span>
                      {meProfile.zone && <span className="mono-tag">{meProfile.zone}</span>}
                    </div>
                    <h1>
                      {meProfile.name} <em>{meProfile.handle}</em>
                    </h1>
                    {meProfile.bio && <p>{meProfile.bio}</p>}
                    {meProfile.stickers.length > 0 && (
                      <div className="profile-sticker-tray">
                        {meProfile.stickers.map((st, i) => (
                          <span key={i} className="sticker-chip">
                            {st}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="profile-cta-col">
                    <div className="profile-actions-row">
                      <button
                        type="button"
                        className="apple-btn primary profile-action-btn-half"
                        onClick={() => {
                          sfx.open();
                          setEditProfileOpen(true);
                        }}
                      >
                        Editar Perfil &amp; Identidad
                      </button>
                      <button
                        type="button"
                        className="apple-btn ghost profile-action-btn-half profile-invite-half-btn"
                        onClick={() => {
                          sfx.open();
                          setInviteFriendsModalOpen(true);
                        }}
                        title="Invitaciones exclusivas a board (3 pases disponibles)"
                      >
                        <span>🎟️ Invitar amigos</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="profile-metrics-bar">
                  <div>
                    <b>{myProjects.reduce((acc, p) => acc + p.tracks.length, 0)}</b>
                    <span>TRACKS</span>
                  </div>
                  <div>
                    <b>{myProjects.length}</b>
                    <span>PROYECTOS</span>
                  </div>
                  {meProfile.followersCount > 0 && (
                    <div>
                      <b>{meProfile.followersCount}</b>
                      <span>SEGUIDORES</span>
                    </div>
                  )}
                </div>
              </section>

              {/* ==================== 1. MIS PROYECTOS & CANVAS (ANTES DE INVITACIONES) ==================== */}
              <section className="profile-manifold-showcase">
                <div className="section-header-row">
                  <div>
                    <h2 className="editorial-h2">
                      Mis Proyectos &amp; Canvas
                    </h2>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="apple-btn primary"
                      onClick={() => navigate("crear-proyecto")}
                    >
                      + Crear Proyecto
                    </button>
                    <button
                      type="button"
                      className="apple-btn ghost"
                      onClick={() => navigate("subir")}
                    >
                      + Subir tracks
                    </button>
                  </div>
                </div>

                <ManifoldLibrary3D
                  projects={myProjects}
                  selectedProjectId={activeProject?.id || selectedProjectId}
                  viewMode={libraryViewMode}
                  compact={true}
                  hideSwitcher={true}
                  onChangeViewMode={(m) => setLibraryViewMode(m)}
                  onSelectProject={(proj) => setSelectedProjectId(proj.id)}
                  onDiveIntoProject={(proj) => {
                    setSelectedProjectId(proj.id);
                    setLibrarySubTab("proyectos");
                    setInsideCubeOpen(true);
                    navigate("biblioteca");
                  }}
                  onOpenCreateProject={() => navigate("crear-proyecto")}
                  onDeleteProject={handleDeleteProject}
                  dropTargetProjectId={dropTargetProjectId}
                  transferAnimation={
                    transferAnimation?.active
                      ? {
                          trackTitle: transferAnimation.track.title,
                          targetProjectId: transferAnimation.targetProjectId,
                        }
                      : null
                  }
                />
              </section>

              {/* ==================== 2. INVITACIONES EXCLUSIVAS (AL FINAL DE PROYECTOS) ==================== */}
              <section className="profile-invites-bottom-section">
                <div
                  className="profile-invite-banner"
                  onClick={() => {
                    sfx.open();
                    setInviteFriendsModalOpen(true);
                  }}
                  title="Abrir mis pases de invitación"
                >
                  <div className="profile-invite-banner-left">
                    <span className="invite-banner-icon">🎟️</span>
                    <div className="invite-banner-text">
                      <b>Invitaciones exclusivas a El tablero.</b>
                      <p>Tenés 3 códigos cada 2 semanas para sumar a tus artistas y productores de confianza.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="apple-btn ghost invite-banner-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      sfx.open();
                      setInviteFriendsModalOpen(true);
                    }}
                  >
                    Ver pases
                  </button>
                </div>
              </section>
            </div>
          )}
        </motion.main>
      </AnimatePresence>

      {/* ==================== DYNAMIC ISLAND REPRODUCTOR (CONTROLES 100% CENTRADOS + SOLO TRACK/ARTISTA + SLIDER DE VOLUMEN) ==================== */}
      <AnimatePresence>
        {!playerExpanded && (
          <div className="ios-mini-player-dock">
            <motion.div
              className="ios-mini-player"
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              onTouchStart={(e) => {
                if (e.touches.length === 1) {
                  miniPlayerTouchRef.current = {
                    startY: e.touches[0].clientY,
                    startX: e.touches[0].clientX,
                  };
                }
              }}
              onTouchEnd={(e) => {
                if (miniPlayerTouchRef.current && e.changedTouches.length === 1) {
                  const dy = e.changedTouches[0].clientY - miniPlayerTouchRef.current.startY;
                  const dx = Math.abs(e.changedTouches[0].clientX - miniPlayerTouchRef.current.startX);
                  // Deslizar hacia arriba en el mini-player (dy < -18px) lo abre inmediatamente
                  if (dy < -18 && dx < Math.abs(dy) * 1.5) {
                    sfx.open();
                    setPlayerExpanded(true);
                  }
                }
                miniPlayerTouchRef.current = null;
              }}
              onClick={(e) => {
                const t = e.target as HTMLElement;
                if (t.closest("button") || t.closest("input")) return;
                sfx.open();
                setPlayerExpanded(true);
              }}
            >
              {/* Barra superior de progreso interactiva (Scrubber) */}
              <div className="mini-scrubber-track">
                <div
                  className="mini-scrubber-fill"
                  style={{
                    width: `${Math.min(100, (miniPlayback.currentSec / Math.max(1, miniPlayback.durationSec)) * 100)}%`,
                  }}
                />
                <input
                  type="range"
                  min={0}
                  max={Math.max(1, miniPlayback.durationSec)}
                  step={0.2}
                  value={Math.min(miniPlayback.durationSec, miniPlayback.currentSec)}
                  onChange={(e) => {
                    const sec = Number(e.target.value);
                    setMiniPlayback((prev) => ({ ...prev, currentSec: sec }));
                    sfx.seek(sec);
                  }}
                  className="mini-scrubber-input"
                  aria-label="Progreso del track"
                />
              </div>

              {/* Columna Izquierda: Portada + Nombre del Track y Artista */}
              <div
                className="mini-left"
                onClick={() => {
                  sfx.open();
                  setPlayerExpanded(true);
                }}
              >
                <div
                  className="mini-art"
                  style={{
                    background: `linear-gradient(135deg, ${currentTrack.c1}, ${currentTrack.c2})`,
                  }}
                >
                  {currentProject?.coverUrl ? (
                    <img
                      src={currentProject.coverUrl}
                      alt={currentTrack.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }}
                    />
                  ) : (
                    <span className={isPlaying ? "spin-slow" : ""}>{currentTrack.glyph}</span>
                  )}
                </div>

                <div className="mini-meta">
                  <b>{currentTrack.title}</b>
                  {currentTrack.id !== "standby-track" && (
                    <div className="mini-meta-sub">
                      <span>
                        {currentTrack.artist}
                        {currentTrack.prod ? ` · prod. ${currentTrack.prod}` : ""}
                      </span>
                      <small className="mini-time-badge">
                        {formatTime(miniPlayback.currentSec)} / {formatTime(miniPlayback.durationSec)}
                      </small>
                    </div>
                  )}
                </div>
              </div>

              {/* Columna Central: Controles Play / Skip perfectamente centrados en el eje del Dynamic Island */}
              <div className="mini-controls">
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => stepTrack(-1)}
                  aria-label="Anterior"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="19 20 9 12 19 4 19 20"></polygon>
                    <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="3" strokeLinecap="round"></line>
                  </svg>
                </button>
                <button
                  type="button"
                  className="mini-play-btn"
                  onClick={togglePlay}
                  aria-label="Reproducir o pausar"
                >
                  {isPlaying ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1.5"></rect>
                      <rect x="14" y="4" width="4" height="16" rx="1.5"></rect>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                      <polygon points="6 4 20 12 6 20 6 4"></polygon>
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  onClick={() => stepTrack(1)}
                  aria-label="Siguiente"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 4 15 12 5 20 5 4"></polygon>
                    <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="3" strokeLinecap="round"></line>
                  </svg>
                </button>
              </div>

              {/* Columna Derecha: Slider de Volumen + Botón Expandir 3D */}
              <div className="mini-volume-wrap">
                <button
                  type="button"
                  className="mini-vol-btn"
                  onClick={handleToggleMute}
                  aria-label={muted ? "Activar sonido" : "Silenciar"}
                >
                  {muted || volume === 0 ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <line x1="23" y1="9" x2="17" y2="15"></line>
                      <line x1="17" y1="9" x2="23" y2="15"></line>
                    </svg>
                  ) : volume < 0.5 ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="apple-volume-slider"
                  aria-label="Volumen"
                />
                <button
                  type="button"
                  className="mini-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    sfx.open();
                    setPlayerExpanded(true);
                  }}
                  title="Expandir reproductor visual 3D"
                  aria-label="Expandir reproductor visual 3D"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <polyline points="9 21 3 21 3 15"></polyline>
                    <line x1="21" y1="3" x2="14" y2="10"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                  </svg>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== PANTALLA REPRODUCTOR 3D COMPLETA ==================== */}
      <AnimatePresence>
        {playerExpanded && (
          <UniversalPortal>
            <motion.div
              className="perf-modal-layer"
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", stiffness: 280, damping: 30 }}
            >
              <PerformativePlayer
                track={currentTrack}
                project={
                  projects.find((p) => p.id === currentProject.id) ||
                  projects.find((p) => p.tracks.some((t) => t.id === currentTrack.id)) ||
                  activeProject ||
                  currentProject
                }
                allProjects={projects}
                isPlaying={isPlaying}
                volume={volume}
                muted={muted}
                shuffle={shuffle}
                repeatMode={repeatMode}
                likedTrackIds={likedTrackIds}
                userQueue={userQueue}
                onTogglePlay={togglePlay}
                onNext={() => stepTrack(1)}
                onPrev={() => stepTrack(-1)}
                onSelectTrack={(t, p) => playTrack(t, p, true)}
                onToggleShuffle={() => setShuffle((s) => !s)}
                onCycleRepeat={() =>
                  setRepeatMode((m) => (m === "off" ? "all" : m === "all" ? "one" : "off"))
                }
                onToggleLike={(id) =>
                  setLikedTrackIds((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                  )
                }
                onAddToQueue={(t, p) => setUserQueue((prev) => [...prev, { track: t, project: p }])}
                onRemoveFromQueue={(idx) =>
                  setUserQueue((prev) => prev.filter((_, i) => i !== idx))
                }
                onClearQueue={() => setUserQueue([])}
                onVolumeChange={handleVolumeChange}
                onToggleMute={handleToggleMute}
                onClose={() => setPlayerExpanded(false)}
                onJumpToProject={(projId) => {
                  setPlayerExpanded(false);
                  setSelectedProjectId(projId);
                  setTab("biblioteca");
                }}
                onOpenEditTrack={() => setEditingTrack(currentTrack)}
                onSaveTrack={handleSaveTrackAndClip}
                theme={theme}
                onToggleTheme={toggleTheme}
              />
            </motion.div>
          </UniversalPortal>
        )}
      </AnimatePresence>

      {/* ==================== PANTALLA / MODAL "EDITAR TRACK" ==================== */}
      <AnimatePresence>
        {editingTrack && (
          <EditTrackModal
            track={editingTrack}
            onClose={() => setEditingTrack(null)}
            onSave={handleSaveEditedTrack}
            onDelete={() => handleDeleteTrackById(editingTrack.id)}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL "EDITAR PROYECTO & VINILO" ==================== */}
      <AnimatePresence>
        {editingProject && (
          <EditProjectModal
            project={editingProject}
            onClose={() => setEditingProject(null)}
            onSave={handleSaveEditedProject}
            onDelete={() => {
              handleDeleteProject(editingProject.id);
              setEditingProject(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL "INVITACIÓN AL EP / PROYECTO" (ESTILO [untitled]) ==================== */}
      <AnimatePresence>
        {invitingProject && (
          <InviteProjectModal
            project={invitingProject}
            isOwner={Boolean(meProfile.id && invitingProject.artistId === meProfile.id)}
            canShareEdit={Boolean(
              (meProfile.id && invitingProject.artistId === meProfile.id) ||
                projectInvites[invitingProject.id] === "edit"
            )}
            onToggleVisibility={(nextVis) => {
              sfx.tick();
              updateProjectMeta(invitingProject.id, { visibility: nextVis });
            }}
            onCopiedLink={(pid) => {
              setShareCopiedId(pid);
              window.setTimeout(() => {
                setShareCopiedId((prev) => (prev === pid ? null : prev));
              }, 2600);
            }}
            onClose={() => setInvitingProjectId(null)}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL "EDITAR PERFIL" ==================== */}
      <AnimatePresence>
        {editProfileOpen && (
          <EditProfileModal
            profile={meProfile}
            googleConnected={googleConnected}
            userEmail={meProfile.email}
            onOpenAuth={() => setAuthModalOpen(true)}
            onClose={() => setEditProfileOpen(false)}
            onSave={async (updated) => {
              const res = await handleSaveProfileAndHandle(updated);
              if (res.success) {
                setEditProfileOpen(false);
                sfx.drop();
              }
              return res;
            }}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL CUENTAS / LOGIN & REGISTER CON GOOGLE ==================== */}
      <AnimatePresence>
        {authModalOpen && (
          <GoogleAuthModal
            profile={meProfile}
            connected={googleConnected}
            onClose={() => setAuthModalOpen(false)}
            onSaveProfile={handleSaveProfileAndHandle}
            onSignOut={async () => {
              try {
                await supabase.auth.signOut();
              } catch {}
              setGoogleConnected(false);
              setAuthModalOpen(false);
              sfx.drop();
            }}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL INVITAR AMIGOS (3 CÓDIGOS CADA 2 SEMANAS) ==================== */}
      <AnimatePresence>
        {inviteFriendsModalOpen && (
          <InviteFriendsModal
            profile={meProfile}
            onClose={() => setInviteFriendsModalOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ==================== MODAL DE BIENVENIDA POR LINK DE INVITACIÓN ==================== */}
      <AnimatePresence>
        {welcomeInvite && !googleConnected && (
          <WelcomeInviteModal
            code={welcomeInvite.code}
            creatorHandle={welcomeInvite.creatorHandle}
            creatorName={welcomeInvite.creatorName}
            onAccept={() => {
              setWelcomeInvite(null);
              setAuthModalOpen(true);
            }}
            onClose={() => setWelcomeInvite(null)}
          />
        )}
      </AnimatePresence>

      {/* ==================== LANDING SOBRE LA APP (solo si se abre /landing con sesión) ==================== */}
      <AnimatePresence>
        {showLanding && <LandingScene onOpenGoogleAuth={() => setShowLanding(false)} />}
      </AnimatePresence>

      {syncStatus !== "idle" && (
        <button
          type="button"
          className={`sync-pill ${syncStatus}`}
          onClick={() => syncStatus === "error" && setProjects((p) => [...p])}
        >
          {syncStatus === "saving" ? "Guardando…" : "No se pudo guardar en la nube · reintentar"}
        </button>
      )}

      {/* ==================== PROXY FLOTANTE CON FORCEFIELD FACHERO ==================== */}
      {draggedTrack && (
        <div
          className="track-forcefield-floating-proxy"
          style={{
            transform: `translate3d(${dragPointer.x}px, ${dragPointer.y}px, 0px) translate(-50%, -50%) rotate(2.4deg)`,
          }}
        >
          <div className="forcefield-aura-ring" />
          <div className="forcefield-card">
            <div className="forcefield-thumb">
              <img
                src={
                  draggedTrack.track.coverUrl ||
                  activeProject?.coverUrl ||
                  "/covers/chickennugget.png"
                }
                alt=""
              />
              <span className="forcefield-energy-badge">⚡</span>
            </div>
            <div className="forcefield-info">
              <b>{draggedTrack.track.title}</b>
              <span>
                {draggedTrack.track.artist} · {draggedTrack.track.bpm} BPM · {draggedTrack.track.key}
              </span>
            </div>
            <div className="forcefield-status-chip">
              {insideCubeOpen
                ? "Arrastrá a la izq. para proyectos"
                : dropTargetProjectId
                ? "Soltá para agregar ✓"
                : "Soltá en un proyecto"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== COMPONENTE: PANTALLA EDITAR TRACK ==================== */
function UniversalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (mounted && typeof document !== "undefined") return createPortal(children, document.body);
  return null;
}

/**
 * En celular la hoja del proyecto es `position: fixed` a pantalla completa. Si queda dentro de un
 * ancestro con transform/filter (animaciones de página), el navegador la recorta al alto del ancestro
 * y se ve la pantalla vacía. Por eso en <= 720px se monta directo en <body>.
 */
function MobileSheetPortal({ children }: { children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  if (mobile && typeof document !== "undefined") return createPortal(children, document.body);
  return <>{children}</>;
}

function EditTrackModal({
  track,
  onClose,
  onSave,
  onDelete,
}: {
  track: Track;
  onClose: () => void;
  onSave: (t: Track) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [feat, setFeat] = useState(track.feat || "");
  const [prod, setProd] = useState(track.prod || "");
  const [bpm, setBpm] = useState(track.bpm);
  const [musicalKey, setMusicalKey] = useState(track.key);
  const [version, setVersion] = useState(track.version);
  const [note, setNote] = useState(track.note || "");
  const [c2, setC2] = useState(track.c2);
  const [customAudioUrl, setCustomAudioUrl] = useState<string | undefined>(track.customAudioUrl);
  const [coverUrl, setCoverUrl] = useState<string | undefined>(track.coverUrl);

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">STUDIO INSPECTOR // EDITAR TRACK</span>
            <h3>Editar metadata y versión del track</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="modal-form-grid">
          <label className="modal-field">
            <span>TÍTULO DEL TRACK</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>ARTISTA PRINCIPAL</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>FEATURING (OPCIONAL)</span>
            <input value={feat} onChange={(e) => setFeat(e.target.value)} placeholder="ej. eyebags" />
          </label>
          <label className="modal-field">
            <span>PRODUCTOR (OPCIONAL)</span>
            <input value={prod} onChange={(e) => setProd(e.target.value)} placeholder="ej. dorkke, Gonza2k..." />
          </label>
          <label className="modal-field">
            <span>BPM</span>
            <input type="number" value={bpm} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <label className="modal-field">
            <span>KEY (TONALIDAD)</span>
            <input value={musicalKey} onChange={(e) => setMusicalKey(e.target.value)} placeholder="ej. F#m" />
          </label>
          <label className="modal-field">
            <span>NÚMERO DE VERSIÓN</span>
            <input type="number" value={version} onChange={(e) => setVersion(Number(e.target.value))} />
          </label>
          <label className="modal-field">
            <span>COLOR DEL DISCO / SELLO</span>
            <div className="color-dots">
              {["#e11d48", "#0284c7", "#ca8a04", "#65a30d", "#7e22ce", "#14b8a6"].map((col) => (
                <button
                  key={col}
                  type="button"
                  style={{ background: col }}
                  className={c2 === col ? "on" : ""}
                  onClick={() => setC2(col)}
                />
              ))}
            </div>
          </label>

          <label className="modal-field full">
            <span>PORTADA / IMAGEN INDIVIDUAL DEL TRACK</span>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 6 }}>
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={title}
                  style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
                />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 8, background: "#1c1d24", display: "grid", placeItems: "center" }}>
                  <DiscIcon size={24} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setCoverUrl(URL.createObjectURL(f));
                  }}
                />
                <small style={{ display: "block", color: "rgba(255,255,255,0.5)", marginTop: 4, fontSize: 11 }}>
                  Esta imagen se muestra en su disco del spinner 3D y en el reproductor.
                </small>
              </div>
            </div>
          </label>

          <label className="modal-field full">
            <span>NOTAS DE SESIÓN / CAMBIOS DE MEZCLA</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ej. sub más seco, falta automatizar delay del outro..."
            />
          </label>
          <label className="modal-field full">
            <span>REEMPLAZAR ARCHIVO DE AUDIO (WAV / MP3 · DETECTA KEY Y BPM AUTOMÁTICO)</span>
            <input
              type="file"
              accept=".wav,.mp3,.m4a,.flac,.aac,.ogg,.aiff,.alac,.opus,audio/wav,audio/x-wav,audio/wave,audio/mpeg,audio/mp3,audio/mp4,audio/x-m4a,audio/aac,audio/flac,application/octet-stream"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setCustomAudioUrl(URL.createObjectURL(f));
                  const res = await analyzeAudioFile(f);
                  setBpm(res.bpm);
                  setMusicalKey(res.key);
                }
              }}
            />
          </label>
        </div>

        <div className="modal-foot">
          <button
            type="button"
            className="apple-btn ghost danger-trash-btn"
            onClick={onDelete}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <TrashIcon /> Eliminar track
            </span>
          </button>
          <div className="row-actions">
            <button type="button" className="apple-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="apple-btn primary"
              onClick={() =>
                onSave({
                  ...track,
                  title,
                  artist,
                  feat: feat.trim() || undefined,
                  prod: prod.trim() || undefined,
                  bpm: Number(bpm) || track.bpm,
                  key: musicalKey || track.key,
                  version: Number(version) || track.version,
                  note: note.trim() || undefined,
                  c2,
                  accent: c2,
                  customAudioUrl,
                  coverUrl,
                })
              }
            >
              Guardar cambios en el track
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ==================== COMPONENTE: MODAL EDITAR PROYECTO & VINILO ==================== */
function EditProjectModal({
  project,
  onClose,
  onSave,
  onDelete,
}: {
  project: Project;
  onClose: () => void;
  onSave: (p: Project) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [artist, setArtist] = useState(project.artist);
  const [visibility, setVisibility] = useState<"private" | "public">(project.visibility || "private");
  const [description, setDescription] = useState(project.description || "");
  const [coverUrl, setCoverUrl] = useState<string | undefined>(project.coverUrl);
  const [zone, setZone] = useState(project.zone || "Mendoza");

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">PROYECTO</span>
            <h3>Editar proyecto</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="modal-form-grid">
          <label className="modal-field">
            <span>NOMBRE DEL PROYECTO</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="modal-field">
            <span>ARTISTA O CREW</span>
            <input value={artist} onChange={(e) => setArtist(e.target.value)} required />
          </label>
          <div className="modal-field full">
            <span>PRIVACIDAD</span>
            <div className="seg-pills" style={{ marginTop: 6 }}>
              <button type="button" className={visibility === "private" ? "on" : ""} onClick={() => setVisibility("private")}>
                Privado
              </button>
              <button type="button" className={visibility === "public" ? "on" : ""} onClick={() => setVisibility("public")}>
                Público
              </button>
            </div>
          </div>
          <label className="modal-field">
            <span>ZONA</span>
            <input value={zone} onChange={(e) => setZone(e.target.value)} />
          </label>

          <label className="modal-field full">
            <span>ARTWORK</span>
            <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 6 }}>
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={title}
                  style={{ width: 64, height: 64, borderRadius: 8, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
                />
              ) : (
                <div style={{ width: 64, height: 64, borderRadius: 8, background: "#1c1d24", display: "grid", placeItems: "center" }}>
                  <DiscIcon size={28} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setCoverUrl(URL.createObjectURL(f));
                  }}
                />
              </div>
            </div>
          </label>

          <label className="modal-field full">
            <span>DESCRIPCIÓN</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Descripción (opcional)"
            />
          </label>
        </div>

        <div className="modal-foot">
          <button type="button" className="apple-btn ghost danger-trash-btn" onClick={onDelete}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <TrashIcon /> Eliminar proyecto
            </span>
          </button>
          <div className="row-actions">
            <button type="button" className="apple-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className="apple-btn primary"
              onClick={() => {
                onSave({
                  ...project,
                  title: title.trim() || project.title,
                  artist: artist.trim() || project.artist,
                  visibility,
                  zone,
                  description,
                  coverUrl,
                });
              }}
            >
              Guardar Cambios
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ==================== COMPONENTE: MODAL EDITAR PERFIL ==================== */
function EditProfileModal({
  profile,
  googleConnected,
  userEmail,
  onOpenAuth,
  onClose,
  onSave,
}: {
  profile: ArtistProfile;
  googleConnected?: boolean;
  userEmail?: string;
  onOpenAuth?: () => void;
  onClose: () => void;
  onSave: (p: ArtistProfile) => Promise<{ success: boolean; error?: string }>;
}) {
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || "");
  const [accountType, setAccountType] = useState<"artista" | "oyente">(profile.accountType || "artista");
  const [role, setRole] = useState(profile.role);
  const [zone, setZone] = useState(profile.zone);
  const [bio, setBio] = useState(profile.bio);
  const [color, setColor] = useState(profile.color);
  const [stickersText, setStickersText] = useState(profile.stickers.join(" "));
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg("");
    const res = await onSave({
      ...profile,
      name,
      handle: handle.startsWith("@") ? handle : `@${handle}`,
      avatarUrl: avatarUrl.trim() || undefined,
      accountType,
      role,
      zone,
      bio,
      color,
      stickers: stickersText
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setSaving(false);
    if (!res.success && res.error) {
      setErrorMsg(res.error);
    }
  };

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">PERFIL // BOARD.</span>
            <h3>Editar identidad del artista</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {errorMsg && (
          <div style={{ padding: "8px 12px", background: "rgba(225,29,72,0.14)", color: "#f43f5e", border: "1px solid rgba(225,29,72,0.3)", borderRadius: 8, fontSize: "0.82rem", marginBottom: 14 }}>
            {errorMsg}
          </div>
        )}

        <div className="modal-form-grid">
          {/* FOTO DE PERFIL */}
          <div className="modal-field full profile-avatar-edit-field">
            <span>FOTO DE PERFIL</span>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 6 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: color,
                  overflow: "hidden",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                  border: "2px solid var(--line-strong)",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <span style={{ fontSize: "1.4rem", fontWeight: 700, color: "#ffffff" }}>
                    {name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <label className="apple-btn ghost" style={{ cursor: "pointer", alignSelf: "flex-start", fontSize: "0.78rem" }}>
                  <span>Elegir imagen de tu dispositivo</span>
                  <input
                    type="file"
                    accept="image/*,.png,.jpg,.jpeg,.webp,.gif"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          if (typeof reader.result === "string") {
                            setAvatarUrl(reader.result);
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
                <input
                  type="url"
                  placeholder="O pegá el enlace a tu foto..."
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  style={{ fontSize: "0.8rem", padding: "6px 10px" }}
                />
              </div>
            </div>
          </div>

          {/* TIPO DE CUENTA: ARTISTA / OYENTE */}
          <div className="modal-field full">
            <span>TIPO DE CUENTA EN BOARD.</span>
            <div className="seg-pills" style={{ marginTop: 6 }}>
              <button
                type="button"
                className={accountType === "artista" ? "on" : ""}
                onClick={() => setAccountType("artista")}
              >
                🎙️ Artista / Productor
              </button>
              <button
                type="button"
                className={accountType === "oyente" ? "on" : ""}
                onClick={() => setAccountType("oyente")}
              >
                🎧 Oyente (Coleccionar &amp; Escuchar)
              </button>
            </div>
            <small style={{ color: "var(--ink-secondary)", fontSize: "0.68rem", marginTop: 4, display: "block" }}>
              {accountType === "oyente"
                ? "Como oyente, tu biblioteca se enfoca exclusivamente en tus proyectos guardados."
                : "Como artista o productor, podés crear proyectos 3D, subir tracks WAV/MP3 y canvas."}
            </small>
          </div>

          <label className="modal-field">
            <span>NOMBRE ARTÍSTICO</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>USUARIO (@HANDLE ÚNICO)</span>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@tu_handle" />
            <small style={{ color: "var(--ink-secondary)", fontSize: "0.68rem", marginTop: 3 }}>
              Único e irrepetible: solo vos podés usarlo en El tablero.
            </small>
          </label>
          <label className="modal-field">
            <span>ROL</span>
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="ej. Rapero · Artista" />
          </label>
          <label className="modal-field">
            <span>ZONA / DEPARTAMENTO</span>
            <input value={zone} onChange={(e) => setZone(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>COLOR DE AVATAR</span>
            <div className="color-dots">
              {["#111111", "#e11d48", "#1d4ed8", "#0f766e", "#ca8a04", "#7e22ce"].map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{ background: c }}
                  className={color === c ? "on" : ""}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </label>
          <label className="modal-field full">
            <span>BIO / MANIFIESTO</span>
            <input value={bio} onChange={(e) => setBio(e.target.value)} />
          </label>
          <label className="modal-field full">
            <span>STICKERS / INSIGNIAS (SEPARADOS POR ESPACIO)</span>
            <input value={stickersText} onChange={(e) => setStickersText(e.target.value)} />
          </label>

          {/* SECCIÓN CUENTA / GOOGLE SIGN-IN */}
          <div className="modal-field full profile-auth-integrated-card">
            <span>CUENTA &amp; SINCRONIZACIÓN EN LA NUBE</span>
            <div className="profile-auth-integrated-content">
              <div className="profile-auth-integrated-info">
                <b>
                  {googleConnected ? (userEmail || "Conectado con Google") : "Cuenta no vinculada"}
                </b>
                <small>
                  {googleConnected
                    ? "Tus canciones y proyectos se respaldan automáticamente en la nube de El tablero."
                    : "Vinculá tu cuenta para sincronizar tus proyectos entre todos tus dispositivos."}
                </small>
              </div>
              {onOpenAuth && (
                <button
                  type="button"
                  className="apple-btn ghost profile-auth-integrated-btn"
                  onClick={() => {
                    onClose();
                    onOpenAuth();
                  }}
                >
                  {googleConnected ? "Administrar Cuenta" : "Cuenta / Google Sign-In"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <button type="button" className="apple-btn ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button
            type="button"
            className="apple-btn primary"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Guardando en servidor..." : "Guardar Perfil"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ==================== COMPONENTE: MODAL LOGIN / REGISTER CON GOOGLE (FACTOR AUTH INVITACIÓN) ==================== */
function GoogleAuthModal({
  profile,
  connected,
  onClose,
  onSaveProfile,
  onSignOut,
}: {
  profile: ArtistProfile;
  connected: boolean;
  onClose: () => void;
  onSaveProfile: (updated: { name: string; handle: string; email?: string }) => Promise<{ success: boolean; error?: string }>;
  onSignOut: () => void;
}) {
  const [email, setEmail] = useState(profile.email || "");
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"info" | "error" | "success">("info");

  // Factor Auth: invitación obligatoria para nuevos registros
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [verifiedInvite, setVerifiedInvite] = useState<{
    code: string;
    creatorHandle?: string;
  } | null>(null);
  const [checkingInvite, setCheckingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [existingUserMode, setExistingUserMode] = useState(false);

  useEffect(() => {
    if (connected) return;
    const pending = getPendingInviteCode();
    if (pending) {
      setInviteCodeInput(pending);
      void validateInviteCode(pending).then((res) => {
        if (res.valid) {
          setVerifiedInvite({ code: pending, creatorHandle: res.creatorHandle });
        }
      });
    }
  }, [connected]);

  const handleVerifyCode = async () => {
    if (!inviteCodeInput.trim()) {
      setInviteError("Ingresá un código de invitación.");
      return;
    }
    setCheckingInvite(true);
    setInviteError("");
    sfx.tap();
    const res = await validateInviteCode(inviteCodeInput);
    setCheckingInvite(false);
    if (res.valid) {
      setVerifiedInvite({ code: inviteCodeInput.trim().toLowerCase(), creatorHandle: res.creatorHandle });
      setPendingInviteCode(inviteCodeInput.trim().toLowerCase());
      sfx.drop();
    } else {
      setInviteError(res.error || "Código inválido o ya utilizado.");
    }
  };

  const handleOAuthGoogle = async () => {
    if (!connected && !verifiedInvite && !existingUserMode) {
      setInviteError("Ingresá y validá tu código de invitación para registrarte.");
      return;
    }

    setLoading(true);
    setMsg("Conectando con Google...");
    setMsgType("info");
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
        },
      });
      if (data?.url && typeof window !== "undefined") {
        window.location.assign(data.url);
        return;
      }
      if (error) {
        setMsg(`Error de Google: ${error.message}`);
        setMsgType("error");
      }
    } catch (err: any) {
      setMsg(`Fallo de conexión: ${err?.message || err}`);
      setMsgType("error");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAccount = async () => {
    setLoading(true);
    setMsg("");
    const res = await onSaveProfile({ name, handle, email });
    setLoading(false);
    if (res.success) {
      setMsg("¡Perfil y @handle guardados en El tablero. con éxito!");
      setMsgType("success");
      sfx.drop();
    } else {
      setMsg(res.error || "No se pudo guardar el handle.");
      setMsgType("error");
    }
  };

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card narrow"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">
              {connected ? "CUENTA" : "ACCESO EXCLUSIVO"}
            </span>
            <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <GoogleCircleIcon size={22} />
              {connected ? "Sesión iniciada" : "Ingreso a El tablero."}
            </h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        {connected ? (
          <div className="google-session-card">
            <div className="google-session-head">
              <GoogleCircleIcon size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <b style={{ fontSize: "0.92rem", wordBreak: "break-all" }}>{profile.email || email}</b>
                  <span className="google-verified-tag">Verificado ✓</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Factor Auth Gate: Invitación obligatoria para nuevos registros */}
        {!connected && (
          <>
            {verifiedInvite ? (
              <div
                style={{
                  padding: "11px 14px",
                  borderRadius: 12,
                  fontSize: "0.82rem",
                  marginBottom: 16,
                  border: "1px solid rgba(34,197,94,0.35)",
                  background: "rgba(34,197,94,0.08)",
                  color: "#16a34a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <div>
                  <b>✓ Pase VIP de invitación verificado</b>
                  <div style={{ fontSize: "0.74rem", opacity: 0.85, marginTop: 2 }}>
                    Invitado por {verifiedInvite.creatorHandle || "@quetablero"} · Código: {verifiedInvite.code}
                  </div>
                </div>
                <span style={{ fontSize: "1.1rem" }}>🎟️</span>
              </div>
            ) : existingUserMode ? (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  fontSize: "0.82rem",
                  marginBottom: 16,
                  border: "1px solid var(--line)",
                  background: "var(--surface-secondary, rgba(0,0,0,0.02))",
                  color: "var(--ink)",
                }}
              >
                <div style={{ fontWeight: 600 }}>Miembros existentes</div>
                <div style={{ fontSize: "0.74rem", color: "var(--ink-secondary)", marginTop: 2, marginBottom: 8 }}>
                  Si ya tenías cuenta creada en El tablero., ingresá directo con tu cuenta de Google.
                </div>
                <button
                  type="button"
                  onClick={() => setExistingUserMode(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--ink-secondary)",
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  ← ¿Sos nuevo? Ingresar con código de invitación
                </button>
              </div>
            ) : (
              <div className="auth-invite-gate-box">
                <span style={{ fontWeight: 600, color: "var(--ink)" }}>
                  Acceso exclusivo por invitación
                </span>
                <span>
                  El tablero. es una plataforma privada. Para registrarte como artista o productor necesitás un link o código de invitación de un miembro.
                </span>
                <div className="auth-invite-input-row">
                  <input
                    placeholder="Código (ej. board-k9x2m)"
                    value={inviteCodeInput}
                    onChange={(e) => {
                      setInviteCodeInput(e.target.value);
                      setInviteError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyCode();
                    }}
                  />
                  <button
                    type="button"
                    className="apple-btn primary compact"
                    disabled={checkingInvite}
                    onClick={handleVerifyCode}
                  >
                    {checkingInvite ? "..." : "Verificar"}
                  </button>
                </div>
                {inviteError && (
                  <div style={{ color: "#e11d48", fontSize: "0.76rem", marginTop: 2 }}>
                    {inviteError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setExistingUserMode(true);
                    setInviteError("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--ink-secondary)",
                    fontSize: "0.76rem",
                    cursor: "pointer",
                    padding: 0,
                    textAlign: "left",
                    textDecoration: "underline",
                    marginTop: 4,
                  }}
                >
                  ¿Ya tenías cuenta en El tablero.? Iniciar sesión directo
                </button>
              </div>
            )}
          </>
        )}

        {msg && (
          <div
            style={{
              padding: "9px 13px",
              borderRadius: 8,
              fontSize: "0.82rem",
              marginBottom: 14,
              border: "1px solid",
              background: msgType === "error" ? "rgba(225,29,72,0.1)" : msgType === "success" ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.06)",
              color: msgType === "error" ? "#e11d48" : msgType === "success" ? "#16a34a" : "var(--ink)",
              borderColor: msgType === "error" ? "rgba(225,29,72,0.3)" : msgType === "success" ? "rgba(34,197,94,0.3)" : "var(--line)",
            }}
          >
            {msg}
          </div>
        )}

        <div className="modal-form-grid single-col">
          <label className="modal-field">
            <span>NOMBRE DE ARTISTA</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>@HANDLE ÚNICO EN BOARD.</span>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="@tu_handle"
            />
          </label>
        </div>

        <div className="google-auth-actions" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {connected ? (
            <>
              <button
                type="button"
                className="apple-btn primary"
                disabled={loading}
                onClick={handleSaveAccount}
                style={{ justifyContent: "center" }}
              >
                {loading ? "Guardando en servidor..." : "Guardar @handle y nombre"}
              </button>
              <button
                type="button"
                className="apple-btn ghost danger-trash-btn"
                onClick={onSignOut}
                style={{ justifyContent: "center", marginTop: 4 }}
              >
                Cerrar sesión de Google
              </button>
            </>
          ) : (
            <button
              type="button"
              className="google-oauth-btn"
              disabled={loading || (!verifiedInvite && !existingUserMode)}
              onClick={handleOAuthGoogle}
              style={{
                opacity: !verifiedInvite && !existingUserMode ? 0.45 : 1,
                cursor: !verifiedInvite && !existingUserMode ? "not-allowed" : "pointer",
              }}
            >
              <GoogleCircleIcon size={20} />
              <span>
                {loading
                  ? "Conectando..."
                  : !verifiedInvite && !existingUserMode
                  ? "Validá tu invitación para continuar"
                  : "Ingresar con Google"}
              </span>
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ==================== COMPONENTE: MODAL INVITACIÓN AL EP / PROYECTO (ESTILO [untitled]) ==================== */
function InviteProjectModal({
  project,
  isOwner,
  canShareEdit,
  onToggleVisibility,
  onCopiedLink,
  onClose,
}: {
  project: Project;
  isOwner: boolean;
  canShareEdit: boolean;
  onToggleVisibility: (nextVisibility: "private" | "public") => void;
  onCopiedLink: (projectId: string) => void;
  onClose: () => void;
}) {
  const [copiedRole, setCopiedRole] = useState<ProjectInviteRole | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "https://eltablero.blog";
  const listenUrl = `${origin}/project/${project.id}?invite=${makeProjectInviteToken(project.id, "listen")}`;
  const editUrl = `${origin}/project/${project.id}?invite=${makeProjectInviteToken(project.id, "edit")}`;

  const copyInvite = (role: ProjectInviteRole, url: string) => {
    sfx.tick();
    setCopiedRole(role);
    onCopiedLink(project.id);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url).catch(() => {});
    }
    window.setTimeout(() => {
      setCopiedRole((prev) => (prev === role ? null : prev));
    }, 2800);
  };

  return (
    <motion.div
      className="apple-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="apple-modal-card invite-project-modal-card"
        initial={{ scale: 0.94, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.94, y: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="mono-tag">INVITACIÓN PRIVADA // BOARD.</span>
            <h3>Invitación al {project.type}</h3>
          </div>
          <button type="button" className="apple-btn ghost" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="invite-project-summary">
          {project.coverUrl ? (
            <img src={project.coverUrl} alt={project.title} className="invite-project-cover" />
          ) : (
            <div className="invite-project-cover fallback">
              <DiscIcon size={26} />
            </div>
          )}
          <div className="invite-project-meta">
            <b>{project.title}</b>
            <span>
              {project.artist} · {project.tracks.length} {project.tracks.length === 1 ? "track" : "tracks"}
            </span>
          </div>
          <div className={`invite-privacy-badge ${project.visibility === "public" ? "public" : "private"}`}>
            {project.visibility === "public" ? "🌐 Público" : "🔒 Privado"}
          </div>
        </div>

        {isOwner && (
          <div className="invite-visibility-bar">
            <div className="invite-visibility-copy">
              <b>Visibilidad del {project.type}</b>
              <small>
                {project.visibility === "private"
                  ? "Nadie más puede ver este proyecto salvo a quien le pases un link de invitación abajo."
                  : "Visible para todos en el Inicio de El tablero."}
              </small>
            </div>
            <div className="seg-pills">
              <button
                type="button"
                className={project.visibility !== "public" ? "on" : ""}
                onClick={() => onToggleVisibility("private")}
              >
                🔒 Privado
              </button>
              <button
                type="button"
                className={project.visibility === "public" ? "on" : ""}
                onClick={() => onToggleVisibility("public")}
              >
                🌐 Público
              </button>
            </div>
          </div>
        )}

        <div className="invite-links-stack">
          {/* OPCIÓN 1: SOLO ESCUCHAR */}
          <div className="invite-option-card listen">
            <div className="invite-option-top">
              <span className="invite-role-tag listen">SOLO LECTURA · ESCUCHA</span>
              <h4>🎧 Solo escuchar</h4>
              <p>
                Quien abra este link de invitación al {project.type} puede ver y escuchar el proyecto privado,
                descargar los tracks y guardarlo en su biblioteca, pero no puede modificar nada.
              </p>
            </div>
            <div className="invite-url-row">
              <input
                type="text"
                readOnly
                value={listenUrl}
                onClick={(e) => e.currentTarget.select()}
                className="invite-url-input"
              />
              <button
                type="button"
                className={`apple-btn primary invite-copy-btn ${copiedRole === "listen" ? "copied" : ""}`}
                onClick={() => copyInvite("listen", listenUrl)}
              >
                {copiedRole === "listen" ? "✓ Link copiado" : "Copiar link · Solo escuchar"}
              </button>
            </div>
          </div>

          {/* OPCIÓN 2: PERMITIR EDITAR EL PROYECTO */}
          {canShareEdit && (
            <div className="invite-option-card edit">
              <div className="invite-option-top">
                <span className="invite-role-tag edit">COLABORADOR · PERMISO DE EDICIÓN</span>
                <h4>✏️ Permitir editar el proyecto</h4>
                <p>
                  Quien abra este link entra con permisos para editar el {project.type}: puede subir tracks
                  nuevos, editar Key y BPM, cambiar el Artwork o el Canvas y editar la info del proyecto.
                </p>
              </div>
              <div className="invite-url-row">
                <input
                  type="text"
                  readOnly
                  value={editUrl}
                  onClick={(e) => e.currentTarget.select()}
                  className="invite-url-input"
                />
                <button
                  type="button"
                  className={`apple-btn ghost invite-copy-btn edit-btn ${copiedRole === "edit" ? "copied" : ""}`}
                  onClick={() => copyInvite("edit", editUrl)}
                >
                  {copiedRole === "edit" ? "✓ Link de edición copiado" : "Copiar link · Permitir editar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

