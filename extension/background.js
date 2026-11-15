/* El tablero — extensión: lee tus proyectos de [untitled] con tu sesión y se los pasa a El tablero.
   Todo lo de [untitled] se pide DESDE una pestaña de untitled.stream (como si navegaras vos), así
   Cloudflare no frena nada. Solo proyectos propios o en los que sos colaborador con edición. */
var UT = "https://untitled.stream";

function waitComplete(tabId) {
  return new Promise(function (resolve) {
    chrome.tabs.get(tabId, function (t) {
      if (t && t.status === "complete") return resolve();
      function onUpd(id, info) {
        if (id === tabId && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(onUpd);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(onUpd);
      setTimeout(function () {
        chrome.tabs.onUpdated.removeListener(onUpd);
        resolve();
      }, 30000);
    });
  });
}

/* Usa una pestaña de [untitled] abierta; si no hay, abre una por detrás */
async function untitledTab() {
  var tabs = await chrome.tabs.query({ url: UT + "/*" });
  var tab = tabs.find(function (t) { return t.status === "complete"; }) || tabs[0];
  if (!tab) tab = await chrome.tabs.create({ url: UT + "/library", active: false });
  await waitComplete(tab.id);
  return tab;
}

async function inUntitled(func, args) {
  var tab = await untitledTab();
  var res = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: func, args: args || [] });
  return res && res[0] ? res[0].result : { error: "sin respuesta de [untitled]" };
}

/* ---- funciones que corren ADENTRO de untitled.stream (no pueden usar nada de afuera) ---- */
async function listProjectsInPage() {
  var ctx = window.__remixContext;
  var me = ctx && ctx.state && ctx.state.loaderData && ctx.state.loaderData.root && ctx.state.loaderData.root.authUser;
  if (!me || !me.id) return { error: "login" };
  var routes = (window.__remixManifest && window.__remixManifest.routes) || {};
  var LIB = Object.keys(routes).find(function (k) { return /^routes\/library\._index$/.test(k); }) || "routes/library._index";
  var data = ctx.state.loaderData[LIB];
  if (!data || !data.projects) {
    var r = await fetch("/library?_data=" + encodeURIComponent(LIB), { credentials: "include" });
    if (!r.ok) return { error: "HTTP " + r.status };
    data = await r.json();
  }
  var list = (data.projects || []).map(function (x) { return x.project; }).filter(Boolean).map(function (p) {
    var own = p.owner_auth_id === me.id;
    var collab = !own && (p.editable === true || p.access_role === "editor" || p.access_role === "collaborator");
    return { slug: p.slug, title: p.title, username: p.username, own: own, collab: collab, cover: p.artwork_thumbnail_signed_url || p.artwork_small_signed_url || p.artwork_signed_url || null };
  });
  return { projects: list };
}

async function getProjectInPage(slug, wantWav) {
  var ctx = window.__remixContext;
  var me = ctx && ctx.state && ctx.state.loaderData && ctx.state.loaderData.root && ctx.state.loaderData.root.authUser;
  if (!me || !me.id) return { error: "login" };
  var routes = (window.__remixManifest && window.__remixManifest.routes) || {};
  var PROJ = Object.keys(routes).find(function (k) { return /^routes\/library\.project\.\$[^./]+$/.test(k); }) || "routes/library.project.$projectSlug";
  var r = await fetch("/library/project/" + encodeURIComponent(slug) + "?_data=" + encodeURIComponent(PROJ), { credentials: "include" });
  if (!r.ok) return { error: "HTTP " + r.status };
  var d = await r.json();
  var info = d.project && d.project.project;
  var tracks = (d.project && d.project.tracks) || [];
  if (!info) return { error: "proyecto sin datos" };
  var own = info.owner_auth_id === me.id;
  var collab = !own && (info.editable === true || info.access_role === "editor" || info.access_role === "collaborator");
  if (!own && !collab) return { error: "Ese proyecto es de otra cuenta: que lo importe su dueño." };
  function ref(u) {
    var m = String(u || "").match(/\/storage\/v1\/object\/(?:sign\/|public\/)?([^/]+)\/([^?]+)/);
    return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
  }
  function extOf(u, fb) { var m = String(u || "").split("?")[0].match(/\.([a-z0-9]{2,5})$/i); return m ? m[1].toLowerCase() : fb; }
  async function sign(u) {
    var x = ref(u);
    if (!x) return null;
    try {
      var rr = await fetch("/api/storage/buckets/" + x.bucket + "/objects/" + encodeURIComponent(x.path) + "/signedUrl?durationInSeconds=10800&cacheBufferInSeconds=600", { credentials: "include" });
      if (!rr.ok) return null;
      var j = await rr.json();
      return j && j.url ? j.url : null;
    } catch (e) { return null; }
  }
  var out = [];
  for (var i = 0; i < tracks.length; i++) {
    var t = tracks[i], url = null, ext = "mp3";
    if (wantWav && t.audio_url) { url = await sign(t.audio_url); ext = t.file_type || extOf(t.audio_url, "wav"); }
    if (!url) { var fb = t.audio_fallback_url || t.audio_url; url = await sign(fb); ext = extOf(fb, "mp3"); }
    out.push({ title: t.title, bpm: t.bpm || null, key: t.key || null, durationSec: t.duration || null, uploader: t.username || null, url: url, ext: ext });
  }
  return { title: info.title, cover: info.artwork_signed_url || null, coverExt: extOf(info.artwork_url || info.artwork_signed_url, "jpg"), tracks: out };
}

/* ---- descarga directa (la extensión no tiene problema de CORS con sb.untitled.stream) ---- */
async function fetchFile(url) {
  if (!/^https:\/\/(sb\.)?untitled\.stream\//.test(url)) return { error: "dirección no permitida" };
  var r = await fetch(url);
  if (!r.ok) return { error: "HTTP " + r.status };
  var buf = new Uint8Array(await r.arrayBuffer());
  var bin = "";
  for (var i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return { b64: btoa(bin), type: r.headers.get("content-type") || "" };
}

chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
  /* Solo responde a la página de El tablero (el puente corre únicamente ahí) */
  var from = sender && sender.url ? sender.url : "";
  if (!/^https:\/\/(www\.)?eltablero\.blog\//.test(from)) {
    reply({ error: "origen no permitido" });
    return false;
  }
  var p = msg.payload || {};
  var job =
    msg.type === "untitled:list" ? inUntitled(listProjectsInPage) :
    msg.type === "untitled:project" ? inUntitled(getProjectInPage, [String(p.slug || ""), !!p.wav]) :
    msg.type === "untitled:file" ? fetchFile(String(p.url || "")) :
    Promise.resolve({ error: "pedido desconocido" });
  job.then(reply, function (e) { reply({ error: String((e && e.message) || e) }); });
  return true; /* respuesta asíncrona */
});

/* Tocar el ícono de la extensión abre El tablero con el importador */
chrome.action.onClicked.addListener(function () {
  chrome.tabs.create({ url: "https://www.eltablero.blog/?import=untitled" });
});
