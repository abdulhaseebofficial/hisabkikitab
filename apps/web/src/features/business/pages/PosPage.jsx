import { useEffect, useRef, useState } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  Printer,
  CheckCircle2,
  CreditCard,
  Wallet,
  ArrowLeft,
  Barcode,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';

export default function PosPage() {
  const { activeBusiness, activeBusinessId } = useBusiness();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountRs, setDiscountRs] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // V2 Shift State
  const [activeShift, setActiveShift] = useState(null);
  const [openShiftModal, setOpenShiftModal] = useState(false);
  const [closeShiftModal, setCloseShiftModal] = useState(false);
  const [shiftOpeningCashRs, setShiftOpeningCashRs] = useState('0');
  const [shiftActualCashRs, setShiftActualCashRs] = useState('');
  const [shiftNotes, setShiftNotes] = useState('');
  const [savingShift, setSavingShift] = useState(false);

  // V2 Held Orders State (Queue)
  const [heldOrders, setHeldOrders] = useState(() => {
    try {
      const saved = localStorage.getItem(`hisab_held_orders_${activeBusinessId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [heldOrdersModalOpen, setHeldOrdersModalOpen] = useState(false);

  // V2 Returns Modal State
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [recentSales, setRecentSales] = useState([]);
  const [selectedSaleForReturn, setSelectedSaleForReturn] = useState(null);
  const [returnItems, setReturnItems] = useState([]);
  const [returnMethod, setReturnMethod] = useState('cash');
  const [returnRestock, setReturnRestock] = useState(true);
  const [returnReason, setReturnReason] = useState('');
  const [savingReturn, setSavingReturn] = useState(false);

  const searchInputRef = useRef(null);

  const fetchBaseData = () => {
    if (!activeBusinessId) return;
    businessApi.listProducts(activeBusinessId).then(setProducts).catch(console.error);
    businessApi.listCategories(activeBusinessId).then(setCategories).catch(console.error);
    businessApi.listCustomers(activeBusinessId).then(setCustomers).catch(console.error);
    businessApi.getActiveShift(activeBusinessId).then(setActiveShift).catch(console.error);
  };

  useEffect(() => {
    fetchBaseData();
  }, [activeBusinessId]);

  useEffect(() => {
    if (activeBusinessId) {
      localStorage.setItem(`hisab_held_orders_${activeBusinessId}`, JSON.stringify(heldOrders));
    }
  }, [heldOrders, activeBusinessId]);

  // Barcode / Search filtering
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category_id === selectedCategory;
    const s = search.toLowerCase();
    const matchesSearch =
      !s ||
      p.name.toLowerCase().includes(s) ||
      (p.barcode && p.barcode.toLowerCase().includes(s)) ||
      (p.sku && p.sku.toLowerCase().includes(s));
    return matchesCat && matchesSearch;
  });

  const handleBarcodeOrEnter = (e) => {
    if (e.key === 'Enter' && search.trim()) {
      const match = products.find(
        (p) => p.barcode && p.barcode.trim().toLowerCase() === search.trim().toLowerCase()
      );
      if (match) {
        addToCart(match);
        setSearch('');
      }
    }
  };

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      if (existing) {
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit || 'pcs',
          unitPriceMinor: Number(product.selling_price_minor),
          quantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.productId === productId) {
            const newQ = item.quantity + delta;
            return newQ > 0 ? { ...item, quantity: newQ } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((item) => item.productId !== productId));
  };

  // Hold & Resume
  const handleHoldOrder = () => {
    if (!cart.length) return toast.error('Cart is empty to hold');
    const cust = customers.find((c) => c.id === selectedCustomerId);
    const newHold = {
      id: Date.now().toString(),
      heldAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      customerName: cust ? cust.name : 'Walk-in',
      customerId: selectedCustomerId,
      discountRs,
      paymentMethod,
      items: cart,
    };
    setHeldOrders((prev) => [newHold, ...prev]);
    setCart([]);
    setSelectedCustomerId('');
    setDiscountRs('');
    toast.success('Order placed on hold');
  };

  const handleResumeOrder = (order) => {
    setCart(order.items);
    setSelectedCustomerId(order.customerId || '');
    setDiscountRs(order.discountRs || '');
    setPaymentMethod(order.paymentMethod || 'cash');
    setHeldOrders((prev) => prev.filter((o) => o.id !== order.id));
    setHeldOrdersModalOpen(false);
    toast.success('Held order loaded into cart');
  };

  const handleDeleteHeldOrder = (orderId) => {
    setHeldOrders((prev) => prev.filter((o) => o.id !== orderId));
    toast.success('Held order discarded');
  };

  // Shifts
  const handleOpenShift = async (e) => {
    e.preventDefault();
    setSavingShift(true);
    try {
      const shift = await businessApi.openShift(activeBusinessId, {
        openingCashMinor: Math.round(Number(shiftOpeningCashRs || 0) * 100),
        notes: shiftNotes.trim(),
      });
      setActiveShift(shift);
      setOpenShiftModal(false);
      setShiftOpeningCashRs('0');
      setShiftNotes('');
      toast.success('Shift opened successfully! Cash drawer ready.');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to open shift');
    } finally {
      setSavingShift(false);
    }
  };

  const handleCloseShift = async (e) => {
    e.preventDefault();
    if (!shiftActualCashRs) return toast.error('Enter counted cash in drawer');
    setSavingShift(true);
    try {
      const closed = await businessApi.closeShift(activeBusinessId, {
        actualCashMinor: Math.round(Number(shiftActualCashRs) * 100),
        notes: shiftNotes.trim(),
      });
      setActiveShift(null);
      setCloseShiftModal(false);
      setShiftActualCashRs('');
      setShiftNotes('');
      const varMinor = Number(closed.cash_variance_minor || 0);
      toast.success(
        `Shift closed! Variance: ${formatRs(varMinor)} (${varMinor >= 0 ? 'Surplus/Exact' : 'Shortage'})`
      );
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to close shift');
    } finally {
      setSavingShift(false);
    }
  };

  // Sales Returns
  const openReturnModal = () => {
    businessApi.listSales(activeBusinessId, { limit: 20 }).then((s) => {
      setRecentSales(s || []);
      setReturnModalOpen(true);
    }).catch(console.error);
  };

  const handleSelectSaleForReturn = async (saleId) => {
    try {
      const fullSale = await businessApi.getSale(activeBusinessId, saleId);
      setSelectedSaleForReturn(fullSale);
      setReturnItems(
        (fullSale.items || []).map((item) => ({
          saleItemId: item.id,
          productId: item.product_id,
          productName: item.product_name,
          maxQty: item.quantity,
          returnQty: 1,
          unitPriceMinor: Number(item.unit_price_minor),
          condition: 'restockable',
        }))
      );
    } catch (err) {
      toast.error('Failed to load sale details');
    }
  };

  const handleProcessReturn = async (e) => {
    e.preventDefault();
    if (!selectedSaleForReturn) return toast.error('Select a sale invoice first');
    const activeReturns = returnItems.filter((i) => i.returnQty > 0);
    if (!activeReturns.length) return toast.error('Select at least one product item to return');

    setSavingReturn(true);
    try {
      await businessApi.createSalesReturn(activeBusinessId, {
        saleId: selectedSaleForReturn.id,
        refundMethod: returnMethod,
        reason: returnReason.trim() || 'POS Customer Return',
        restock: returnRestock,
        items: activeReturns.map((i) => ({
          saleItemId: i.saleItemId,
          productId: i.productId,
          quantity: i.returnQty,
          condition: i.condition,
        })),
      });

      toast.success('Return processed and inventory adjusted');
      setReturnModalOpen(false);
      setSelectedSaleForReturn(null);
      fetchBaseData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to process return');
    } finally {
      setSavingReturn(false);
    }
  };

  const subtotalMinor = cart.reduce((acc, item) => acc + item.unitPriceMinor * item.quantity, 0);
  const discountMinor = Math.round(Number(discountRs || 0) * 100);
  const grandTotalMinor = Math.max(0, subtotalMinor - discountMinor);

  const handleCheckout = async () => {
    if (!cart.length) {
      toast.error('Cart is empty');
      return;
    }
    if (paymentMethod === 'credit' && !selectedCustomerId) {
      toast.error('Please select a customer for credit (Udhaar) sales');
      return;
    }

    setSubmitting(true);
    try {
      const salePayload = {
        customerId: selectedCustomerId || null,
        paymentMethod,
        discountMinor,
        isPos: true,
        items: cart.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          unitPriceMinor: item.unitPriceMinor,
        })),
      };

      const sale = await businessApi.createSale(activeBusinessId, salePayload);
      setCompletedSale(sale);
      setCart([]);
      setDiscountRs('');
      setReceiptOpen(true);
      toast.success(`Sale ${sale.sale_number} completed!`);

      // Refresh product stock
      businessApi.listProducts(activeBusinessId).then(setProducts).catch(console.error);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Checkout failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col gap-6 lg:h-[calc(100vh-6.5rem)] lg:flex-row">
      {/* Left: Product Catalog & Search */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-canvas-darkCard">
        {/* Top Control Bar: Shifts, Returns, Held Orders */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex items-center gap-2">
            {activeShift ? (
              <button
                type="button"
                onClick={() => setCloseShiftModal(true)}
                className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-semibold text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                <Clock className="h-3.5 w-3.5" /> Shift Active • Close Drawer
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setOpenShiftModal(true)}
                className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Shift Closed • Open Shift
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openReturnModal}
              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <RotateCcw className="h-3.5 w-3.5 text-rose-500" /> Return / Refund
            </button>

            {heldOrders.length > 0 && (
              <button
                type="button"
                onClick={() => setHeldOrdersModalOpen(true)}
                className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 font-semibold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300"
              >
                <PauseCircle className="h-3.5 w-3.5" /> Held Orders ({heldOrders.length})
              </button>
            )}
          </div>
        </div>

        {/* Search & Barcode Bar */}
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <Link
              to="/business"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleBarcodeOrEnter}
                placeholder="Search product name, SKU, or scan barcode..."
                className="hw-input w-full pl-9"
                autoFocus
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap transition ${
                selectedCategory === 'all'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              All Items ({products.length})
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCategory(c.id)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold whitespace-nowrap transition ${
                  selectedCategory === c.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((p) => {
              const inStock = Number(p.current_stock) > 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addToCart(p)}
                  className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-brand-800"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 line-clamp-2 dark:text-slate-100">
                      {p.name}
                    </h4>
                    {p.barcode && (
                      <span className="mt-0.5 block text-[10px] text-slate-400">Barcode: {p.barcode}</span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      {formatRs(p.selling_price_minor)}
                    </span>
                    <span className={`text-[10px] font-medium ${inStock ? 'text-slate-500' : 'text-rose-500'}`}>
                      {inStock ? `${p.current_stock} ${p.unit}` : 'Out of stock'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {!filteredProducts.length && (
            <div className="py-12 text-center text-sm text-slate-400">
              No products found matching your search.
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart & Checkout Register */}
      <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white lg:w-96 dark:border-slate-800 dark:bg-canvas-darkCard">
        <div className="border-b border-slate-200 p-4 dark:border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
              <ShoppingCart className="h-5 w-5 text-emerald-600" /> Current Bill
            </h3>
            <div className="flex items-center gap-2">
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleHoldOrder}
                  title="Put Order on Hold"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  <PauseCircle className="h-4 w-4" />
                </button>
              )}
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {cart.length} item(s)
              </span>
            </div>
          </div>

          {/* Customer Selection */}
          <div className="mt-3">
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="hw-input w-full text-xs"
            >
              <option value="">Walk-in Customer (Naqad Grahak)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `(${c.phone})` : ''} - Bal: {formatRs(c.current_balance_minor)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cart Item List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.map((item) => (
            <div
              key={item.productId}
              className="flex items-center justify-between border-b border-slate-100 pb-2 text-sm dark:border-slate-800"
            >
              <div className="flex-1 pr-2">
                <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{item.name}</p>
                <p className="text-xs text-slate-500">
                  {formatRs(item.unitPriceMinor)} / {item.unit}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateQuantity(item.productId, -1)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-xs font-bold text-slate-900 dark:text-slate-100">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => updateQuantity(item.productId, 1)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.productId)}
                  className="rounded-lg p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}

          {!cart.length && (
            <div className="py-12 text-center text-xs text-slate-400">
              Cart is empty. Click products or scan barcode to add.
            </div>
          )}
        </div>

        {/* Calculation & Payment */}
        <div className="border-t border-slate-200 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{formatRs(subtotalMinor)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Discount (Rs):</span>
              <input
                type="number"
                min="0"
                value={discountRs}
                onChange={(e) => setDiscountRs(e.target.value)}
                placeholder="0"
                className="hw-input h-7 w-20 text-right text-xs"
              />
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900 dark:border-slate-700 dark:text-slate-100">
              <span>Grand Total:</span>
              <span className="text-emerald-700 dark:text-emerald-400">{formatRs(grandTotalMinor)}</span>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {[
              { id: 'cash', label: 'Cash (Naqad)' },
              { id: 'bank', label: 'Bank Transfer' },
              { id: 'wallet', label: 'JazzCash / Easy' },
              { id: 'credit', label: 'Credit (Khata)' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaymentMethod(m.id)}
                className={`rounded-xl border p-2 text-center text-xs font-semibold transition ${
                  paymentMethod === m.id
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <Button
            disabled={!cart.length || submitting}
            onClick={handleCheckout}
            className="mt-4 w-full bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
          >
            {submitting ? 'Processing...' : `Checkout ${formatRs(grandTotalMinor)}`}
          </Button>
        </div>
      </div>

      {/* Printable Receipt Modal */}
      <Modal open={receiptOpen} onClose={() => setReceiptOpen(false)} title="Sale Receipt" size="sm">
        {completedSale && (
          <div id="printable-receipt" className="space-y-4 p-2 text-center text-slate-900 dark:text-slate-100">
            <div className="border-b border-dashed border-slate-300 pb-3">
              <h3 className="text-lg font-bold">{activeBusiness?.name}</h3>
              <p className="text-xs text-slate-500">{activeBusiness?.address || activeBusiness?.city}</p>
              <p className="text-xs text-slate-500">Phone: {activeBusiness?.contact_number || 'N/A'}</p>
              <p className="mt-2 text-xs font-semibold">Invoice: #{completedSale.sale_number}</p>
              <p className="text-[10px] text-slate-400">{completedSale.date}</p>
            </div>

            <div className="space-y-1 text-left text-xs">
              <div className="flex justify-between font-semibold border-b pb-1">
                <span>Total Amount:</span>
                <span>{formatRs(completedSale.total_amount_minor)}</span>
              </div>
              <div className="flex justify-between">
                <span>Paid ({completedSale.payment_method}):</span>
                <span>{formatRs(completedSale.amount_paid_minor)}</span>
              </div>
              {Number(completedSale.balance_due_minor) > 0 && (
                <div className="flex justify-between text-rose-600 font-semibold">
                  <span>Remaining Khata:</span>
                  <span>{formatRs(completedSale.balance_due_minor)}</span>
                </div>
              )}
            </div>

            <div className="border-t border-dashed border-slate-300 pt-3">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Thank you for your visit!</p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="secondary" onClick={() => setReceiptOpen(false)} className="flex-1 text-xs">
                Close
              </Button>
              <Button
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white text-xs"
              >
                <Printer className="h-4 w-4" /> Print Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Held Orders Modal */}
      <Modal open={heldOrdersModalOpen} onClose={() => setHeldOrdersModalOpen(false)} title="Held Customer Orders">
        <div className="space-y-3">
          {heldOrders.map((ho) => {
            const total = ho.items.reduce((sum, it) => sum + it.unitPriceMinor * it.quantity, 0);
            return (
              <div
                key={ho.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-800"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    {ho.customerName} • <span className="font-normal text-slate-400">{ho.heldAt}</span>
                  </p>
                  <p className="text-slate-500">
                    {ho.items.length} items • Total: {formatRs(total)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => handleDeleteHeldOrder(ho.id)} className="text-xs">
                    Discard
                  </Button>
                  <Button variant="primary" onClick={() => handleResumeOrder(ho)} className="text-xs">
                    Resume Order
                  </Button>
                </div>
              </div>
            );
          })}
          {!heldOrders.length && (
            <p className="py-6 text-center text-xs text-slate-400">No orders currently on hold.</p>
          )}
        </div>
      </Modal>

      {/* Open Shift Modal */}
      <Modal open={openShiftModal} onClose={() => setOpenShiftModal(false)} title="Open Cashier Shift">
        <form onSubmit={handleOpenShift} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Opening Float / Cash in Drawer (PKR)
            </label>
            <input
              type="number"
              min="0"
              value={shiftOpeningCashRs}
              onChange={(e) => setShiftOpeningCashRs(e.target.value)}
              placeholder="e.g. 5000"
              className="hw-input mt-1 w-full text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Notes / Drawer ID</label>
            <input
              type="text"
              value={shiftNotes}
              onChange={(e) => setShiftNotes(e.target.value)}
              placeholder="e.g. Counter 1 Morning Shift"
              className="hw-input mt-1 w-full text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setOpenShiftModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={savingShift}>
              Open Shift
            </Button>
          </div>
        </form>
      </Modal>

      {/* Close Shift Modal */}
      <Modal open={closeShiftModal} onClose={() => setCloseShiftModal(false)} title="Close Shift & Cash Drawer Reconciliation">
        <form onSubmit={handleCloseShift} className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/50">
            <div className="flex justify-between">
              <span>Opening Cash Float:</span>
              <span className="font-semibold">{formatRs(activeShift?.opening_cash_minor || 0)}</span>
            </div>
            <div className="flex justify-between mt-1 text-slate-500">
              <span>Opened At:</span>
              <span>{activeShift?.opened_at ? new Date(activeShift.opened_at).toLocaleTimeString() : '—'}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Actual Physical Cash Counted (PKR)
            </label>
            <input
              type="number"
              required
              min="0"
              value={shiftActualCashRs}
              onChange={(e) => setShiftActualCashRs(e.target.value)}
              placeholder="Enter exact cash in drawer"
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Shift Closing Notes</label>
            <input
              type="text"
              value={shiftNotes}
              onChange={(e) => setShiftNotes(e.target.value)}
              placeholder="e.g. Handed over to Evening Cashier"
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCloseShiftModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={savingShift}>
              Reconcile & Close Shift
            </Button>
          </div>
        </form>
      </Modal>

      {/* Sales Return / Refund Modal */}
      <Modal open={returnModalOpen} onClose={() => setReturnModalOpen(false)} title="Process Sales Return & Refund">
        <form onSubmit={handleProcessReturn} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Select Sale Invoice</label>
            <select
              onChange={(e) => handleSelectSaleForReturn(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            >
              <option value="">Select Invoice to Return</option>
              {recentSales.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.sale_number} - {s.customer_name || 'Walk-in'} - {formatRs(s.total_amount_minor)} ({s.date})
                </option>
              ))}
            </select>
          </div>

          {selectedSaleForReturn && (
            <div className="space-y-3">
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 text-xs dark:border-slate-800">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 uppercase dark:bg-slate-900">
                    <tr>
                      <th className="p-2">Item</th>
                      <th className="p-2">Sold Qty</th>
                      <th className="p-2">Return Qty</th>
                      <th className="p-2">Condition</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {returnItems.map((item, idx) => (
                      <tr key={item.saleItemId}>
                        <td className="p-2 font-medium">{item.productName}</td>
                        <td className="p-2">{item.maxQty}</td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            max={item.maxQty}
                            value={item.returnQty}
                            onChange={(e) => {
                              const val = Math.min(item.maxQty, Math.max(0, Number(e.target.value)));
                              setReturnItems((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, returnQty: val } : p))
                              );
                            }}
                            className="hw-input w-16 text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={item.condition}
                            onChange={(e) => {
                              const cond = e.target.value;
                              setReturnItems((prev) =>
                                prev.map((p, i) => (i === idx ? { ...p, condition: cond } : p))
                              );
                            }}
                            className="hw-input text-xs"
                          >
                            <option value="restockable">Restockable</option>
                            <option value="damaged">Damaged (Write-off)</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Refund Method</label>
                  <select
                    value={returnMethod}
                    onChange={(e) => setReturnMethod(e.target.value)}
                    className="hw-input mt-1 w-full text-xs"
                  >
                    <option value="cash">Cash Refund</option>
                    <option value="bank">Bank Refund</option>
                    {selectedSaleForReturn.customer_id && (
                      <option value="credit_adjustment">Customer Khata Credit Adjustment</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Restock To Inventory</label>
                  <select
                    value={returnRestock ? 'true' : 'false'}
                    onChange={(e) => setReturnRestock(e.target.value === 'true')}
                    className="hw-input mt-1 w-full text-xs"
                  >
                    <option value="true">Yes, Restock Inventory</option>
                    <option value="false">No, Do Not Restock</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Return Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Wrong size / customer changed mind"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="hw-input mt-1 w-full text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setReturnModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={savingReturn} disabled={!selectedSaleForReturn}>
              Process Return
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
