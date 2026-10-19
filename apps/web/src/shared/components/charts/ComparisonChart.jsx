import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../../app/providers/ThemeProvider';
import { CHART_INK, inCategoryOrder } from '../../utils/constants';
import { formatMoney } from '../../utils/format';
import ChartTooltip from './ChartTooltip';
import useCategoryLabel from '../../i18n/useCategoryLabel';
import EmptyState from '../ui/EmptyState';
import { BarChart3 } from 'lucide-react';
import useT from '../../i18n/I18nProvider';

/**
 * This month against last month, category by category.
 *
 * Two series, so a legend is mandatory. Both use the first two validated
 * categorical slots (blue, orange) and the bars carry a 2px surface gap.
 * Everything shares one y-axis - two scales on one chart is never the answer.
 */
export default function ComparisonChart({
  rows = [],
  currency = 'INR',
  currentLabel,
  previousLabel,
  height = 280,
}) {
  const { t } = useT();
  const label = useCategoryLabel();

  // Resolved here rather than in the parameter list: a default written as a
  // literal is a default in English, whatever the reader chose.
  const currentName = currentLabel || t('charts.thisMonth');
  const previousName = previousLabel || t('charts.lastMonth');
  const { theme } = useTheme();
  const ink = CHART_INK[theme] || CHART_INK.light;

  const currentColor = ink.primary;
  const previousColor = ink.accent;

  // The axis shows the label, not the stored id.
  const data = inCategoryOrder(rows)
    .filter((row) => row.current > 0 || row.previous > 0)
    .map((row) => ({ ...row, label: label(row.category) }));

  if (!data.length) {
    return (
      <EmptyState
        icon={BarChart3}
        title={t('charts.notEnoughHistory')}
        message={t('charts.notEnoughHistoryMessage')}
      />
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barGap={2}>
          <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="label"
            tick={{ fill: ink.muted, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: ink.axis }}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={82}
            tickFormatter={(value) => (value.length > 20 ? `${value.slice(0, 19)}\u2026` : value)}
          />
          <YAxis
            tick={{ fill: ink.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value) => formatMoney(value, currency, { compact: true })}
          />

          <Tooltip cursor={{ fill: `${ink.text}10` }} content={<ChartTooltip currency={currency} />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            iconType="square"
            iconSize={10}
            formatter={(value) => <span style={{ color: ink.muted }}>{value}</span>}
          />

          <Bar dataKey="previous" name={previousName} fill={previousColor} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="current" name={currentName} fill={currentColor} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
