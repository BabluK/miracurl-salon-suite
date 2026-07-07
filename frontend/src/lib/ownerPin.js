import api from "./api";
import { toast } from "sonner";

let cachedPin = null;

function call(method, url, data) {
  const headers = cachedPin ? { "X-Owner-Pin": cachedPin } : {};
  if (method === "delete") return api.delete(url, { headers });
  return api[method](url, data, { headers });
}

async function withPin(method, url, data) {
  try {
    return await call(method, url, data);
  } catch (e) {
    if (e.response?.status === 403 && e.response?.data?.detail === "OWNER_PIN_REQUIRED") {
      const pin = window.prompt("🔒 Owner Security PIN required for this action:");
      if (!pin) throw e;
      cachedPin = pin.trim();
      try {
        return await call(method, url, data);
      } catch (e2) {
        if (e2.response?.status === 403 && e2.response?.data?.detail === "OWNER_PIN_REQUIRED") {
          cachedPin = null;
          toast.error("Incorrect PIN — action blocked");
        }
        throw e2;
      }
    }
    throw e;
  }
}

const pinApi = {
  post: (url, data) => withPin("post", url, data),
  put: (url, data) => withPin("put", url, data),
  delete: (url) => withPin("delete", url),
};

export default pinApi;
