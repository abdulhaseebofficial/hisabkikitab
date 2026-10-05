/**
 * Auth endpoints.
 *
 * The one thing this layer owns that the service does not: the refresh cookie.
 * The service hands back a refresh token and says nothing about how it should
 * travel; setting it httpOnly, and clearing it again, happens here.
 */

const auth = require('./auth.service');
const users = require('../users/users.service');
const asyncHandler = require('../../shared/http/asyncHandler');
const {
  refreshCookieOptions,
  accessCookieOptions,
  REFRESH_COOKIE,
  ACCESS_COOKIE,
} = require('./auth.tokens');
const google = require('../../infrastructure/auth/google');
const mailer = require('../../infrastructure/email/mailer');

/**
 * Puts both tokens into httpOnly cookies.
 *
 * The access token is still returned in the response body as well, because
 * that is the API contract and what every non-browser caller reads. What has
 * changed is that a browser no longer needs to keep a copy anywhere a script
 * can reach - the cookie carries it, and JavaScript cannot see the cookie.
 */
const setSession = (res, { refreshToken, accessToken }) => {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  if (accessToken) res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions());
};

const clearSession = (res) => {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
  res.clearCookie(ACCESS_COOKIE, { ...accessCookieOptions(), maxAge: undefined });
};

const readRefreshCookie = (req) => (req.cookies ? req.cookies[REFRESH_COOKIE] : null);

/**
 * POST /api/auth/register
 * Creates the account and logs the student straight in.
 */
const register = asyncHandler(async (req, res) => {
  const session = await auth.register(req.body);
  setSession(res, session);

  res.status(201).json({
    success: true,
    message: `Welcome to Hisabki Kitab, ${session.user.name.split(' ')[0]}!`,
    data: { user: session.user, accessToken: session.accessToken },
  });
});

/** GET /api/auth/config - what the sign-in screen needs before it renders. */
const publicConfig = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: {
      google: google.isConfigured() ? { enabled: true, clientId: google.clientId() } : { enabled: false },
      passwordReset: { enabled: mailer.isConfigured() },
    },
  });
});

/**
 * POST /api/auth/google
 * Signs in with a Google ID token, creating the account on first use.
 *
 * The response is deliberately the same shape a password login returns, and
 * carries the same cookie: once signed in, nothing downstream knows or cares
 * which door was used. `created` is only there so the browser can send a first
 * timer to onboarding instead of the dashboard.
 */
const googleSignIn = asyncHandler(async (req, res) => {
  const session = await auth.signInWithGoogle(req.body.idToken);
  setSession(res, session);

  res.status(session.created ? 201 : 200).json({
    success: true,
    message: session.created
      ? `Welcome to Hisabki Kitab, ${session.user.name.split(' ')[0]}!`
      : `Welcome back, ${session.user.name.split(' ')[0]}.`,
    data: { user: session.user, accessToken: session.accessToken, created: session.created },
  });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const session = await auth.login(req.body.email, req.body.password);
  setSession(res, session);

  res.json({
    success: true,
    message: `Welcome back, ${session.user.name.split(' ')[0]}!`,
    data: { user: session.user, accessToken: session.accessToken },
  });
});

/**
 * POST /api/auth/refresh
 * Reads the httpOnly cookie and mints a fresh access token. The refresh token
 * is rotated on every use.
 */
const refresh = asyncHandler(async (req, res) => {
  let session;
  try {
    session = await auth.refresh(readRefreshCookie(req));
  } catch (err) {
    // A replayed token revokes every session, so the dead cookie goes too.
    if (err.clearRefreshCookie) clearSession(res);
    throw err;
  }

  setSession(res, session);
  res.json({
    success: true,
    data: { user: session.user, accessToken: session.accessToken },
  });
});

/** POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  await auth.logout(readRefreshCookie(req));
  clearSession(res);
  res.json({ success: true, message: 'Logged out' });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: users.toPublic(req.user) } });
});

/**
 * POST /api/auth/forgot-password
 * Always answers 200 so the endpoint cannot be used to enumerate accounts.
 */
const forgotPassword = asyncHandler(async (req, res) => {
  const extra = await auth.forgotPassword(req.body.email);
  res.json({
    success: true,
    message: extra.deliveryAvailable === false
      ? 'Password reset by email is temporarily unavailable.'
      : 'If that email is registered, a password reset link is on its way.',
    ...extra,
  });
});

/** POST /api/auth/reset-password/:token */
const resetPassword = asyncHandler(async (req, res) => {
  const session = await auth.resetPassword(req.params.token, req.body.password);
  setSession(res, session);

  res.json({
    success: true,
    message: 'Password updated. You are logged in.',
    data: { user: session.user, accessToken: session.accessToken },
  });
});

/** PUT /api/auth/change-password (Settings page) */
const changePassword = asyncHandler(async (req, res) => {
  const session = await auth.changePassword(
    req.user._id,
    req.body.currentPassword,
    req.body.newPassword
  );
  setSession(res, session);

  res.json({
    success: true,
    message: 'Password changed',
    data: { accessToken: session.accessToken },
  });
});

module.exports = {
  publicConfig,
  googleSignIn,
  register,
  login,
  refresh,
  logout,
  me,
  forgotPassword,
  resetPassword,
  changePassword,
};
