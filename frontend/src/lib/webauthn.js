// WebAuthn (fingerprint / Face ID) helpers — works on Android, iOS & desktop over HTTPS.
import api from "@/lib/api";

const bytes = (s) => {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const b64u = (a) => btoa(String.fromCharCode(...new Uint8Array(a))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const decodeOpts = (o) => {
  if (o.challenge) o.challenge = bytes(o.challenge);
  if (o.user?.id) o.user.id = bytes(o.user.id);
  (o.excludeCredentials || []).forEach((c) => (c.id = bytes(c.id)));
  (o.allowCredentials || []).forEach((c) => (c.id = bytes(c.id)));
  return o;
};

const credJSON = (c) => {
  const r = c.response;
  const out = { id: c.id, rawId: b64u(c.rawId), type: c.type, clientExtensionResults: {}, response: { clientDataJSON: b64u(r.clientDataJSON) } };
  if (r.attestationObject) {
    out.response.attestationObject = b64u(r.attestationObject);
    out.response.transports = r.getTransports ? r.getTransports() : ["internal"];
  } else {
    out.response.authenticatorData = b64u(r.authenticatorData);
    out.response.signature = b64u(r.signature);
    out.response.userHandle = r.userHandle ? b64u(r.userHandle) : null;
  }
  return out;
};

export const passkeySupported = () =>
  typeof window !== "undefined" && !!window.PublicKeyCredential && window.isSecureContext;

export async function registerPasskey() {
  const { data } = await api.post("/passkeys/register/options", {});
  const cred = await navigator.credentials.create({ publicKey: decodeOpts(data) });
  await api.post("/passkeys/register/verify", { credential: credJSON(cred) });
  localStorage.setItem("pk_enrolled", "1");
}

export async function loginWithPasskey(email = "") {
  const { data } = await api.post("/passkeys/login/options", { email });
  const cred = await navigator.credentials.get({ publicKey: decodeOpts(data) });
  const res = await api.post("/passkeys/login/verify", { credential: credJSON(cred) });
  return res.data;
}
