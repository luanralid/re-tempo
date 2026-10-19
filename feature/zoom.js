/*
 * RE-TEMPO · zoom (user MOD layer)
 * ---------------------------------------------------------------------------
 * Toast for the app's NATIVE zoom (View > Zoom In / Zoom Out / Actual Size):
 * whenever the native zoom factor changes, a small toast in the bottom-right
 * corner shows the new level ("120%") for ~1 s.
 *
 * The zoom itself is Electron's, not this file's:
 *   - View > Zoom In ships bound to Cmd+Shift+= only; tools/enable-zoom-
 *     shortcut.sh remaps it to Cmd+= (macOS NSUserKeyEquivalents), as in
 *     VS Code / Orca. Cmd+- and Cmd+0 work out of the box.
 *   - Electron scales everything (webviews, canvas, terminal) and persists
 *     the level per page URL (Preferences > partition.per_host_zoom_levels),
 *     so nothing is stored here.
 *   - Who keeps the keys: a handler that prevents the keydown (the design
 *     canvas zoom, element font size) keeps them and the menu does not fire.
 *     With focus inside a <webview>, the menu zooms that guest page.
 *
 * Detection: a native zoom change resizes the CSS viewport, so on "resize"
 * the factor is read from the preload (canvasApi.getHostZoomFactor).
 * Introspection: window.__RE_TEMPO_ZOOM__ (get, dispose).
 * ---------------------------------------------------------------------------
 */
(() => {
  "use strict";

  if (window.__RE_TEMPO_ZOOM__?.dispose) window.__RE_TEMPO_ZOOM__.dispose(); // double injection

  // Left by the first version of this mod (CSS zoom); the native zoom
  // persists by itself.
  const LEGACY_KEY = "re-tempo:zoom";
  const TOAST_MS = 1000;

  const hostZoom = () => {
    const z = window.canvasApi?.getHostZoomFactor?.();
    return typeof z === "number" && Number.isFinite(z) && z > 0 ? z : 1;
  };

  let last = hostZoom();
  let toastEl = null;
  let toastTimer = 0;

  function showToast(z) {
    if (!document.body) return;
    if (!toastEl || !toastEl.isConnected) {
      toastEl = document.createElement("div");
      toastEl.className = "rtz-toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = `${Math.round(z * 100)}%`;
    toastEl.style.zoom = String(1 / z); // same on-screen size at any level
    toastEl.setAttribute("data-show", "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl?.removeAttribute("data-show"), TOAST_MS);
  }

  function onResize() {
    const z = hostZoom();
    if (Math.abs(z - last) < 0.001) return; // a plain window resize
    last = z;
    showToast(z);
  }

  window.addEventListener("resize", onResize);
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch (_) {
    /* storage unavailable: nothing to clean */
  }

  window.__RE_TEMPO_ZOOM__ = {
    get: hostZoom,
    dispose() {
      window.removeEventListener("resize", onResize);
      clearTimeout(toastTimer);
      toastEl?.remove();
      delete window.__RE_TEMPO_ZOOM__;
    },
  };
})();
