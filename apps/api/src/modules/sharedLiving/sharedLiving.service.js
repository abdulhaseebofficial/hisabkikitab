const crypto = require("crypto");
const repo = require("./sharedLiving.repository");
const v = require("./sharedLiving.validator");
const calc = require("./sharedLiving.calculations");
const ApiError = require("../../shared/errors/ApiError");
const { png } = require("./sharedLiving.receipts");
const DEFAULTS = {
  food: [
    "egg",
    "yogurt",
    "water",
    "vegetables",
    "meat",
    "milk",
    "tea",
    "groceries",
    "other",
  ],
  bill: [
    "cook",
    "rent",
    "electricity",
    "internet",
    "gas",
    "water",
    "groceries",
    "maintenance",
    "cleaning",
    "other",
  ],
};
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const authorize = (space, user, write) => {
  if (!space) throw ApiError.notFound("shared.notFound");
  if (write && (space.role !== "admin" || space.owner_id !== user._id))
    throw ApiError.forbidden("shared.viewOnly");
};
const scope = (user, spaceId, write, fn) =>
  repo.transaction(async (tx) => {
    v.uuid(spaceId);
    const space = await repo.access(tx, spaceId, user._id);
    authorize(space, user, write);
    return fn(tx, space);
  });
const openPeriod = async (tx, spaceId, month, write = true) => {
  const p = await repo.period(tx, spaceId, v.month(month));
  if (!p) throw ApiError.notFound("shared.noMonth");
  if (write && p.closed) throw ApiError.conflict("shared.closed");
  return p;
};
const invite = async (tx, space, user, body = {}) => {
  let expires = null;
  if (body.expires_at) {
    expires = `${v.date(body.expires_at)}T23:59:59.999Z`;
    if (new Date(expires) <= new Date()) return v.invalid();
  }
  await tx.query(
    "UPDATE sl_invites SET revoked_at=now() WHERE space_id=$1 AND revoked_at IS NULL",
    [space.id],
  );
  const code = crypto.randomBytes(32).toString("base64url");
  if (!v.bool(body.disabled))
    await tx.query(
      "INSERT INTO sl_invites(space_id,code_hash,expires_at) VALUES($1,$2,$3)",
      [space.id, hash(code), expires],
    );
  await repo.audit(
    tx,
    space.id,
    user._id,
    body.disabled ? "invite_disabled" : "invite_regenerated",
    "invite",
    null,
    null,
    { expires_at: expires, disabled: !!body.disabled },
  );
  return { code: body.disabled ? null : code, expires_at: expires };
};
const createSpace = (user, body) =>
  repo.transaction(async (tx) => {
    const values = v.space(body),
      month = v.month(body.month),
      budget = v.amount(body.budget);
    const space = await repo.insert(tx, "spaces", {
      ...values,
      owner_id: user._id,
    });
    await tx.query(
      "INSERT INTO sl_memberships(space_id,user_id,role) VALUES($1,$2,'admin')",
      [space.id, user._id],
    );
    await repo.insert(tx, "periods", {
      space_id: space.id,
      month: `${month}-01`,
      budget_minor: budget,
      food_budget_minor: v.amount(body.food_budget ?? body.budget),
    });
    for (const [kind, keys] of Object.entries(DEFAULTS))
      for (let i = 0; i < keys.length; i++)
        await repo.insert(tx, "categories", {
          space_id: space.id,
          kind,
          stable_key: keys[i],
          position: i,
        });
    await repo.audit(
      tx,
      space.id,
      user._id,
      "space_created",
      "space",
      space.id,
      null,
      space,
    );
    return { ...space, role: "admin", invite: await invite(tx, space, user) };
  });
