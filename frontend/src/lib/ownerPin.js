import api from "./api";
import { toast } from "sonner";

let cachedPin = null;
let pinPromise = null;

function askPinOnce() {
  if (!pinPromise) {
    pinPromise = askPin().finally(() => { pinPromise = null; });
  }
  return pinPromise;
}

/* window.prompt is blocked inside installed PWAs / mobile webviews, so we use a
   lightweight DOM dialog that works everywhere. */
function askPin() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.setAttribute("data-testid", "owner-pin-modal");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;";
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:20px;max-width:320px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.35)">
        <div style="font-weight:600;color:#1e293b;font-size:15px">🔒 Owner Security PIN</div>
        <p style="font-size:12px;color:#64748b;margin:6px 0 12px">This action needs the owner PIN to continue.</p>
        <input data-testid="owner-pin-input" type="password" inputmode="numeric" autocomplete="one-time-code" maxlength="8"
          style="width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;font-size:18px;letter-spacing:6px;text-align:center;outline:none;box-sizing:border-box" />
        <div style="display:flex;gap:8px;margin-top:14px">
          <button type="button" data-testid="owner-pin-cancel" style="flex:1;padding:10px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;color:#64748b;font-size:13px;cursor:pointer">Cancel</button>
          <button type="button" data-testid="owner-pin-ok" style="flex:1;padding:10px;border-radius:10px;border:none;background:#0f172a;color:#fff;font-weight:600;font-size:13px;cursor:pointer">Unlock</button>
        </div>
      </div>`;
    const input = overlay.querySelector("input");
    const done = (val) => { overlay.remove(); resolve(val); };
    input.oninput = () => { input.value = input.value.replace(/\D/g, ""); };
    const submit = () => {
      const v = input.value.trim();
      if (!v) return done(null);
      if (!/^\d{4,8}$/.test(v)) { toast.error("PIN must be 4–8 digits"); return; }
      done(v);
    };
    overlay.querySelector('[data-testid="owner-pin-cancel"]').onclick = () => done(null);
    overlay.querySelector('[data-testid="owner-pin-ok"]').onclick = submit;
    input.onkeydown = (e) => { if (e.key === "Enter") submit(); };
    overlay.onclick = (e) => { if (e.target === overlay) done(null); };
    document.body.appendChild(overlay);
    setTimeout(() => input.focus(), 60);
  });
}

function call(method, url, data) {
  const headers = cachedPin ? { "X-Owner-Pin": cachedPin } : {};
  if (method === "delete") return api.delete(url, { headers });
  if (method === "get") return api.get(url, { headers });
  return api[method](url, data, { headers });
}

async function withPin(method, url, data) {
  try {
    return await call(method, url, data);
  } catch (e) {
    if (e.response?.status === 403 && e.response?.data?.detail === "OWNER_PIN_NOT_SET") {
      e.response.data.detail = "This action is locked — the owner hasn't set a Security PIN yet";
      toast.error("Sorry, you are not authorized — the owner hasn't set a Security PIN yet. Ask the owner to set one in Settings → Security PIN.", { duration: 6000 });
      throw e;
    }
    if (e.response?.status === 403 && e.response?.data?.detail === "OWNER_PIN_REQUIRED") {
      const pin = await askPinOnce();
      if (!pin) {
        e.response.data.detail = "Owner PIN required — action cancelled";
        throw e;
      }
      cachedPin = pin;
      try {
        return await call(method, url, data);
      } catch (e2) {
        if (e2.response?.status === 403 && e2.response?.data?.detail === "OWNER_PIN_REQUIRED") {
          cachedPin = null;
          e2.response.data.detail = "Incorrect Owner PIN — please contact your Salon Admin team";
          toast.error("Incorrect PIN — please contact your Salon Admin team", { duration: 6000 });
        }
        throw e2;
      }
    }
    throw e;
  }
}

const pinApi = {
  get: (url) => withPin("get", url),
  post: (url, data) => withPin("post", url, data),
  put: (url, data) => withPin("put", url, data),
  delete: (url) => withPin("delete", url),
};

export default pinApi;
