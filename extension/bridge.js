/* El tablero — puente entre la página de El tablero y la extensión.
   Solo corre en eltablero.blog. La página pide cosas con window.postMessage({ source: "et-page", ... })
   y este script se las pasa a la extensión y devuelve la respuesta. */
(function () {
  var VERSION = chrome.runtime.getManifest().version;
  function hello() {
    window.postMessage({ source: "et-ext", type: "hello", version: VERSION }, location.origin);
  }
  hello();
  document.addEventListener("DOMContentLoaded", hello);

  window.addEventListener("message", function (ev) {
    if (ev.source !== window || !ev.data || ev.data.source !== "et-page") return;
    var id = ev.data.id;
    var type = ev.data.type;
    if (type === "ping") {
      hello();
      return;
    }
    chrome.runtime.sendMessage({ type: type, payload: ev.data.payload }, function (res) {
      var err = chrome.runtime.lastError;
      window.postMessage(
        {
          source: "et-ext",
          type: "reply",
          id: id,
          ok: !err && !!res && !res.error,
          data: res,
          error: err ? err.message : res && res.error
        },
        location.origin
      );
    });
  });
})();
