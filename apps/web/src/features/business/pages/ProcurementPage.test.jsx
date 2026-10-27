import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ProcurementPage from './ProcurementPage';
import { I18nProvider } from '../../../shared/i18n/I18nProvider';
import businessApi from '../api/businessApi';
import { downloadDocumentPdf } from '../utils/businessDocuments';

const mockUseBusiness = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('../BusinessContext', () => ({
  useBusiness: () => mockUseBusiness(),
}));

vi.mock('../../auth', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('../api/businessApi', () => ({
  default: {
    listPurchaseRequests: vi.fn(),
    listPurchaseOrders: vi.fn(),
    listGrns: vi.fn(),
    listSupplierBills: vi.fn(),
    listPayments: vi.fn(),
    listPurchaseReturns: vi.fn(),
    listSuppliers: vi.fn(),
    listProducts: vi.fn(),
    listWarehouses: vi.fn(),
    listAccounts: vi.fn(),
    createPurchaseRequest: vi.fn(),
    submitPurchaseRequest: vi.fn(),
    approvePurchaseRequest: vi.fn(),
    rejectPurchaseRequest: vi.fn(),
    createPurchaseOrder: vi.fn(),
    submitPurchaseOrder: vi.fn(),
    approvePurchaseOrder: vi.fn(),
    rejectPurchaseOrder: vi.fn(),
    sendPurchaseOrder: vi.fn(),
    createGrn: vi.fn(),
    createSupplierBill: vi.fn(),
    createSupplierPayment: vi.fn(),
    createPurchaseReturn: vi.fn(),
  },
}));

vi.mock('../utils/businessDocuments', () => ({
  DOCUMENT_TYPES: {
    PURCHASE_ORDER: 'purchase-order',
    GOODS_RECEIVED_NOTE: 'goods-received-note',
    SUPPLIER_BILL: 'supplier-bill',
    PAYMENT_RECEIPT: 'payment-receipt',
  },
  downloadDocumentPdf: vi.fn(),
  previewDocumentPdf: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ProcurementPage', () => {
  const mockOrders = [
    {
      id: 'po-1',
      po_number: 'PO-0001',
      supplier_id: 'sup-1',
      supplier_name: 'Metro Cash & Carry',
      date: '2026-10-20',
      expected_delivery_date: '2026-10-27',
      total_amount_minor: 5000000,
      status: 'pending_approval',
    },
    {
      id: 'po-2',
      po_number: 'PO-0002',
      supplier_id: 'sup-2',
      supplier_name: 'Al-Madina Traders',
      date: '2026-10-18',
      expected_delivery_date: '2026-10-25',
      total_amount_minor: 1200000,
      status: 'approved',
    },
  ];

  const mockGrns = [
    {
      id: 'grn-1',
      grn_number: 'GRN-0001',
      po_id: 'po-2',
      po_number: 'PO-0002',
      supplier_id: 'sup-2',
      supplier_name: 'Al-Madina Traders',
      receive_date: '2026-10-19',
      delivery_challan_number: 'DC-8819',
      total_received_value_minor: 1200000,
    },
  ];

  const mockBills = [
    {
      id: 'bill-1',
      bill_number: 'BILL-0001',
      supplier_id: 'sup-2',
      supplier_name: 'Al-Madina Traders',
      supplier_invoice_number: 'INV-441',
      bill_date: '2026-10-19',
      due_date: '2026-11-19',
      total_amount_minor: 1200000,
      balance_due_minor: 1200000,
      status: 'unpaid',
    },
  ];

  const mockSuppliers = [
    { id: 'sup-1', name: 'Metro Cash & Carry', current_balance_minor: 0 },
    { id: 'sup-2', name: 'Al-Madina Traders', current_balance_minor: 1200000 },
  ];

  const mockProducts = [
    { id: 'prod-1', name: 'Atta 10kg Bag', purchase_price_minor: 120000, current_stock: 25 },
    { id: 'prod-2', name: 'Cooking Oil 5L', purchase_price_minor: 250000, current_stock: 10 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseBusiness.mockReturnValue({
      activeBusinessId: 'biz-123',
      activeBusiness: { id: 'biz-123', name: 'Al-Madina Cash & Carry' },
      role: 'owner',
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'u1', name: 'Owner User', isDemo: false },
    });

    businessApi.listPurchaseRequests.mockResolvedValue([]);
    businessApi.listPurchaseOrders.mockResolvedValue(mockOrders);
    businessApi.listGrns.mockResolvedValue(mockGrns);
    businessApi.listSupplierBills.mockResolvedValue(mockBills);
    businessApi.listPayments.mockResolvedValue([]);
    businessApi.listPurchaseReturns.mockResolvedValue([]);
    businessApi.listSuppliers.mockResolvedValue(mockSuppliers);
    businessApi.listProducts.mockResolvedValue(mockProducts);
    businessApi.listWarehouses.mockResolvedValue([{ id: 'wh-1', name: 'Main Store', code: 'MAIN' }]);
    businessApi.listAccounts.mockResolvedValue([
      { id: 'acc-1', code: '1010', name: 'Cash in Hand', subtype: 'cash' },
      { id: 'acc-2', code: '1020', name: 'Bank Alfalah', subtype: 'bank' },
    ]);
  });

  const renderPage = () =>
    render(
      <MemoryRouter>
        <I18nProvider>
          <ProcurementPage />
        </I18nProvider>
      </MemoryRouter>
    );

  it('renders procurement dashboard, tabs, and loaded purchase orders', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Procurement & Purchasing/)).toBeInTheDocument();
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
      expect(screen.getByText('PO-0002')).toBeInTheDocument();
      expect(screen.getByText('Metro Cash & Carry')).toBeInTheDocument();
    });
  });

  it('switches between procurement tabs to view GRNs and Bills', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });

    // Switch to GRN tab
    const grnTab = screen.getByRole('button', { name: /Goods Receipts/ });
    fireEvent.click(grnTab);

    await waitFor(() => {
      expect(screen.getByText('GRN-0001')).toBeInTheDocument();
      expect(screen.getByText('DC-8819')).toBeInTheDocument();
    });

    // Switch to Bills tab
    const billsTab = screen.getByRole('button', { name: /Supplier Bills/ });
    fireEvent.click(billsTab);

    await waitFor(() => {
      expect(screen.getByText('BILL-0001')).toBeInTheDocument();
      expect(screen.getByText('INV-441')).toBeInTheDocument();
    });
  });

  it('handles PO approval workflow action', async () => {
    businessApi.approvePurchaseOrder.mockResolvedValueOnce({ id: 'po-1', status: 'approved' });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });

    // Owner can approve pending PO
    const approveBtn = screen.getByRole('button', { name: 'Approve' });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(businessApi.approvePurchaseOrder).toHaveBeenCalledWith('biz-123', 'po-1');
    });
  });

  it('triggers PDF document download for Purchase Order', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });

    const downloadButtons = screen.getAllByTitle('Download PDF Purchase Order');
    fireEvent.click(downloadButtons[0]);

    await waitFor(() => {
      expect(downloadDocumentPdf).toHaveBeenCalledWith({
        businessId: 'biz-123',
        docType: 'purchase-order',
        docId: 'po-1',
      });
    });
  });

  it('opens and submits a new Purchase Order', async () => {
    businessApi.createPurchaseOrder.mockResolvedValueOnce({ id: 'po-new', po_number: 'PO-0003' });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });

    const newPoBtn = screen.getByRole('button', { name: /New Purchase Order/ });
    fireEvent.click(newPoBtn);

    await waitFor(() => {
      expect(screen.getByText('Products & Quantities')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Create Purchase Order/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(businessApi.createPurchaseOrder).toHaveBeenCalled();
    });
  });

  it('records a Goods Received Note from approved PO', async () => {
    businessApi.createGrn.mockResolvedValueOnce({ id: 'grn-new', grn_number: 'GRN-0002' });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });

    const receiveBtn = screen.getByRole('button', { name: /Receive Goods \(GRN\)/ });
    fireEvent.click(receiveBtn);

    await waitFor(() => {
      expect(screen.getByText('Record Goods Received Note (GRN)')).toBeInTheDocument();
    });
  });

  it('records a Supplier Bill against GRN', async () => {
    businessApi.createSupplierBill.mockResolvedValueOnce({ id: 'bill-new', bill_number: 'BILL-0002' });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });

    const recordBillBtn = screen.getByRole('button', { name: /Record Bill/ });
    fireEvent.click(recordBillBtn);

    await waitFor(() => {
      expect(screen.getByText('Record Supplier Bill (Invoice)')).toBeInTheDocument();
    });

    const postBillBtn = screen.getByRole('button', { name: /Post Bill to Accounts Payable/ });
    fireEvent.click(postBillBtn);

    await waitFor(() => {
      expect(businessApi.createSupplierBill).toHaveBeenCalled();
    });
  });

  it('records a Supplier Payment settling Accounts Payable', async () => {
    businessApi.createSupplierPayment.mockResolvedValueOnce({ id: 'pay-new' });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });

    const payBtn = screen.getByRole('button', { name: /Pay Supplier/ });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(screen.getByText('Record Supplier Payment')).toBeInTheDocument();
    });

    // Enter payment amount
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '5000' } });

    const postPayBtn = screen.getByRole('button', { name: /Confirm & Post Payment/ });
    fireEvent.click(postPayBtn);

    await waitFor(() => {
      expect(businessApi.createSupplierPayment).toHaveBeenCalled();
    });
  });

  it('blocks demo accounts from submitting purchase orders', async () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'demo-1', name: 'Demo Guest', isDemo: true },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('PO-0001')).toBeInTheDocument();
    });

    const newPoBtn = screen.getByRole('button', { name: /New Purchase Order/ });
    fireEvent.click(newPoBtn);

    await waitFor(() => {
      expect(screen.getByText('Create Purchase Order')).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Create Purchase Order/ });
    fireEvent.click(submitBtn);

    expect(businessApi.createPurchaseOrder).not.toHaveBeenCalled();
  });
});

