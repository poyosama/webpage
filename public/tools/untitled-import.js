/* El tablero. — "Llevar a El tablero" desde [untitled].
   Corre en untitled.stream con TU sesión (como si navegaras vos): lee tus proyectos, baja cada
   canción y la portada, y se las pasa a El tablero (en otra pestaña) para que las importes.
   No guarda ni manda tu contraseña ni tu sesión a ningún lado. */
(function () {
  if (window.__etImport) { window.__etImport.show(); return; }
  var TARGET = window.__ET_TARGET || "https://eltablero.blog";
  var ctx = window.__remixContext;
  var me = ctx && ctx.state && ctx.state.loaderData && ctx.state.loaderData.root && ctx.state.loaderData.root.authUser;
  if (!/untitled\.stream$/.test(location.hostname) && !window.__ET_TARGET) {
    alert("Abrí untitled.stream (logueado) y tocá este favorito ahí.");
    return;
  }
  if (!me || !me.id) {
    alert("Iniciá sesión en [untitled] y volvé a tocar el favorito.");
    return;
  }
  var myId = me.id;

  /* ---------- cartel ---------- */
  var box = document.createElement("div");
  box.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:16px;width:380px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:#0b0b0e;color:#fff;font:13px/1.45 -apple-system,system-ui,sans-serif;border:1px solid rgba(255,255,255,.18);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px");
  box.innerHTML =
    '<div style="font:600 11px ui-monospace,monospace;letter-spacing:.12em;opacity:.6;margin-bottom:6px">EL TABLERO · IMPORTAR DESDE [UNTITLED]</div>' +
    '<div data-msg style="margin-bottom:10px">Leyendo tus proyectos…</div>' +
    '<div data-list style="overflow:auto;flex:1 1 auto;min-height:0;display:grid;gap:4px;margin-bottom:10px"></div>' +
    '<label data-wavrow style="display:none;gap:8px;align-items:flex-start;margin-bottom:10px;opacity:.9"><input data-wav type="checkbox" style="margin-top:3px"> <span>Traer también los <b>WAV originales</b> (tarda mucho más; si no, se traen en MP3, que alcanza para escuchar)</span></label>' +
    '<div style="display:flex;gap:8px"><button data-go disabled style="flex:1;border:0;border-radius:999px;padding:10px 12px;background:#fff;color:#000;font-weight:800;cursor:pointer;opacity:.5">Llevar a El tablero</button>' +
    '<button data-x style="border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:10px 12px;background:transparent;color:#fff;cursor:pointer">Cerrar</button></div>';
  document.body.appendChild(box);
  var $ = function (s) { return box.querySelector(s); };
  var msg = function (t) { $("[data-msg]").innerHTML = t; };
  $("[data-x]").onclick = function () { box.style.display = "none"; };
  window.__etImport = { show: function () { box.style.display = "flex"; } };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function getJson(path) {
    return fetch(path, { credentials: "include", headers: { accept: "application/json" } }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status + " en " + path.split("?")[0]);
      return r.json();
    });
  }
  /* "https://sb.untitled.stream/storage/v1/object/private-audio/<uuid>/<file>.wav" → {bucket, path} */
  function storageRef(url) {
    var m = String(url || "").match(/\/storage\/v1\/object\/(?:sign\/|public\/)?([^/]+)\/([^?]+)/);
    return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null;
  }
  function signedUrl(url) {
    var ref = storageRef(url);
    if (!ref) return Promise.reject(new Error("sin ruta"));
    return getJson("/api/storage/buckets/" + ref.bucket + "/objects/" + encodeURIComponent(ref.path) + "/signedUrl?durationInSeconds=10800&cacheBufferInSeconds=600").then(function (j) {
      if (!j || !j.url) throw new Error("sin link");
      return j.url;
    });
  }
  function download(url, name, onPct) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      var total = +r.headers.get("content-length") || 0;
      var type = r.headers.get("content-type") || "";
      if (!r.body || !r.body.getReader || !total) return r.blob().then(function (b) { return new File([b], name, { type: b.type || type }); });
      var reader = r.body.getReader(), chunks = [], got = 0;
      function pump() {
        return reader.read().then(function (res) {
          if (res.done) return new File(chunks, name, { type: type });
          chunks.push(res.value); got += res.value.length;
          if (onPct) onPct(got / total);
          return pump();
        });
      }
      return pump();
    });
  }
  var NOTE_FIX = { "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#" };
  function keyLabel(k) {
    if (!k || !k.base_note) return "";
    var n = NOTE_FIX[k.base_note] || k.base_note;
    return n + (/min/i.test(k.mode || "") ? "m" : "");
  }
  function extOf(url, fallback) { var m = String(url || "").split("?")[0].match(/\.([a-z0-9]{2,5})$/i); return m ? m[1].toLowerCase() : fallback; }
  function safe(s) { return String(s || "track").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) || "track"; }

  /* ---------- 1. lista de proyectos ---------- */
  var projects = [];
  getJson("/library?_data").then(function (data) {
    projects = (data.projects || []).map(function (x) { return x.project; }).filter(Boolean);
    var mine = 0;
    var html = projects.map(function (p, i) {
      var own = p.owner_auth_id === myId;
      /* Solo tus proyectos o en los que sos colaborador con permiso de edición; los de otras cuentas no */
      var collab = !own && (p.editable === true || p.access_role === "editor" || p.access_role === "collaborator");
      var can = own || collab;
      if (own) mine++;
      return '<label style="display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:10px;background:#16161b;' + (can ? "" : "opacity:.45;") + '">' +
        '<input type="checkbox" data-i="' + i + '" ' + (can ? "checked" : "disabled") + '>' +
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.title) + "</span>" +
        '<span style="opacity:.55;font-size:11px">' + (own ? "tuyo" : collab ? "colaborás · @" + esc(p.username) : "de @" + esc(p.username)) + "</span></label>";
    }).join("");
    $("[data-list]").innerHTML = html || '<div style="opacity:.7">No encontré proyectos.</div>';
    msg("Elegí qué proyectos llevar (" + mine + " tuyos). Los de otras cuentas no se traen (salvo que seas colaborador): que los importe su dueño.");
    $("[data-wavrow]").style.display = "flex";
    var go = $("[data-go]");
    go.disabled = false; go.style.opacity = "1";
    go.onclick = start;
  }).catch(function (e) {
    msg("No pude leer tu biblioteca de [untitled] (" + esc(e.message) + "). Recargá la página y probá de nuevo.");
  });

  /* ---------- 2. abrir El tablero y mandar proyecto por proyecto ---------- */
  var win = null, ready = false, waitingAck = null;
  window.addEventListener("message", function (ev) {
    if (ev.origin !== TARGET || !ev.data || typeof ev.data !== "object") return;
    if (ev.data.type === "et-ready") ready = true;
    if (ev.data.type === "et-ack" && waitingAck) { var w = waitingAck; waitingAck = null; w(); }
  });
  function waitReady(timeoutMs) {
    return new Promise(function (resolve, reject) {
      var t0 = Date.now();
      (function tick() {
        if (ready) return resolve();
        if (win && win.closed) return reject(new Error("cerraste la pestaña de El tablero"));
        if (Date.now() - t0 > timeoutMs) return reject(new Error("El tablero no respondió (¿iniciaste sesión ahí?)"));
        setTimeout(tick, 400);
      })();
    });
  }
  function send(payload) {
    return new Promise(function (resolve) {
      waitingAck = resolve;
      win.postMessage(payload, TARGET);
    });
  }

  function start() {
    var picked = [].slice.call(box.querySelectorAll("[data-i]:checked")).map(function (c) { return projects[+c.getAttribute("data-i")]; });
    if (!picked.length) { msg("Elegí al menos un proyecto."); return; }
    var wantWav = $("[data-wav]").checked;
    $("[data-go]").disabled = true; $("[data-go]").style.opacity = ".5";
    [].slice.call(box.querySelectorAll("[data-i]")).forEach(function (c) { c.disabled = true; });
    win = window.open(TARGET + "/?import=untitled", "eltablero-import");
    if (!win) { msg("El navegador bloqueó la ventana nueva: permití ventanas emergentes para untitled.stream y tocá de nuevo."); $("[data-go]").disabled = false; $("[data-go]").style.opacity = "1"; return; }
    msg("Abriendo El tablero… (si te pide iniciar sesión, iniciala ahí)");
    var okTracks = 0, failTracks = 0;
    waitReady(180000).then(function () {
      var chain = Promise.resolve();
      picked.forEach(function (p, pi) {
        chain = chain.then(function () {
          msg("Proyecto " + (pi + 1) + "/" + picked.length + ": <b>" + esc(p.title) + "</b> — leyendo tracks…");
          return getJson("/library/project/" + encodeURIComponent(p.slug) + "?_data").then(function (d) {
            var info = (d.project && d.project.project) || p;
            var tracks = (d.project && d.project.tracks) || [];
            var cover = null, files = [];
            var cv = info.artwork_signed_url || p.artwork_signed_url;
            var coverJob = cv ? download(cv, "cover." + extOf(info.artwork_url || cv, "jpg")).then(function (f) { cover = f; }).catch(function () {}) : Promise.resolve();
            var tchain = coverJob;
            tracks.forEach(function (t, ti) {
              tchain = tchain.then(function () {
                var label = "Proyecto " + (pi + 1) + "/" + picked.length + ": <b>" + esc(info.title) + "</b><br>Track " + (ti + 1) + "/" + tracks.length + ": " + esc(t.title);
                msg(label);
                var useWav = wantWav && t.audio_url;
                var src = useWav ? t.audio_url : t.audio_fallback_url || t.audio_url;
                var getLink = signedUrl(src).catch(function () { return useWav && t.audio_fallback_url ? signedUrl(t.audio_fallback_url) : Promise.reject(new Error("sin acceso")); });
                return getLink.then(function (link) {
                  var ext = extOf(link, useWav ? (t.file_type || "wav") : "mp3");
                  return download(link, safe(t.title) + "." + ext, function (pct) { msg(label + " — " + Math.round(pct * 100) + "%"); });
                }).then(function (file) {
                  okTracks++;
                  files.push({
                    file: file,
                    title: t.title,
                    bpm: t.bpm || null,
                    key: keyLabel(t.key),
                    durationSec: t.duration || null,
                    uploader: t.username || null
                  });
                }).catch(function () { failTracks++; });
              });
            });
            return tchain.then(function () {
              if (!files.length) return;
              return send({ type: "et-project", source: "untitled", project: { title: info.title, cover: cover, tracks: files } });
            });
          });
        }).catch(function (e) { failTracks++; console.warn("[El tablero] proyecto con error", p.title, e); });
      });
      return chain.then(function () {
        win.postMessage({ type: "et-done" }, TARGET);
        msg("✓ Listo: " + okTracks + " tracks enviados" + (failTracks ? " (" + failTracks + " no se pudieron bajar)" : "") + ". Seguí en la pestaña de El tablero y tocá <b>Importar</b>.");
        try { win.focus(); } catch (e) {}
      });
    }).catch(function (e) {
      msg("Se cortó: " + esc(e.message) + ". Tocá el favorito de nuevo para reintentar.");
    });
  }
})();
