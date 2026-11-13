// The iOS app is this same web app inside a Capacitor shell (app/native). This is the one place that knows: the
// rest of the app asks here, and in a browser or the Android TWA every answer is "no".
const cap = () => window.Capacitor;

export const isNative = () => { try { return !!cap()?.isNativePlatform?.(); } catch (e) { return false; } };
export const platform = () => isNative() ? cap().getPlatform() : "web";

const plugins = {};
/** A native plugin by its registered name, or null when absent, so the web build never breaks without it. */
export function plugin(name) {
  if (!isNative()) return null;
  if (!(name in plugins)) {
    const c = cap();
    let p = c.Plugins?.[name] || null;
    if (!p && c.isPluginAvailable?.(name)) { try { p = c.registerPlugin(name); } catch (e) { p = null; } }
    plugins[name] = p;
  }
  return plugins[name];
}

/** A light tap on a phone that has one; nothing anywhere else. */
export function haptic() {
  const h = plugin("Haptics");
  if (h) h.impact({ style: "LIGHT" }).catch(() => {});
  else if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) { /* not allowed here */ } }
}

// A universal link tapped elsewhere opens the app, not the page: follow it, keeping the fragment the route lives in.
plugin("App")?.addListener?.("appUrlOpen", ({ url }) => {
  let u;
  try { u = new URL(url); } catch (e) { return; }
  if (u.origin !== location.origin) return;
  if (u.pathname === location.pathname && u.hash) location.hash = u.hash;
  else location.href = u.href;
});
