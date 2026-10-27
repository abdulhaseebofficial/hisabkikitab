/**
 * What auth offers the rest of the app.
 *
 * Who is signed in, and how a session starts and ends.
 *
 * Anything not re-exported here is internal to this feature: other
 * features import from this file, never from a path inside it.
 */

export { AuthProvider, useAuth, useOptionalAuth } from './AuthContext';
export { default as authApi } from './api/authApi';
