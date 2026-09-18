import api from '../../../shared/api/client';
import { trackEvent } from '../../../shared/analytics/analytics';

const expenseService = {
  /** `params` maps straight onto the backend query string. */
  async list(params = {}) {
    const { data } = await api.get('/expenses', { params });
    return data.data; // { items, pagination, filteredTotal }
  },

  async get(id) {
    const { data } = await api.get(`/expenses/${id}`);
    return data.data.expense;
  },

  async create(payload) {
    const { data } = await api.post('/expenses', payload);
    trackEvent('expense_created');
    return data.data.expense;
  },

  async update(id, payload) {
    const { data } = await api.put(`/expenses/${id}`, payload);
    trackEvent('expense_updated');
    return data.data.expense;
  },

  /**
   * Ticks a recurring bill off for this cycle.
   *
   * Records the expense and moves the template's due date on, in one call - so
   * a bill cannot end up recorded but still sitting in "upcoming", or moved on
   * without being recorded.
   */
  async markPaid(id, payload = {}) {
    const { data } = await api.post(`/expenses/${id}/mark-paid`, payload);
    trackEvent('expense_created');
    return data.data; // { expense, nextDueAt }
  },

  async remove(id) {
    const { data } = await api.delete(`/expenses/${id}`);
    trackEvent('expense_deleted');
    return data.data.id;
  },
};

export default expenseService;
