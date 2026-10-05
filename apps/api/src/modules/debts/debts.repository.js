/**
 * The debts and debt_payments tables.
 *
 * Two things this file is careful about.
 *
 * The arithmetic is done in SQL, on numeric columns, never in JavaScript. Three
 * instalments of 33.33 against 100.00 have to leave exactly 0.01, and adding
 * them up in floating point does not.
 *
 * A payment locks its debt row before reading the balance. Two payments
 * arriving together would otherwise both read the old total, both write their
 * own, and the second would silently erase the first.
 */

const { query, queryOne, transaction } = require('../../infrastructure/database/pool');
const { toApi, toApiList, buildSet, isUuid } = require('../../infrastructure/database/rows');

/**
 * Every debt column plus the two figures that are always derived rather than
 * stored: what is left, and whether today has passed the due date.
 *
 * Overdue is computed here so it can never be stale, and so it can be filtered
 * and sorted on in the same query that reads it.
 */
const DEBT_COLUMNS = `
  d.*,
  c.display_name AS current_person_name,
  c.contact_info AS current_contact_info,
  (d.original_amount - d.paid_amount) AS remaining_amount,
  (d.status NOT IN ('SETTLED', 'CANCELLED') AND d.due_date IS NOT NULL AND d.due_date < now()) AS is_overdue`;
const DEBT_FROM = 'FROM debts d JOIN debt_contacts c ON c.id=d.contact_id AND c.user_id=d.user_id';
const toDebtApi = (row) => {
  const debt = toApi(row);
  if (!debt) return null;
  debt.recordedPersonName = debt.personName;
  debt.personName = debt.currentPersonName;
  debt.contactInfo = debt.currentContactInfo;
  delete debt.currentPersonName;
  delete debt.currentContactInfo;
  return debt;
};
const toDebtList = (rows) => rows.map(toDebtApi);

/* ------------------------------ reading ----------------------------- */

const SORTS = {
  newest: 'd.transaction_date DESC, d.id DESC',
  oldest: 'd.transaction_date ASC, d.id ASC',
  amount: 'd.original_amount DESC, d.id DESC',
  remaining: '(d.original_amount - d.paid_amount) DESC, d.id DESC',
  due: 'd.due_date ASC NULLS LAST, d.id DESC',
};

/** Escapes the wildcards a student can type into a search box. */
const escapeLike = (value) => String(value).replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Turns the query string into a WHERE clause and its values.
 *
 * `status=OVERDUE` is a filter on the derived expression, not on the column,
 * which is why it is spelled out here rather than compared to `d.status`.
 */
const buildFilters = (userId, financeMode, filters = {}) => {
  const clauses = ['d.user_id = $1', 'd.finance_mode = $2'];
  const values = [userId, financeMode];
  const next = () => values.length + 1;

  const { kind, status, search, from, to, dueFrom, dueTo } = filters;

  if (kind === 'BORROWED' || kind === 'LENT') {
    clauses.push(`d.kind = $${next()}`);
    values.push(kind);
  }

  if (status === 'OVERDUE') {
    clauses.push(`d.status NOT IN ('SETTLED', 'CANCELLED') AND d.due_date IS NOT NULL AND d.due_date < now()`);
  } else if (status === 'OUTSTANDING') {
    clauses.push(`d.status NOT IN ('SETTLED', 'CANCELLED')`);
  } else if (['PENDING', 'PARTIALLY_PAID', 'SETTLED', 'CANCELLED'].includes(status)) {
    clauses.push(`d.status = $${next()}`);
    values.push(status);
  }

  if (search) {
    // Both halves compare against the same value, so the placeholder number is
    // taken once. Reading `values.length` again for the second half would give
    // the index of the *previous* parameter, because the push has not happened
    // yet - which is how the note clause once ended up comparing a name to a
    // user id, and every search returned a 500.
    const n = next();
    clauses.push(`(c.display_name ILIKE $${n} ESCAPE '\\' OR d.note ILIKE $${n} ESCAPE '\\')`);
    values.push(`%${escapeLike(search)}%`);
  }

  if (from) {
    clauses.push(`d.transaction_date >= $${next()}`);
    values.push(new Date(from));
  }
  if (to) {
    const end = new Date(to);
    end.setUTCHours(23, 59, 59, 999);
    clauses.push(`d.transaction_date <= $${next()}`);
    values.push(end);
  }
  if (dueFrom) {
    clauses.push(`d.due_date >= $${next()}`);
    values.push(new Date(dueFrom));
  }
  if (dueTo) {
    const end = new Date(dueTo);
    end.setUTCHours(23, 59, 59, 999);
    clauses.push(`d.due_date <= $${next()}`);
    values.push(end);
  }

  return { where: clauses.join(' AND '), values };
};

