import api from '../../../shared/api/client';
import { trackEvent } from '../../../shared/analytics/analytics';

/**
 * Udhaar: what the student borrowed, and what they lent.
 *
 * Every figure that matters - remaining, status, the summary totals - is worked
 * out by the server. Nothing here adds money up, because two places doing the
 * same arithmetic is two places to get it wrong.
 */
const debtsApi = {
  /** `params` maps straight onto the backend query string. */
  async list(params = {}) {
    const { data } = await api.get('/debts', { params });
    return data.data; // { items, pagination, filteredOutstanding }
  },

  /** Payable, receivable, net, overdue, and what falls due soon. */
  async summary() {
    const { data } = await api.get('/debts/summary');
    return data.data;
  },

  /** One record together with its full payment history. */
  async get(id) {
    const { data } = await api.get(`/debts/${id}`);
    return data.data; // { debt, payments }
  },

  async create(payload) {
    const { data } = await api.post('/debts', payload);
    trackEvent('debt_created');
    return data.data.debt;
  },

  async update(id, payload) {
    const { data } = await api.put(`/debts/${id}`, payload);
    trackEvent('debt_updated');
    return data.data.debt;
  },

  async remove(id) {
    const { data } = await api.delete(`/debts/${id}`);
    trackEvent('debt_deleted');
    return data.data.id;
  },

  /** A full or partial payment. Returns the record with its new balance. */
  async addPayment(id, payload) {
    const { data } = await api.post(`/debts/${id}/payments`, payload);
    trackEvent('debt_payment_recorded');
    if (data.data.justSettled) trackEvent('debt_settled');
    return data.data; // { debt, payment, justSettled }
  },

  /** Clears whatever is left in one go. */
  async settle(id, note) {
    const { data } = await api.post(`/debts/${id}/settle`, { note });
    trackEvent('debt_settled');
    return data.data;
  },

  /**
   * Stops a record counting without destroying it.
   *
   * Different from remove(): that is for something typed by mistake, this is
   * for a debt that existed and no longer stands. The ledger survives.
   */
  async cancel(id, reason) {
    const { data } = await api.post(`/debts/${id}/cancel`, { reason });
    trackEvent('debt_cancelled');
    return data.data.debt;
  },

  /** Undo a mistyped payment; the balance goes back with it. */
  async removePayment(id, paymentId) {
    const { data } = await api.delete(`/debts/${id}/payments/${paymentId}`);
    return data.data.debt;
  },
};

export default debtsApi;
