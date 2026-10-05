const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../../apps/api/src/modules/sharedLiving/sharedLiving.calculations");
const v = require("../../apps/api/src/modules/sharedLiving/sharedLiving.validator");
const {
  png,
} = require("../../apps/api/src/modules/sharedLiving/sharedLiving.receipts");
const members = [
  { id: "a", weight: "1", joined_on: "2024-02-01", left_on: null },
  { id: "b", weight: "2", joined_on: "2024-02-15", left_on: "2024-02-20" },
  { id: "c", weight: "1", joined_on: "2024-02-01", left_on: null },
];
test("Shared Living money converts decimal strings exactly and rejects unsafe values", () => {
  assert.equal(c.money("0.29"), 29);
  assert.equal(c.money("9999999999.99"), 999999999999);
  assert.equal(c.decimal(-29), "-0.29");
  for (const value of [
    "1e3",
    "-1",
    "NaN",
    "1.001",
    "10000000000",
    " 1",
    "01",
    null,
    {},
  ])
    assert.throws(() => c.money(value));
});
test("equal and selected splits assign remainder deterministically", () => {
  assert.deepEqual(
    c.split(100, "equal", [...members].reverse()).map((s) => s.amount_minor),
    [34, 33, 33],
  );
  assert.deepEqual(
    c.split(1, "selected", members.slice(0, 2)).map((s) => s.amount_minor),
    [1, 0],
  );
});
test("percentage, custom and weighted splits have exact expected shares", () => {
  assert.deepEqual(
    c
      .split(1001, "percentage", members, { a: "50", b: "30", c: "20" })
      .map((s) => s.amount_minor),
    [501, 300, 200],
  );
  assert.deepEqual(
    c.split(1001, "weighted", members).map((s) => s.amount_minor),
    [250, 501, 250],
  );
  assert.deepEqual(
    c
      .split(1001, "custom", members, { a: "2.50", b: "5.01", c: "2.50" })
      .map((s) => s.amount_minor),
    [250, 501, 250],
  );
  assert.ok(
    c.split(1, "custom", [members[0]], { a: "0.01" })[0].manually_adjusted,
  );
});
test("invalid share totals, duplicate residents and missing weights fail", () => {
  for (const fn of [
    () => c.split(100, "percentage", members, { a: "30", b: "30", c: "30" }),
    () => c.split(100, "custom", members, { a: "1", b: "1", c: "1" }),
    () => c.split(100, "equal", []),
    () => c.split(100, "equal", [members[0], members[0]]),
    () => c.split(100, "weighted", members, { a: "0" }),
    () => c.split(100, "unknown", members),
    () => c.split(100, "equal", members, { outsider: "1" }),
  ])
    assert.throws(fn);
});
test("all supported methods conserve minor units across many rounding cases", () => {
  for (let amount = 1; amount < 500; amount++)
    for (const method of ["equal", "weighted", "percentage"]) {
      const result = c.split(
        amount,
        method,
        members,
        method === "percentage"
          ? { a: "33.33", b: "33.33", c: "33.34" }
          : undefined,
      );
      assert.equal(
        result.reduce((s, r) => s + r.amount_minor, 0),
        amount,
      );
      assert.ok(
        result.every(
          (r) => Number.isSafeInteger(r.amount_minor) && r.amount_minor >= 0,
        ),
      );
    }
});
test("real calendar validation supports every month length", () => {
  assert.equal(c.daysInMonth("2024-02"), 29);
  assert.equal(c.daysInMonth("2023-02"), 28);
  assert.equal(c.daysInMonth("2024-04"), 30);
  assert.equal(c.daysInMonth("2024-01"), 31);
  for (const day of [
    "2023-02-29",
    "2024-04-31",
    "2024-13-01",
    "2024-00-01",
    "2024-2-01",
  ])
    assert.throws(() => c.date(day));
});
test("join and departure dates are inclusive, independently of current active status", () => {
  assert.equal(c.eligible(members[1], "2024-02-14"), false);
  assert.equal(c.eligible(members[1], "2024-02-15"), true);
  assert.equal(c.eligible(members[1], "2024-02-20"), true);
  assert.equal(c.eligible(members[1], "2024-02-21"), false);
});
test("budget, food budget, cash, outstanding, credit and accrual totals stay distinct", () => {
  const result = c.summary(
    {
      month: "2024-02",
      budget: 10000,
      foodBudget: 5000,
      members,
      expenses: [
        { category_id: "egg", date: "2024-02-01", amount_minor: 3000 },
      ],
      bills: [
        { amount_minor: 2000, paid: false },
        { amount_minor: 1000, paid: true },
      ],
      payments: [
        { member_id: "a", amount_minor: 2500 },
        { member_id: "b", amount_minor: 500 },
      ],
      shares: [
        { member_id: "a", amount_minor: 2000, kind: "expense" },
        { member_id: "b", amount_minor: 2000, kind: "bill" },
        { member_id: "c", amount_minor: 2000, kind: "bill" },
      ],
    },
    "2024-02-10",
  );
  for (const [key, value] of Object.entries({
    collected: "30.00",
    spent: "60.00",
    remainingBudget: "40.00",
    remainingFoodBudget: "20.00",
    cash: "-10.00",
    outstanding: "35.00",
    averageDaily: "3.00",
    recommendedDaily: "1.00",
    perPerson: "20.00",
  }))
    assert.equal(result[key], value, key);
  assert.equal(result.members[0].credit, "5.00");
  assert.equal(result.members[1].due, "15.00");
  assert.equal(result.daily.length, 29);
  assert.equal(result.highestDay.date, "2024-02-01");
});
test("validation refuses markup, inactive residents without a leaving date and bad email", () => {
  assert.throws(() =>
    v.space({ name: "<script>", currency: "PKR", residents: 1 }),
  );
  assert.throws(() =>
    v.member({ name: "Ali", joined_on: "2024-02-01", active: false }),
  );
  assert.throws(() =>
    v.member({ name: "Ali", joined_on: "2024-02-01", email: "bad" }),
  );
});
test("receipt validation rejects non-images, oversized uploads and false PNG signatures", () => {
  for (const value of [
    Buffer.from('<svg onload="alert(1)"/>'),
    Buffer.alloc(524289),
    Buffer.from("89504e470d0a1a0a", "hex"),
    {},
    "image.png",
  ])
    assert.throws(() => png(value));
});
test('a resident-paid bill credits its payer without spending shared cash twice', () => {
  const result = c.summary({ month: '2024-02', budget: 10000, members,
    expenses: [], payments: [{ member_id: 'a', amount_minor: 2000 }],
    bills: [{ amount_minor: 3000, paid: true, paid_by: 'b' }],
    shares: members.map((m) => ({ member_id: m.id, amount_minor: 1000, kind: 'bill' })),
  }, '2024-02-20');
  assert.equal(result.cash, '20.00');
  assert.equal(result.members[1].paidDirect, '30.00');
  assert.equal(result.members[1].credit, '20.00');
  assert.equal(result.outstanding, '10.00');
});
test('new shared spaces default to PKR and recurring bills can start at zero', () => {
  assert.equal(v.space({ name: 'Flat 4' }).currency, 'PKR');
  assert.equal(v.space({ name: 'Flat 4', organization_type: 'company' }).organization_name, '');
  const bill = v.expense({ category_id: '00000000-0000-4000-8000-000000000001',
    name: 'Electricity', date: '2026-10-03', due_date: '2026-10-10',
    amount: '0', method: 'equal', recurring: true }, true);
  assert.equal(bill.amount_minor, 0);
  assert.equal(bill.recurring, true);
  assert.throws(() => v.expense({ category_id: bill.category_id,
    date: '2026-10-03', amount: '0', method: 'equal' }));
});

test('shared dashboard outstanding is actual spending less money paid, not a budget guess', () => {
  const result = c.summary({ month: '2026-09', budget: 0, members,
    expenses: [{ category_id: 'groceries', date: '2026-09-07', amount_minor: 300000,
      split_pending: true }],
    bills: [{ category_id: 'rent', amount_minor: 200000, paid: true, paid_by: 'a' },
      { category_id: 'gas', amount_minor: 0, paid: false }],
    payments: [{ member_id: 'b', amount_minor: 200000 }], shares: [],
  }, '2026-09-10');
  assert.equal(result.spent, '5000.00');
  assert.equal(result.totalPaid, '4000.00');
  assert.equal(result.settlementOutstanding, '1000.00');
  assert.equal(result.unallocated, '3000.00');
  assert.deepEqual(result.categories.map((row) => row.category_id).sort(), ['gas', 'groceries', 'rent']);
});