/** One page of debts, plus the totals for everything the filter matched. */
const list = async (userId, financeMode, filters = {}) => {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const order = SORTS[filters.sort] || SORTS.newest;

  const { where, values } = buildFilters(userId, financeMode, filters);

  const rows = await query(
    `SELECT ${DEBT_COLUMNS} ${DEBT_FROM}
      WHERE ${where}
      ORDER BY ${order}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, (page - 1) * limit]
  );

  const summary = await queryOne(
    `SELECT count(*)::bigint AS total,
            coalesce(sum(d.original_amount - d.paid_amount), 0) AS outstanding
       ${DEBT_FROM} WHERE ${where}`,
    values
  );

  const total = Number(summary.total);

  return {
    items: toDebtList(rows),
    filteredOutstanding: Number(summary.outstanding),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
};

// Contact identity, not spelling, groups the two directions. Old rows each
// retain their own contact until the user explicitly chooses one for new debts.
const people = async (userId, financeMode, filters = {}) => {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = 20;
  const search = String(filters.search || '').trim();
  const params = [userId, financeMode, search ? `%${escapeLike(search)}%` : ''];
  const grouped = `${DEBT_FROM} WHERE d.user_id=$1 AND d.finance_mode=$2
    AND ($3='' OR c.display_name ILIKE $3 ESCAPE '\\')
    GROUP BY c.id, c.display_name, c.contact_info`;
  const rows = await query(
    `SELECT c.id AS contact_id, c.display_name AS person_name, c.contact_info,
      count(*)::integer AS record_count, max(d.transaction_date) AS latest_date,
      coalesce(sum(CASE WHEN d.kind='LENT' AND d.status NOT IN ('SETTLED','CANCELLED')
        THEN d.original_amount-d.paid_amount
        WHEN d.kind='BORROWED' AND d.status NOT IN ('SETTLED','CANCELLED')
        THEN -(d.original_amount-d.paid_amount) ELSE 0 END),0) AS net_balance
      ${grouped} ORDER BY latest_date DESC, contact_id ASC LIMIT $4 OFFSET $5`,
    [...params, limit, (page - 1) * limit],
  );
  const totalRow = await queryOne(`SELECT count(*)::integer AS total FROM (SELECT 1 ${grouped}) people`, params);
  const total = Number(totalRow.total);
  return {
    items: rows.map((row) => ({
      key: row.contact_id, contactId: row.contact_id, name: row.person_name,
      contactInfo: row.contact_info,
      recordCount: Number(row.record_count), netBalance: Number(row.net_balance),
      latestDate: row.latest_date,
    })),
    pagination: { page, total, pages: Math.ceil(total / limit) || 1,
      hasNext: page * limit < total, hasPrev: page > 1 },
  };
};

const personRecords = async (userId, financeMode, contactId, page = 1) => {
  const limit = 20;
  if (!isUuid(contactId)) return { items: [], pagination: { page, total: 0, pages: 1, hasNext: false, hasPrev: false } };
  const rows = await query(
    `SELECT ${DEBT_COLUMNS} ${DEBT_FROM} WHERE d.user_id=$1 AND d.finance_mode=$2
      AND d.contact_id=$3
      ORDER BY d.transaction_date DESC,d.id DESC LIMIT $4 OFFSET $5`,
    [userId, financeMode, contactId, limit, (page - 1) * limit],
  );
  const totalRow = await queryOne(
    `SELECT count(*)::integer AS total FROM debts WHERE user_id=$1 AND finance_mode=$2
      AND contact_id=$3`, [userId, financeMode, contactId],
  );
  const total = Number(totalRow.total);
  return { items: toDebtList(rows), pagination: { page, total,
    pages: Math.ceil(total / limit) || 1, hasNext: page * limit < total, hasPrev: page > 1 } };
};

const contacts = async (userId, search = '', page = 1) => {
  const limit = 100;
  const rows = await query(
    `SELECT id, display_name, contact_info FROM debt_contacts
      WHERE user_id=$1 AND ($2='' OR display_name ILIKE $2 ESCAPE '\\'
        OR contact_info ILIKE $2 ESCAPE '\\')
      ORDER BY lower(display_name), id LIMIT $3 OFFSET $4`,
    [userId, search ? `%${escapeLike(search)}%` : '', limit + 1, (page - 1) * limit],
  );
  return {
    items: rows.slice(0, limit).map((row) => ({ id: row.id, displayName: row.display_name, contactInfo: row.contact_info })),
    page, hasNext: rows.length > limit, hasPrev: page > 1,
  };
};

const renameContact = async (id, userId, displayName) => {
  if (!isUuid(id)) return null;
  const row = await queryOne(
    `UPDATE debt_contacts SET display_name=$3, updated_at=now()
      WHERE id=$1 AND user_id=$2 RETURNING id, display_name, contact_info`,
    [id, userId, displayName],
  );
  return row ? { id: row.id, displayName: row.display_name, contactInfo: row.contact_info } : null;
};

const findById = async (id, financeMode, userId) => {
  if (!isUuid(id)) return null;
  const row = await queryOne(
    `SELECT ${DEBT_COLUMNS} ${DEBT_FROM} WHERE d.id = $1 AND d.user_id = $2 AND d.finance_mode = $3`,
    [id, userId, financeMode]
  );
  return toDebtApi(row);
};

/**
 * The ledger behind one debt, newest payment first.
 *
 * No mode filter, and none is needed: debt_payments has no mode of its own -
 * it inherits the debt's, through the composite foreign key - and the service
 * has already confirmed the debt is one this person can see in this mode
 * before asking for its ledger.
 */
const payments = async (debtId, userId) => {
  if (!isUuid(debtId)) return [];
  const rows = await query(
    `SELECT * FROM debt_payments
      WHERE debt_id = $1 AND user_id = $2
      ORDER BY paid_on DESC, created_at DESC`,
    [debtId, userId]
  );
  return toApiList(rows);
};

/**
 * Every debt in one mode, with its ledger attached - for the account export.
 *
 * Cancelled and settled records are included. An export that quietly dropped
 * them would be a partial account of what happened: a cancelled debt is a
 * thing the person recorded and then wrote off, and the ledger under a settled
 * one is the proof of what was actually paid.
 *
 * Two queries rather than one per debt: the ledger comes back in a single read
 * and is grouped in memory, so an account with three hundred debts does not
 * become three hundred round trips.
 */
const listAllWithPayments = async (userId, financeMode) => {
  const [debtRows, paymentRows] = await Promise.all([
    query(
      `SELECT ${DEBT_COLUMNS} ${DEBT_FROM}
        WHERE d.user_id = $1 AND d.finance_mode = $2
        ORDER BY d.created_at DESC, d.id DESC`,
      [userId, financeMode]
    ),
    query(
      `SELECT p.* FROM debt_payments p
         JOIN debts d ON d.id = p.debt_id
        WHERE p.user_id = $1 AND d.finance_mode = $2
        ORDER BY p.paid_on DESC, p.created_at DESC`,
      [userId, financeMode]
    ),
  ]);

  const ledger = new Map();
  for (const row of toApiList(paymentRows)) {
    const forDebt = ledger.get(row.debtId) || [];
    forDebt.push(row);
    ledger.set(row.debtId, forDebt);
  }

  return toDebtList(debtRows).map((debt) => ({ ...debt, payments: ledger.get(debt._id) || [] }));
};

/* ------------------------------ writing ----------------------------- */

const create = async (userId, input, outerTx = null) => {
  const perform = async (tx) => {
    let personName = input.personName;
    let personContact = input.personContact || '';
    if (input.contactId) {
      const contact = await tx.queryOne(
        `SELECT display_name, contact_info FROM debt_contacts
        WHERE id=$1 AND user_id=$2 FOR SHARE`, [input.contactId, userId],
      );
      if (!contact) return null;
      personName = contact.display_name;
      if (!input.personContact) personContact = contact.contact_info;
    }
    const row = await tx.queryOne(
      `INSERT INTO debts
       (user_id, finance_mode, kind, contact_id, person_name, person_contact, original_amount,
         transaction_date, due_date, category, note, purpose, purpose_category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
      [
        userId,
        input.financeMode,
        input.kind,
        input.contactId || null,
        personName,
        personContact,
        input.originalAmount,
        input.transactionDate,
        input.dueDate || null,
        input.category || null,
        input.note || '',
        input.purpose || '',
        input.purposeCategory || null,
      ],
    );
    const created = await tx.queryOne(
      `SELECT ${DEBT_COLUMNS} ${DEBT_FROM} WHERE d.id=$1 AND d.user_id=$2`,
      [row.id, userId],
    );
    return toDebtApi(created);
  };
  return outerTx ? perform(outerTx) : transaction(perform);
};

