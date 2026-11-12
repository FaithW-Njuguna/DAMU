let token = sessionStorage.getItem("damu_token");
let onAuthFail = () => {};

export const session = {
  set(t) {
    token = t;
    t ? sessionStorage.setItem("damu_token", t) : sessionStorage.removeItem("damu_token");
  }
};
export const setAuthFailHandler = (fn) => { onAuthFail = fn; };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// anon: true never attaches the login token (used by the anonymous whistleblower form).
export async function api(path, { method = "GET", body, anon = false } = {}) {
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: { "Content-Type": "application/json", ...(token && !anon ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const message = data?.message || "Something went wrong. Please try again.";
    if (!anon && (res.status === 401 || /token/i.test(message))) onAuthFail();
    throw new ApiError(message, res.status);
  }
  return data;
}