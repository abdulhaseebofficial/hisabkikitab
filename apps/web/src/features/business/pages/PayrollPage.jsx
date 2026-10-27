import DesktopOnlyWorkspaceGuard from '../components/DesktopOnlyWorkspaceGuard';
import { useEffect, useState } from 'react';
import { Users, UserPlus, Calendar, DollarSign, CheckCircle2, Clock, AlertCircle, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import Card from '../../../shared/components/ui/Card';
import Button from '../../../shared/components/ui/Button';
import Modal from '../../../shared/components/ui/Modal';
import businessApi from '../api/businessApi';
import { useBusiness } from '../BusinessContext';
import { formatRs } from '../../../shared/utils/money';
import { allowOnlyNumbers, sanitizeNumericString, sanitizeDigitsOnly } from '../../../shared/utils/inputs';
import { downloadDocumentPdf, DOCUMENT_TYPES } from '../utils/businessDocuments';

export default function PayrollPage() {
  const { activeBusinessId } = useBusiness();
  const [activeTab, setActiveTab] = useState('payroll'); // 'payroll' | 'attendance' | 'employees'
  const [employees, setEmployees] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Month selector
  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));

  // Attendance state
  const [attendanceList, setAttendanceList] = useState([]);
  const [logAttendanceOpen, setLogAttendanceOpen] = useState(false);
  const [attEmployeeId, setAttEmployeeId] = useState('');
  const [attDate, setAttDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [attStatus, setAttStatus] = useState('present');
  const [attHours, setAttHours] = useState('8');
  const [attNotes, setAttNotes] = useState('');
  const [savingAttendance, setSavingAttendance] = useState(false);

  // Run Payroll Modal
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [paidFromAccountId, setPaidFromAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payrollItems, setPayrollItems] = useState([]);
  const [savingPayroll, setSavingPayroll] = useState(false);

  // Add Employee Modal
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [empName, setEmpName] = useState('');
  const [empRole, setEmpRole] = useState('staff');
  const [empPhone, setEmpPhone] = useState('');
  const [empSalaryRs, setEmpSalaryRs] = useState('');
  const [savingEmployee, setSavingEmployee] = useState(false);

  const fetchData = () => {
    setEmployees([]);
    setPayrollRuns([]);
    setAccounts([]);
    setAttendanceList([]);
    if (!activeBusinessId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      businessApi.listEmployees(activeBusinessId),
      businessApi.listPayroll(activeBusinessId),
      businessApi.listAccounts(activeBusinessId),
      businessApi.listAttendance(activeBusinessId, { month: currentMonth }),
    ])
      .then(([emps, runs, accs, atts]) => {
        setEmployees(emps || []);
        setPayrollRuns(runs || []);
        setAccounts((accs || []).filter((a) => a.type === 'asset' && ['1010', '1020'].includes(a.code)));
        setAttendanceList(atts || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [activeBusinessId, currentMonth]);

  const openPayrollModal = () => {
    const items = employees.map((emp) => {
      const baseMinor = Number(emp.base_salary_minor || 0);
      return {
        employeeId: emp.id,
        name: emp.name,
        role: emp.role,
        baseSalaryMinor: baseMinor,
        allowancesMinor: 0,
        deductionsMinor: 0,
        advanceDeductedMinor: 0,
        netPayableMinor: baseMinor,
      };
    });
    setPayrollItems(items);
    setRunModalOpen(true);
  };

  const updatePayrollItem = (empId, field, valueRs) => {
    const minor = Math.round(Number(valueRs || 0) * 100);
    setPayrollItems((prev) =>
      prev.map((item) => {
        if (item.employeeId !== empId) return item;
        const updated = { ...item, [field]: minor };
        const net = updated.baseSalaryMinor + updated.allowancesMinor - updated.deductionsMinor - updated.advanceDeductedMinor;
        return { ...updated, netPayableMinor: Math.max(0, net) };
      })
    );
  };

  const handleRunPayroll = async (e) => {
    e.preventDefault();
    if (!payrollItems.length) return toast.error('No employees to process');
    setSavingPayroll(true);
    try {
      await businessApi.runItemizedPayroll(activeBusinessId, {
        month: currentMonth,
        paymentDate,
        paidFromAccountId: paidFromAccountId || null,
        items: payrollItems,
        notes: `Monthly payroll run for ${currentMonth}`,
      });
      toast.success('Payroll processed & ledger entry posted');
      setRunModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to run payroll');
    } finally {
      setSavingPayroll(false);
    }
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!empName.trim()) return toast.error('Employee name is required');
    setSavingEmployee(true);
    try {
      await businessApi.createEmployee(activeBusinessId, {
        name: empName.trim(),
        role: empRole,
        phone: empPhone.trim(),
        baseSalaryMinor: Math.round(Number(empSalaryRs || 0) * 100),
      });
      toast.success('Staff member registered');
      setAddEmployeeOpen(false);
      setEmpName('');
      setEmpPhone('');
      setEmpSalaryRs('');
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to add employee');
    } finally {
      setSavingEmployee(false);
    }
  };

  const handleLogAttendance = async (e) => {
    e.preventDefault();
    if (!attEmployeeId) return toast.error('Select an employee');
    setSavingAttendance(true);
    try {
      await businessApi.logAttendance(activeBusinessId, {
        employeeId: attEmployeeId,
        date: attDate,
        status: attStatus,
        hoursWorked: Number(attHours || 8),
        notes: attNotes.trim(),
      });
      toast.success('Attendance recorded');
      setLogAttendanceOpen(false);
      setAttNotes('');
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Failed to log attendance');
    } finally {
      setSavingAttendance(false);
    }
  };

  const totalPayrollGross = payrollItems.reduce((sum, item) => sum + item.netPayableMinor, 0);

  return (
    <DesktopOnlyWorkspaceGuard
      featureName="Staff & Payroll Administration"
      featureDescription="Employee registers, daily staff attendance tracking, and monthly payroll disbursements"
      featureIcon={Users}
      quickActionLink={{ to: '/business', label: 'Back to Overview' }}
      essentialSummary={
        <p className="text-slate-600 dark:text-slate-400">
          Monthly salary registers, attendance logging, and salary slip generation are configured on desktop screens.
        </p>
      }
    >
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Staff, Attendance & Payroll
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage employee profiles, daily attendance records, and itemized monthly salary disbursements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={currentMonth}
            onChange={(e) => setCurrentMonth(e.target.value)}
            className="hw-input text-xs"
          />
          {activeTab === 'payroll' && (
            <Button variant="primary" onClick={openPayrollModal} className="text-xs">
              <DollarSign className="mr-1.5 h-4 w-4" /> Run {currentMonth} Payroll
            </Button>
          )}
          {activeTab === 'attendance' && (
            <Button variant="primary" onClick={() => setLogAttendanceOpen(true)} className="text-xs">
              <Clock className="mr-1.5 h-4 w-4" /> Mark Attendance
            </Button>
          )}
          {activeTab === 'employees' && (
            <Button variant="primary" onClick={() => setAddEmployeeOpen(true)} className="text-xs">
              <UserPlus className="mr-1.5 h-4 w-4" /> Add Employee
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('payroll')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'payroll'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <DollarSign className="h-4 w-4" /> Payroll Runs ({payrollRuns.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('attendance')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'attendance'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Calendar className="h-4 w-4" /> Attendance Register ({attendanceList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('employees')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
            activeTab === 'employees'
              ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Users className="h-4 w-4" /> Staff Directory ({employees.length})
        </button>
      </div>

      {/* Tab: Payroll Runs */}
      {activeTab === 'payroll' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Payment Date</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total Net Salaries</th>
                  <th className="px-4 py-3">Notes</th>
                  <th className="px-4 py-3 text-right">Payslip</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {payrollRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{run.month}</td>
                    <td className="px-4 py-3 text-slate-500">{run.payment_date || 'Accrued'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${
                          run.status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatRs(run.total_salary_minor)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{run.notes || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          downloadDocumentPdf({
                            businessId: activeBusinessId,
                            docType: DOCUMENT_TYPES.EMPLOYEE_PAYSLIP,
                            docId: run.id,
                            customFilename: `Payslip-${run.month}.pdf`,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
                        title="Download Payslip PDF"
                      >
                        <Download className="h-3 w-3" /> Payslip PDF
                      </button>
                    </td>
                  </tr>
                ))}
                {!payrollRuns.length && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No payroll runs yet. Click "Run Payroll" to generate monthly salary vouchers.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Attendance */}
      {activeTab === 'attendance' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
                {attendanceList.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/40">
                    <td className="px-4 py-3 font-semibold">{att.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{att.employee_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                          att.status === 'present'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : att.status === 'absent'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                        }`}
                      >
                        {att.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{att.hours_worked || 8} hrs</td>
                    <td className="px-4 py-3 text-slate-400">{att.notes || '—'}</td>
                  </tr>
                ))}
                {!attendanceList.length && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No attendance marked for {currentMonth}. Click "Mark Attendance" to record daily logs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Tab: Employees */}
      {activeTab === 'employees' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((emp) => (
            <Card key={emp.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100">{emp.name}</h3>
                  <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {emp.role}
                  </span>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                  Active
                </span>
              </div>
              <div className="mt-4 space-y-1.5 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Base Monthly Salary:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {formatRs(emp.base_salary_minor)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Phone:</span>
                  <span>{emp.phone || '—'}</span>
                </div>
              </div>
            </Card>
          ))}
          {!employees.length && (
            <div className="col-span-full py-12 text-center text-slate-400">
              No staff members added yet. Click "Add Employee" to register staff.
            </div>
          )}
        </div>
      )}

      {/* Run Itemized Payroll Modal */}
      <Modal open={runModalOpen} onClose={() => setRunModalOpen(false)} title={`Run Monthly Payroll (${currentMonth})`}>
        <form onSubmit={handleRunPayroll} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Payment Date</label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Disburse From Account</label>
              <select
                value={paidFromAccountId}
                onChange={(e) => setPaidFromAccountId(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                <option value="">Accrue as Payable (Do not disburse cash yet)</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 font-bold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                <tr>
                  <th className="p-2">Employee</th>
                  <th className="p-2">Base (Rs)</th>
                  <th className="p-2">Bonus / Allowances</th>
                  <th className="p-2">Deductions</th>
                  <th className="p-2 text-right">Net Payable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payrollItems.map((item) => (
                  <tr key={item.employeeId}>
                    <td className="p-2 font-medium">{item.name}</td>
                    <td className="p-2">{formatRs(item.baseSalaryMinor)}</td>
                    <td className="p-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                        onChange={(e) => updatePayrollItem(item.employeeId, 'allowancesMinor', sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                        className="hw-input w-24 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0"
                        onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
                        onChange={(e) => updatePayrollItem(item.employeeId, 'deductionsMinor', sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
                        className="hw-input w-24 text-xs"
                      />
                    </td>
                    <td className="p-2 text-right font-bold text-emerald-600">
                      {formatRs(item.netPayableMinor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
            <span className="text-sm font-bold">Total Payroll Net:</span>
            <span className="text-base font-extrabold text-emerald-700 dark:text-emerald-400">
              {formatRs(totalPayrollGross)}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setRunModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={savingPayroll}>
              Disburse & Post to General Ledger
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Employee Modal */}
      <Modal open={addEmployeeOpen} onClose={() => setAddEmployeeOpen(false)} title="Register Staff Member">
        <form onSubmit={handleAddEmployee} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Full Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Tariq Mehmood"
              value={empName}
              onChange={(e) => setEmpName(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Role / Designation</label>
              <select
                value={empRole}
                onChange={(e) => setEmpRole(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                <option value="staff">Sales Staff</option>
                <option value="cashier">Cashier</option>
                <option value="inventory_manager">Warehouse / Inventory</option>
                <option value="accountant">Accountant</option>
                <option value="manager">Branch Manager</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Phone</label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="03001234567"
                value={empPhone}
                onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: false, allowNegative: false })}
                onChange={(e) => setEmpPhone(sanitizeDigitsOnly(e.target.value))}
                className="hw-input mt-1 w-full text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Base Monthly Salary (PKR)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 35000"
              value={empSalaryRs}
              onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
              onChange={(e) => setEmpSalaryRs(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setAddEmployeeOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={savingEmployee}>
              Save Staff
            </Button>
          </div>
        </form>
      </Modal>

      {/* Log Attendance Modal */}
      <Modal open={logAttendanceOpen} onClose={() => setLogAttendanceOpen(false)} title="Record Employee Attendance">
        <form onSubmit={handleLogAttendance} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Employee</label>
            <select
              required
              value={attEmployeeId}
              onChange={(e) => setAttEmployeeId(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            >
              <option value="">Select Employee</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.role})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Date</label>
              <input
                type="date"
                required
                value={attDate}
                onChange={(e) => setAttDate(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Status</label>
              <select
                value={attStatus}
                onChange={(e) => setAttStatus(e.target.value)}
                className="hw-input mt-1 w-full text-xs"
              >
                <option value="present">Present (Hazir)</option>
                <option value="absent">Absent (Ghair Hazir)</option>
                <option value="late">Late Arrival</option>
                <option value="half_day">Half Day</option>
                <option value="leave">Approved Leave</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Hours Worked</label>
            <input
              type="text"
              inputMode="decimal"
              value={attHours}
              onKeyDown={(e) => allowOnlyNumbers(e, { allowDecimal: true, allowNegative: false })}
              onChange={(e) => setAttHours(sanitizeNumericString(e.target.value, { allowDecimal: true, allowNegative: false }))}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Remarks / Reason</label>
            <input
              type="text"
              placeholder="e.g. On-site delivery duty"
              value={attNotes}
              onChange={(e) => setAttNotes(e.target.value)}
              className="hw-input mt-1 w-full text-xs"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setLogAttendanceOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={savingAttendance}>
              Save Record
            </Button>
          </div>
        </form>
      </Modal>
    </div>
    </DesktopOnlyWorkspaceGuard>
  );
}