/**
 * Applies a partial update. The money columns are deliberately not settable:
 * a balance is what the ledger says it is, not what a request claims.
 */
const update = async (id, financeMode, userId, patch) => {
  const columns = {
    kind: patch.kind,
    purpose: patch.purpose,
    purpose_category: patch.purposeCategory,
    person_contact: patch.personContact,
    original_amount: patch.originalAmount,
    transaction_date: patch.transactionDate,
    due_date: patch.dueDate,
    category: patch.category,
    note: patch.note,
  };

  const { fragment, values, next } = buildSet(columns);
  if (!fragment && patch.personName === undefined) return findById(id, financeMode, userId);

  // Changing the original amount can change what the status should be - paying
  // 500 against a debt later corrected to 500 settles it - so the status is
  // recomputed from the balance rather than left as it was.
  //
  // All of it in ONE statement, deliberately. Writing the amount first and the
  // status second leaves the row saying two different things about itself in
  // between: a reader sees PARTIALLY_PAID on a debt that is now fully paid, and
  // if the second statement never runs, it stays that way. The database refuses
  // that intermediate row outright (debts_status_matches_balance), which is how
  // the split came to light.
  //
  // Postgres evaluates every SET expression against the row as it was BEFORE
  // the update, so the status below cannot simply read original_amount - that
  // would still be the old figure. It reads the incoming value instead, falling
  // back to the stored one when the amount is not part of this patch.
  const amountPlaceholder = patch.originalAmount === undefined ? 'original_amount' : `$${next}`;
  const amountValues = patch.originalAmount === undefined ? [] : [patch.originalAmount];
  const idPosition = next + amountValues.length;

  return transaction(async (tx) => {
    const locked = await tx.queryOne(
      'SELECT contact_id FROM debts WHERE id=$1 AND user_id=$2 AND finance_mode=$3 FOR UPDATE',
      [id, userId, financeMode],
    );
    if (!locked) return null;
    if (patch.personName !== undefined || patch.personContact !== undefined) {
      await tx.queryOne(
        `UPDATE debt_contacts SET display_name=coalesce($3,display_name),
          contact_info=coalesce($4,contact_info), updated_at=now()
          WHERE id=$1 AND user_id=$2 RETURNING id`,
        [locked.contact_id, userId, patch.personName ?? null, patch.personContact ?? null],
      );
    }
    if (fragment) {
      await tx.queryOne(
        `UPDATE debts
        SET ${fragment},
            status = CASE
              WHEN paid_amount >= ${amountPlaceholder}::numeric THEN 'SETTLED'
              WHEN paid_amount > 0 THEN 'PARTIALLY_PAID'
              ELSE 'PENDING' END,
            settled_at = CASE
              WHEN paid_amount >= ${amountPlaceholder}::numeric THEN coalesce(settled_at, now())
              ELSE NULL END,
            updated_at = now()
      WHERE id = $${idPosition} AND user_id = $${idPosition + 1}
        AND finance_mode = $${idPosition + 2}
      RETURNING id`,
        [...values, ...amountValues, id, userId, financeMode],
      );
    }
    const row = await tx.queryOne(
      `SELECT ${DEBT_COLUMNS} ${DEBT_FROM} WHERE d.id=$1 AND d.user_id=$2 AND d.finance_mode=$3`,
      [id, userId, financeMode],
    );
    return toDebtApi(row);
  });
};

