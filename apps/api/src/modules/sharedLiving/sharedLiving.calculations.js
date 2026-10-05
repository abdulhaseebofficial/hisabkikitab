// All money is integer minor units. BigInt intermediates make weighted products exact.
const fail = () => {
  throw new Error("shared.invalid");
};
const money = (value) => {
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(String(value))) return fail();
  const [whole, fraction = ""] = String(value).split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > 999999999999n) return fail();
  return Number(amount);
};
const decimal = (value) => {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
};
const date = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return fail();
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    return fail();
  if (value < "2000-01-01" || value > "2200-12-31") return fail();
  return value;
};
const period = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return fail();
  date(`${value}-01`);
  return value;
};
const daysInMonth = (value) => {
  period(value);
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};
const eligible = (member, on) =>
  member.joined_on <= on && (!member.left_on || member.left_on >= on);

/** Largest remainder allocation; equal remainders are ordered by immutable member id. */
const split = (amount, method, members, values = {}) => {
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    !members.length ||
    members.length > 500
  )
    return fail();
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(sorted.map((m) => m.id)).size !== sorted.length) return fail();
  if (
    !["equal", "selected", "custom", "percentage", "weighted"].includes(method)
  )
    return fail();
  if (Object.keys(values).some((id) => !sorted.some((m) => m.id === id)))
    return fail();
  const weights = sorted.map((m) => {
    if (method === "equal" || method === "selected") return 1n;
    const value =
      method === "weighted" ? (values[m.id] ?? m.weight) : values[m.id];
    const units = money(value);
    if (method === "weighted" && !units) return fail();
    return BigInt(units);
  });
  const sum = weights.reduce((a, b) => a + b, 0n);
  if (
    !sum ||
    (method === "percentage" && sum !== 10000n) ||
    (method === "custom" && sum !== BigInt(amount))
  )
    return fail();
  const result = sorted.map((m, i) => ({
    member_id: m.id,
    amount_minor: Number((BigInt(amount) * weights[i]) / sum),
    remainder: (BigInt(amount) * weights[i]) % sum,
    manually_adjusted: method === "custom",
  }));
  let remaining = amount - result.reduce((a, b) => a + b.amount_minor, 0);
  for (const row of [...result].sort((a, b) =>
    a.remainder === b.remainder
      ? a.member_id.localeCompare(b.member_id)
      : a.remainder > b.remainder
        ? -1
        : 1,
  )) {
    if (remaining-- > 0) row.amount_minor += 1;
  }
  return result.map(({ remainder, ...row }) => row);
};

const summary = (
  {
    month,
    budget,
    foodBudget = budget,
    members,
    expenses,
    bills,
    payments,
    shares,
  },
  today = new Date().toISOString().slice(0, 10),
) => {
  const sum = (rows) =>
    rows.reduce((total, row) => total + BigInt(row.amount_minor), 0n);
  const food = sum(expenses),
    billTotal = sum(bills),
    collected = sum(payments),
    spent = food + billTotal;
  const paidDirect = sum(bills.filter((bill) => bill.paid && bill.paid_by));
  const totalPaid = collected + paidDirect;
  const daily = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const on = `${month}-${String(i + 1).padStart(2, "0")}`;
    return {
      date: on,
      amount: decimal(sum(expenses.filter((e) => e.date === on))),
    };
  });
  const memberBalances = members.map((m) => {
    const contribution = sum(payments.filter((p) => p.member_id === m.id));
    const paidDirect = sum(bills.filter((b) => b.paid && b.paid_by === m.id));
    const assigned = sum(shares.filter((s) => s.member_id === m.id));
    const foodShare = sum(
      shares.filter((s) => s.member_id === m.id && s.kind === "expense"),
    );
    const balance = contribution + paidDirect - assigned;
    return {
      ...m,
      contributed: decimal(contribution),
      paidDirect: decimal(paidDirect),
      assigned: decimal(assigned),
      foodCost: decimal(foodShare),
      billsCost: decimal(assigned - foodShare),
      balance: decimal(balance),
      due: decimal(balance < 0n ? -balance : 0n),
      credit: decimal(balance > 0n ? balance : 0n),
      status: balance === 0n ? "settled" : balance < 0n ? "due" : "credit",
    };
  });
  const elapsed =
    today.slice(0, 7) < month
      ? 0
      : today.slice(0, 7) > month
        ? daysInMonth(month)
        : Number(today.slice(8));
  const remainingDays =
    today.slice(0, 7) > month
      ? 0
      : daysInMonth(month) - Math.max(0, elapsed - 1);
  const allCosts = [...expenses, ...bills];
  const categories = [...new Set(allCosts.map((e) => e.category_id))].map(
    (id) => ({
      category_id: id,
      amount: decimal(sum(allCosts.filter((e) => e.category_id === id))),
    }),
  );
  const participants = members.filter(
    (m) =>
      m.joined_on <= `${month}-${daysInMonth(month)}` &&
      (!m.left_on || m.left_on >= `${month}-01`),
  ).length;
  return {
    collected: decimal(collected),
    totalPaid: decimal(totalPaid),
    settlementOutstanding: decimal(spent > totalPaid ? spent - totalPaid : 0n),
    unallocated: decimal(sum(allCosts.filter((row) => row.split_pending))),
    spent: decimal(spent),
    food: decimal(food),
    bills: decimal(billTotal),
    budget: decimal(budget),
    remainingBudget: decimal(BigInt(budget) - spent),
    foodBudget: decimal(foodBudget),
    remainingFoodBudget: decimal(BigInt(foodBudget) - food),
    cash: decimal(collected - food - sum(bills.filter((b) => b.paid && !b.paid_by))),
    outstanding: decimal(
      memberBalances.reduce(
        (total, m) => total + BigInt(m.due.replace(".", "")),
        0n,
      ),
    ),
    today: decimal(sum(expenses.filter((e) => e.date === today))),
    averageDaily: decimal(food / BigInt(Math.max(1, elapsed))),
    recommendedDaily: decimal(
      remainingDays
        ? (BigInt(foodBudget) > food ? BigInt(foodBudget) - food : 0n) /
            BigInt(remainingDays)
        : 0n,
    ),
    perPerson: decimal(spent / BigInt(Math.max(1, participants))),
    foodPerPerson: decimal(food / BigInt(Math.max(1, participants))),
    billsPerPerson: decimal(billTotal / BigInt(Math.max(1, participants))),
    activeMembers: members.filter((m) =>
      eligible(
        m,
        today.slice(0, 7) === month ? today : `${month}-${daysInMonth(month)}`,
      ),
    ).length,
    highestDay: [...daily].sort(
      (a, b) => Number(b.amount) - Number(a.amount),
    )[0],
    daily,
    categories,
    members: memberBalances,
  };
};
module.exports = {
  money,
  decimal,
  date,
  period,
  daysInMonth,
  eligible,
  split,
  summary,
};
