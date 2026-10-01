// Chrome fires beforeinstallprompt once, moments after load, and boot.js only reaches its own listener after
// an IndexedDB restore has finished -- long enough to miss it and leave the app with no way to offer the home
// screen at all. A classic script before the modules is the only thing early enough to catch it.
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); window.__installPrompt = e; });
window.addEventListener("appinstalled", () => { window.__installPrompt = null; window.__installed = true; });