const remove = async (id, financeMode, userId) => {
  if (!isUuid(id)) return false;
  // debt_payments is ON DELETE CASCADE, so the ledger goes with it.
  const rows = await query(
    `DELETE FROM debts WHERE id = $1 AND user_id = $2 AND finance_mode = $3 RETURNING id`,
    [id, userId, financeMode]
  );
  return rows.length > 0;
};

/**
 * Marks a record cancelled: it was never really owed, or both sides walked
 * away from it.
 *
 * Deliberately not a delete. The ledger stays, the record stays readable, and
 * the row simply stops counting towards what anybody owes - every summary and
 * overdue query already excludes CANCELLED. Someone who wrote down a debt that
 * turned out to be a mistake still wants to see that they wrote it down.
 *
 * Already-cancelled and already-settled rows are refused rather than silently
 * re-cancelled: a settled debt is a finished story, and cancelling it would
 * quietly rewrite what was paid.
 */
const cancel = async (id, financeMode, userId, reason) => {
  if (!isUuid(id)) return { reason: 'NOT_FOUND' };

  const row = await queryOne(
    `UPDATE debts
        SET status = 'CANCELLED',
            -- The reason is appended to the note, never a replacement for it:
            -- whatever the person already wrote about this debt is still the
            -- most useful thing on the record. nullif keeps an empty note from
            -- contributing a blank first line.
            note = CASE
              WHEN $4::text IS NULL THEN note
              WHEN nullif(note, '') IS NULL THEN $4::text
              ELSE note || chr(10) || $4::text
            END,
            updated_at = now()
      WHERE id = $1 AND user_id = $2 AND finance_mode = $3
        AND status NOT IN ('SETTLED', 'CANCELLED')
      RETURNING id`,
    [id, userId, financeMode, reason ? String(reason).trim() : null]
  );

  if (row) return { reason: 'OK', debt: await findById(id, financeMode, userId) };

  // Nothing changed. Which of the two it was matters to the caller: a 404 for
  // someone else's record, a 400 for one that cannot be cancelled.
  const existing = await findById(id, financeMode, userId);
  return { reason: existing ? 'NOT_CANCELLABLE' : 'NOT_FOUND', debt: existing };
};

