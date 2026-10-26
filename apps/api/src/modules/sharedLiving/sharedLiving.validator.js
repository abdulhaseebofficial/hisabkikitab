const calc = require("./sharedLiving.calculations");
const ApiError = require("../../shared/errors/ApiError");
const invalid = () => {
  throw ApiError.badRequest("shared.invalid");
};
/**
 * A member name, space name or note, in whatever script the household writes.
 *
 * NFC first, for the reason given on `unicodeText` in shared/validation/rules:
 * the same Urdu or Devanagari word can be encoded two ways, Postgres compares
 * bytes, and a space named from one keyboard would not match a search typed on
 * another. Length is then counted in characters, so a 100-character space name
 * is 100 Urdu characters and not the 33 a byte limit would allow.
 *
 * The refused set is the whole C0 control block except tab, newline and
 * carriage return - a NUL reaches Postgres as a 22021 - plus the angle brackets
 * this module has always rejected as defence in depth.
 */
const text = (value, max = 1000, required = false) => {
  if (value === undefined && !required) return "";
  if (typeof value !== "string") return invalid();
  const normalized = value.normalize("NFC");
  if (
    normalized.trim().length > max ||
    (required && !normalized.trim()) ||
    /[<>\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(normalized)
  )
    return invalid();
  return normalized.trim();
};
const uuid = (value) => {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return invalid();
  return value;
};
const bool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") return invalid();
  return value;
};
const integer = (value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max) return invalid();
  return value;
};
const choice = (value, allowed) => {
  if (!allowed.includes(value)) return invalid();
  return value;
};
const checked =
  (fn) =>
  (...args) => {
    try {
      return fn(...args);
    } catch {
      return invalid();
    }
  };
const amount = checked(calc.money);
const positive = (value) => {
  const result = amount(value);
  if (!result) return invalid();
  return result;
};
const date = checked(calc.date);
const month = checked(calc.period);
const space = (body) => ({
  name: text(body.name, 100, true),
  currency: choice(body.currency || "PKR", [
    "PKR",
    "BDT",
    "USD",
    "EUR",
    "GBP",
    "INR",
    "AED",
    "SAR",
  ]),
  residents: integer(body.residents ?? 1, 1, 500),
  description: text(body.description),
  organization_type: choice(body.organization_type || "other", [
    "university", "company", "hostel", "other",
  ]),
  organization_name: text(body.organization_name, 100),
});
const member = (body) => {
  const result = {
    name: text(body.name, 100, true),
    phone: text(body.phone, 30),
    email: text(body.email, 254),
    joined_on: date(body.joined_on),
    left_on: body.left_on ? date(body.left_on) : null,
    active: bool(body.active, true),
    weight: calc.decimal(positive(body.weight ?? "1")),
    note: text(body.note),
  };
  if (
    amount(result.weight) > 99999999 ||
    (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) ||
    (result.left_on && result.left_on < result.joined_on) ||
    (!result.active && !result.left_on)
  )
    return invalid();
  return result;
};
const category = (body) => ({
  kind: choice(body.kind, ["food", "bill"]),
  name: text(body.name, 100, true),
  archived: bool(body.archived),
  position: integer(body.position ?? 0, 0, 10000),
});
const payment = (body) => ({
  member_id: uuid(body.member_id),
  amount_minor: positive(body.amount),
  date: date(body.date),
  method: choice(body.method, ["cash", "bank", "mobile", "other"]),
  reference: text(body.reference, 100),
  note: text(body.note),
});
const expense = (body, bill = false) => {
  const result = {
    category_id: uuid(body.category_id),
    date: date(body.date),
    amount_minor: bill ? amount(body.amount) : positive(body.amount),
    note: text(body.note),
    method: choice(body.method || "equal", [
      "equal",
      "selected",
      "custom",
      "percentage",
      "weighted",
      "later",
    ]),
  };
  if (bill)
    Object.assign(result, {
      name: text(body.name, 100, true),
      due_date: date(body.due_date),
      paid: bool(body.paid),
      paid_by: body.paid_by ? uuid(body.paid_by) : null,
      recurring: bool(body.recurring),
    });
  if (bill && result.due_date < result.date) return invalid();
  return result;
};
module.exports = {
  invalid,
  text,
  uuid,
  bool,
  integer,
  choice,
  amount,
  positive,
  date,
  month,
  space,
  member,
  category,
  payment,
  expense,
};
