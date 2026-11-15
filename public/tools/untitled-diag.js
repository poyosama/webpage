/* El tablero. — Diagnóstico de [untitled] (solo lectura).
   Corre en la página de [untitled] que tenés abierta, con tu sesión. NO manda nada a ningún lado:
   arma un resumen de CÓMO están organizados los datos (nombres de campos, direcciones de la API,
   tipos de archivo) y lo copia para que lo pegues en el chat. No copia contraseñas, tokens,
   mails ni archivos: los textos se recortan y lo que parece un token se tapa. */
(function () {
  if (window.__etDiag) { window.__etDiag.show(); return; }
  var started = Date.now();
  var calls = [];
  var MAX_CALLS = 60;

  function redact(s) {
    if (typeof s !== "string") return s;
    if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+/.test(s)) return "[jwt]";
    if (/@[^\s]+\.[a-z]{2,}/i.test(s)) return "[mail]";
    if (s.length > 40 && /^[A-Za-z0-9+/=_-]+$/.test(s)) return "[token " + s.length + "]";
    return s;
  }
  function cleanUrl(u) {
    try {
      var x = new URL(u, location.href);
      var params = [];
      x.searchParams.forEach(function (_, k) { params.push(k); });
      return x.origin + x.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid").replace(/\/\d{3,}(?=\/|$)/g, "/:num") + (params.length ? "?" + params.join("&") : "");
    } catch (e) { return String(u).slice(0, 120); }
  }
  /* Forma de un JSON: claves y tipos, con ejemplos cortos (para saber dónde están título, audio, etc.) */
  function shape(v, depth) {
    depth = depth || 0;
    if (v === null) return null;
    if (Array.isArray(v)) return v.length ? ["(" + v.length + " items)", shape(v[0], depth + 1)] : [];
    if (typeof v === "object") {
      if (depth > 5) return "{…}";
      var o = {}, keys = Object.keys(v).slice(0, 40);
      for (var i = 0; i < keys.length; i++) o[keys[i]] = shape(v[keys[i]], depth + 1);
      return o;
    }
    if (typeof v === "string") {
      var r = redact(v);
      if (r !== v) return r;
      if (/^https?:\/\//.test(v)) return "url:" + cleanUrl(v);
      return "str:" + v.slice(0, 24) + (v.length > 24 ? "…" : "");
    }
    return typeof v + ":" + String(v).slice(0, 12);
  }
  function bodyInfo(b) {
    if (!b || typeof b !== "string") return b ? "[" + (b.constructor && b.constructor.name) + "]" : undefined;
    try {
      var j = JSON.parse(b);
      if (j && j.query) return { graphql: String(j.query).replace(/\s+/g, " ").slice(0, 400), operationName: j.operationName, variables: shape(j.variables) };
      return shape(j);
    } catch (e) { return "texto(" + b.length + ")"; }
  }
  function record(entry, text, ctype) {
    if (calls.length >= MAX_CALLS) return;
    if (ctype && /json|graphql/i.test(ctype) && text) {
      try { entry.response = shape(JSON.parse(text)); } catch (e) { entry.response = "json inválido"; }
    } else {
      entry.response = ctype ? "[" + ctype.split(";")[0] + "]" : undefined;
    }
    calls.push(entry);
    ui.count();
  }

  /* Escuchar lo que la página pide a su servidor mientras usás la app */
  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = (init && init.method) || (input && input.method) || "GET";
    var hdrs = {};
    try { var h = new Headers((init && init.headers) || (input && input.headers) || {}); h.forEach(function (_, k) { hdrs[k] = "✓"; }); } catch (e) {}
    var entry = { via: "fetch", method: method, url: cleanUrl(url), requestHeaders: Object.keys(hdrs), request: bodyInfo(init && init.body), t: Date.now() - started };
    return origFetch.apply(this, arguments).then(function (res) {
      try {
        entry.status = res.status;
        var ct = res.headers.get("content-type") || "";
        if (/json|graphql/i.test(ct)) res.clone().text().then(function (t) { record(entry, t, ct); });
        else record(entry, "", ct);
      } catch (e) {}
      return res;
    });
  };
  var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__et = { via: "xhr", method: m, url: cleanUrl(u), t: Date.now() - started }; return XO.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function (b) {
    var x = this, e = x.__et;
    if (e) {
      e.request = bodyInfo(b);
      x.addEventListener("loadend", function () {
        e.status = x.status;
        var ct = x.getResponseHeader("content-type") || "";
        var txt = "";
        try { txt = x.responseType === "" || x.responseType === "text" ? x.responseText : ""; } catch (er) {}
        record(e, txt, ct);
      });
    }
    return XS.apply(this, arguments);
  };

  function snapshot() {
    var g = window;
    var globals = {};
    ["__NEXT_DATA__", "__NUXT__", "__remixContext", "__APOLLO_STATE__", "__INITIAL_STATE__", "__PRELOADED_STATE__", "__sveltekit_data", "__staticRouterHydrationData"].forEach(function (k) {
      if (g[k]) globals[k] = shape(g[k]);
    });
    var nd = document.getElementById("__NEXT_DATA__");
    if (nd && !globals.__NEXT_DATA__) { try { globals.__NEXT_DATA__ = shape(JSON.parse(nd.textContent)); } catch (e) {} }
    var media = [].slice.call(document.querySelectorAll("audio,video,source")).map(function (m) { return { tag: m.tagName.toLowerCase(), src: m.currentSrc || m.src ? cleanUrl(m.currentSrc || m.src) : "", preload: m.preload }; });
    var res = performance.getEntriesByType("resource").map(function (r) { return r.initiatorType + " " + cleanUrl(r.name); });
    var uniq = {}; res.forEach(function (r) { uniq[r] = (uniq[r] || 0) + 1; });
    var testids = {}; [].slice.call(document.querySelectorAll("[data-testid]")).slice(0, 200).forEach(function (el) { testids[el.getAttribute("data-testid")] = 1; });
    var main = document.querySelector("main") || document.body;
    return {
      herramienta: "El tablero · diagnóstico untitled v1",
      pagina: cleanUrl(location.href),
      titulo: document.title.slice(0, 80),
      navegador: navigator.userAgent.slice(0, 120),
      frameworks: { react: !!document.querySelector("[data-reactroot],#__next,#root"), next: !!g.next || !!nd, globals: Object.keys(globals) },
      datosEnLaPagina: globals,
      localStorageKeys: (function () { try { return Object.keys(localStorage).slice(0, 60); } catch (e) { return "bloqueado"; } })(),
      sessionStorageKeys: (function () { try { return Object.keys(sessionStorage).slice(0, 60); } catch (e) { return "bloqueado"; } })(),
      cookieNames: document.cookie.split(";").map(function (c) { return c.split("=")[0].trim(); }).filter(Boolean),
      audioEnPantalla: media,
      dataTestIds: Object.keys(testids).slice(0, 80),
      textoVisible: (main.innerText || "").replace(/\s+\n/g, "\n").split("\n").filter(Boolean).slice(0, 40).map(function (l) { return redact(l.slice(0, 60)); }),
      recursosCargados: Object.keys(uniq).slice(0, 120),
      llamadasGrabadas: calls
    };
  }

  /* Cartelito flotante */
  var box = document.createElement("div");
  box.setAttribute("style", "position:fixed;z-index:2147483647;right:16px;bottom:16px;width:320px;max-width:calc(100vw - 32px);background:#0b0b0e;color:#fff;font:13px/1.45 -apple-system,system-ui,sans-serif;border:1px solid rgba(255,255,255,.18);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.5);padding:14px");
  box.innerHTML =
    '<div style="font:600 11px ui-monospace,monospace;letter-spacing:.12em;opacity:.6;margin-bottom:6px">EL TABLERO · DIAGNÓSTICO</div>' +
    '<div style="margin-bottom:10px">Grabando cómo carga [untitled]. Ahora: <b>tocá play en un track</b>, abrí <b>otro proyecto</b> y volvé a tu biblioteca. Después tocá <b>Listo</b>.</div>' +
    '<div data-c style="opacity:.7;margin-bottom:10px">0 llamadas grabadas</div>' +
    '<div style="display:flex;gap:8px"><button data-ok style="flex:1;border:0;border-radius:999px;padding:9px 12px;background:#fff;color:#000;font-weight:700;cursor:pointer">Listo, copiar</button>' +
    '<button data-x style="border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:9px 12px;background:transparent;color:#fff;cursor:pointer">Cerrar</button></div>' +
    '<textarea data-t readonly style="display:none;width:100%;height:120px;margin-top:10px;border-radius:10px;background:#16161b;color:#ddd;border:1px solid rgba(255,255,255,.15);font:11px ui-monospace,monospace;padding:8px"></textarea>' +
    '<div data-m style="margin-top:8px;opacity:.8"></div>';
  document.body.appendChild(box);
  var ui = {
    count: function () { var c = box.querySelector("[data-c]"); if (c) c.textContent = calls.length + " llamadas grabadas"; },
    show: function () { box.style.display = "block"; }
  };
  box.querySelector("[data-x]").onclick = function () { box.style.display = "none"; };
  box.querySelector("[data-ok]").onclick = function () {
    var out = JSON.stringify(snapshot(), null, 1);
    var ta = box.querySelector("[data-t]");
    var msg = box.querySelector("[data-m]");
    ta.style.display = "block"; ta.value = out;
    function done(ok) { msg.textContent = ok ? "✓ Copiado. Pegalo en el chat con Claude." : "Seleccioná todo el texto de arriba, copialo y pegalo en el chat."; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(out).then(function () { done(true); }, function () { ta.select(); try { done(document.execCommand("copy")); } catch (e) { done(false); } });
    else { ta.select(); try { done(document.execCommand("copy")); } catch (e) { done(false); } }
  };
  window.__etDiag = ui;
})();