/* ----------------------------- payments ----------------------------- */

/**
 * Records a payment and moves the balance, atomically.
 *
 * The row is locked first: two payments arriving together would otherwise both
 * read the old total and the second would overwrite the first. Everything after
 * the lock - the insert, the new total, the status - happens in one transaction,
 * so a failure anywhere leaves no half-applied payment.
 *
 * Returns a reason rather than throwing, so the service decides what each one
 * means to a caller.
 */
const addPayment = async (debtId, financeMode, userId, { amount, paidOn, note }, outerTx = null) => {
  const perform = async (tx) => {
    if (!isUuid(debtId)) return { reason: 'NOT_FOUND' };

    const current = await tx.queryOne(
      `SELECT original_amount, paid_amount, status
         FROM debts WHERE id = $1 AND user_id = $2 AND finance_mode = $3 FOR UPDATE`,
      [debtId, userId, financeMode]
    );
    if (!current) return { reason: 'NOT_FOUND' };

    // Compared in SQL against numeric columns, so a payment that exactly
    // clears the balance is recognised as exactly clearing it.
    const room = await tx.queryOne(
      `SELECT ($1::numeric - $2::numeric) < $3::numeric AS too_much`,
      [current.original_amount, current.paid_amount, amount]
    );
    if (room.too_much) {
      return {
        reason: 'OVERPAY',
        remaining: Number(current.original_amount) - Number(current.paid_amount),
      };
    }

    const payment = await tx.queryOne(
      `INSERT INTO debt_payments (debt_id, user_id, amount, paid_on, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [debtId, userId, amount, paidOn || new Date(), note || '']
    );

    await tx.query(
      `UPDATE debts
          SET paid_amount = paid_amount + $3::numeric,
              status = CASE
                WHEN paid_amount + $3::numeric >= original_amount THEN 'SETTLED'
                WHEN paid_amount + $3::numeric > 0 THEN 'PARTIALLY_PAID'
                ELSE 'PENDING' END,
              settled_at = CASE
                WHEN paid_amount + $3::numeric >= original_amount
                THEN coalesce(settled_at, now()) ELSE NULL END,
              updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [debtId, userId, amount]
    );

    const row = await tx.queryOne(
      `SELECT ${DEBT_COLUMNS} ${DEBT_FROM} WHERE d.id = $1 AND d.user_id = $2 AND d.finance_mode = $3`,
      [debtId, userId, financeMode]
    );

    return {
      reason: 'OK',
      debt: toDebtApi(row),
      payment: toApi(payment),
      wasSettled: current.status === 'SETTLED',
    };
  };
  return outerTx ? perform(outerTx) : transaction(perform);
};

/**
 * Removes a payment and puts the balance back, atomically.
 *
 * Used to correct a mistyped entry. The debt returns to whatever status the
 * remaining ledger implies, so undoing the payment that settled a debt reopens
 * it rather than leaving it wrongly closed.
 */
