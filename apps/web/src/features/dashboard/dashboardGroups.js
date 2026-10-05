/**
 * Which categories each dashboard leads with.
 *
 * A student's month and a household's month are not the same shape. A student
 * asks "how much is left and can I eat out"; a household asks "what is already
 * committed and what is left after it". Showing both the same four tiles with
 * different words on them would be a rename, not a dashboard.
 *
 * These are ids from the shared catalogue, so the grouping survives a language
 * change - and a group that matches nothing simply shows zero rather than
 * disappearing, which is what makes an empty month still readable.
 */

import { sumMoney } from '../../shared/utils/money';

export const STUDENT_GROUPS = [
  {
    key: 'food',
    labelKey: 'dashboard.groupFood',
    categories: ['Mess/Food'],
  },
  {
    key: 'transport',
    labelKey: 'dashboard.groupTransport',
    categories: ['Travel'],
  },
  {
    key: 'study',
    labelKey: 'dashboard.groupStudy',
    categories: ['Books & Stationery'],
  },
  {
    key: 'hostel',
    labelKey: 'dashboard.groupHostel',
    categories: ['Rent/Hostel Fee'],
  },
  {
    key: 'personal',
    labelKey: 'dashboard.groupPersonal',
    categories: ['Personal Care', 'Entertainment', 'student_shopping', 'Health'],
  },
];

export const HOUSEHOLDER_GROUPS = [
  {
    key: 'housing',
    labelKey: 'dashboard.groupHousing',
    categories: ['house_rent', 'maintenance'],
  },
  {
    key: 'utilities',
    labelKey: 'dashboard.groupUtilities',
    categories: ['electricity_bill', 'gas_bill', 'water_bill', 'internet', 'mobile'],
  },
  {
    key: 'groceries',
    labelKey: 'dashboard.groupGroceries',
    categories: ['groceries', 'dining_out'],
  },
  {
    key: 'education',
    labelKey: 'dashboard.groupEducation',
    categories: ['school_fees', 'children'],
  },
  {
    key: 'healthcare',
    labelKey: 'dashboard.groupHealthcare',
    categories: ['healthcare', 'insurance'],
  },
  {
    key: 'transport',
    labelKey: 'dashboard.groupTransport',
    categories: ['transport_fuel'],
  },
  {
    key: 'family',
    labelKey: 'dashboard.groupFamily',
    categories: [
      'family_support',
      'domestic_help',
      'personal_care',
      'clothing',
      'entertainment',
      'charity_zakat',
      'guests_events',
    ],
  },
];

/**
 * Adds up a breakdown into the groups above.
 *
 * `breakdown` is what the dashboard already fetched: `{ category, amount }`
 * per category, for this mode and this month. Nothing is estimated - a group
 * with no matching rows is genuinely zero, not unknown.
 */
export const totalsByGroup = (groups, breakdown = []) => {
  const spent = new Map(breakdown.map((row) => [row.category, row.amount]));

  return groups.map((group) => ({
    ...group,
    amount: sumMoney(group.categories.map((id) => spent.get(id) || 0)),
  }));
};

/** The groups for a mode, defaulting to the student ones. */
export const groupsFor = (financeMode) =>
  financeMode === 'householder' ? HOUSEHOLDER_GROUPS : STUDENT_GROUPS;
