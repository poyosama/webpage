/* El tablero. — "Llevar a El tablero" desde [untitled].
   Corre en untitled.stream con TU sesión (como si navegaras vos): lee tus proyectos, baja cada
   canción y la portada, y se las pasa a El tablero (en otra pestaña) para que las importes.
   No guarda ni manda tu contraseña ni tu sesión a ningún lado. */
(function () {
  if (window.__etImport) { window.__etImport.show(); return; }
  var TARGET = window.__ET_TARGET || "https://www.eltablero.blog";
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

  /* Remix pide los datos con ?_data=<id de la ruta>: los ids salen del manifiesto de la propia página */
  function routeId(re, fallback) {
    var m = window.__remixManifest && window.__remixManifest.routes;
    if (m) for (var k in m) if (re.test(k)) return k;
    return fallback;
  }
  var LIB_ROUTE = routeId(/^routes\/library\._index$/, "routes/library._index");
  var PROJ_ROUTE = routeId(/^routes\/library\.project\.\$[^./]+$/, "routes/library.project.$projectSlug");
  function libraryData() {
    var ld = ctx.state && ctx.state.loaderData && ctx.state.loaderData[LIB_ROUTE];
    if (ld && ld.projects && ld.projects.length) return Promise.resolve(ld);
    return getJson("/library?_data=" + encodeURIComponent(LIB_ROUTE));
  }

  /* ---------- cartel ---------- */
  var box = document.createElement("div");
  box.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:16px;width:380px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);display:flex;flex-direction:column;background:#0b0b0e;color:#fff;font:13px/1.45 -apple-system,system-ui,sans-serif;border:1px solid rgba(255,255,255,.18);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px");
  box.innerHTML =
    '<div style="font:600 11px ui-monospace,monospace;letter-spacing:.12em;opacity:.6;margin-bottom:6px">EL TABLERO · IMPORTAR DESDE [UNTITLED]</div>' +
    '<div data-msg style="margin-bottom:10px">Leyendo tus proyectos…</div>' +
    '<div data-list style="overflow-y:auto;overflow-x:hidden;flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin-bottom:10px"></div>' +
    '<label data-wavrow style="display:none;gap:8px;align-items:flex-start;margin-bottom:10px;opacity:.9"><input data-wav type="checkbox" style="margin-top:3px"> <span>Traer también los <b>WAV originales</b> (tarda mucho más; si no, se traen en MP3, que alcanza para escuchar)</span></label>' +
    '<div style="display:flex;gap:8px"><button data-go disabled style="flex:1;border:0;border-radius:999px;padding:10px 12px;background:#fff;color:#000;font-weight:800;cursor:pointer;opacity:.5">Bajar para El tablero</button>' +
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
  libraryData().then(function (data) {
    projects = (data.projects || []).map(function (x) { return x.project; }).filter(Boolean);
    var mine = 0;
    var html = projects.map(function (p, i) {
      var own = p.owner_auth_id === myId;
      /* Solo tus proyectos o en los que sos colaborador con permiso de edición; los de otras cuentas no */
      var collab = !own && (p.editable === true || p.access_role === "editor" || p.access_role === "collaborator");
      var can = own || collab;
      if (own) mine++;
      return '<label style="display:flex;min-width:0;gap:8px;align-items:center;padding:6px 8px;border-radius:10px;background:#16161b;' + (can ? "" : "opacity:.45;") + '">' +
        '<input type="checkbox" data-i="' + i + '" ' + (can ? "checked" : "disabled") + '>' +
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.title) + "</span>" +
        '<span style="opacity:.55;font-size:11px;flex:none">' + (own ? "tuyo" : collab ? "colaborás · @" + esc(p.username) : "de @" + esc(p.username)) + "</span></label>";
    }).join("");
    $("[data-list]").innerHTML = html || '<div style="opacity:.7">No encontré proyectos. Abrí <b>untitled.stream/library</b> (tu biblioteca), recargá la página y tocá el favorito de nuevo.</div>';
    msg("Elegí qué proyectos llevar (" + mine + " tuyos). Los de otras cuentas no se traen (salvo que seas colaborador): que los importe su dueño.");
    $("[data-wavrow]").style.display = "flex";
    var go = $("[data-go]");
    go.disabled = false; go.style.opacity = "1";
    go.onclick = start;
  }).catch(function (e) {
    msg("No pude leer tu biblioteca de [untitled] (" + esc(e.message) + "). Recargá la página y probá de nuevo.");
  });

  /* ---------- 2. armar .zip (sin comprimir: los audios ya vienen comprimidos) y descargarlo ----------
     [untitled] corta la comunicación con otras pestañas (Cross-Origin-Opener-Policy), así que el camino
     seguro es una descarga: después se suelta el .zip en El tablero → Importar carpetas o .zip */
  var CRC_T = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xffffffff; for (var i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function ZipBuilder() { this.parts = []; this.central = []; this.offset = 0; this.count = 0; }
  ZipBuilder.prototype.add = function (name, u8) {
    var nameB = new TextEncoder().encode(name), crc = crc32(u8), d = new Date();
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, u8.length, true); lh.setUint32(22, u8.length, true); lh.setUint16(26, nameB.length, true); lh.setUint16(28, 0, true);
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, u8.length, true); ch.setUint32(24, u8.length, true);
    ch.setUint16(28, nameB.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true); ch.setUint32(42, this.offset, true);
    this.parts.push(new Uint8Array(lh.buffer), nameB, u8);
    this.central.push(new Uint8Array(ch.buffer), nameB);
    this.offset += 30 + nameB.length + u8.length; this.count++;
  };
  ZipBuilder.prototype.blob = function () {
    var cdSize = 0; this.central.forEach(function (c) { cdSize += c.length; });
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, this.count, true); end.setUint16(10, this.count, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, this.offset, true);
    return new Blob(this.parts.concat(this.central, [new Uint8Array(end.buffer)]), { type: "application/zip" });
  };
  function saveBlob(blob, name) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }
  function folderName(s) { return safe(s).replace(/\.+$/, "") || "proyecto"; }

  var ZIP_LIMIT = 380 * 1024 * 1024; /* partir en varios .zip para no llenar la memoria */
  function start() {
    var picked = [].slice.call(box.querySelectorAll("[data-i]:checked")).map(function (c) { return projects[+c.getAttribute("data-i")]; });
    if (!picked.length) { msg("Elegí al menos un proyecto."); return; }
    var wantWav = $("[data-wav]").checked;
    $("[data-go]").disabled = true; $("[data-go]").style.opacity = ".5";
    [].slice.call(box.querySelectorAll("[data-i]")).forEach(function (c) { c.disabled = true; });
    var okTracks = 0, failTracks = 0, zipN = 0, zip = new ZipBuilder(), zipBytes = 0, zipNames = [];
    function flush(force) {
      if (!zip.count || (!force && zipBytes < ZIP_LIMIT)) return;
      zipN++;
      var name = "eltablero-untitled-" + zipN + ".zip";
      saveBlob(zip.blob(), name); zipNames.push(name);
      zip = new ZipBuilder(); zipBytes = 0;
    }
    var used = {};
    var chain = Promise.resolve();
    picked.forEach(function (p, pi) {
      chain = chain.then(function () {
        msg("Proyecto " + (pi + 1) + "/" + picked.length + ": <b>" + esc(p.title) + "</b> — leyendo tracks…");
        return getJson("/library/project/" + encodeURIComponent(p.slug) + "?_data=" + encodeURIComponent(PROJ_ROUTE)).then(function (d) {
          var info = (d.project && d.project.project) || p;
          var tracks = (d.project && d.project.tracks) || [];
          var dir = folderName(info.title), n = 2;
          while (used[dir]) dir = folderName(info.title) + " (" + n++ + ")";
          used[dir] = 1;
          var manifest = { source: "untitled", title: info.title, cover: null, tracks: [] };
          var files = [];
          var cv = info.artwork_signed_url || p.artwork_signed_url;
          var tchain = cv ? download(cv, "cover").then(function (f) {
            return f.arrayBuffer().then(function (b) {
              var nm = "cover." + extOf(info.artwork_url || cv, "jpg");
              files.push([dir + "/" + nm, new Uint8Array(b)]); manifest.cover = nm;
            });
          }).catch(function () {}) : Promise.resolve();
          tracks.forEach(function (t, ti) {
            tchain = tchain.then(function () {
              var label = "Proyecto " + (pi + 1) + "/" + picked.length + ": <b>" + esc(info.title) + "</b><br>Track " + (ti + 1) + "/" + tracks.length + ": " + esc(t.title);
              msg(label);
              var useWav = wantWav && t.audio_url;
              var src = useWav ? t.audio_url : t.audio_fallback_url || t.audio_url;
              var getLink = signedUrl(src).catch(function () { return useWav && t.audio_fallback_url ? signedUrl(t.audio_fallback_url) : Promise.reject(new Error("sin acceso")); });
              return getLink.then(function (link) {
                return download(link, "a", function (pct) { msg(label + " — " + Math.round(pct * 100) + "%"); }).then(function (file) {
                  return file.arrayBuffer().then(function (b) {
                    var ext = extOf(link, useWav ? (t.file_type || "wav") : "mp3");
                    var nm = String(ti + 1).padStart(2, "0") + " - " + safe(t.title) + "." + ext;
                    files.push([dir + "/" + nm, new Uint8Array(b)]);
                    manifest.tracks.push({ file: nm, title: t.title, bpm: t.bpm || null, key: keyLabel(t.key), durationSec: t.duration || null, uploader: t.username || null });
                    okTracks++;
                  });
                });
              }).catch(function () { failTracks++; });
            });
          });
          return tchain.then(function () {
            if (!manifest.tracks.length) return;
            files.push([dir + "/el-tablero.json", new TextEncoder().encode(JSON.stringify(manifest, null, 1))]);
            var size = 0; files.forEach(function (f) { size += f[1].length; });
            if (zipBytes && zipBytes + size > ZIP_LIMIT) flush(true);
            files.forEach(function (f) { zip.add(f[0], f[1]); });
            zipBytes += size;
            flush(false);
          });
        });
      }).catch(function (e) { failTracks++; console.warn("[El tablero] proyecto con error", p.title, e); });
    });
    chain.then(function () {
      flush(true);
      if (!zipNames.length) { msg("No se pudo bajar ningún track. Recargá [untitled] y probá de nuevo."); return; }
      msg("✓ Listo: " + okTracks + " tracks" + (failTracks ? " (" + failTracks + " no se pudieron bajar)" : "") +
        ". Se descargó <b>" + zipNames.join(", ") + "</b>.<br><br>Ahora: abrí El tablero → tu perfil → <b>+</b> → <b>Importar carpetas o .zip</b> y elegí " +
        (zipNames.length > 1 ? "esos archivos" : "ese archivo") + ". Si el navegador pregunta si permitir varias descargas, poné que sí.");
      var a = document.createElement("a"); a.href = TARGET + "/profile"; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Abrir El tablero →";
      a.setAttribute("style", "display:inline-block;margin-top:8px;color:#fff;font-weight:700");
      $("[data-msg]").appendChild(document.createElement("br")); $("[data-msg]").appendChild(a);
    });
  }
})();