const join = (user, body) =>
  repo.transaction(async (tx) => {
    if (typeof body.code !== "string" || !/^[\w-]{43}$/.test(body.code))
      throw ApiError.badRequest("shared.invalidCode");
    // Lock the space before rechecking the invitation, matching rotation's lock order.
    const found = await tx.queryOne(
      "SELECT space_id FROM sl_invites WHERE code_hash=$1",
      [hash(body.code)],
    );
    if (!found) throw ApiError.badRequest("shared.invalidCode");
    await tx.query("SELECT id FROM sl_spaces WHERE id=$1 FOR UPDATE", [
      found.space_id,
    ]);
    const valid = await tx.queryOne(
      "SELECT space_id FROM sl_invites WHERE code_hash=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())",
      [hash(body.code)],
    );
    if (!valid) throw ApiError.badRequest("shared.invalidCode");
    const membership = await tx.queryOne(
      "INSERT INTO sl_memberships(space_id,user_id,role) VALUES($1,$2,'viewer') ON CONFLICT(space_id,user_id) DO NOTHING RETURNING *",
      [valid.space_id, user._id],
    );
    if (membership)
      await repo.audit(
        tx,
        valid.space_id,
        user._id,
        "viewer_joined",
        "membership",
        null,
        null,
        { role: "viewer" },
      );
    return { space_id: valid.space_id };
  });
const dashboard = (user, spaceId, month) =>
  scope(user, spaceId, false, async (tx, space) => {
    const p = await openPeriod(tx, spaceId, month, false);
    const members = await repo.members(tx, spaceId);
    const expenses = await repo.records(tx, "expenses", spaceId, p.id),
      bills = await repo.records(tx, "bills", spaceId, p.id),
      payments = await repo.records(tx, "payments", spaceId, p.id);
    const shares = await repo.shares(tx, spaceId, p.id);
    const categories = await tx.query(
      "SELECT * FROM sl_categories WHERE space_id=$1 ORDER BY position,id",
      [spaceId],
    );
    const receipts = await tx.query(
      "SELECT bill_id FROM sl_receipts WHERE space_id=$1",
      [spaceId],
    );
    for (const bill of bills)
      bill.has_receipt = receipts.some((r) => r.bill_id === bill.id);
    const periods = await tx.query(
      "SELECT p.*,to_char(p.month,'YYYY-MM') AS month_key,(SELECT COALESCE(sum(e.amount_minor),0)::text FROM sl_expenses e WHERE e.period_id=p.id AND NOT e.deleted) AS food_minor,(SELECT COALESCE(sum(b.amount_minor),0)::text FROM sl_bills b WHERE b.period_id=p.id AND NOT b.deleted) AS bills_minor FROM sl_periods p WHERE space_id=$1 ORDER BY month",
      [spaceId],
    );
    const activity = await tx.query(
      "SELECT a.id,a.action,a.entity,a.entity_id,a.before_values,a.after_values,a.created_at,a.actor_name AS actor FROM sl_activity a LEFT JOIN users u ON u.id=a.actor_id WHERE a.space_id=$1 ORDER BY a.id DESC LIMIT 100",
      [spaceId],
    );
    return {
      space,
      period: p,
      periods,
      categories,
      expenses,
      bills,
      payments,
      shares,
      activity,
      summary: calc.summary({
        month,
        budget: p.budget_minor,
        foodBudget: p.food_budget_minor,
        members,
        expenses,
        bills,
        payments,
        shares,
      }),
    };
  });
const editSpace = (user, spaceId, body) =>
  scope(user, spaceId, true, async (tx, space) => {
    const values = v.space(body);
    // Currency is the unit of every stored amount; changing it would relabel history.
    if (values.currency !== space.currency)
      throw ApiError.conflict("shared.currencyLocked");
    const result = await repo.update(tx, "spaces", spaceId, spaceId, values);
    await repo.audit(
      tx,
      spaceId,
      user._id,
      "space_updated",
      "space",
      spaceId,
      space,
      result,
    );
    return result;
  });
