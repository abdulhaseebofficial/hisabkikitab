import api from './client';

const profileService = {
  async update(payload) {
    const { data } = await api.put('/profile', payload);
    return data.data.user;
  },

  async completeOnboarding(payload) {
    const { data } = await api.post('/profile/onboarding', payload);
    return data.data; // { user, goal }
  },

  async categories() {
    const { data } = await api.get('/profile/categories');
    return data.data; // { defaults, custom, all }
  },

  async addCategory(name) {
    const { data } = await api.post('/profile/categories', { name });
    return data.data.all;
  },

  async deleteCategory(name) {
    const { data } = await api.delete(`/profile/categories/${encodeURIComponent(name)}`);
    return data.data.all;
  },

  /** Full JSON export of everything the account holds. */
  async exportData() {
    const response = await api.get('/profile/export', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hisabkikitab-data.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async deleteAccount(password) {
    await api.delete('/profile', { data: { password } });
  },
};

export default profileService;
