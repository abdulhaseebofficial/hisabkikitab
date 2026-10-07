const usersRepo = require('../users/users.service');
const ApiError = require('../../shared/errors/ApiError');
const asyncHandler = require('../../shared/http/asyncHandler');
const { verifyAccessToken, ACCESS_COOKIE } = require('./auth.tokens');

/**
 * Authenticates the request and attaches the user to `req.user`. Every route
 * below /api that touches user data must sit behind this.
 *
 * Two ways in, in this order:
 *
 *   Authorization: Bearer <token>   what the API contract has always accepted,
 *                                   and what anything that is not a browser
 *                                   uses - scripts, the test suites, curl
 *
 *   hw_access cookie                the browser's way, set httpOnly so no
 *                                   injected script can read the token
 *
 * The header is checked first so an explicit credential always wins over an
 * ambient one: a script passing a token must not silently act as whoever the
 * browser happens to be signed in as.
 */
const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const fromHeader = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const fromCookie = req.cookies ? req.cookies[ACCESS_COOKIE] : null;
  const token = fromHeader || fromCookie || null;

  if (!token) throw ApiError.unauthorized('No token provided. Please log in.');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    // Distinguish expiry so the frontend interceptor knows to hit /refresh.
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Session expired');
    throw ApiError.unauthorized('Invalid token');
  }

  if (payload.type !== 'access') throw ApiError.unauthorized('Invalid token type');
  if (!Number.isSafeInteger(payload.v) || payload.v < 0)
    throw ApiError.unauthorized('Session is no longer valid, please log in again');

  // findById is already required to reject deleted accounts and populate
  // req.user. It selects tokenVersion, so revocation adds no database lookup.
  const user = await usersRepo.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('This account no longer exists');
  if (payload.v !== user.tokenVersion)
    throw ApiError.unauthorized('Session is no longer valid, please log in again');

  req.user = user;
  next();
});

module.exports = { protect };
