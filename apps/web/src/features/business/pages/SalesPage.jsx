import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, Plus, Search, FileText, CheckCircle2 } from 'lucide-react';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';

export default function SalesPage() {
  const { activeBusinessId } = useBusiness();
  const [sales, setSales] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeBusinessId) return;
    setLoading(true);
    businessApi
      .listSales(activeBusinessId)
      .then((data) => setSales(data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeBusinessId]);

  const filteredSales = sales.filter((s) => {
    const term = search.toLowerCase();
    return (
      s.sale_number?.toLowerCase().includes(term) ||
      s.customer_name?.toLowerCase().includes(term) ||
      s.payment_method?.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Sales & Invoices
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track all completed orders, cash sales, and credit invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/business/pos">
            <Button className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
              <ShoppingBag className="h-4 w-4" /> Open POS Terminal
            </Button>
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice # or customer..."
            className="hw-input w-full pl-9"
          />
        </div>
      </div>

      {/* Sales List Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Invoice #</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Paid</th>
                <th className="px-4 py-3 text-right">Balance Due</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredSales.map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40">
                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                    {sale.sale_number}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{sale.date}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                    {sale.customer_name || 'Walk-in Customer'}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-400">
                    {sale.payment_method}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                    {formatRs(sale.total_amount_minor)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                    {formatRs(sale.amount_paid_minor)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-rose-600 dark:text-rose-400">
                    {Number(sale.balance_due_minor) > 0 ? formatRs(sale.balance_due_minor) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Completed
                    </span>
                  </td>
                </tr>
              ))}

              {!filteredSales.length && !loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-slate-400">
                    No sales recorded yet. Click "Open POS Terminal" to make a sale!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
