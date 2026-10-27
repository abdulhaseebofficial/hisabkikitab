import { useEffect, useState } from 'react';
import { Building2, Save, FileText, Check, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import businessContracts from '@hisabkikitab/contracts/business';
const { BUSINESS_CATEGORIES } = businessContracts;

export default function BusinessSettingsPage() {
  const { activeBusiness, activeBusinessId, businesses, setActiveBusinessId, refreshBusinesses, openOnboarding } = useBusiness();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('grocery');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [taxId, setTaxId] = useState('');

  // Settings
  const [invoicePrefix, setInvoicePrefix] = useState('INV-');
  const [invoiceFooterNote, setInvoiceFooterNote] = useState('Thank you for your business!');
  const [enableTax, setEnableTax] = useState(false);
  const [defaultTaxRate, setDefaultTaxRate] = useState('0');

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeBusiness) {
      setName(activeBusiness.name || '');
      setCategory(activeBusiness.category || 'grocery');
      setContactNumber(activeBusiness.contact_number || '');
      setEmail(activeBusiness.email || '');
      setAddress(activeBusiness.address || '');
      setCity(activeBusiness.city || '');
      setTaxId(activeBusiness.tax_id || '');
      setInvoicePrefix(activeBusiness.invoice_prefix || 'INV-');
      setInvoiceFooterNote(activeBusiness.invoice_footer_note || 'Thank you for your business!');
      setEnableTax(Boolean(activeBusiness.enable_tax));
      setDefaultTaxRate(String(activeBusiness.default_tax_rate || '0'));
    }
  }, [activeBusiness]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Business name is required');
    setSaving(true);
    try {
      await businessApi.updateBusiness(activeBusinessId, {
        name: name.trim(),
        category,
        contact_number: contactNumber.trim(),
        email: email.trim(),
        address: address.trim(),
        city: city.trim(),
        tax_id: taxId.trim(),
        settings: {
          invoice_prefix: invoicePrefix.trim(),
          invoice_footer_note: invoiceFooterNote.trim(),
          enable_tax: enableTax,
          default_tax_rate: Number(defaultTaxRate || 0),
        },
      });

      await refreshBusinesses();
      toast.success('Business settings saved successfully!');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Business Settings & Profile
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configure business details, invoice numbering, tax, and branding.
        </p>
      </div>

      <Card className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label htmlFor="active-business" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Your Businesses
            </label>
            <select
              id="active-business"
              value={activeBusinessId || ''}
              onChange={(event) => setActiveBusinessId(event.target.value)}
              disabled={businesses.length === 0}
              className="hw-input mt-1 w-full"
            >
              {businesses.length === 0 && <option value="">No businesses yet</option>}
              {businesses.map((business) => (
                <option key={business.id} value={business.id}>{business.name}</option>
              ))}
            </select>
          </div>
          <Button type="button" variant="secondary" onClick={openOnboarding} className="flex items-center gap-1.5">
            <Plus className="h-4 w-4" /> Add New Business
          </Button>
        </div>
      </Card>

      <form onSubmit={handleSave} className="space-y-6">
        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Business Identity</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Business Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="hw-input mt-1 w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Business Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                {BUSINESS_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.en} ({c.roman_ur})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Contact Phone
              </label>
              <input
                type="text"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="hw-input mt-1 w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="hw-input mt-1 w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                City
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="hw-input mt-1 w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                NTN / Tax Registration Number
              </label>
              <input
                type="text"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="Optional"
                className="hw-input mt-1 w-full"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Full Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="hw-input mt-1 w-full"
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Invoice & Billing Configuration</h3>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Invoice Prefix
              </label>
              <input
                type="text"
                value={invoicePrefix}
                onChange={(e) => setInvoicePrefix(e.target.value)}
                className="hw-input mt-1 w-full"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Invoice Footer Note
              </label>
              <input
                type="text"
                value={invoiceFooterNote}
                onChange={(e) => setInvoiceFooterNote(e.target.value)}
                className="hw-input mt-1 w-full"
              />
            </div>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button disabled={saving} type="submit" className="flex items-center gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
            <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Business Settings'}
          </Button>
        </div>
      </form>
    </div>
  );
}
