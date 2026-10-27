import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DOCUMENT_TYPES,
  sanitizeFilename,
  getDefaultFilename,
  fetchDocumentBlob,
  downloadDocumentPdf,
} from './businessDocuments';
import client from '../../../shared/api/client';
import toast from 'react-hot-toast';

vi.mock('../../../shared/api/client', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('businessDocuments utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeFilename', () => {
    it('cleans invalid path characters and ensures .pdf extension', () => {
      expect(sanitizeFilename('Invoice #101 / July:2026.pdf')).toBe('Invoice_#101_-_July-2026.pdf');
      expect(sanitizeFilename('test document')).toBe('test_document.pdf');
      expect(sanitizeFilename('../../../malicious/path.pdf')).toBe('..-..-..-malicious-path.pdf');
      expect(sanitizeFilename(null)).toBe('document.pdf');
    });
  });

  describe('getDefaultFilename', () => {
    it('generates consistent filenames with date and id', () => {
      const name = getDefaultFilename(DOCUMENT_TYPES.SALES_INVOICE, '12345678-abcd', '2026-10-20');
      expect(name).toBe('HKK-sales-invoice-12345678-2026-10-20.pdf');
    });

    it('handles statements without specific id', () => {
      const name = getDefaultFilename(DOCUMENT_TYPES.PROFIT_AND_LOSS, 'current', '2026-10-20');
      expect(name).toBe('HKK-profit-and-loss-2026-10-20.pdf');
    });
  });

  describe('fetchDocumentBlob', () => {
    it('throws when businessId or docType is missing', async () => {
      await expect(fetchDocumentBlob({ docType: 'sales-invoice' })).rejects.toThrow('Business ID is required');
      await expect(fetchDocumentBlob({ businessId: 'biz-1' })).rejects.toThrow('Document type is required');
    });

    it('calls client.get with blob responseType and returns blob', async () => {
      const mockBlob = new Blob(['%PDF-1.4 test'], { type: 'application/pdf' });
      client.get.mockResolvedValueOnce({ data: mockBlob });

      const result = await fetchDocumentBlob({
        businessId: 'biz-123',
        docType: DOCUMENT_TYPES.SALES_INVOICE,
        docId: 'sale-456',
      });

      expect(client.get).toHaveBeenCalledWith('/business/biz-123/documents/sales-invoice/sale-456/pdf', {
        params: {},
        responseType: 'blob',
        headers: { Accept: 'application/pdf' },
      });
      expect(result).toBe(mockBlob);
    });

    it('maps 403 Forbidden to permission error message', async () => {
      const error = new Error('Request failed with status code 403');
      error.response = { status: 403, data: null };
      client.get.mockRejectedValueOnce(error);

      await expect(
        fetchDocumentBlob({
          businessId: 'biz-123',
          docType: DOCUMENT_TYPES.PROFIT_AND_LOSS,
        })
      ).rejects.toThrow('You do not have permission to view or download this document.');
    });

    it('maps 404 Not Found to missing document error message', async () => {
      const error = new Error('Request failed with status code 404');
      error.response = { status: 404, data: null };
      client.get.mockRejectedValueOnce(error);

      await expect(
        fetchDocumentBlob({
          businessId: 'biz-123',
          docType: DOCUMENT_TYPES.SALES_INVOICE,
          docId: 'missing-id',
        })
      ).rejects.toThrow('Requested document or record was not found.');
    });
  });

  describe('downloadDocumentPdf', () => {
    it('creates object URL and triggers anchor download', async () => {
      const mockBlob = new Blob(['%PDF-1.4 content'], { type: 'application/pdf' });
      client.get.mockResolvedValueOnce({ data: mockBlob });

      // Mock window.URL methods
      const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-blob');
      const revokeObjectURLMock = vi.fn();
      window.URL.createObjectURL = createObjectURLMock;
      window.URL.revokeObjectURL = revokeObjectURLMock;

      await downloadDocumentPdf({
        businessId: 'biz-123',
        docType: DOCUMENT_TYPES.SALES_INVOICE,
        docId: 'inv-001',
      });

      expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
      expect(toast.success).toHaveBeenCalled();
    });
  });
});
