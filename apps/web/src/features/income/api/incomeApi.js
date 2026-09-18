import api from '../../../shared/api/client';
import { trackEvent } from '../../../shared/analytics/analytics';

const incomeService = {
  async list(params = {}) {
    const { data } = await api.get('/income', { params });
    return data.data; // { items, total }
  },

  async summary() {
    const { data } = await api.get('/income/summary');
    return data.data;
  },

  async create(payload) {
    const { data } = await api.post('/income', payload);
    trackEvent('income_created');
    return data.data.income;
  },

  async update(id, payload) {
    const { data } = await api.put(`/income/${id}`, payload);
    trackEvent('income_updated');
    return data.data.income;
  },

  async remove(id) {
    const { data } = await api.delete(`/income/${id}`);
    trackEvent('income_deleted');
    return data.data.id;
  },
};

export default incomeService;
