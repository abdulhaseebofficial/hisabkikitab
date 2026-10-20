import { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  AlertTriangle,
  Boxes,
  Edit2,
  SlidersHorizontal,
  ClipboardCheck,
  ArrowRightLeft,
  Building2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';
import { allowOnlyNumbers, sanitizeNumericString } from '../../../shared/utils/inputs';

export default function InventoryPage() {
  const { activeBusinessId } = useBusiness();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState(null);

  // V2 Physical Stock Audit Modal
  const [stockCountModalOpen, setStockCountModalOpen] = useState(false);
  const [auditCounts, setAuditCounts] = useState({}); // productId -> countedQty
  const [auditNotes, setAuditNotes] = useState('');
  const [savingAudit, setSavingAudit] = useState(false);

  // V2 Stock Transfer Modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferFromBranch, setTransferFromBranch] = useState('');
  const [transferToBranch, setTransferToBranch] = useState('');
  const [transferProductId, setTransferProductId] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [savingTransfer, setSavingTransfer] = useState(false);

  // Add Product form state
  const [newName, setNewName] = useState('');
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newUnit, setNewUnit] = useState('pcs');
  const [newPurchasePrice, setNewPurchasePrice] = useState('');
  const [newSellingPrice, setNewSellingPrice] = useState('');
  const [newStock, setNewStock] = useState('0');
  const [newMinAlert, setNewMinAlert] = useState('5');
  const [savingProduct, setSavingProduct] = useState(false);

  // Adjust stock form state
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustType, setAdjustType] = useState('adjustment_add');
  const [adjustReason, setAdjustReason] = useState('');
  const [savingAdjust, setSavingAdjust] = useState(false);

  const fetchInventory = () => {
    if (!activeBusinessId) return;
    setLoading(true);
    Promise.all([
      businessApi.listProducts(activeBusinessId),
      businessApi.listCategories(activeBusinessId),
      businessApi.listWarehouses(activeBusinessId),
    ])
      .then(([prods, cats, whs]) => {
        setProducts(prods || []);
        setCategories(cats || []);
        setWarehouses(whs || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchInventory();
  }, [activeBusinessId]);

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    if (!newName.trim()) {
      toast.error('Product name is required');
      return;
    }
    setSavingProduct(true);
    try {
      await businessApi.createProduct(activeBusinessId, {
        name: newName.trim(),
        categoryId: newCategoryId || null,
        sku: newSku.trim(),
        barcode: newBarcode.trim(),
        unit: newUnit,
        purchasePriceMinor: Math.round(Number(newPurchasePrice || 0) * 100),
        sellingPriceMinor: Math.round(Number(newSellingPrice || 0) * 100),
        currentStock: Number(newStock || 0),
        minStockAlert: Number(newMinAlert || 5),
      });

      toast.success('Product created successfully');
      setAddModalOpen(false);
      setNewName('');
      setNewSku('');
      setNewBarcode('');
      setNewPurchasePrice('');
      setNewSellingPrice('');
      setNewStock('0');
      fetchInventory();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to create product');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!adjustProduct || Number(adjustQty) <= 0) {
      toast.error('Please enter a valid adjustment quantity');
      return;
    }
    setSavingAdjust(true);
    try {
      await businessApi.adjustStock(activeBusinessId, {
        productId: adjustProduct.id,
        adjustedQuantity: Number(adjustQty),
        type: adjustType,
        reason: adjustReason.trim() || 'Manual stock reconciliation',
      });

      toast.success('Stock adjusted successfully');
      setAdjustModalOpen(false);
      setAdjustProduct(null);
      setAdjustQty('');
      setAdjustReason('');
      fetchInventory();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Adjustment failed');
    } finally {
      setSavingAdjust(false);
    }
  };

  // V2 Stock Audit Handlers
  const openAuditModal = () => {
    const initial = {};
    products.forEach((p) => {
      initial[p.id] = p.current_stock;
    });
    setAuditCounts(initial);
    setStockCountModalOpen(true);
  };

  const handleSaveAudit = async (e) => {
    e.preventDefault();
    setSavingAudit(true);
    try {
      const items = Object.entries(auditCounts).map(([productId, countedQty]) => ({
        productId,
        countedQty: Number(countedQty || 0),
      }));

      const count = await businessApi.createStockCount(activeBusinessId, {
        items,
        notes: auditNotes.trim() || 'Physical inventory audit',
      });

      // Automatically reconcile the audit
      await businessApi.reconcileStockCount(activeBusinessId, count.id);

      toast.success('Physical count reconciled! General ledger adjustments posted.');
      setStockCountModalOpen(false);
      fetchInventory();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to reconcile audit');
    } finally {
      setSavingAudit(false);
    }
  };

  // V2 Stock Transfer Handler
  const handleSaveTransfer = async (e) => {
    e.preventDefault();
    if (!transferFromBranch || !transferToBranch) return toast.error('Select origin and destination');
    if (transferFromBranch === transferToBranch) return toast.error('Origin and destination cannot be identical');
    if (!transferProductId || Number(transferQty) <= 0) return toast.error('Select product and quantity');

    setSavingTransfer(true);
    try {
      await businessApi.createStockTransfer(activeBusinessId, {
        fromBranchId: transferFromBranch,
        toBranchId: transferToBranch,
        items: [{ productId: transferProductId, quantity: Number(transferQty) }],
        notes: transferNotes.trim(),
      });

      toast.success('Stock transfer dispatched!');
      setTransferModalOpen(false);
      setTransferProductId('');
      setTransferQty('');
      setTransferNotes('');
      fetchInventory();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Transfer failed');
    } finally {
      setSavingTransfer(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const s = search.toLowerCase();
    const matchesSearch =
      !s ||
      p.name.toLowerCase().includes(s) ||
      (p.sku && p.sku.toLowerCase().includes(s)) ||
      (p.barcode && p.barcode.toLowerCase().includes(s));
    const matchesCat = !selectedCategory || p.category_id === selectedCategory;
    const matchesLowStock = !lowStockFilter || Number(p.current_stock) <= Number(p.min_stock_alert);
    return matchesSearch && matchesCat && matchesLowStock;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Products & Inventory
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Monitor stock levels, physical inventory audits, branch transfers & FIFO valuation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={openAuditModal} className="text-xs">
            <ClipboardCheck className="mr-1.5 h-4 w-4" /> Physical Audit
          </Button>

          {warehouses.length > 1 && (
            <Button variant="secondary" onClick={() => setTransferModalOpen(true)} className="text-xs">
              <ArrowRightLeft className="mr-1.5 h-4 w-4" /> Branch Transfer
            </Button>
          )}

          <Button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
          >
            <Plus className="h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, SKU or barcode..."
            className="hw-input w-full pl-9"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="hw-input sm:w-48 text-xs"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setLowStockFilter((v) => !v)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
            lowStockFilter
              ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-canvas-darkCard dark:text-slate-300'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> Low Stock Only
        </button>
      </div>

      {/* Products Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Cost Price</th>
                <th className="px-4 py-3 text-right">Sale Price</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Valuation</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map((p) => {
                const isLow = Number(p.current_stock) <= Number(p.min_stock_alert);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                      {(p.sku || p.barcode) && (
                        <div className="text-[10px] text-slate-400">
                          {p.sku && `SKU: ${p.sku} `}
                          {p.barcode && `BC: ${p.barcode}`}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      {p.category_name || 'General'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                      {formatRs(p.purchase_price_minor)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {formatRs(p.selling_price_minor)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-flex items-center gap-1 font-bold ${
                          isLow ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {p.current_stock} {p.unit}
                        {isLow && <AlertTriangle className="h-3 w-3" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-700 dark:text-emerald-400">
                      {formatRs(p.inventory_valuation_minor)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setAdjustProduct(p);
                          setAdjustModalOpen(true);
                        }}
                        className="text-xs"
                      >
                        Adjust
                      </Button>
                    </td>
                  </tr>
                );
              })}

              {!filteredProducts.length && !loading && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                    No products found. Click "Add Product" to create your inventory catalog.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add Product Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add New Product" size="md">
        <form onSubmit={handleCreateProduct} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Product Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Basmati Rice 5kg"
              className="hw-input mt-1 w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Category</label>
              <select
                value={newCategoryId}
                onChange={(e) => setNewCategoryId(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                <option value="">General</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Unit of Measure</label>
              <select
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                <option value="pcs">Pieces (Pcs)</option>
                <option value="kg">Kilogram (Kg)</option>
                <option value="g">Gram (g)</option>
                <option value="ltr">Liter (Ltr)</option>
                <option value="box">Box / Carton</option>
                <option value="pack">Pack</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Purchase / Cost Price (Rs)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={newPurchasePrice}
                onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                onChange={(e) => setNewPurchasePrice(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                placeholder="0"
                className="hw-input mt-1 w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Sale / Retail Price (Rs) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={newSellingPrice}
                onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                onChange={(e) => setNewSellingPrice(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                placeholder="0"
                className="hw-input mt-1 w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Initial Stock Quantity
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={newStock}
                onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                onChange={(e) => setNewStock(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                className="hw-input mt-1 w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Low Stock Alert Limit
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={newMinAlert}
                onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                onChange={(e) => setNewMinAlert(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                className="hw-input mt-1 w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Barcode</label>
              <input
                type="text"
                value={newBarcode}
                onChange={(e) => setNewBarcode(e.target.value)}
                placeholder="Optional"
                className="hw-input mt-1 w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">SKU / Item Code</label>
              <input
                type="text"
                value={newSku}
                onChange={(e) => setNewSku(e.target.value)}
                placeholder="Optional"
                className="hw-input mt-1 w-full"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={savingProduct} type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
              {savingProduct ? 'Saving...' : 'Save Product'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal open={adjustModalOpen} onClose={() => setAdjustModalOpen(false)} title="Stock Adjustment" size="sm">
        <form onSubmit={handleAdjustStock} className="space-y-4">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Adjusting inventory for <strong>{adjustProduct?.name}</strong> (Current: {adjustProduct?.current_stock}{' '}
            {adjustProduct?.unit}).
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Adjustment Type</label>
            <select
              value={adjustType}
              onChange={(e) => setAdjustType(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            >
              <option value="adjustment_add">Add Found Stock (Surplus / Faltu)</option>
              <option value="adjustment_sub">Remove Missing / Lost Stock</option>
              <option value="damage">Record Damaged / Expired Stock</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Quantity to Adjust ({adjustProduct?.unit})
            </label>
            <input
              type="text"
              inputMode="decimal"
              required
              value={adjustQty}
              onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
              onChange={(e) => setAdjustQty(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
              placeholder="e.g. 5"
              className="hw-input mt-1 w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Reason / Remarks</label>
            <input
              type="text"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="e.g. Physical inventory count discrepancy"
              className="hw-input mt-1 w-full"
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="secondary" onClick={() => setAdjustModalOpen(false)}>
              Cancel
            </Button>
            <Button disabled={savingAdjust} type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
              {savingAdjust ? 'Adjusting...' : 'Save Adjustment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Physical Stock Audit Modal */}
      <Modal
        open={stockCountModalOpen}
        onClose={() => setStockCountModalOpen(false)}
        title="Physical Inventory Audit & Reconciliation"
        size="lg"
      >
        <form onSubmit={handleSaveAudit} className="space-y-4">
          <p className="text-xs text-slate-500">
            Enter the actual physical count for each item. Any discrepancies will automatically generate shrinkage/surplus
            journal entries to keep your books strictly accurate.
          </p>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 text-xs dark:border-slate-800">
            <table className="w-full text-left">
              <thead className="bg-slate-50 font-bold uppercase dark:bg-slate-900">
                <tr>
                  <th className="p-2.5">Product</th>
                  <th className="p-2.5">Recorded Stock</th>
                  <th className="p-2.5">Counted Stock</th>
                  <th className="p-2.5 text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {products.map((p) => {
                  const counted = auditCounts[p.id] !== undefined ? Number(auditCounts[p.id]) : p.current_stock;
                  const variance = counted - p.current_stock;
                  return (
                    <tr key={p.id}>
                      <td className="p-2.5 font-medium">{p.name}</td>
                      <td className="p-2.5 text-slate-500">
                        {p.current_stock} {p.unit}
                      </td>
                      <td className="p-2.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={counted}
                          onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                          onChange={(e) => {
                            const val = sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false });
                            setAuditCounts((prev) => ({ ...prev, [p.id]: val }));
                          }}
                          className="hw-input w-24 text-xs"
                        />
                      </td>
                      <td
                        className={`p-2.5 text-right font-bold ${
                          variance < 0 ? 'text-rose-600' : variance > 0 ? 'text-emerald-600' : 'text-slate-400'
                        }`}
                      >
                        {variance > 0 ? `+${variance}` : variance}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Audit Notes</label>
            <input
              type="text"
              placeholder="e.g. Month-end warehouse physical audit"
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setStockCountModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={savingAudit}>
              Reconcile & Update Ledger
            </Button>
          </div>
        </form>
      </Modal>

      {/* Stock Transfer Modal */}
      <Modal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        title="Transfer Stock Between Branches"
        size="md"
      >
        <form onSubmit={handleSaveTransfer} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">From Location</label>
              <select
                required
                value={transferFromBranch}
                onChange={(e) => setTransferFromBranch(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                <option value="">Select Origin</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">To Location</label>
              <select
                required
                value={transferToBranch}
                onChange={(e) => setTransferToBranch(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                <option value="">Select Destination</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Product</label>
            <select
              required
              value={transferProductId}
              onChange={(e) => setTransferProductId(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            >
              <option value="">Select Product to Transfer</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Available: {p.current_stock} {p.unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Quantity</label>
            <input
              type="text"
              inputMode="decimal"
              required
              value={transferQty}
              onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
              onChange={(e) => setTransferQty(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
              placeholder="e.g. 10"
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Transfer Remarks</label>
            <input
              type="text"
              placeholder="e.g. Stock replenishment for Branch 2"
              value={transferNotes}
              onChange={(e) => setTransferNotes(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={savingTransfer}>
              Dispatch Transfer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