const removePayment = async (debtId, paymentId, financeMode, userId) =>
  transaction(async (tx) => {
    if (!isUuid(debtId) || !isUuid(paymentId)) return { reason: 'NOT_FOUND' };

    const locked = await tx.queryOne(
      `SELECT id FROM debts WHERE id = $1 AND user_id = $2 AND finance_mode = $3 FOR UPDATE`,
      [debtId, userId, financeMode]
    );
    if (!locked) return { reason: 'NOT_FOUND' };

    const removed = await tx.queryOne(
      `DELETE FROM debt_payments
        WHERE id = $1 AND debt_id = $2 AND user_id = $3 RETURNING amount`,
      [paymentId, debtId, userId]
    );
    if (!removed) return { reason: 'PAYMENT_NOT_FOUND' };

    await tx.query(
      `UPDATE debts
          SET paid_amount = paid_amount - $3::numeric,
              status = CASE
                WHEN paid_amount - $3::numeric >= original_amount THEN 'SETTLED'
                WHEN paid_amount - $3::numeric > 0 THEN 'PARTIALLY_PAID'
                ELSE 'PENDING' END,
              settled_at = CASE
                WHEN paid_amount - $3::numeric >= original_amount
                THEN settled_at ELSE NULL END,
              updated_at = now()
        WHERE id = $1 AND user_id = $2`,
      [debtId, userId, removed.amount]
    );

    const row = await tx.queryOne(
      `SELECT ${DEBT_COLUMNS} ${DEBT_FROM} WHERE d.id = $1 AND d.user_id = $2 AND d.finance_mode = $3`,
      [debtId, userId, financeMode]
    );
    return { reason: 'OK', debt: toDebtApi(row) };
  });

/* ------------------------------ summary ----------------------------- */

/**
 * What the student owes and is owed, counting only what is still outstanding.
 *
 * A settled debt contributes nothing: it is history, not a position. Every
 * figure is summed in SQL over numeric columns, so the totals are exact and the
 * frontend never adds money up itself.
 */
const summary = async (userId, financeMode) => {
  const row = await queryOne(
    `SELECT
       coalesce(sum(original_amount - paid_amount)
                FILTER (WHERE kind = 'BORROWED' AND status NOT IN ('SETTLED', 'CANCELLED')), 0) AS payable,
       coalesce(sum(original_amount - paid_amount)
                FILTER (WHERE kind = 'LENT' AND status NOT IN ('SETTLED', 'CANCELLED')), 0) AS receivable,
       coalesce(sum(original_amount - paid_amount)
                FILTER (WHERE status NOT IN ('SETTLED', 'CANCELLED')
                        AND due_date IS NOT NULL AND due_date < now()), 0) AS overdue,
       count(*) FILTER (WHERE status NOT IN ('SETTLED', 'CANCELLED'))::bigint AS outstanding_count,
       count(*) FILTER (WHERE status = 'SETTLED')::bigint AS settled_count,
       count(*) FILTER (WHERE status NOT IN ('SETTLED', 'CANCELLED')
                        AND due_date IS NOT NULL AND due_date < now())::bigint AS overdue_count
     FROM debts WHERE user_id = $1 AND finance_mode = $2`,
    [userId, financeMode]
  );

  return {
    payable: Number(row.payable),
    receivable: Number(row.receivable),
    overdue: Number(row.overdue),
    outstandingCount: Number(row.outstanding_count),
    settledCount: Number(row.settled_count),
    overdueCount: Number(row.overdue_count),
  };
};

/** Outstanding debts falling due within `days`, soonest first. */
const dueWithin = async (userId, financeMode, days, limit = 5) => {
  const rows = await query(
    `SELECT ${DEBT_COLUMNS} ${DEBT_FROM}
      WHERE d.user_id = $1 AND d.finance_mode = $4
        AND d.status NOT IN ('SETTLED', 'CANCELLED') AND d.due_date IS NOT NULL
        AND d.due_date <= now() + ($2 || ' days')::interval
      ORDER BY d.due_date ASC LIMIT $3`,
    [userId, String(days), limit, financeMode]
  );
  return toDebtList(rows);
};

module.exports = {
  list,
  people,
  personRecords,
  contacts,
  renameContact,
  findById,
  payments,
  listAllWithPayments,
  create,
  update,
  remove,
  cancel,
  addPayment,
  removePayment,
  summary,
  dueWithin,
};
