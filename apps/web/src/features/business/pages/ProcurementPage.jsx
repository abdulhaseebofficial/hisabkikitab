import { useEffect, useState, useMemo } from 'react';
import {
  ShoppingBag,
  FileText,
  PackageCheck,
  Receipt,
  Wallet,
  RotateCcw,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  Download,
  AlertCircle,
  ChevronDown,
  Building,
  ArrowRight,
  Printer,
  Eye,
  FilePlus,
  Undo2,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import Badge from '../../../shared/components/ui/Badge';
import Spinner from '../../../shared/components/ui/Spinner';
import EmptyState from '../../../shared/components/ui/EmptyState';
import { useBusiness } from '../BusinessContext';
import { useAuth } from '../../auth';
import businessApi from '../api/businessApi';
import useT from '../../../shared/i18n/I18nProvider';
import { formatRs, toMinor, fromMinor } from '../../../shared/utils/money';
import { allowOnlyNumbers, sanitizeNumericString } from '../../../shared/utils/inputs';
import { DOCUMENT_TYPES, downloadDocumentPdf, previewDocumentPdf } from '../utils/businessDocuments';

const STATUS_TONES = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'brand',
  rejected: 'danger',
  sent_to_supplier: 'brand',
  partially_received: 'warning',
  fully_received: 'safe',
  billed: 'safe',
  unpaid: 'danger',
  partially_paid: 'warning',
  paid: 'safe',
  converted_to_po: 'safe',
  cancelled: 'neutral',
};

