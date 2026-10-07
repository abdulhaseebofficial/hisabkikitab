import api, { setAccessToken } from '../../../shared/api/client';

/** Every call returns the payload the caller actually needs, not the envelope. */
const authService = {
  async register(payload) {
    const { data } = await api.post('/auth/register', payload);
    setAccessToken(data.data.accessToken);
    return data.data.user;
  },

  /** What the sign-in screen needs before it renders anything. */
  async config() {
    const { data } = await api.get('/auth/config');
    return data.data;
  },

  /**
   * Exchanges a Google ID token for a Hisabki Kitab session.
   *
   * The token is not inspected here. It is opaque to the browser and only
   * means anything once the server has checked Google's signature on it.
   */
  async google(idToken) {
    const { data } = await api.post('/auth/google', { idToken });
    setAccessToken(data.data.accessToken);
    return data.data;
  },

  async login(payload) {
    const { data } = await api.post('/auth/login', payload);
    setAccessToken(data.data.accessToken);
    return data.data.user;
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      // Clear locally even if the network call failed.
      setAccessToken(null);
    }
  },

  /** Used on app boot to restore the session from the refresh cookie. */
  async refresh() {
    const { data } = await api.post('/auth/refresh');
    setAccessToken(data.data.accessToken);
    return data.data.user;
  },

  async me() {
    const { data } = await api.get('/auth/me');
    return data.data.user;
  },

  async forgotPassword(email) {
    const { data } = await api.post('/auth/forgot-password', { email });
    return data;
  },

  async resetPassword(token, password) {
    const { data } = await api.post(`/auth/reset-password/${token}`, { password });
    setAccessToken(data.data.accessToken);
    return data.data.user;
  },

  async changePassword(currentPassword, newPassword) {
    const { data } = await api.put('/auth/change-password', { currentPassword, newPassword });
    setAccessToken(data.data.accessToken);
    return data;
  },
};

export default authService;
