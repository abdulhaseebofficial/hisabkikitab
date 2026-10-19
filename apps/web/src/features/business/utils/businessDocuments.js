import client from '../../../shared/api/client';
import toast from 'react-hot-toast';

/**
 * Valid Business Mode PDF Document Types supported by the backend
 */
export const DOCUMENT_TYPES = {
  SALES_INVOICE: 'sales-invoice',
  POS_RECEIPT: 'pos-receipt',
  PURCHASE_ORDER: 'purchase-order',
  GOODS_RECEIVED_NOTE: 'goods-received-note',
  SUPPLIER_BILL: 'supplier-bill',
  CUSTOMER_STATEMENT: 'customer-statement',
  SUPPLIER_STATEMENT: 'supplier-statement',
  PAYMENT_RECEIPT: 'payment-receipt',
  EMPLOYEE_PAYSLIP: 'employee-payslip',
  PROFIT_AND_LOSS: 'profit-and-loss',
  BALANCE_SHEET: 'balance-sheet',
  CASH_FLOW: 'cash-flow',
};

/**
 * Sanitizes a filename string to prevent path traversal or invalid filesystem characters.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'document.pdf';
  const clean = name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_').trim();
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

/**
 * Generates an appropriate default filename for a document type and ID.
 * @param {string} docType
 * @param {string} [docId]
 * @param {string} [dateStr]
 * @returns {string}
 */
export function getDefaultFilename(docType, docId, dateStr) {
  const date = dateStr || new Date().toISOString().split('T')[0];
  const shortId = docId && docId !== 'current' ? `-${String(docId).slice(0, 8)}` : '';
  return sanitizeFilename(`HKK-${docType}${shortId}-${date}.pdf`);
}

/**
 * Fetches a PDF document from the backend API as a Blob with full session authentication.
 * Handles 401, 403, 404, and network errors gracefully.
 *
 * @param {object} options
 * @param {string} options.businessId - Current active business ID
 * @param {string} options.docType - One of DOCUMENT_TYPES
 * @param {string} [options.docId] - Specific entity ID (or 'current' for financial statements)
 * @param {object} [options.params] - Optional query params (e.g. fromDate, toDate, asOfDate)
 * @returns {Promise<Blob>}
 */
export async function fetchDocumentBlob({ businessId, docType, docId, params = {} }) {
  if (!businessId) {
    throw new Error('Business ID is required to fetch documents.');
  }
  if (!docType) {
    throw new Error('Document type is required.');
  }

  const endpoint = docId
    ? `/business/${businessId}/documents/${encodeURIComponent(docType)}/${encodeURIComponent(docId)}/pdf`
    : `/business/${businessId}/documents/${encodeURIComponent(docType)}/pdf`;

  try {
    const response = await client.get(endpoint, {
      params,
      responseType: 'blob',
      headers: {
        Accept: 'application/pdf',
      },
    });

    if (!(response.data instanceof Blob) || response.data.size === 0) {
      throw new Error('Received empty document payload from server.');
    }

    return response.data;
  } catch (err) {
    // If the server returned a JSON error wrapped in a Blob, extract the message
    if (err.response?.data instanceof Blob && err.response.data.type?.includes('application/json')) {
      try {
        const errorText = await err.response.data.text();
        const json = JSON.parse(errorText);
        throw new Error(json.message || `Failed to fetch document (${err.response.status})`);
      } catch (parseErr) {
        if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr;
      }
    }

    const status = err.response?.status;
    if (status === 401) {
      throw new Error('Session expired. Please sign in again.');
    }
    if (status === 403) {
      throw new Error('You do not have permission to view or download this document.');
    }
    if (status === 404) {
      throw new Error('Requested document or record was not found.');
    }

    throw new Error(err.response?.data?.message || err.message || 'Failed to download document.');
  }
}

/**
 * Downloads a Business Mode PDF document directly to the client disk with clean URL revocation.
 *
 * @param {object} options
 * @param {string} options.businessId
 * @param {string} options.docType
 * @param {string} [options.docId]
 * @param {string} [options.customFilename]
 * @param {object} [options.params]
 * @param {function} [options.setLoading] - React state updater for loading indicator
 * @returns {Promise<void>}
 */
export async function downloadDocumentPdf({
  businessId,
  docType,
  docId,
  customFilename,
  params = {},
  setLoading,
}) {
  if (setLoading) setLoading(true);
  try {
    const blob = await fetchDocumentBlob({ businessId, docType, docId, params });
    const filename = customFilename || getDefaultFilename(docType, docId);

    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up temporary object URL
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 2000);

    toast.success(`Downloaded ${filename}`);
  } catch (err) {
    toast.error(err.message || 'Download failed');
    throw err;
  } finally {
    if (setLoading) setLoading(false);
  }
}

/**
 * Opens a PDF document in a new browser tab for previewing or printing.
 *
 * @param {object} options
 * @param {string} options.businessId
 * @param {string} options.docType
 * @param {string} [options.docId]
 * @param {object} [options.params]
 * @param {function} [options.setLoading]
 * @returns {Promise<void>}
 */
export async function previewDocumentPdf({
  businessId,
  docType,
  docId,
  params = {},
  setLoading,
}) {
  if (setLoading) setLoading(true);
  try {
    const blob = await fetchDocumentBlob({ businessId, docType, docId, params });
    const blobUrl = window.URL.createObjectURL(blob);
    const newWindow = window.open(blobUrl, '_blank');

    if (!newWindow) {
      toast.error('Popup blocked. Please allow popups to preview documents.');
    }

    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl);
    }, 60000); // Give user 60 seconds before revoking preview URL
  } catch (err) {
    toast.error(err.message || 'Preview failed');
    throw err;
  } finally {
    if (setLoading) setLoading(false);
  }
}

/**
 * Triggers native browser print on a PDF document via a hidden iframe.
 *
 * @param {object} options
 * @param {string} options.businessId
 * @param {string} options.docType
 * @param {string} [options.docId]
 * @param {object} [options.params]
 * @param {function} [options.setLoading]
 * @returns {Promise<void>}
 */
export async function printDocumentPdf({
  businessId,
  docType,
  docId,
  params = {},
  setLoading,
}) {
  if (setLoading) setLoading(true);
  try {
    const blob = await fetchDocumentBlob({ businessId, docType, docId, params });
    const blobUrl = window.URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl;

    document.body.appendChild(iframe);

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (printErr) {
        // Fallback: open in new tab if iframe printing is restricted
        window.open(blobUrl, '_blank');
      } finally {
        setTimeout(() => {
          document.body.removeChild(iframe);
          window.URL.revokeObjectURL(blobUrl);
        }, 60000);
      }
    };
  } catch (err) {
    toast.error(err.message || 'Print failed');
    throw err;
  } finally {
    if (setLoading) setLoading(false);
  }
}