export default function ProcurementPage() {
  const { activeBusinessId, activeBusiness, role } = useBusiness();
  const { user } = useAuth();
  const isDemo = Boolean(user?.isDemo);
  const { t, language } = useT();

  const isUrdu = language === 'ur';
  const canApprove = ['owner', 'admin'].includes(role);
  const canManageProcurement = ['owner', 'admin', 'inventory_manager', 'accountant'].includes(role);

  // Active Tab: 'requests' | 'orders' | 'grns' | 'bills' | 'payments' | 'returns'
  const [activeTab, setActiveTab] = useState('orders');

  // Master Lists
  const [requests, setRequests] = useState([]);
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);
  const [bills, setBills] = useState([]);
  const [payments, setPayments] = useState([]);
  const [returns, setReturns] = useState([]);

  // Reference Catalogs
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [accounts, setAccounts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [downloadingDocId, setDownloadingDocId] = useState(null);

  // Modals
  const [prModalOpen, setPrModalOpen] = useState(false);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [grnModalOpen, setGrnModalOpen] = useState(false);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);

  // Reject dialog state
  const [rejectTarget, setRejectTarget] = useState({ type: null, id: null });
  const [rejectReason, setRejectReason] = useState('');

  // ---------------------------------------------------------------------------
  // Forms State
  // ---------------------------------------------------------------------------

  // 1. Purchase Request Form
  const [prDepartment, setPrDepartment] = useState('General');
  const [prPriority, setPrPriority] = useState('medium');
  const [prRequiredDate, setPrRequiredDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
  const [prNotes, setPrNotes] = useState('');
  const [prItems, setPrItems] = useState([{ productName: '', quantity: '1', estimatedUnitCost: '', notes: '' }]);

  // 2. Purchase Order Form
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poDate, setPoDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [poDeliveryDate, setPoDeliveryDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
  const [poPaymentTerms, setPoPaymentTerms] = useState('net_30');
  const [poNotes, setPoNotes] = useState('');
  const [poFromPrId, setPoFromPrId] = useState(null);
  const [poItems, setPoItems] = useState([{ productId: '', quantity: '1', unitPrice: '', tax: '0', discount: '0' }]);

  // 3. GRN Form
  const [grnPoId, setGrnPoId] = useState('');
  const [grnWarehouseId, setGrnWarehouseId] = useState('');
  const [grnReceiveDate, setGrnReceiveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [grnChallanNumber, setGrnChallanNumber] = useState('');
  const [grnNotes, setGrnNotes] = useState('');
  const [grnItems, setGrnItems] = useState([]); // populated from selected PO

  // 4. Supplier Bill Form
  const [billSupplierId, setBillSupplierId] = useState('');
  const [billGrnId, setBillGrnId] = useState('');
  const [billInvoiceNumber, setBillInvoiceNumber] = useState('');
  const [billDate, setBillDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [billDueDate, setBillDueDate] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
  const [billNotes, setBillNotes] = useState('');
  const [billDiscount, setBillDiscount] = useState('0');
  const [billItems, setBillItems] = useState([{ productId: '', description: '', quantity: '1', unitPrice: '', tax: '0' }]);

  // 5. Supplier Payment Form
  const [paySupplierId, setPaySupplierId] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState('cash');
  const [payAccountId, setPayAccountId] = useState('');
  const [payBillId, setPayBillId] = useState('');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // 6. Purchase Return Form
  const [retSupplierId, setRetSupplierId] = useState('');
  const [retDate, setRetDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [retRefundMethod, setRetRefundMethod] = useState('credit_note');
  const [retAccountId, setRetAccountId] = useState('');
  const [retReason, setRetReason] = useState('Damaged goods / defective stock');
  const [retNotes, setRetNotes] = useState('');
  const [retItems, setRetItems] = useState([{ productId: '', quantity: '1', unitCost: '' }]);

  const [saving, setSaving] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const fetchAllData = async () => {
    if (!activeBusinessId) return;
    setLoading(true);
    try {
      const [
        reqRes,
        poRes,
        grnRes,
        billRes,
        payRes,
        retRes,
        suppRes,
        prodRes,
        whRes,
        accRes,
      ] = await Promise.all([
        businessApi.listPurchaseRequests(activeBusinessId).catch(() => []),
        businessApi.listPurchaseOrders(activeBusinessId).catch(() => []),
        businessApi.listGrns(activeBusinessId).catch(() => []),
        businessApi.listSupplierBills(activeBusinessId).catch(() => []),
        businessApi.listPayments(activeBusinessId, { paymentType: 'supplier_payment' }).catch(() => []),
        businessApi.listPurchaseReturns(activeBusinessId).catch(() => []),
        businessApi.listSuppliers(activeBusinessId).catch(() => []),
        businessApi.listProducts(activeBusinessId).catch(() => []),
        businessApi.listWarehouses(activeBusinessId).catch(() => []),
        businessApi.listAccounts(activeBusinessId).catch(() => []),
      ]);

      setRequests(reqRes || []);
      setOrders(poRes || []);
      setGrns(grnRes || []);
      setBills(billRes || []);
      setPayments(payRes || []);
      setReturns(retRes || []);
      setSuppliers(suppRes || []);
      setProducts(prodRes || []);
      setWarehouses(whRes || []);
      setAccounts(accRes || []);
    } catch (err) {
      console.error('Failed to load procurement data:', err);
      toast.error('Failed to refresh procurement records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [activeBusinessId]);

  // ---------------------------------------------------------------------------
  // Handlers: Purchase Request
  // ---------------------------------------------------------------------------
  const handleOpenCreatePr = () => {
    setPrDepartment('General');
    setPrPriority('medium');
    setPrRequiredDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
    setPrNotes('');
    setPrItems([{ productName: '', quantity: '1', estimatedUnitCost: '', notes: '' }]);
    setPrModalOpen(true);
  };

  const handleAddPrItem = () => {
    setPrItems([...prItems, { productName: '', quantity: '1', estimatedUnitCost: '', notes: '' }]);
  };

  const handleRemovePrItem = (idx) => {
    if (prItems.length <= 1) return;
    setPrItems(prItems.filter((_, i) => i !== idx));
  };

  const handleSubmitPr = async (e) => {
    e.preventDefault();
    if (isDemo) {
      toast.error('Demo accounts cannot create purchase requests');
      return;
    }
    const validItems = prItems.filter((item) => item.productName.trim() && Number(item.quantity) > 0);
    if (!validItems.length) {
      toast.error('Please specify at least one valid item');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        department: prDepartment,
        priority: prPriority,
        requiredByDate: prRequiredDate,
        notes: prNotes,
        items: validItems.map((item) => ({
          productName: item.productName.trim(),
          quantity: Number(item.quantity),
          estimatedUnitCostMinor: item.estimatedUnitCost ? toMinor(item.estimatedUnitCost).toString() : '0',
          notes: item.notes || '',
        })),
      };

      await businessApi.createPurchaseRequest(activeBusinessId, payload);
      toast.success('Purchase request created');
      setPrModalOpen(false);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to create request');
    } finally {
      setSaving(false);
    }
  };

  const handlePrAction = async (requestId, action, reason = '') => {
    if (isDemo) {
      toast.error('Demo accounts cannot perform mutations');
      return;
    }
    try {
      if (action === 'submit') {
        await businessApi.submitPurchaseRequest(activeBusinessId, requestId);
        toast.success('Submitted for approval');
      } else if (action === 'approve') {
        await businessApi.approvePurchaseRequest(activeBusinessId, requestId);
        toast.success('Purchase request approved');
      } else if (action === 'reject') {
        await businessApi.rejectPurchaseRequest(activeBusinessId, requestId, { reason });
        toast.success('Purchase request rejected');
      }
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Action failed');
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Purchase Order
  // ---------------------------------------------------------------------------
  const handleOpenCreatePo = (fromPr = null) => {
    if (fromPr) {
      setPoFromPrId(fromPr.id);
      setPoNotes(`Created from Purchase Request #${fromPr.request_number}. ${fromPr.notes || ''}`);
      setPoItems(
        fromPr.items?.map((item) => ({
          productId: '',
          customName: item.product_name,
          quantity: String(item.quantity || 1),
          unitPrice: item.estimated_unit_cost_minor ? String(fromMinor(item.estimated_unit_cost_minor)) : '',
          tax: '0',
          discount: '0',
        })) || [{ productId: '', quantity: '1', unitPrice: '', tax: '0', discount: '0' }]
      );
    } else {
      setPoFromPrId(null);
      setPoSupplierId(suppliers[0]?.id || '');
      setPoDate(new Date().toISOString().split('T')[0]);
      setPoDeliveryDate(new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
      setPoPaymentTerms('net_30');
      setPoNotes('');
      setPoItems([{ productId: products[0]?.id || '', quantity: '1', unitPrice: products[0]?.purchase_price_minor ? String(fromMinor(products[0].purchase_price_minor)) : '', tax: '0', discount: '0' }]);
    }
    setPoModalOpen(true);
  };

  const handleAddPoItem = () => {
    setPoItems([...poItems, { productId: products[0]?.id || '', quantity: '1', unitPrice: '', tax: '0', discount: '0' }]);
  };

  const handleRemovePoItem = (idx) => {
    if (poItems.length <= 1) return;
    setPoItems(poItems.filter((_, i) => i !== idx));
  };

  const handlePoProductChange = (idx, prodId) => {
    const prod = products.find((p) => p.id === prodId);
    const updated = [...poItems];
    updated[idx].productId = prodId;
    if (prod && prod.purchase_price_minor) {
      updated[idx].unitPrice = String(fromMinor(prod.purchase_price_minor));
    }
    setPoItems(updated);
  };

  const handleSubmitPo = async (e) => {
    e.preventDefault();
    if (isDemo) {
      toast.error('Demo accounts cannot create purchase orders');
      return;
    }
    if (!poSupplierId) {
      toast.error('Please select a supplier');
      return;
    }
    const validItems = poItems.filter((i) => i.productId && Number(i.quantity) > 0);
    if (!validItems.length) {
      toast.error('Please select at least one valid product item');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplierId: poSupplierId,
        purchaseRequestId: poFromPrId || null,
        date: poDate,
        expectedDeliveryDate: poDeliveryDate,
        paymentTerms: poPaymentTerms,
        notes: poNotes,
        items: validItems.map((item) => ({
          productId: item.productId,
          quantityOrdered: Number(item.quantity),
          unitPriceMinor: toMinor(item.unitPrice || '0').toString(),
          taxMinor: toMinor(item.tax || '0').toString(),
          discountMinor: toMinor(item.discount || '0').toString(),
        })),
      };

      await businessApi.createPurchaseOrder(activeBusinessId, payload);
      toast.success('Purchase order created successfully');
      setPoModalOpen(false);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to create PO');
    } finally {
      setSaving(false);
    }
  };

  const handlePoAction = async (poId, action, reason = '') => {
    if (isDemo) {
      toast.error('Demo accounts cannot perform mutations');
      return;
    }
    try {
      if (action === 'submit') {
        await businessApi.submitPurchaseOrder(activeBusinessId, poId);
        toast.success('PO submitted for approval');
      } else if (action === 'approve') {
        await businessApi.approvePurchaseOrder(activeBusinessId, poId);
        toast.success('PO approved');
      } else if (action === 'reject') {
        await businessApi.rejectPurchaseOrder(activeBusinessId, poId, { reason });
        toast.success('PO rejected');
      } else if (action === 'send') {
        await businessApi.sendPurchaseOrder(activeBusinessId, poId);
        toast.success('PO marked as sent to supplier');
      }
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Action failed');
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Goods Received Note (GRN)
  // ---------------------------------------------------------------------------
  const handleOpenCreateGrn = (targetPo = null) => {
    const defaultPo = targetPo || orders.find((o) => ['approved', 'sent_to_supplier', 'partially_received'].includes(o.status));
    setGrnPoId(defaultPo?.id || '');
    setGrnWarehouseId(warehouses[0]?.id || '');
    setGrnReceiveDate(new Date().toISOString().split('T')[0]);
    setGrnChallanNumber('');
    setGrnNotes('');

    if (defaultPo && defaultPo.items) {
      const remainingItems = defaultPo.items
        .map((item) => {
          const rem = Math.max(0, Number(item.quantity_ordered) - Number(item.quantity_received || 0));
          return {
            poItemId: item.id,
            productId: item.product_id,
            productName: item.product_name,
            quantityOrdered: Number(item.quantity_ordered),
            alreadyReceived: Number(item.quantity_received || 0),
            quantityReceived: String(rem),
            unitCostMinor: item.unit_price_minor,
            batchNumber: '',
            expiryDate: '',
          };
        })
        .filter((item) => Number(item.quantityReceived) > 0);
      setGrnItems(remainingItems);
    } else {
      setGrnItems([]);
    }
    setGrnModalOpen(true);
  };

  const handleGrnPoChange = (poId) => {
    setGrnPoId(poId);
    const po = orders.find((o) => o.id === poId);
    if (po && po.items) {
      const remainingItems = po.items
        .map((item) => {
          const rem = Math.max(0, Number(item.quantity_ordered) - Number(item.quantity_received || 0));
          return {
            poItemId: item.id,
            productId: item.product_id,
            productName: item.product_name,
            quantityOrdered: Number(item.quantity_ordered),
            alreadyReceived: Number(item.quantity_received || 0),
            quantityReceived: String(rem),
            unitCostMinor: item.unit_price_minor,
            batchNumber: '',
            expiryDate: '',
          };
        })
        .filter((item) => Number(item.quantityReceived) > 0);
      setGrnItems(remainingItems);
    } else {
      setGrnItems([]);
    }
  };

  const handleSubmitGrn = async (e) => {
    e.preventDefault();
    if (isDemo) {
      toast.error('Demo accounts cannot record goods receipt');
      return;
    }
    if (!grnPoId) {
      toast.error('Please select an active Purchase Order');
      return;
    }
    const receivingItems = grnItems.filter((i) => Number(i.quantityReceived) > 0);
    if (!receivingItems.length) {
      toast.error('Please specify quantity received for at least one item');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        poId: grnPoId,
        warehouseId: grnWarehouseId || null,
        receiveDate: grnReceiveDate,
        deliveryChallanNumber: grnChallanNumber || null,
        notes: grnNotes || null,
        items: receivingItems.map((item) => ({
          poItemId: item.poItemId,
          productId: item.productId,
          quantityReceived: Number(item.quantityReceived),
          unitCostMinor: item.unitCostMinor,
          batchNumber: item.batchNumber || null,
          expiryDate: item.expiryDate || null,
        })),
      };

      await businessApi.createGrn(activeBusinessId, payload);
      toast.success('Goods Received Note recorded & inventory updated!');
      setGrnModalOpen(false);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to record GRN');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Supplier Bill (Invoice)
  // ---------------------------------------------------------------------------
  const handleOpenCreateBill = (fromGrn = null) => {
    if (fromGrn) {
      setBillGrnId(fromGrn.id);
      setBillSupplierId(fromGrn.supplier_id || '');
      setBillInvoiceNumber(fromGrn.delivery_challan_number || '');
      setBillDate(fromGrn.receive_date || new Date().toISOString().split('T')[0]);
      setBillDueDate(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setBillDiscount('0');
      setBillNotes(`Billed against GRN #${fromGrn.grn_number}`);

      const items = fromGrn.items?.map((item) => ({
        productId: item.product_id,
        poItemId: item.po_item_id || null,
        description: item.product_name,
        quantity: String(item.quantity_received || 1),
        unitPrice: item.unit_cost_minor ? String(fromMinor(item.unit_cost_minor)) : '0',
        tax: '0',
      })) || [{ productId: '', description: '', quantity: '1', unitPrice: '', tax: '0' }];
      setBillItems(items);
    } else {
      setBillGrnId('');
      setBillSupplierId(suppliers[0]?.id || '');
      setBillInvoiceNumber('');
      setBillDate(new Date().toISOString().split('T')[0]);
      setBillDueDate(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
      setBillDiscount('0');
      setBillNotes('');
      setBillItems([{ productId: products[0]?.id || '', description: products[0]?.name || 'Item', quantity: '1', unitPrice: products[0]?.purchase_price_minor ? String(fromMinor(products[0].purchase_price_minor)) : '', tax: '0' }]);
    }
    setBillModalOpen(true);
  };

  const handleAddBillItem = () => {
    setBillItems([...billItems, { productId: products[0]?.id || '', description: '', quantity: '1', unitPrice: '', tax: '0' }]);
  };

  const handleRemoveBillItem = (idx) => {
    if (billItems.length <= 1) return;
    setBillItems(billItems.filter((_, i) => i !== idx));
  };

  const handleSubmitBill = async (e) => {
    e.preventDefault();
    if (isDemo) {
      toast.error('Demo accounts cannot create supplier bills');
      return;
    }
    if (!billSupplierId) {
      toast.error('Please select a supplier');
      return;
    }
    const validItems = billItems.filter((i) => Number(i.quantity) > 0);
    if (!validItems.length) {
      toast.error('At least one bill item is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplierId: billSupplierId,
        grnId: billGrnId || null,
        supplierInvoiceNumber: billInvoiceNumber || null,
        billDate,
        dueDate: billDueDate,
        discountMinor: toMinor(billDiscount || '0').toString(),
        notes: billNotes,
        items: validItems.map((item) => ({
          productId: item.productId || null,
          poItemId: item.poItemId || null,
          description: item.description || 'Bill Line Item',
          quantity: Number(item.quantity),
          unitPriceMinor: toMinor(item.unitPrice || '0').toString(),
          taxMinor: toMinor(item.tax || '0').toString(),
        })),
      };

      await businessApi.createSupplierBill(activeBusinessId, payload);
      toast.success('Supplier Bill recorded to Khata & General Ledger');
      setBillModalOpen(false);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to record bill');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Supplier Payment
  // ---------------------------------------------------------------------------
  const handleOpenPayModal = (targetBill = null) => {
    if (targetBill) {
      setPaySupplierId(targetBill.supplier_id);
      setPayBillId(targetBill.id);
      setPayAmount(targetBill.balance_due_minor ? String(fromMinor(targetBill.balance_due_minor)) : '');
      setPayNotes(`Payment for Bill #${targetBill.bill_number}`);
    } else {
      setPaySupplierId(suppliers[0]?.id || '');
      setPayBillId('');
      setPayAmount('');
      setPayNotes('');
    }
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayMethod('cash');
    const cashAcc = accounts.find((a) => a.subtype === 'cash') || accounts[0];
    setPayAccountId(cashAcc?.id || '');
    setPayReference('');
    setPayModalOpen(true);
  };

  const handleSubmitPayment = async (e) => {
    e.preventDefault();
    if (isDemo) {
      toast.error('Demo accounts cannot disburse supplier payments');
      return;
    }
    if (!paySupplierId) {
      toast.error('Please select a supplier');
      return;
    }
    if (!payAmount || Number(payAmount) <= 0) {
      toast.error('Please enter a valid positive payment amount');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplierId: paySupplierId,
        amountMinor: toMinor(payAmount).toString(),
        date: payDate,
        paymentMethod: payMethod,
        paymentAccountId: payAccountId || null,
        billId: payBillId || null,
        reference: payReference || null,
        notes: payNotes || null,
      };

      await businessApi.createSupplierPayment(activeBusinessId, payload);
      toast.success('Supplier payment recorded & Khata updated');
      setPayModalOpen(false);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Payment failed');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Handlers: Purchase Return (Debit Note)
  // ---------------------------------------------------------------------------
  const handleOpenReturnModal = () => {
    setRetSupplierId(suppliers[0]?.id || '');
    setRetDate(new Date().toISOString().split('T')[0]);
    setRetRefundMethod('credit_note');
    const cashAcc = accounts.find((a) => a.subtype === 'cash') || accounts[0];
    setRetAccountId(cashAcc?.id || '');
    setRetReason('Damaged goods / defective stock');
    setRetNotes('');
    setRetItems([{ productId: products[0]?.id || '', quantity: '1', unitCost: products[0]?.purchase_price_minor ? String(fromMinor(products[0].purchase_price_minor)) : '' }]);
    setReturnModalOpen(true);
  };

  const handleAddReturnItem = () => {
    setRetItems([...retItems, { productId: products[0]?.id || '', quantity: '1', unitCost: '' }]);
  };

  const handleRemoveReturnItem = (idx) => {
    if (retItems.length <= 1) return;
    setRetItems(retItems.filter((_, i) => i !== idx));
  };

  const handleSubmitReturn = async (e) => {
    e.preventDefault();
    if (isDemo) {
      toast.error('Demo accounts cannot record purchase returns');
      return;
    }
    if (!retSupplierId) {
      toast.error('Please select a supplier');
      return;
    }
    const validItems = retItems.filter((i) => i.productId && Number(i.quantity) > 0);
    if (!validItems.length) {
      toast.error('Please specify at least one return item');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        supplierId: retSupplierId,
        returnDate: retDate,
        refundMethod: retRefundMethod,
        refundAccountId: retRefundMethod === 'cash' || retRefundMethod === 'bank' ? retAccountId : null,
        reason: retReason,
        notes: retNotes,
        items: validItems.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitCostMinor: item.unitCost ? toMinor(item.unitCost).toString() : undefined,
        })),
      };

      await businessApi.createPurchaseReturn(activeBusinessId, payload);
      toast.success('Purchase Return recorded & stock deducted');
      setReturnModalOpen(false);
      fetchAllData();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Return failed');
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // PDF Download Helper
  // ---------------------------------------------------------------------------
  const handleDownloadDoc = async (docType, docId) => {
    if (!activeBusinessId) return;
    setDownloadingDocId(docId);
    try {
      await downloadDocumentPdf({
        businessId: activeBusinessId,
        docType,
        docId,
      });
    } catch (err) {
      // Error is toasted inside downloadDocumentPdf
    } finally {
      setDownloadingDocId(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Filtered Lists
  // ---------------------------------------------------------------------------
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const matchesSearch = !searchQuery || r.request_number?.toLowerCase().includes(searchQuery.toLowerCase()) || r.department?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [requests, searchQuery, statusFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch = !searchQuery || o.po_number?.toLowerCase().includes(searchQuery.toLowerCase()) || o.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const filteredGrns = useMemo(() => {
    return grns.filter((g) => {
      return !searchQuery || g.grn_number?.toLowerCase().includes(searchQuery.toLowerCase()) || g.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) || g.delivery_challan_number?.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [grns, searchQuery]);

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const matchesSearch = !searchQuery || b.bill_number?.toLowerCase().includes(searchQuery.toLowerCase()) || b.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) || b.supplier_invoice_number?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [bills, searchQuery, statusFilter]);

  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      return !searchQuery || p.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) || p.reference?.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [payments, searchQuery]);

  const filteredReturns = useMemo(() => {
    return returns.filter((r) => {
      return !searchQuery || r.return_number?.toLowerCase().includes(searchQuery.toLowerCase()) || r.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [returns, searchQuery]);

  // Selected supplier balance lookup helper
  const selectedSupplierBalance = useMemo(() => {
    const s = suppliers.find((sup) => sup.id === paySupplierId);
    return s?.current_balance_minor ? fromMinor(s.current_balance_minor) : 0;
  }, [suppliers, paySupplierId]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="h-6 w-6 text-brand-600 dark:text-brand-400" />
            {isUrdu ? 'خریداری و سپلائی چین (Procurement)' : 'Procurement & Purchasing'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {isUrdu
              ? 'مکمل پروکیورمنٹ سائیکل: فرمائش، خریداری آرڈر (PO)، وصولی رسید (GRN)، اور بل ادائیگی۔'
              : 'End-to-end purchasing lifecycle: Requisitions, Purchase Orders, Goods Receipt (GRN), Supplier Bills, and Returns.'}
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => handleOpenCreatePo()}>
            <Plus className="h-4 w-4 mr-1" />
            {isUrdu ? 'نیا خریداری آرڈر (PO)' : 'New Purchase Order'}
          </Button>

          <Button variant="outline" size="sm" onClick={() => handleOpenCreateGrn()}>
            <PackageCheck className="h-4 w-4 mr-1" />
            {isUrdu ? 'سامان وصولی (GRN)' : 'Receive Goods (GRN)'}
          </Button>

          <Button variant="outline" size="sm" onClick={() => handleOpenCreateBill()}>
            <Receipt className="h-4 w-4 mr-1" />
            {isUrdu ? 'انوائس بل درج کریں' : 'Record Bill'}
          </Button>

          <Button variant="outline" size="sm" onClick={() => handleOpenPayModal()}>
            <Wallet className="h-4 w-4 mr-1" />
            {isUrdu ? 'ادائیگی کریں' : 'Pay Supplier'}
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { id: 'orders', label: 'Purchase Orders (PO)', icon: ShoppingBag, count: orders.length },
          { id: 'grns', label: 'Goods Receipts (GRN)', icon: PackageCheck, count: grns.length },
          { id: 'bills', label: 'Supplier Bills (Invoices)', icon: Receipt, count: bills.length },
          { id: 'payments', label: 'Supplier Payments', icon: Wallet, count: payments.length },
          { id: 'requests', label: 'Purchase Requests', icon: FileText, count: requests.length },
          { id: 'returns', label: 'Purchase Returns (Debit Notes)', icon: RotateCcw, count: returns.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setStatusFilter('all');
                setSearchQuery('');
              }}
              className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800/60'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span className="ml-1 rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={isUrdu ? 'تلاش کریں...' : 'Search by number or supplier...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm placeholder-slate-400 focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>

        {['orders', 'requests', 'bills'].includes(activeTab) && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <option value="all">All Statuses</option>
              {activeTab === 'orders' && (
                <>
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="sent_to_supplier">Sent to Supplier</option>
                  <option value="partially_received">Partially Received</option>
                  <option value="fully_received">Fully Received</option>
                  <option value="billed">Billed</option>
                  <option value="rejected">Rejected</option>
                </>
              )}
              {activeTab === 'requests' && (
                <>
                  <option value="draft">Draft</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="approved">Approved</option>
                  <option value="converted_to_po">Converted to PO</option>
                  <option value="rejected">Rejected</option>
                </>
              )}
              {activeTab === 'bills' && (
                <>
                  <option value="unpaid">Unpaid</option>
                  <option value="partially_paid">Partially Paid</option>
                  <option value="paid">Paid</option>
                </>
              )}
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner className="h-8 w-8 text-brand-600" />
        </div>
      ) : (
        <>
          {/* TAB 1: PURCHASE ORDERS */}
          {activeTab === 'orders' && (
            <div className="space-y-4">
              {!filteredOrders.length ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="No Purchase Orders found"
                  description="Create a purchase order to request items and formalize pricing from your suppliers."
                  actionLabel="Create Purchase Order"
                  onAction={() => handleOpenCreatePo()}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">PO Number</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Delivery Date</th>
                        <th className="px-4 py-3 text-right">Total Amount</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredOrders.map((po) => (
                        <tr key={po.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {po.po_number}
                          </td>
                          <td className="px-4 py-3">{po.supplier_name || 'N/A'}</td>
                          <td className="px-4 py-3">{po.date}</td>
                          <td className="px-4 py-3">{po.expected_delivery_date || '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                            {formatRs(po.total_amount_minor)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={STATUS_TONES[po.status] || 'neutral'}>
                              {po.status?.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Workflow buttons */}
                              {po.status === 'draft' && (
                                <Button size="xs" variant="outline" onClick={() => handlePoAction(po.id, 'submit')}>
                                  Submit
                                </Button>
                              )}
                              {po.status === 'pending_approval' && canApprove && (
                                <>
                                  <Button size="xs" variant="safe" onClick={() => handlePoAction(po.id, 'approve')}>
                                    Approve
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="danger"
                                    onClick={() => {
                                      setRejectTarget({ type: 'po', id: po.id });
                                      setRejectReason('');
                                      setRejectModalOpen(true);
                                    }}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              {po.status === 'approved' && (
                                <Button size="xs" variant="primary" onClick={() => handlePoAction(po.id, 'send')}>
                                  <Send className="h-3 w-3 mr-1" />
                                  Send
                                </Button>
                              )}
                              {['sent_to_supplier', 'partially_received'].includes(po.status) && (
                                <Button size="xs" variant="outline" onClick={() => handleOpenCreateGrn(po)}>
                                  <PackageCheck className="h-3 w-3 mr-1" />
                                  GRN
                                </Button>
                              )}

                              {/* Download PDF button */}
                              <Button
                                size="xs"
                                variant="ghost"
                                disabled={downloadingDocId === po.id}
                                onClick={() => handleDownloadDoc(DOCUMENT_TYPES.PURCHASE_ORDER, po.id)}
                                title="Download PDF Purchase Order"
                              >
                                {downloadingDocId === po.id ? (
                                  <Spinner className="h-3.5 w-3.5 text-brand-600" />
                                ) : (
                                  <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GOODS RECEIVED NOTES (GRN) */}
          {activeTab === 'grns' && (
            <div className="space-y-4">
              {!filteredGrns.length ? (
                <EmptyState
                  icon={PackageCheck}
                  title="No Goods Received Notes"
                  description="When ordered stock arrives at your shop or warehouse, record a GRN to update stock counts and weighted average cost."
                  actionLabel="Record Goods Receipt"
                  onAction={() => handleOpenCreateGrn()}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">GRN Number</th>
                        <th className="px-4 py-3">PO Reference</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Receive Date</th>
                        <th className="px-4 py-3">Challan / D.C #</th>
                        <th className="px-4 py-3 text-right">Received Valuation</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredGrns.map((grn) => (
                        <tr key={grn.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {grn.grn_number}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{grn.po_number || 'N/A'}</td>
                          <td className="px-4 py-3">{grn.supplier_name || 'N/A'}</td>
                          <td className="px-4 py-3">{grn.receive_date}</td>
                          <td className="px-4 py-3">{grn.delivery_challan_number || '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                            {formatRs(grn.total_received_value_minor)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button size="xs" variant="outline" onClick={() => handleOpenCreateBill(grn)}>
                                <Receipt className="h-3 w-3 mr-1" />
                                Bill
                              </Button>

                              <Button
                                size="xs"
                                variant="ghost"
                                disabled={downloadingDocId === grn.id}
                                onClick={() => handleDownloadDoc(DOCUMENT_TYPES.GOODS_RECEIVED_NOTE, grn.id)}
                                title="Download GRN PDF"
                              >
                                {downloadingDocId === grn.id ? (
                                  <Spinner className="h-3.5 w-3.5 text-brand-600" />
                                ) : (
                                  <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SUPPLIER BILLS & INVOICES */}
          {activeTab === 'bills' && (
            <div className="space-y-4">
              {!filteredBills.length ? (
                <EmptyState
                  icon={Receipt}
                  title="No Supplier Bills recorded"
                  description="Record supplier invoices to update your Accounts Payable (Khata) and clear accrued purchase liabilities."
                  actionLabel="Record Supplier Bill"
                  onAction={() => handleOpenCreateBill()}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Bill Number</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Invoice #</th>
                        <th className="px-4 py-3">Bill Date</th>
                        <th className="px-4 py-3">Due Date</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-right">Balance Due</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredBills.map((bill) => (
                        <tr key={bill.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {bill.bill_number}
                          </td>
                          <td className="px-4 py-3">{bill.supplier_name || 'N/A'}</td>
                          <td className="px-4 py-3 font-mono text-xs">{bill.supplier_invoice_number || '—'}</td>
                          <td className="px-4 py-3">{bill.bill_date}</td>
                          <td className="px-4 py-3">{bill.due_date || '—'}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatRs(bill.total_amount_minor)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-danger">
                            {formatRs(bill.balance_due_minor)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={STATUS_TONES[bill.status] || 'neutral'}>
                              {bill.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {Number(bill.balance_due_minor) > 0 && (
                                <Button size="xs" variant="primary" onClick={() => handleOpenPayModal(bill)}>
                                  Pay
                                </Button>
                              )}

                              <Button
                                size="xs"
                                variant="ghost"
                                disabled={downloadingDocId === bill.id}
                                onClick={() => handleDownloadDoc(DOCUMENT_TYPES.SUPPLIER_BILL, bill.id)}
                                title="Download Bill PDF"
                              >
                                {downloadingDocId === bill.id ? (
                                  <Spinner className="h-3.5 w-3.5 text-brand-600" />
                                ) : (
                                  <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                                )}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SUPPLIER PAYMENTS */}
          {activeTab === 'payments' && (
            <div className="space-y-4">
              {!filteredPayments.length ? (
                <EmptyState
                  icon={Wallet}
                  title="No Supplier Payments recorded"
                  description="When you disburse cash or bank transfers to settle your supplier accounts, record it here."
                  actionLabel="Record Payment"
                  onAction={() => handleOpenPayModal()}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Payment Method</th>
                        <th className="px-4 py-3">Reference</th>
                        <th className="px-4 py-3 text-right">Amount Disbursed</th>
                        <th className="px-4 py-3 text-right">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredPayments.map((pay) => (
                        <tr key={pay.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3">{pay.date}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {pay.supplier_name || 'Supplier'}
                          </td>
                          <td className="px-4 py-3 uppercase text-xs font-medium text-slate-500">
                            {pay.payment_method}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">{pay.reference || '—'}</td>
                          <td className="px-4 py-3 text-right font-bold text-safe">
                            {formatRs(pay.amount_minor)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button
                              size="xs"
                              variant="ghost"
                              disabled={downloadingDocId === pay.id}
                              onClick={() => handleDownloadDoc(DOCUMENT_TYPES.PAYMENT_RECEIPT, pay.id)}
                              title="Download Payment Receipt PDF"
                            >
                              {downloadingDocId === pay.id ? (
                                <Spinner className="h-3.5 w-3.5 text-brand-600" />
                              ) : (
                                <Download className="h-3.5 w-3.5 text-slate-600 dark:text-slate-300" />
                              )}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: PURCHASE REQUESTS (REQUISITIONS) */}
          {activeTab === 'requests' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" variant="primary" onClick={handleOpenCreatePr}>
                  <Plus className="h-4 w-4 mr-1" />
                  New Purchase Request
                </Button>
              </div>

              {!filteredRequests.length ? (
                <EmptyState
                  icon={FileText}
                  title="No Purchase Requests"
                  description="Staff and branch managers can submit internal requisitions before a formal purchase order is placed."
                  actionLabel="Create Request"
                  onAction={handleOpenCreatePr}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Request #</th>
                        <th className="px-4 py-3">Department</th>
                        <th className="px-4 py-3">Required By</th>
                        <th className="px-4 py-3">Priority</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredRequests.map((pr) => (
                        <tr key={pr.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {pr.request_number}
                          </td>
                          <td className="px-4 py-3">{pr.department}</td>
                          <td className="px-4 py-3">{pr.required_by_date || '—'}</td>
                          <td className="px-4 py-3">
                            <Badge tone={pr.priority === 'urgent' ? 'danger' : pr.priority === 'high' ? 'warning' : 'neutral'}>
                              {pr.priority}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={STATUS_TONES[pr.status] || 'neutral'}>
                              {pr.status?.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {pr.status === 'draft' && (
                                <Button size="xs" variant="outline" onClick={() => handlePrAction(pr.id, 'submit')}>
                                  Submit
                                </Button>
                              )}
                              {pr.status === 'pending_approval' && canApprove && (
                                <>
                                  <Button size="xs" variant="safe" onClick={() => handlePrAction(pr.id, 'approve')}>
                                    Approve
                                  </Button>
                                  <Button
                                    size="xs"
                                    variant="danger"
                                    onClick={() => {
                                      setRejectTarget({ type: 'pr', id: pr.id });
                                      setRejectReason('');
                                      setRejectModalOpen(true);
                                    }}
                                  >
                                    Reject
                                  </Button>
                                </>
                              )}
                              {pr.status === 'approved' && (
                                <Button size="xs" variant="primary" onClick={() => handleOpenCreatePo(pr)}>
                                  Convert to PO
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: PURCHASE RETURNS (DEBIT NOTES) */}
          {activeTab === 'returns' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button size="sm" variant="danger" onClick={handleOpenReturnModal}>
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Record Purchase Return (Debit Note)
                </Button>
              </div>

              {!filteredReturns.length ? (
                <EmptyState
                  icon={RotateCcw}
                  title="No Purchase Returns"
                  description="When defective or damaged stock is returned to suppliers, record a Debit Note to deduct stock and reduce liability."
                  actionLabel="Record Return"
                  onAction={handleOpenReturnModal}
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                  <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs uppercase text-slate-500 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Return Number</th>
                        <th className="px-4 py-3">Supplier</th>
                        <th className="px-4 py-3">Return Date</th>
                        <th className="px-4 py-3">Refund Method</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3 text-right">Return Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {filteredReturns.map((ret) => (
                        <tr key={ret.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                            {ret.return_number}
                          </td>
                          <td className="px-4 py-3">{ret.supplier_name || 'N/A'}</td>
                          <td className="px-4 py-3">{ret.return_date}</td>
                          <td className="px-4 py-3 capitalize text-xs">
                            {ret.refund_method?.replace(/_/g, ' ')}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-xs truncate">{ret.reason}</td>
                          <td className="px-4 py-3 text-right font-bold text-danger">
                            {formatRs(ret.total_amount_minor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE PURCHASE REQUEST                                          */}
      {/* ========================================================================= */}
      <Modal open={prModalOpen} onClose={() => setPrModalOpen(false)} title="New Purchase Request (Internal Requisition)">
        <form onSubmit={handleSubmitPr} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Department
              </label>
              <input
                type="text"
                value={prDepartment}
                onChange={(e) => setPrDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="e.g. Kitchen, Store, Branch"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <select
                value={prPriority}
                onChange={(e) => setPrPriority(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Required By Date
              </label>
              <input
                type="date"
                value={prRequiredDate}
                onChange={(e) => setPrRequiredDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Requested Items
              </label>
              <button
                type="button"
                onClick={handleAddPrItem}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                + Add Item
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {prItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <input
                    type="text"
                    placeholder="Product or item description"
                    value={item.productName}
                    onChange={(e) => {
                      const updated = [...prItems];
                      updated[idx].productName = e.target.value;
                      setPrItems(updated);
                    }}
                    className="flex-1 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Qty"
                    value={item.quantity}
                    onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                    onChange={(e) => {
                      const updated = [...prItems];
                      updated[idx].quantity = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                      setPrItems(updated);
                    }}
                    className="w-20 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Est. Rate Rs"
                    value={item.estimatedUnitCost}
                    onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                    onChange={(e) => {
                      const updated = [...prItems];
                      updated[idx].estimatedUnitCost = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                      setPrItems(updated);
                    }}
                    className="w-28 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                  {prItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePrItem(idx)}
                      className="text-danger hover:opacity-80 p-1"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Notes & Justification
            </label>
            <textarea
              rows="2"
              value={prNotes}
              onChange={(e) => setPrNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="Why are these items needed? Any specific brand requirements?"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setPrModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 mr-1" /> : null}
              Save Request
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 2: CREATE PURCHASE ORDER                                            */}
      {/* ========================================================================= */}
      <Modal open={poModalOpen} onClose={() => setPoModalOpen(false)} title="New Purchase Order (PO)">
        <form onSubmit={handleSubmitPo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Supplier *
              </label>
              <select
                value={poSupplierId}
                onChange={(e) => setPoSupplierId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.contact_person ? `(${s.contact_person})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Terms
              </label>
              <select
                value={poPaymentTerms}
                onChange={(e) => setPoPaymentTerms(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="cash_on_delivery">Cash on Delivery (COD)</option>
                <option value="net_15">Net 15 Days</option>
                <option value="net_30">Net 30 Days</option>
                <option value="advance_payment">Advance Payment</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                PO Date
              </label>
              <input
                type="date"
                value={poDate}
                onChange={(e) => setPoDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Expected Delivery Date
              </label>
              <input
                type="date"
                value={poDeliveryDate}
                onChange={(e) => setPoDeliveryDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Products & Quantities
              </label>
              <button
                type="button"
                onClick={handleAddPoItem}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                + Add Product
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {poItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <select
                    value={item.productId}
                    onChange={(e) => handlePoProductChange(idx, e.target.value)}
                    className="flex-1 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Current Stock: {p.current_stock || 0})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Qty"
                    value={item.quantity}
                    onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                    onChange={(e) => {
                      const updated = [...poItems];
                      updated[idx].quantity = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                      setPoItems(updated);
                    }}
                    className="w-20 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Unit Price Rs"
                    value={item.unitPrice}
                    onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                    onChange={(e) => {
                      const updated = [...poItems];
                      updated[idx].unitPrice = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                      setPoItems(updated);
                    }}
                    className="w-28 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  {poItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemovePoItem(idx)}
                      className="text-danger hover:opacity-80 p-1"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Notes & Delivery Instructions
            </label>
            <textarea
              rows="2"
              value={poNotes}
              onChange={(e) => setPoNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="e.g. Please deliver to back warehouse gate before 5 PM"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setPoModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 mr-1" /> : null}
              Create Purchase Order
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 3: GOODS RECEIVED NOTE (GRN)                                        */}
      {/* ========================================================================= */}
      <Modal open={grnModalOpen} onClose={() => setGrnModalOpen(false)} title="Record Goods Received Note (GRN)">
        <form onSubmit={handleSubmitGrn} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Select Purchase Order *
              </label>
              <select
                value={grnPoId}
                onChange={(e) => handleGrnPoChange(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              >
                <option value="">Select PO</option>
                {orders
                  .filter((o) => ['approved', 'sent_to_supplier', 'partially_received'].includes(o.status))
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.po_number} — {o.supplier_name} ({o.status})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Destination Warehouse / Store
              </label>
              <select
                value={grnWarehouseId}
                onChange={(e) => setGrnWarehouseId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Main Shop / Default</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Receive Date *
              </label>
              <input
                type="date"
                value={grnReceiveDate}
                onChange={(e) => setGrnReceiveDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Delivery Challan / Billty #
              </label>
              <input
                type="text"
                placeholder="e.g. DC-98412 or Bilty-44"
                value={grnChallanNumber}
                onChange={(e) => setGrnChallanNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Received Items & Quantities
            </label>
            {!grnItems.length ? (
              <p className="text-xs text-slate-500 italic p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                Please select a Purchase Order to view items pending receipt.
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {grnItems.map((item, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{item.productName}</p>
                      <p className="text-[11px] text-slate-500">
                        Ordered: {item.quantityOrdered} | Previously Rcvd: {item.alreadyReceived}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        Receive Qty:
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={item.quantityReceived}
                        onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                        onChange={(e) => {
                          const updated = [...grnItems];
                          const cleaned = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                          const max = item.quantityOrdered - item.alreadyReceived;
                          updated[idx].quantityReceived = cleaned !== '' && Number(cleaned) > max ? max : cleaned;
                          setGrnItems(updated);
                        }}
                        className="w-24 rounded-md border border-slate-300 p-1.5 text-xs text-right font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                        required
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Inspection Notes / Quality Remarks
            </label>
            <textarea
              rows="2"
              value={grnNotes}
              onChange={(e) => setGrnNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="e.g. All cartons inspected; seals intact."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setGrnModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving || !grnItems.length}>
              {saving ? <Spinner className="h-4 w-4 mr-1" /> : null}
              Confirm & Post GRN
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 4: RECORD SUPPLIER BILL (INVOICE)                                    */}
      {/* ========================================================================= */}
      <Modal open={billModalOpen} onClose={() => setBillModalOpen(false)} title="Record Supplier Bill (Invoice)">
        <form onSubmit={handleSubmitBill} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Supplier *
              </label>
              <select
                value={billSupplierId}
                onChange={(e) => setBillSupplierId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Supplier Invoice / Bill Number
              </label>
              <input
                type="text"
                placeholder="e.g. INV-2026-8812"
                value={billInvoiceNumber}
                onChange={(e) => setBillInvoiceNumber(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bill Date *
              </label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Due Date
              </label>
              <input
                type="date"
                value={billDueDate}
                onChange={(e) => setBillDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Invoice Line Items
              </label>
              <button
                type="button"
                onClick={handleAddBillItem}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                + Add Line
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {billItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => {
                      const updated = [...billItems];
                      updated[idx].description = e.target.value;
                      setBillItems(updated);
                    }}
                    className="flex-1 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Qty"
                    value={item.quantity}
                    onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                    onChange={(e) => {
                      const updated = [...billItems];
                      updated[idx].quantity = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                      setBillItems(updated);
                    }}
                    className="w-20 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Rate Rs"
                    value={item.unitPrice}
                    onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                    onChange={(e) => {
                      const updated = [...billItems];
                      updated[idx].unitPrice = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                      setBillItems(updated);
                    }}
                    className="w-28 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  {billItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBillItem(idx)}
                      className="text-danger hover:opacity-80 p-1"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Discount Received (Rs)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={billDiscount}
                onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                onChange={(e) => setBillDiscount(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Notes
              </label>
              <input
                type="text"
                placeholder="Remarks"
                value={billNotes}
                onChange={(e) => setBillNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setBillModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 mr-1" /> : null}
              Post Bill to Accounts Payable
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 5: RECORD SUPPLIER PAYMENT                                          */}
      {/* ========================================================================= */}
      <Modal open={payModalOpen} onClose={() => setPayModalOpen(false)} title="Record Supplier Payment">
        <form onSubmit={handleSubmitPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Supplier *
            </label>
            <select
              value={paySupplierId}
              onChange={(e) => {
                setPaySupplierId(e.target.value);
                setPayBillId('');
              }}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              required
            >
              <option value="">Select Supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Balance: Rs {fromMinor(s.current_balance_minor || 0).toLocaleString()})
                </option>
              ))}
            </select>
            {paySupplierId && (
              <p className="mt-1 text-xs text-slate-500">
                Current Khata Balance: <span className="font-bold text-danger">Rs {selectedSupplierBalance.toLocaleString()}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Amount (Rs) *
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={payAmount}
                onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                onChange={(e) => setPayAmount(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm font-bold dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Date *
              </label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Payment Method
              </label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="cash">Cash (Rokad)</option>
                <option value="bank">Bank Transfer / Cheque</option>
                <option value="wallet">Digital Wallet (Easypaisa/JazzCash)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Disbursement Account
              </label>
              <select
                value={payAccountId}
                onChange={(e) => setPayAccountId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {accounts
                  .filter((a) => ['cash', 'bank', 'wallet'].includes(a.subtype))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Allocate Against Specific Bill (Optional)
            </label>
            <select
              value={payBillId}
              onChange={(e) => setPayBillId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <option value="">General Khata Reduction (No specific bill)</option>
              {bills
                .filter((b) => b.supplier_id === paySupplierId && Number(b.balance_due_minor) > 0)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    Bill #{b.bill_number} — Due Rs {fromMinor(b.balance_due_minor).toLocaleString()}
                  </option>
                ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cheque / Reference Number
              </label>
              <input
                type="text"
                placeholder="e.g. CHQ-7789 or Txn ID"
                value={payReference}
                onChange={(e) => setPayReference(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Notes
              </label>
              <input
                type="text"
                placeholder="Remarks"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setPayModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 mr-1" /> : null}
              Confirm & Post Payment
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 6: RECORD PURCHASE RETURN (DEBIT NOTE)                              */}
      {/* ========================================================================= */}
      <Modal open={returnModalOpen} onClose={() => setReturnModalOpen(false)} title="Record Purchase Return (Debit Note)">
        <form onSubmit={handleSubmitReturn} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Supplier *
              </label>
              <select
                value={retSupplierId}
                onChange={(e) => setRetSupplierId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Return Date *
              </label>
              <input
                type="date"
                value={retDate}
                onChange={(e) => setRetDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Refund Method
              </label>
              <select
                value={retRefundMethod}
                onChange={(e) => setRetRefundMethod(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="credit_note">Supplier Credit / Reduce Khata Balance</option>
                <option value="cash">Cash Refund Received</option>
                <option value="bank">Bank Deposit Refund</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Return Reason
              </label>
              <input
                type="text"
                value={retReason}
                onChange={(e) => setRetReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                placeholder="e.g. Expired, Broken seal, Wrong specification"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Returned Products & Quantities
              </label>
              <button
                type="button"
                onClick={handleAddReturnItem}
                className="text-xs font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                + Add Product
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {retItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <select
                    value={item.productId}
                    onChange={(e) => {
                      const prod = products.find((p) => p.id === e.target.value);
                      const updated = [...retItems];
                      updated[idx].productId = e.target.value;
                      if (prod && prod.purchase_price_minor) {
                        updated[idx].unitCost = String(fromMinor(prod.purchase_price_minor));
                      }
                      setRetItems(updated);
                    }}
                    className="flex-1 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  >
                    <option value="">Select Product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Stock: {p.current_stock || 0})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Qty"
                    value={item.quantity}
                    onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                    onChange={(e) => {
                      const updated = [...retItems];
                      updated[idx].quantity = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                      setRetItems(updated);
                    }}
                    className="w-20 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="Cost Rate Rs"
                    value={item.unitCost}
                    onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                    onChange={(e) => {
                      const updated = [...retItems];
                      updated[idx].unitCost = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                      setRetItems(updated);
                    }}
                    className="w-28 rounded-md border border-slate-300 p-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    required
                  />
                  {retItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveReturnItem(idx)}
                      className="text-danger hover:opacity-80 p-1"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Remarks
            </label>
            <textarea
              rows="2"
              value={retNotes}
              onChange={(e) => setRetNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              placeholder="e.g. Sent back via courier with driver Muhammad Akram"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" type="button" onClick={() => setReturnModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" type="submit" disabled={saving}>
              {saving ? <Spinner className="h-4 w-4 mr-1" /> : null}
              Record Return & Deduct Stock
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL 7: REJECT CONFIRMATION DIALOG                                       */}
      {/* ========================================================================= */}
      <Modal open={rejectModalOpen} onClose={() => setRejectModalOpen(false)} title="Reject Requisition / Order">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Please enter a reason for rejecting this {rejectTarget.type === 'po' ? 'Purchase Order' : 'Purchase Request'}.
          </p>
          <textarea
            rows="3"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            placeholder="Reason for rejection (e.g. Budget exceeded, Unapproved supplier, duplicate request)"
            required
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (rejectTarget.type === 'po') {
                  handlePoAction(rejectTarget.id, 'reject', rejectReason);
                } else if (rejectTarget.type === 'pr') {
                  handlePrAction(rejectTarget.id, 'reject', rejectReason);
                }
                setRejectModalOpen(false);
              }}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