const editPeriod = (user, spaceId, month, body) =>
  scope(user, spaceId, true, async (tx) => {
    v.month(month);
    const before = await repo.period(tx, spaceId, month);
    let result;
    if (!before)
      result = await repo.insert(tx, "periods", {
        space_id: spaceId,
        month: `${month}-01`,
        budget_minor: v.amount(body.budget),
        food_budget_minor: v.amount(body.food_budget ?? body.budget),
      });
    else {
      const closed = v.bool(body.closed, before.closed);
      if (
        before.closed &&
        (body.budget !== undefined || body.food_budget !== undefined)
      )
        throw ApiError.conflict("shared.closed");
      result = await repo.update(tx, "periods", spaceId, before.id, {
        closed,
        ...(body.budget === undefined
          ? {}
          : { budget_minor: v.amount(body.budget) }),
        ...(body.food_budget === undefined
          ? {}
          : { food_budget_minor: v.amount(body.food_budget) }),
      });
    }
    await repo.audit(
      tx,
      spaceId,
      user._id,
      !before
        ? "month_started"
        : result.closed
          ? "month_closed"
          : before.closed
            ? "month_reopened"
            : "budget_updated",
      "period",
      result.id,
      before,
      result,
    );
    return result;
  });
const editMember = (user, spaceId, id, body, remove = false) =>
  scope(user, spaceId, true, async (tx) => {
    const before = id
      ? await repo.find(tx, "members", spaceId, v.uuid(id))
      : null;
    if (id && !before) throw ApiError.notFound("shared.notFound");
    const values = remove
      ? { archived: true, active: false, left_on: v.date(body.left_on) }
      : v.member(body);
    if (
      remove &&
      values.left_on < new Date(before.joined_on).toISOString().slice(0, 10)
    )
      return v.invalid();
    const result = id
      ? await repo.update(tx, "members", spaceId, id, values)
      : await repo.insert(tx, "members", { space_id: spaceId, ...values });
    await repo.audit(
      tx,
      spaceId,
      user._id,
      remove ? "member_removed" : id ? "member_updated" : "member_added",
      "member",
      result.id,
      before,
      result,
    );
    return result;
  });
const editCategory = (user, spaceId, id, body) =>
  scope(user, spaceId, true, async (tx) => {
    const before = id
      ? await repo.find(tx, "categories", spaceId, v.uuid(id))
      : null;
    if (id && !before) throw ApiError.notFound("shared.notFound");
    const values = v.category(body);
    if (before && before.kind !== values.kind) return v.invalid();
    const result = id
      ? await repo.update(tx, "categories", spaceId, id, values)
      : await repo.insert(tx, "categories", {
          space_id: spaceId,
          stable_key: crypto.randomUUID(),
          ...values,
        });
    await repo.audit(
      tx,
      spaceId,
      user._id,
      id ? "category_updated" : "category_added",
      "category",
      result.id,
      before,
      result,
    );
    return result;
  });
