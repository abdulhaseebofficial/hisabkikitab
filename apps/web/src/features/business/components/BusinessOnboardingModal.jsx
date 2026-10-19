import { useState } from 'react';
import { Building2, Check, ArrowRight, ArrowLeft, Store, DollarSign, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../../shared/components/ui/Modal';
import Button from '../../../shared/components/ui/Button';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { BUSINESS_CATEGORIES } from '@hisabkikitab/contracts/business';
import { formatRs } from '../../../shared/utils/money';

export default function BusinessOnboardingModal({ open, onClose }) {
  const { refreshBusinesses, setActiveBusinessId, setMode } = useBusiness();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState('grocery');
  const [currency, setCurrency] = useState('PKR');
  const [contactNumber, setContactNumber] = useState('');
  const [city, setCity] = useState('');

  // Opening balances (in rupees, converted to minor units on submit)
  const [openingCash, setOpeningCash] = useState('');
  const [openingBank, setOpeningBank] = useState('');
  const [openingInventory, setOpeningInventory] = useState('');
  const [openingReceivables, setOpeningReceivables] = useState('');
  const [openingPayables, setOpeningPayables] = useState('');

  const toMinor = (val) => Math.round(Number(val || 0) * 100);

  const cashMinor = toMinor(openingCash);
  const bankMinor = toMinor(openingBank);
  const invMinor = toMinor(openingInventory);
  const recMinor = toMinor(openingReceivables);
  const payMinor = toMinor(openingPayables);

  const totalAssetsMinor = cashMinor + bankMinor + invMinor + recMinor;
  const netCapitalMinor = totalAssetsMinor - payMinor;

  const handleFinish = async () => {
    if (!name.trim()) {
      toast.error('Please enter your business name');
      return;
    }
    setSaving(true);
    try {
      const created = await businessApi.createBusiness({
        name: name.trim(),
        category,
        currency,
        contactNumber,
        city,
        openingBalances: {
          cashMinor,
          bankMinor,
          inventoryMinor: invMinor,
          receivablesMinor: recMinor,
          payablesMinor: payMinor,
        },
      });

      await refreshBusinesses();
      setActiveBusinessId(created.id);
      setMode('business');
      toast.success(`Business "${created.name}" created successfully!`);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to create business');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Setup Your Business Profile" size="lg">
      <div className="space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${step === 1 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>1</span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Identity</span>
          </div>
          <div className="h-0.5 w-12 bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${step === 2 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>2</span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Opening Balances</span>
          </div>
          <div className="h-0.5 w-12 bg-slate-200 dark:bg-slate-800" />
          <div className="flex items-center gap-2">
            <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${step === 3 ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>3</span>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Confirm</span>
          </div>
        </div>

        {/* Step 1: Business Identity */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Business Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Al-Madina Kiryana & General Store"
                className="hw-input mt-1 w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Business Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="hw-input mt-1 w-full"
              >
                {BUSINESS_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.en} ({cat.roman_ur})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                  placeholder="0300-1234567"
                  className="hw-input mt-1 w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Lahore, Karachi, Islamabad..."
                  className="hw-input mt-1 w-full"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                disabled={!name.trim()}
                onClick={() => setStep(2)}
                className="flex items-center gap-2"
              >
                Next Step <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Opening Balances */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Enter any existing balances you already hold. You can leave these as 0 and record them later.
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Opening Cash in Hand (Rs)
                </label>
                <input
                  type="number"
                  min="0"
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  placeholder="0"
                  className="hw-input mt-1 w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Opening Bank Balance (Rs)
                </label>
                <input
                  type="number"
                  min="0"
                  value={openingBank}
                  onChange={(e) => setOpeningBank(e.target.value)}
                  placeholder="0"
                  className="hw-input mt-1 w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Opening Inventory Value (Rs)
                </label>
                <input
                  type="number"
                  min="0"
                  value={openingInventory}
                  onChange={(e) => setOpeningInventory(e.target.value)}
                  placeholder="0"
                  className="hw-input mt-1 w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Customer Receivables (Udhaar / Khata)
                </label>
                <input
                  type="number"
                  min="0"
                  value={openingReceivables}
                  onChange={(e) => setOpeningReceivables(e.target.value)}
                  placeholder="0"
                  className="hw-input mt-1 w-full"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  Supplier Payables (Wajib-ul-Ada / Karobar Dena Hai)
                </label>
                <input
                  type="number"
                  min="0"
                  value={openingPayables}
                  onChange={(e) => setOpeningPayables(e.target.value)}
                  placeholder="0"
                  className="hw-input mt-1 w-full"
                />
              </div>
            </div>

            {/* Reconciled Capital Preview */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Total Assets:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{formatRs(totalAssetsMinor)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Total Liabilities:</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">{formatRs(payMinor)}</span>
              </div>
              <div className="mt-2 border-t border-slate-200 pt-2 flex items-center justify-between text-sm font-bold dark:border-slate-700">
                <span className="text-brand-700 dark:text-brand-300">Net Owner Capital (Equity):</span>
                <span className="text-brand-700 dark:text-brand-300">{formatRs(netCapitalMinor)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <Button variant="secondary" onClick={() => setStep(1)} className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button onClick={() => setStep(3)} className="flex items-center gap-2">
                Review <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Create */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-brand-200 bg-brand-50/50 p-5 dark:border-brand-900/50 dark:bg-brand-950/20">
              <h4 className="text-base font-semibold text-brand-900 dark:text-brand-200">{name}</h4>
              <p className="mt-1 text-sm text-brand-700 dark:text-brand-300">
                {BUSINESS_CATEGORIES.find((c) => c.id === category)?.en} • {city || 'Pakistan'}
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400">
                <div>Cash: {formatRs(cashMinor)}</div>
                <div>Bank: {formatRs(bankMinor)}</div>
                <div>Stock: {formatRs(invMinor)}</div>
                <div>Receivables: {formatRs(recMinor)}</div>
                <div>Payables: {formatRs(payMinor)}</div>
                <div className="font-semibold text-brand-700 dark:text-brand-300">Net Capital: {formatRs(netCapitalMinor)}</div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4">
              <Button variant="secondary" onClick={() => setStep(2)} className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button disabled={saving} onClick={handleFinish} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Check className="h-4 w-4" /> {saving ? 'Initializing...' : 'Launch Business Mode'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
