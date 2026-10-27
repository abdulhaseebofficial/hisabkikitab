import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '../../../app/providers/ThemeProvider';
import { CHART_INK } from '../../utils/constants';
import { formatMoney } from '../../utils/format';
import ChartTooltip from './ChartTooltip';
import EmptyState from '../ui/EmptyState';
import { TrendingUp } from 'lucide-react';
import useT from '../../i18n/I18nProvider';

/**
 * Daily spending through the month. One series, so no legend box is needed -
 * the card title names it. A dashed reference line marks the daily average,
 * which is what makes a spike readable as a spike.
 */
export default function TrendChart({ data = [], currency = 'INR', average = 0, height = 240 }) {
  const { t } = useT();
  const { theme } = useTheme();
  const ink = CHART_INK[theme] || CHART_INK.light;
  const seriesColor = ink.primary;

  const hasSpending = data.some((point) => point.amount > 0);
  if (!data.length || !hasSpending) {
    return (
      <EmptyState
        icon={TrendingUp}
        title={t('charts.noTrend')}
        message={t('charts.noTrendMessage')}
      />
    );
  }

  return (
    <div>
      <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {/* top:16 keeps the highest y-axis label off the card's edge. */}
        <AreaChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="hw-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor} stopOpacity={0.28} />
              <stop offset="100%" stopColor={seriesColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={ink.grid} strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="day"
            tick={{ fill: ink.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: ink.axis }}
            interval="preserveStartEnd"
            minTickGap={20}
          />
          <YAxis
            tick={{ fill: ink.muted, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(value) => formatMoney(value, currency, { compact: true })}
          />

          {/*
            The line carries no inline label. Recharts pins a reference-line
            label to the plot edge, where it lands on top of the series and the
            axis ticks whenever the average sits low - which, for a month with
            one big bill and lots of small days, is most of the time. The
            caption under the chart says the same thing with room to say it.
          */}
          {average > 0 && <ReferenceLine y={average} stroke={ink.axis} strokeDasharray="4 4" />}

          <Tooltip
            cursor={{ stroke: ink.axis, strokeWidth: 1 }}
            content={<ChartTooltip currency={currency} labelFormatter={(day) => `Day ${day}`} />}
          />

          <Area
            type="monotone"
            dataKey="amount"
            name="Spent"
            stroke={seriesColor}
            strokeWidth={2}
            fill="url(#hw-trend-fill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: ink.surface }}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
      </div>

      {average > 0 && (
        <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span
            className="inline-block h-0 w-6 shrink-0 border-t-2 border-dashed"
            style={{ borderColor: ink.axis }}
            aria-hidden="true"
          />
          Daily average {formatMoney(average, currency, { decimals: 0 })}
        </p>
      )}
    </div>
  );
}