const saveFinancial = async (
  tx,
  user,
  spaceId,
  p,
  kind,
  id,
  body,
  remove = false,
) => {
  let requestId, requestHash;
  if (!id && !remove && body.request_id != null) {
    requestId = v.uuid(body.request_id);
    const { request_id, ...payload } = body;
    requestHash = hash(JSON.stringify(canonical(payload)));
    // scope() holds the group lock until commit, including this lookup and insert.
    const prior = await repo.findRequest(tx, kind, spaceId, requestId);
    if (prior) {
      if (prior.period_id !== p.id || prior.request_hash !== requestHash || prior.deleted)
        throw ApiError.conflict('shared.requestConflict');
      const shares = kind === 'payments' ? undefined : await tx.query(
        `SELECT member_id,amount_minor,manually_adjusted FROM sl_shares WHERE ${kind === 'bills' ? 'bill_id' : 'expense_id'}=$1 ORDER BY member_id`, [prior.id]);
      return { ...prior, ...(shares ? { shares } : {}) };
    }
  }
  const before = id ? await repo.find(tx, kind, spaceId, v.uuid(id)) : null;
  if (id && (!before || before.period_id !== p.id || before.deleted))
    throw ApiError.notFound("shared.notFound");
  let values, assigned;
  if (remove) values = { deleted: true };
  else {
    values =
      kind === "payments" ? v.payment(body) : v.expense(body, kind === "bills");
    if (kind !== "payments" && values.date.slice(0, 7) !== p.month_key)
      return v.invalid();
    const members = await repo.members(tx, spaceId);
    if (kind === "payments") {
      // Former residents may settle arrears after leaving.
      if (
        !members.some(
          (m) => m.id === values.member_id && m.joined_on <= values.date,
        )
      )
        return v.invalid();
    } else {
      const category = await repo.find(
        tx,
        "categories",
        spaceId,
        values.category_id,
      );
      if (
        !category ||
        category.archived ||
        category.kind !== (kind === "bills" ? "bill" : "food")
      )
        return v.invalid();
      if (values.paid_by && !members.some((m) => m.id === values.paid_by))
        return v.invalid();
      let included = members.filter((m) => calc.eligible(m, values.date));
      if (body.included !== undefined) {
        if (
          !Array.isArray(body.included) ||
          new Set(body.included).size !== body.included.length ||
          body.included.some((key) => !included.some((m) => m.id === key))
        )
          return v.invalid();
        included = included.filter((m) => body.included.includes(m.id));
      }
      if (values.method === "selected" && body.included === undefined)
        return v.invalid();
      if (
        body.values !== undefined &&
        (!body.values ||
          typeof body.values !== "object" ||
          Array.isArray(body.values))
      )
        return v.invalid();
      try {
        assigned = calc.split(
          values.amount_minor,
          values.method,
          included,
          body.values,
        );
      } catch {
        return v.invalid();
      }
    }
  }
  const oldShares =
    before && kind !== "payments"
      ? await tx.query(
          `SELECT member_id,amount_minor,manually_adjusted FROM sl_shares WHERE ${kind === "bills" ? "bill_id" : "expense_id"}=$1`,
          [id],
        )
      : [];
  const result = id
    ? await repo.update(tx, kind, spaceId, id, values)
    : await repo.insert(tx, kind, {
        space_id: spaceId,
        period_id: p.id,
        ...(requestId ? { request_id: requestId, request_hash: requestHash } : {}),
        ...values,
      });
  if (assigned) {
    const column = kind === "bills" ? "bill_id" : "expense_id";
    await tx.query(`DELETE FROM sl_shares WHERE ${column}=$1`, [result.id]);
    for (const share of assigned)
      await tx.query(
        `INSERT INTO sl_shares(space_id,${column},member_id,amount_minor,manually_adjusted) VALUES($1,$2,$3,$4,$5)`,
        [
          spaceId,
          result.id,
          share.member_id,
          share.amount_minor,
          share.manually_adjusted,
        ],
      );
  }
  await repo.audit(
    tx,
    spaceId,
    user._id,
    `${kind}_${remove ? "deleted" : id ? "updated" : "added"}`,
    kind,
    result.id,
    before ? { ...before, shares: oldShares } : null,
    { ...result, ...(assigned ? { shares: assigned } : {}) },
  );
  if (
    before &&
    !remove &&
    kind !== "payments" &&
    (before.method !== result.method ||
      JSON.stringify(oldShares) !== JSON.stringify(assigned))
  )
    await repo.audit(
      tx,
      spaceId,
      user._id,
      "sharing_changed",
      kind,
      result.id,
      { method: before.method, shares: oldShares },
      { method: result.method, shares: assigned },
    );
  return { ...result, ...(assigned ? { shares: assigned } : {}) };
};
const editFinancial = (user, spaceId, month, kind, id, body, remove = false) =>
  scope(user, spaceId, true, async (tx) => {
    v.choice(kind, ["expenses", "bills", "payments"]);
    return saveFinancial(
      tx,
      user,
      spaceId,
      await openPeriod(tx, spaceId, month),
      kind,
      id,
      body,
      remove,
    );
  });
