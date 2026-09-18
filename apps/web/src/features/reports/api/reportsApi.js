import api from '../../../shared/api/client';

const reportService = {
  async monthly(month, year) {
    const { data } = await api.get('/reports/monthly', { params: { month, year } });
    return data.data;
  },

  /**
   * Downloads the report. The response is binary, so it is requested as a blob
   * and handed to the browser through a temporary object URL.
   */
  async download(format, month, year) {
    const response = await api.get('/reports/export', {
      params: { format, month, year },
      responseType: 'blob',
    });

    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `hisabkikitab-${year}-${String(month).padStart(2, '0')}.${format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default reportService;
