import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

/* --------------------------- token storage -------------------------- */

/**
 * The access token lives in memory for this page, and nowhere else.
 *
 * It used to be mirrored into localStorage so a reload would not sign the
 * student out. That worked, and it also meant any injected script could read
 * the token whenever it liked and keep reading it long after the injection
 * itself was cleaned up - a stored credential is a credential an attacker can
 * take away with them.
 *
 * Reloads are handled by the server instead: the same token is set as an
 * httpOnly cookie that JavaScript cannot read, and the browser presents it
 * automatically. So a fresh page load starts with no token in memory, the
 * cookie authenticates the first call, and nothing is persisted here at all.
 *
 * The variable is still kept because the Authorization header is the explicit
 * credential, and an explicit credential should beat an ambient one.
 */
let accessToken = null;
let sessionEpoch = 0;

export const getAccessToken = () => accessToken;

export const setAccessToken = (token) => {
  accessToken = token || null;
};

/** Invalidate in-flight restore/refresh requests when an explicit auth action starts. */
export const bumpSessionEpoch = () => {
  sessionEpoch += 1;
};

/* ------------------------------- client ----------------------------- */

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // send the refresh cookie
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000, // AI calls can legitimately take a while
});

// Keep a key through an uncertain network failure so repeating the same submit
// cannot create another financial effect. A completed submit releases the key.
const pendingFinancial = new Map();
const financialRoute = (method, url) => {
  const path = String(url || '').split('?')[0];
  return (method === 'post' && [
    /^\/(expenses|income|debts|goals)\/?$/,
    /^\/profile\/onboarding$/,
    /^\/profile\/onboarding$/,
    /^\/expenses\/[^/]+\/mark-paid$/,
    /^\/debts\/[^/]+\/(payments|settle)$/,
  ].some(pattern => pattern.test(path))) ||
    (method === 'patch' && /^\/goals\/[^/]+\/add$/.test(path));
};

api.interceptors.request.use((config) => {
  if (config._sessionEpoch === undefined) config._sessionEpoch = sessionEpoch;
  if (financialRoute(String(config.method || '').toLowerCase(), config.url)) {
    const fingerprint = `${config.method}:${config.url}:${typeof config.data === 'string' ? config.data : JSON.stringify(config.data || {})}`;
    if (!pendingFinancial.has(fingerprint)) pendingFinancial.set(fingerprint, crypto.randomUUID());
    config.headers['Idempotency-Key'] = pendingFinancial.get(fingerprint);
    config._financialFingerprint = fingerprint;
  }
  // No header on a fresh page load, and that is correct: the httpOnly cookie
  // carries the session until the first response hands a token back.
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/* --------------------- silent refresh on a 401 ---------------------- */

let refreshing = null;          // in-flight refresh promise
let onSessionExpired = () => {}; // set by AuthContext

export const setSessionExpiredHandler = (fn) => {
  onSessionExpired = fn;
};

const refreshSession = async () => {
  // One refresh at a time: parallel 401s all wait on the same promise.
  if (!refreshing) {
    refreshing = axios
      .post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then((res) => {
        const token = res.data.data.accessToken;
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
};

api.interceptors.response.use(
  (response) => {
    if (response.config?._financialFingerprint) pendingFinancial.delete(response.config._financialFingerprint);
    return response;
  },
  async (error) => {
    const original = error.config;
    const status = error.response ? error.response.status : null;

    // Never try to refresh the calls that mint a session themselves, and only
    // retry once. `/auth/me` is deliberately absent from this list: an expired
    // access token with a live refresh cookie is exactly the case the silent
    // refresh exists for, and matching it here logged the student out on boot
    // 15 minutes after login despite a 30-day cookie.
    const NO_REFRESH = ['/auth/refresh', '/auth/login', '/auth/register', '/auth/logout'];
    const isAuthRoute = original && original.url && NO_REFRESH.some((path) => original.url.startsWith(path));

    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true;
      try {
        const token = await refreshSession();
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        setAccessToken(null);
        if (original._sessionEpoch === sessionEpoch) onSessionExpired();
        return Promise.reject(error);
      }
    }

    if (original?._financialFingerprint && error.response && error.response.status < 500)
      pendingFinancial.delete(original._financialFingerprint);
    return Promise.reject(error);
  }
);

/* --------------------------- error helper --------------------------- */

/**
 * Turns any axios failure into a plain message the UI can show.
 * Field-level validation errors are attached as `.fields`.
 */
export const getErrorMessage = (error) => {
  if (error.response && error.response.data) {
    const { message, errors } = error.response.data;
    if (Array.isArray(errors) && errors.length) {
      const err = new Error(message || errors[0].message);
      err.fields = errors;
      return err.message;
    }
    return message || 'Something went wrong';
  }
  if (error.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  if (error.message === 'Network Error') return 'Cannot reach the server. Is the backend running?';
  return error.message || 'Something went wrong';
};

/** Field-level errors, ready to feed into react-hook-form setError. */
export const getFieldErrors = (error) => {
  const errors = error.response && error.response.data && error.response.data.errors;
  return Array.isArray(errors) ? errors : [];
};

export default api;