const copyBills = (user, spaceId, month, body) =>
  scope(user, spaceId, true, async (tx) => {
    const target = await openPeriod(tx, spaceId, month),
      source = await openPeriod(tx, spaceId, body.from, false);
    if (target.id === source.id) return v.invalid();
    const bills = (await repo.records(tx, "bills", spaceId, source.id)).filter(
      (b) => b.recurring,
    );
    const result = [];
    for (const bill of bills) {
      // New month uses residents eligible on the new bill date and equal shares.
      const date = `${month}-${String(Math.min(Number(bill.date.slice(8)), calc.daysInMonth(month))).padStart(2, "0")}`;
      const due_date = `${month}-${String(Math.min(Number(bill.due_date.slice(8)), calc.daysInMonth(month))).padStart(2, "0")}`;
      const exists = await tx.queryOne(
        "SELECT id FROM sl_bills WHERE space_id=$1 AND period_id=$2 AND name=$3 AND category_id=$4 AND recurring AND NOT deleted",
        [spaceId, target.id, bill.name, bill.category_id],
      );
      if (!exists)
        result.push(
          await saveFinancial(tx, user, spaceId, target, "bills", null, {
            ...bill,
            amount: calc.decimal(bill.amount_minor),
            date,
            due_date: due_date < date ? date : due_date,
            paid: false,
            paid_by: null,
            method: "equal",
          }),
        );
    }
    return result;
  });
const receipt = (user, spaceId, month, billId, buffer) =>
  scope(user, spaceId, buffer !== undefined, async (tx) => {
    const p = await openPeriod(tx, spaceId, month, buffer !== undefined);
    const bill = await repo.find(tx, "bills", spaceId, v.uuid(billId));
    if (!bill || bill.period_id !== p.id || bill.deleted)
      throw ApiError.notFound("shared.notFound");
    if (buffer !== undefined) {
      const image = png(buffer);
      await tx.query(
        "INSERT INTO sl_receipts(bill_id,space_id,image) VALUES($1,$2,$3) ON CONFLICT(bill_id) DO UPDATE SET image=EXCLUDED.image,created_at=now()",
        [billId, spaceId, image],
      );
      await repo.audit(
        tx,
        spaceId,
        user._id,
        "receipt_updated",
        "bills",
        billId,
        null,
        { sha256: hash(image), bytes: image.length },
      );
      return { saved: true };
    }
    const row = await tx.queryOne(
      "SELECT image FROM sl_receipts WHERE space_id=$1 AND bill_id=$2",
      [spaceId, billId],
    );
    if (!row) throw ApiError.notFound("shared.notFound");
    return row.image;
  });
const preview = (user, spaceId, month, body) =>
  scope(user, spaceId, true, async (tx) => {
    await openPeriod(tx, spaceId, month);
    const values = v.expense(body, body.kind === "bills");
    if (values.date.slice(0, 7) !== month) return v.invalid();
    const eligible = (await repo.members(tx, spaceId)).filter((m) =>
      calc.eligible(m, values.date),
    );
    if (
      body.included !== undefined &&
      (!Array.isArray(body.included) ||
        new Set(body.included).size !== body.included.length ||
        body.included.some((id) => !eligible.some((m) => m.id === id)))
    )
      return v.invalid();
    try {
      return calc.split(
        values.amount_minor,
        values.method,
        eligible.filter((m) => !body.included || body.included.includes(m.id)),
        body.values,
      );
    } catch {
      return v.invalid();
    }
  });
module.exports = {
  spaces: repo.spaces,
  createSpace,
  join,
  dashboard,
  editSpace,
  editPeriod,
  editMember,
  editCategory,
  editFinancial,
  copyBills,
  receipt,
  preview,
  rotateInvite: (user, id, body) =>
    scope(user, id, true, (tx, space) => invite(tx, space, user, body)),
};
