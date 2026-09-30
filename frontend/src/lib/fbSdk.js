let _fbInited = false;
let _fbBlocked = false;

export const loadFbSdk = (appId) => new Promise((resolve, reject) => {
  const init = () => {
    if (!_fbInited) { window.FB.init({ appId, cookie: true, xfbml: false, version: "v22.0" }); _fbInited = true; }
    resolve(window.FB);
  };
  if (window.FB) return init();
  if (_fbBlocked) return reject(new Error("blocked"));
  window.fbAsyncInit = init;
  let tag = document.getElementById("fb-sdk");
  if (!tag) {
    tag = document.createElement("script"); tag.id = "fb-sdk"; tag.async = true; tag.defer = true; tag.crossOrigin = "anonymous";
    tag.src = "https://connect.facebook.net/en_US/sdk.js"; document.body.appendChild(tag);
  }
  tag.addEventListener("error", () => { _fbBlocked = true; reject(new Error("blocked")); }, { once: true });
  setTimeout(() => { if (!window.FB) reject(new Error("timeout")); }, 12000);
});

export const SDK_HELP = "Your browser blocked Meta's login script (ad blocker / tracking prevention). Allow connect.facebook.net for this site or open in Chrome, then try again.";

/** Listen for Meta Embedded Signup postMessages; returns an unsubscribe fn. `session` gets { waba_id, phone_number_id }. */
export function listenWaSignup(session, onError) {
  const onMsg = (ev) => {
    if (!/https:\/\/(www\.)?facebook\.com$/.test(ev.origin)) return;
    let d; try { d = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data; } catch { return; }
    if (d?.type !== "WA_EMBEDDED_SIGNUP") return;
    if (["FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"].includes(d.event)) session.current = d.data || {};
    else if (d.event === "ERROR") onError?.(d.data?.error_message || "Meta signup failed");
  };
  window.addEventListener("message", onMsg);
  return () => window.removeEventListener("message", onMsg);
}

export function launchWaSignup(FB, configId, onLogin) {
  FB.login(onLogin, { config_id: configId, response_type: "code", override_default_response_type: true,
    extras: { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } });
}
