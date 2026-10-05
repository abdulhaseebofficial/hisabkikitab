import { useCallback, useEffect, useRef, useState } from "react";
import { History, Receipt, Users, Wallet } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { sharedSection, sharedSectionSearch } from "../navigation";
import Card from "../../../shared/components/ui/Card";
import Button from "../../../shared/components/ui/Button";
import Input from "../../../shared/components/ui/Input";
import Select from "../../../shared/components/ui/Select";
import Modal from "../../../shared/components/ui/Modal";
import PageHeader from "../../../shared/components/ui/PageHeader";
import EmptyState from "../../../shared/components/ui/EmptyState";
import { SkeletonCard } from "../../../shared/components/ui/Skeleton";
import useT from "../../../shared/i18n/I18nProvider";
import api from "../api/sharedLivingApi";
import AuditChanges from "../components/AuditChanges";
import LedgerForm from "../components/LedgerForm";
import SharedDashboard from "../components/SharedDashboard";
import SharedExpensesList from "../components/SharedExpensesList";
import { trackEvent } from "../../../shared/analytics/analytics";
import { toInputDate } from "../../../shared/utils/format";

const today = () => toInputDate(new Date());
const moneyField = (key = "amount") => ({
  key,
  type: "text",
  inputMode: "decimal",
  pattern: "(0|[1-9][0-9]{0,9})(\\.[0-9]{1,2})?",
  required: true,
});
const required = (key, type = "text") => ({
  key,
  type,
  required: true,
  maxLength: 100,
});
const minor = (value) => {
  const n = BigInt(value);
  return `${n / 100n}.${String(n % 100n).padStart(2, "0")}`;
};
const remembered = (userId) => {
  try {
    return userId ? JSON.parse(localStorage.getItem(`shared-living:${userId}`) || '{}') : {};
  } catch { return {}; }
};
export default function SharedLivingPage({ userId }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = sharedSection(searchParams);
  const setTab = (section) => setSearchParams(sharedSectionSearch(searchParams, section));
  const { t, language } = useT();
  const [preference] = useState(() => remembered(userId));
  const pending = useRef(false);
  const submission = useRef(null);
  const [spaces, setSpaces] = useState([]),
    [spaceId, setSpaceId] = useState(preference?.spaceId || ""),
    [month, setMonth] = useState(/^(20\d\d|21\d\d|2200)-(0[1-9]|1[0-2])$/.test(preference?.month || '') ? preference.month : today().slice(0, 7));
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null),
    [invite, setInvite] = useState(null);
  const [successorUserId, setSuccessorUserId] = useState("");
  const [confirmTransfer, setConfirmTransfer] = useState(false);
  const [transferError, setTransferError] = useState("");
  const day = today();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!userId || !spaces.some((s) => s.id === spaceId)) return;
    try { localStorage.setItem(`shared-living:${userId}`, JSON.stringify({ spaceId, month })); } catch { /* Storage is optional. */ }
  }, [userId, spaces, spaceId, month]);
  const reload = () => setVersion((n) => n + 1);
  useEffect(() => {
    let current = true;
    api
      .spaces()
      .then((rows) => {
        if (current) {
          setSpaces(rows);
          setSpaceId((id) =>
            rows.some((s) => s.id === id) ? id : rows[0]?.id || "",
          );
          setLoading(false);
        }
      })
      .catch(() => {
        if (current) {
          setError("shared.error");
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [version]);
  useEffect(() => {
    let current = true;
    setData(null);
    setError("");
    if (!spaceId) return undefined;
    setLoading(true);
    api
      .month(spaceId, month)
      .catch(async (err) => {
        if (err.response?.data?.message !== "shared.noMonth" ||
            spaces.find((space) => space.id === spaceId)?.role !== "admin") throw err;
        await api.save("post", `/spaces/${spaceId}/months/${month}/start`, {});
        return api.month(spaceId, month);
      })
      .then((result) => {
        if (current) setData(result);
      })
      .catch((err) => {
        if (current) setError(err.response?.data?.message || "shared.error");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [spaceId, month, version, spaces]);
  const selected = spaces.find((s) => s.id === spaceId),
    admin = selected?.role === "admin",
    writable = admin && data && !data.period.closed;
  const base = `/spaces/${spaceId}`,
    periodPath = `${base}/months/${month}`;
  const categoryLabel = useCallback(
    (id) => {
      const c = data?.categories.find((item) => item.id === id);
      return c?.name || t(`shared.categories.${c?.stable_key || "other"}`);
    },
    [data, t],
  );
  const format = (value) => `${selected?.currency === "PKR" ? "Rs." : selected?.currency || ""} ${value}`;
  const downloadReport = () => {
    if (!data || !selected) return;
    const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      ["Hisabki Kitab - Shared Living report"],
      ["Space", selected.name], ["Month", month], ["Currency", selected.currency], [],
      ["Summary", "Amount"],
      ...["spent", "collected", "totalPaid", "settlementOutstanding", "activeMembers"].map((key) => [t(`shared.${key}`), data.summary[key]]),
      [], ["Food expenses"], ["Date", "Category", "Amount", "Note"],
      ...data.expenses.map((row) => [row.date, categoryLabel(row.category_id), minor(row.amount_minor), row.note]),
      [], ["Bills"], ["Name", "Date", "Due date", "Amount", "Paid"],
      ...data.bills.map((row) => [row.name, row.date, row.due_date, minor(row.amount_minor), row.paid ? "Yes" : "No"]),
      [], ["Contributions"], ["Date", "Member", "Amount", "Method"],
      ...data.payments.map((row) => [row.date, data.summary.members.find((m) => m.id === row.member_id)?.name || "", minor(row.amount_minor), row.method]),
    ];
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hisabkikitab-shared-${month}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  const run = async (fn, onError) => {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      setDialog(null);
      reload();
      if (result && Object.hasOwn(result, 'code')) setInvite(result.code);
      if (result?.invite?.code) setInvite(result.invite.code);
      return result;
    } catch (err) {
      const message = err.response?.data?.message || "shared.error";
      if (onError) onError(message);
      else setError(message);
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  const transferOwnership = async () => {
    setTransferError("");
    const result = await run(() => api.transferOwnership(spaceId, successorUserId), setTransferError);
    setConfirmTransfer(false);
    setSuccessorUserId("");
    if (!result) reload();
  };
  const leaveSpace = () => run(() => api.leave(spaceId));
  const options = (keys) =>
    keys.map((key) => ({
      value: key,
      label: t(`shared.${key === "cash" ? "cash_method" : key}`),
    }));
  const memberOptions = [
    { value: "", label: t("shared.pool") },
    ...(data?.summary.members || []).map((m) => ({
      value: m.id,
      label: m.name,
    })),
  ];
  const openSpace = (edit = false) =>
    setDialog({
      kind: "space",
      title: edit ? "editSpace" : "createSpace",
      path: edit ? base : "/spaces",
      method: edit ? "patch" : "post",
      fields: [
        required("name"),
        {
          key: "currency",
          options: ["PKR", "BDT", "USD", "EUR", "GBP", "INR", "AED", "SAR"],
        },
        { key: "organization_type", options: ["university", "company", "hostel", "other"].map((value) => ({ value, label: t(`shared.organization_${value}`) })) },
        { key: "organization_name", maxLength: 100 },
        ...(!edit ? [{ key: "members", maxLength: 1000, placeholder: t("shared.membersPlaceholder") }] : []),
      ],
      initial: edit
        ? selected
        : {
            currency: "PKR",
            organization_type: "other",
            members: "",
          },
    });
  const openMember = (row) =>
    setDialog({
      kind: "member",
      title: row ? "editMember" : "addMember",
      path: `${base}/members${row ? `/${row.id}` : ""}`,
      method: row ? "patch" : "post",
      fields: [
        required("name"),
        required("joined_on", "date"),
        ...(row ? [{ key: "left_on", type: "date" }, { key: "active", type: "checkbox" }] : []),
      ],
      initial: row || { joined_on: `${month}-01`, weight: "1", active: true },
    });
  const openCategory = (row) =>
    setDialog({
      kind: "category",
      title: row ? "editCategory" : "addCategory",
      path: `${base}/categories${row ? `/${row.id}` : ""}`,
      method: row ? "patch" : "post",
      fields: [
        required("name"),
        { key: "kind", options: options(["food", "bill"]) },
        { key: "position", type: "number", min: 0, max: 10000, required: true },
        { key: "archived", type: "checkbox" },
      ],
      initial: row
        ? { ...row, name: row.name || categoryLabel(row.id) }
        : { kind: "food", position: 0 },
    });
  const openFinancial = (kind, row) => {
    const isPayment = kind === "payments",
      isBill = kind === "bills";
    const categories = (data?.categories || [])
      .filter((c) => !c.archived && c.kind === (isBill ? "bill" : "food"))
      .map((c) => ({ value: c.id, label: categoryLabel(c.id) }));
    const initial = row
      ? {
          ...row,
          amount: minor(row.amount_minor),
          included: data.shares
            .filter((s) => s.bill_id === row.id || s.expense_id === row.id)
            .map((s) => s.member_id)
            .filter(Boolean),
          values: Object.fromEntries(
            data.shares
              .filter((s) => s.bill_id === row.id || s.expense_id === row.id)
              .map((s) => [s.member_id, minor(s.amount_minor)]),
          ),
        }
      : {
          date: day.slice(0, 7) === month ? day : `${month}-01`,
          due_date: day.slice(0, 7) === month ? day : `${month}-01`,
          method: isPayment ? "cash" : "equal",
          category_id: categories[0]?.value,
          member_id: data.summary.members[0]?.id,
          paid_by: "",
          paid: false,
          recurring: isBill,
        };
    if (row && !isPayment && initial.included.length === 0)
      initial.included = data.summary.members
        .filter((member) => member.joined_on <= row.date && (!member.left_on || member.left_on >= row.date))
        .map((member) => member.id);
    setDialog({
      kind,
      title: row ? "editRecord" : `add_${kind}`,
      path: `${periodPath}/${kind}${row ? `/${row.id}` : ""}`,
      method: row ? "patch" : "post",
      initial,
      fields: [
        ...(isPayment
          ? [
              {
                key: "member_id",
                options: memberOptions.slice(1),
                required: true,
              },
            ]
          : [{ key: "category_id", options: categories, required: true }]),
        ...(isBill ? [required("name")] : []),
        moneyField(),
        required("date", "date"),
        ...(isBill
          ? [
              required("due_date", "date"),
              { key: "paid", type: "checkbox" },
              { key: "paid_by", options: memberOptions },
              { key: "recurring", type: "checkbox" },
            ]
          : []),
        {
          key: "method",
          options: options(
            isPayment
              ? ["cash", "bank", "mobile", "other"]
              : ["equal", "custom", "percentage", "later"],
          ),
        },
        ...(isPayment ? [{ key: "reference", maxLength: 100 }] : []),
        { key: "note" },
      ],
    });
  };
  const removeFinancial = (kind, row) =>
    setDialog({
      kind: "remove",
      title: "confirmDelete",
      path: `${periodPath}/${kind}/${row.id}`,
      method: "delete",
      fields: [],
      initial: { version: row.version },
    });
  const submit = (values) =>
    run(async () => {
      const body = { ...values };
      if (dialog.kind === "space" && dialog.method === "post") {
        body.members = String(body.members || "").split(/[,\n]/).map((name) => name.trim()).filter(Boolean);
        body.residents = Math.max(1, body.members.length);
        body.month = month;
      }
      if (dialog.kind === "category") body.position = Number(body.position);
      if (["expenses", "bills"].includes(dialog.kind)) {
        if (!body.included)
          body.included = data.summary.members
            .filter(
              (m) =>
                m.joined_on <= body.date &&
                (!m.left_on || m.left_on >= body.date),
            )
            .map((m) => m.id);
        if (!["custom", "percentage", "weighted"].includes(body.method))
          delete body.values;
        else if (body.values)
          body.values = Object.fromEntries(
            Object.entries(body.values).filter(([id]) =>
              body.included.includes(id),
            ),
          );
      }
      if (dialog.kind === "join") {
        const joined = await api.join(body);
        setSpaceId(joined.space_id);
        trackEvent("shared_group_joined", { role: "viewer" });
        return joined;
      }
      if (dialog.method === 'post' && ['expenses', 'bills', 'payments'].includes(dialog.kind)) {
        const fingerprint = JSON.stringify({ path: dialog.path, body });
        if (submission.current?.fingerprint !== fingerprint) submission.current = { fingerprint, id: crypto.randomUUID() };
        body.request_id = submission.current.id;
      }
      const result = await api.save(dialog.method, dialog.path, body);
      submission.current = null;
      if (dialog.kind === "space" && dialog.method === "post") {
        setSpaceId(result.id);
        setMonth(body.month);
        trackEvent("shared_group_created", { role: "admin" });
      } else if (dialog.method === "post") {
        const event = {
          expenses: "shared_expense_created",
          bills: "shared_bill_created",
          payments: "contribution_added",
          member: "shared_member_added",
        }[dialog.kind];
        if (event) trackEvent(event, { role: admin ? "admin" : "viewer" });
      }
      return result;
    });
  const shift = (delta) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + delta);
    setMonth(d.toISOString().slice(0, 7));
    trackEvent("shared_month_changed", { role: admin ? "admin" : "viewer" });
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title={tab === "dashboard" ? t("mode.shared_living") : t(`shared.${tab === 'manage' ? 'manageSpace' : tab}`)}
        subtitle={tab === "dashboard" ? t("shared.subtitle") : `${selected?.name || t("mode.shared_living")} · ${month}`}
      >
        {tab === "dashboard" && spaces.length > 0 && <div className="flex flex-wrap gap-2">
          <Button onClick={() => openSpace()}>{t("shared.createSpace")}</Button>
          <Button
            variant="secondary"
            onClick={() =>
              setDialog({
                kind: "join",
                title: "join",
                initial: {},
                fields: [{ ...required("code"), maxLength: 7, uppercase: true }],
              })
            }
          >
            {t("shared.join")}
          </Button>
        </div>}
      </PageHeader>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 p-3 text-sm"
        >
          <p>{t(error.startsWith("shared.") ? error : "shared.error")}</p>
          {!dialog && !loading && !busy && error === 'shared.error' && (
            <Button className="mt-3" variant="secondary" onClick={() => {
              setError('');
              setLoading(true);
              reload();
            }}>{t('common.retry')}</Button>
          )}
        </div>
      )}
      {tab === "dashboard" && invite && (
        <Card>
          <p>{t("shared.codeOnce")}</p>
          <Input label={t("shared.code")} value={invite} readOnly />
          <Button variant="secondary" onClick={() => setInvite(null)}>
            {t("shared.dismiss")}
          </Button>
        </Card>
      )}
      {tab === "dashboard" && spaces.length > 0 && (
        <Card className="!p-3 sm:!p-4">
          <div className="grid items-end gap-3 sm:grid-cols-3">
            <Select
              label={t("shared.space")}
              disabled={busy}
              options={spaces.map((s) => ({ value: s.id, label: s.name }))}
              value={spaceId}
              onChange={(e) => {
                setInvite(null);
                setData(null);
                setSuccessorUserId("");
                setSpaceId(e.target.value);
              }}
            />
            <Input
              type="month"
              disabled={busy}
              min="2000-01"
              max="2200-12"
              label={t("shared.month")}
              value={month}
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value))
                  setMonth(e.target.value);
              }}
            />
            <div className="flex gap-2">
              <Button variant="secondary" disabled={busy || month === '2000-01'} onClick={() => shift(-1)}>
                {t("shared.previous")}
              </Button>
              <Button variant="secondary" disabled={busy || month === '2200-12'} onClick={() => shift(1)}>
                {t("shared.next")}
              </Button>
            </div>
          </div>
        </Card>
      )}
      {loading && (
        <div role="status" className="space-y-3">
          <p>{t("shared.loading")}</p>
          <SkeletonCard />
        </div>
      )}
      {tab === "dashboard" && !loading && !error && !spaces.length && (
        <Card>
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t("shared.emptySpaces")}</h2>
              <p className="mt-1 max-w-xl text-sm text-slate-500">
                {t("shared.subtitle")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button onClick={() => openSpace()}>{t("shared.createSpace")}</Button>
              <Button
                variant="secondary"
                onClick={() => setDialog({
                  kind: "join",
                  title: "join",
                  initial: {},
                  fields: [{ ...required("code"), maxLength: 7, uppercase: true }],
                })}
              >
                {t("shared.join")}
              </Button>
            </div>
          </div>
        </Card>
      )}
      {data && (
        <>
          <div id="shared-panel" role="region" aria-label={t(`shared.${tab}`)} className="space-y-5 min-w-0 break-words">
          {data.period.closed && (
            <p className="text-sm">{t("shared.closed")}</p>
          )}
          {tab === "dashboard" && <SharedDashboard
            space={selected} month={month} data={data} writable={writable}
            format={format} categoryLabel={categoryLabel}
            onAddExpense={() => openFinancial("expenses")}
            onAddPayment={() => openFinancial("payments")}
            onOpenBills={() => setTab("bills")}
            onOpenMembers={() => setTab("members")}
            onDownload={downloadReport}
          />}
          {tab === "daily" && <SharedExpensesList
            rows={data.expenses} writable={writable && data.summary.activeMembers > 0} categoryLabel={categoryLabel} format={format}
            onAdd={() => openFinancial("expenses")}
            onEdit={(row) => openFinancial("expenses", row)}
            onRemove={(row) => removeFinancial("expenses", row)}
          />}
          {["bills", "payments"].includes(tab) && (
            <>
              {writable && (
                <Button onClick={() => openFinancial(tab)}>
                  {t(`shared.add_${tab}`)}
                </Button>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {data[tab].map((row) => (
                  <Card key={row.id}>
                    <h2 className="font-semibold">
                      {tab === "bills"
                        ? row.name
                        : data.summary.members.find(
                            (m) => m.id === row.member_id,
                          )?.name}
                    </h2>
                    <p>
                      {row.date} · {format(minor(row.amount_minor))}
                    </p>
                    <p className="text-sm">{row.note}</p>
                    {tab === "bills" && (
                      <>
                        <p>
                          {t(row.paid ? "shared.paid" : "shared.unpaid")} ·{" "}
                          {t("shared.due_date")}: {row.due_date}
                        </p>
                        {data.shares.some((s) => s.bill_id === row.id) &&
                          <p className="text-sm text-slate-500 dark:text-slate-400">{data.shares.filter((s) => s.bill_id === row.id).length} {t('shared.members').toLowerCase()}</p>}
                      </>
                    )}
                    {tab === "bills" && row.split_pending && <p className="text-sm text-amber-700 dark:text-amber-300">{t("shared.later")}</p>}
                    {tab === "payments" && (
                      <p>
                        {t(
                          `shared.${row.method === "cash" ? "cash_method" : row.method}`,
                        )}{" "}
                        · {row.reference}
                      </p>
                    )}
                    {writable && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => openFinancial(tab, row)}
                        >
                          {t("shared.edit")}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => removeFinancial(tab, row)}
                        >
                          {t("shared.remove")}
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
              {!data[tab].length && <Card><EmptyState icon={tab === 'bills' ? Receipt : Wallet} title={t(`shared.${tab === 'bills' ? 'emptyBillsTitle' : 'emptyPaymentsTitle'}`)} message={t(`shared.${tab === 'bills' ? 'emptyBillsHint' : 'emptyPaymentsHint'}`)} /></Card>}
            </>
          )}
          {tab === "members" && (
            <>
              {admin && (
                <Button onClick={() => openMember()}>
                  {t("shared.addMember")}
                </Button>
              )}
              {!data.summary.members.length && <Card><EmptyState icon={Users} title={t('shared.emptyMembersTitle')} message={t(admin ? 'shared.emptyMembersAdminHint' : 'shared.emptyMembersHint')} /></Card>}
              <div className="grid gap-3 sm:grid-cols-2">
                {data.summary.members.map((m) => (
                  <Card key={m.id}>
                    <h2 className="font-semibold">
                      {m.name} ·{" "}
                      {t(
                        m.active && !m.archived
                          ? "shared.active"
                          : "shared.inactive",
                      )}
                    </h2>
                    {[
                      ["assigned", m.assigned],
                      ["totalPaid", (Number(m.contributed) + Number(m.paidDirect)).toFixed(2)],
                      ["due", m.due],
                    ].map(([key, value]) => (
                      <p className="mt-1 flex justify-between gap-3" key={key}>
                        <span>{t(`shared.${key}`)}</span>
                        <span>{format(value)}</span>
                      </p>
                    ))}
                    {admin && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => openMember(m)}
                        >
                          {t("shared.edit")}
                        </Button>
                        {!m.archived && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              setDialog({
                                kind: "removeMember",
                                title: "removeMember",
                                path: `${base}/members/${m.id}`,
                                method: "delete",
                                fields: [required("left_on", "date")],
                                initial: { left_on: today() },
                              })
                            }
                          >
                            {t("shared.remove")}
                          </Button>
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
          {tab === "manage" && (
            <>
              <Card>
                <h2 className="font-semibold">{t("shared.spaceDetails")}</h2>
                <p>{selected.name} · {selected.currency} · {data.summary.activeMembers} {t("shared.activeMembers").toLowerCase()}</p>
                {selected.owner_name && <p className="mt-2 text-sm">{t("shared.currentOwner")}: {selected.owner_name}</p>}
                {selected.organization_name && <p>{t(`shared.organization_${selected.organization_type || "other"}`)}: {selected.organization_name}</p>}
                {userId && selected.owner_id === userId ? (
                  <div className="mt-4 max-w-xl space-y-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                    <h3 className="font-semibold">{t("shared.transferOwnership")}</h3>
                    <p className="text-sm text-slate-600 dark:text-slate-300">{t("shared.transferOwnershipHint")}</p>
                    {transferError && <p role="alert" className="rounded-lg border border-red-300 p-3 text-sm">{t(transferError.startsWith("shared.") ? transferError : "shared.error")}</p>}
                    {selected.eligible_successors?.length ? (
                      <>
                        <Select
                          label={t("shared.newOwner")}
                          value={successorUserId}
                          onChange={(event) => { setSuccessorUserId(event.target.value); setTransferError(""); }}
                          options={[
                            { value: "", label: t("shared.selectSuccessor") },
                            ...selected.eligible_successors.map((member) => ({ value: member.user_id, label: member.name })),
                          ]}
                        />
                        <Button disabled={busy || !successorUserId} onClick={() => { setTransferError(""); setConfirmTransfer(true); }}>
                          {t("shared.transferOwnership")}
                        </Button>
                      </>
                    ) : (
                      <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">{t("shared.noEligibleSuccessor")}</p>
                    )}
                    <p className="text-sm text-slate-600 dark:text-slate-300">{t("shared.transferBeforeLeave")}</p>
                    <Button variant="secondary" disabled title={t("shared.transferBeforeLeave")}>{t("shared.leaveSpace")}</Button>
                  </div>
                ) : (
                  <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                    <Button variant="secondary" disabled={busy} onClick={leaveSpace}>{t("shared.leaveSpace")}</Button>
                  </div>
                )}
                {admin && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={() => openSpace(true)}>
                      {t("shared.editSpace")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        setDialog({
                          kind: "invite",
                          title: "regenerate",
                          path: `${base}/invite`,
                          method: "post",
                          fields: [{ key: "expires_at", type: "date" }],
                          initial: {},
                        })
                      }
                    >
                      {t("shared.regenerate")}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          api.save("post", `${base}/invite`, {
                            disabled: true,
                          }),
                        )
                      }
                    >
                      {t("shared.disableCode")}
                    </Button>
                  </div>
                )}
              </Card>
              {admin && (
                <Card>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        run(() =>
                          api.save("put", periodPath, {
                            closed: !data.period.closed,
                          }),
                        )
                      }
                    >
                      {t(
                        data.period.closed
                          ? "shared.reopenMonth"
                          : "shared.closeMonth",
                      )}
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{t("shared.copyHint")}</p>
                </Card>
              )}
              <Card>
                <h2 className="font-semibold">{t("shared.categoriesTitle")}</h2>
                {admin && (
                  <Button className="mt-3" onClick={() => openCategory()}>
                    {t("shared.addCategory")}
                  </Button>
                )}
                {data.categories.map((c) => (
                  <div
                    key={c.id}
                    className="mt-3 flex items-center justify-between gap-3"
                  >
                    <span>
                      {categoryLabel(c.id)} · {t(`shared.${c.kind}`)}{" "}
                      {c.archived && t("shared.archived")}
                    </span>
                    {admin && (
                      <Button
                        variant="secondary"
                        onClick={() => openCategory(c)}
                      >
                        {t("shared.edit")}
                      </Button>
                    )}
                  </div>
                ))}
              </Card>
            </>
          )}
          {tab === "activity" && (
            <div className="space-y-3">
              {!data.activity.length && <Card><EmptyState icon={History} title={t('shared.emptyActivityTitle')} message={t('shared.emptyActivityHint')} /></Card>}
              {data.activity.map((a) => (
                <Card key={a.id}>
                  <p>
                    {a.actor} · {t(`shared.actions.${a.action}`)}
                  </p>
                  <p className="text-sm text-slate-500">
                    {new Date(a.created_at).toLocaleString(
                      language === "en" ? "en-PK" : "ur-Latn-PK",
                    )}
                  </p>
                  <AuditChanges
                    before={a.before_values}
                    after={a.after_values}
                  />
                </Card>
              ))}
            </div>
          )}
          </div>
        </>
      )}
      <Modal
        open={!!dialog}
        onClose={() => !busy && setDialog(null)}
        title={dialog ? t(`shared.${dialog.title}`) : ""}
        size="lg"
      >
        {error && (
          <p role="alert" className="mb-3">
            {t(error.startsWith("shared.") ? error : "shared.error")}
          </p>
        )}
        {dialog && (
          <LedgerForm
            key={`${dialog.kind}-${dialog.path}`}
            fields={dialog.fields}
            initial={dialog.initial}
            onSubmit={submit}
            busy={busy}
          >
            {["expenses", "bills"].includes(dialog.kind)
              ? (values, setValues) => (
                  <fieldset className="space-y-2">
                    <legend className="mb-2 font-semibold">
                      {t("shared.includedMembers")}
                    </legend>
                    <p className="text-sm text-slate-500">{t("shared.splitSimpleHint")}</p>
                    {data.summary.members
                      .filter(
                        (m) =>
                          m.joined_on <= values.date &&
                          (!m.left_on || m.left_on >= values.date),
                      )
                      .map((m) => {
                        const eligibleIds = data.summary.members
                          .filter(
                            (item) =>
                              item.joined_on <= values.date &&
                              (!item.left_on || item.left_on >= values.date),
                          )
                          .map((item) => item.id);
                        const included = values.included || eligibleIds;
                        return (
                          <div
                            key={m.id}
                            className="grid items-center gap-2 sm:grid-cols-2"
                          >
                            <label className="flex min-h-11 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={included.includes(m.id)}
                                onChange={(e) =>
                                  setValues({
                                    ...values,
                                    included: e.target.checked
                                      ? [...included, m.id]
                                      : included.filter((id) => id !== m.id),
                                  })
                                }
                              />
                              {m.name}
                            </label>
                            {["custom", "percentage"].includes(
                              values.method,
                            ) &&
                              included.includes(m.id) && (
                                <Input
                                  label={`${m.name} · ${t(`shared.${values.method}`)}`}
                                  inputMode="decimal"
                                  pattern="(0|[1-9][0-9]*)(\.[0-9]{1,2})?"
                                  required
                                  value={
                                    values.values?.[m.id] ??
                                    (values.method === "weighted"
                                      ? m.weight
                                      : "")
                                  }
                                  onChange={(e) =>
                                    setValues({
                                      ...values,
                                      values: {
                                        ...values.values,
                                        [m.id]: e.target.value,
                                      },
                                    })
                                  }
                                />
                              )}
                          </div>
                        );
                      })}
                    {values.method === "later" && <p className="rounded-lg bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-300">{t("shared.decideLaterHint")}</p>}
                  </fieldset>
                )
              : undefined}
          </LedgerForm>
        )}
      </Modal>
      <Modal
        open={confirmTransfer}
        onClose={() => !busy && setConfirmTransfer(false)}
        title={t("shared.confirmOwnershipTransfer")}
        size="sm"
        footer={(
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmTransfer(false)}>{t("common.cancel")}</Button>
            <Button loading={busy} disabled={!successorUserId} onClick={transferOwnership}>{t("shared.confirmTransfer")}</Button>
          </>
        )}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t("shared.confirmOwnershipTransferBody", {
            name: selected?.eligible_successors?.find((member) => member.user_id === successorUserId)?.name || "",
          })}
        </p>
      </Modal>
    </div>
  );
}
