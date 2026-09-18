const { OAuth2Client } = require('google-auth-library');

/**
 * Turning a Google ID token into a person we are willing to sign in.
 *
 * The browser gets an ID token from Google and posts it here. That token is a
 * JWT signed by Google, so the only thing that makes it trustworthy is actually
 * checking the signature against Google's published keys, and checking that the
 * token was issued *for this application* rather than for some other site the
 * same person also uses. `verifyIdToken` does both: signature, issuer,
 * audience and expiry. A token that fails any of them throws, and nothing
 * downstream ever sees it.
 *
 * Google's official library is used rather than hand-rolled JWKS handling
 * because key rotation, caching and algorithm pinning are exactly the details
 * that get quietly wrong in a hand-rolled version.
 *
 * There is deliberately no client secret and no redirect URI here. The ID-token
 * flow needs neither, which removes a secret that could leak and a redirect
 * allowlist that could be got wrong - two of the three classic OAuth mistakes,
 * simply by not having them.
 */

const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let client = null;

/** The configured client id, or undefined when Google sign-in is switched off. */
const clientId = () => {
  const value = process.env.GOOGLE_CLIENT_ID;
  return value && value.trim() ? value.trim() : undefined;
};

/**
 * Whether Google sign-in is available at all.
 *
 * The whole feature is optional: with no client id configured the button is
 * never shown and the endpoint refuses politely, rather than the API failing to
 * boot over a feature nobody asked for.
 */
const isConfigured = () => Boolean(clientId());

/**
 * Verifies the token and returns only the four claims this app uses.
 *
 * Returns `{ ok: false, reason }` rather than throwing, so the caller decides
 * what the student is told. The reason is for the server's own logs; none of
 * these strings should be handed to the browser verbatim, because "wrong
 * audience" tells an attacker exactly which knob to turn next.
 */
const verify = async (idToken) => {
  const audience = clientId();
  if (!audience) return { ok: false, reason: 'GOOGLE_CLIENT_ID is not configured' };
  if (!idToken || typeof idToken !== 'string') return { ok: false, reason: 'no token supplied' };

  if (!client) client = new OAuth2Client(audience);

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch {
    // Library errors can include the supplied ID token; this reason is logged.
    return { ok: false, reason: 'token verification failed' };
  }

  return checkClaims(payload);
};

/**
 * The claim rules, separated from the signature check so they can be tested.
 *
 * Verifying a signature needs a token Google actually signed, which a test
 * cannot produce. These rules decide who we are willing to sign in once the
 * signature is already trusted, and they are the half that carries the
 * security decision - so they are a pure function over the payload, exercised
 * directly in tests/unit/google-auth.test.js.
 */
const checkClaims = (payload) => {
  if (!payload) return { ok: false, reason: 'token carried no payload' };

  // verifyIdToken already checks the issuer, but it is cheap to be explicit
  // about the one claim that decides whether Google issued this at all.
  if (!ISSUERS.includes(payload.iss)) {
    return { ok: false, reason: `unexpected issuer ${payload.iss}` };
  }

  if (!payload.sub) return { ok: false, reason: 'token carried no subject' };
  if (!payload.email) return { ok: false, reason: 'token carried no email' };

  /*
   * email_verified is the claim that makes account linking safe.
   *
   * Signing in with Google is allowed to open an existing Hisab Ki Kitab account
   * that has the same email address. That is only sound if Google has actually
   * confirmed the person owns that address - otherwise anyone able to put an
   * arbitrary unverified address on a Google account could claim somebody
   * else's financial records. Google sets this true for ordinary accounts;
   * refusing when it is false costs almost nobody anything.
   *
   * Checked with === true, not truthiness: Google has historically sent this
   * claim as the string "true", and a loose check would also accept the string
   * "false".
   */
  if (payload.email_verified !== true) {
    return { ok: false, reason: 'Google has not verified that email address' };
  }

  return {
    ok: true,
    profile: {
      googleId: String(payload.sub),
      email: String(payload.email).trim(),
      name: (payload.name || '').trim(),
    },
  };
};

module.exports = { verify, checkClaims, isConfigured, clientId };
