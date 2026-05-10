import { ScoreGaugeCanvas } from './widgets/ScoreGaugeCanvas';
import { SmartTrendWidgetCanvas } from './widgets/SmartTrendWidgetCanvas';
import { MetricWidget } from './widgets/MetricWidget';
import { OffsetMetricWidget } from './widgets/OffsetMetricWidget';
import { BarChartCanvas } from './widgets/BarChartCanvas';
import { RadarChartCanvas } from './widgets/RadarChartCanvas';
import { PieChartCanvas, type PieSlice } from './widgets/PieChartCanvas';
import { JSONWidget } from './widgets/JSONWidget';
import type { WidgetInstance } from '@/types';
import { formatFieldValue, getFieldLabel, getFieldMeta } from '@/lib/fieldLabels';

interface WidgetRegistryProps {
    widget: WidgetInstance;
    data?: any;
    date?: string;
    onUpdate?: (updates: Partial<WidgetInstance>) => void;
}

// Top-level domains that the daily endpoint exposes as a plural list rather
// than a singular object. We auto-resolve `sleep_session.foo` to
// `sleep_sessions[0].foo` so the same dot-notation works in metric widgets.
const PLURALIZED_DOMAINS: Record<string, string> = {
    sleep_session: 'sleep_sessions',
    workout: 'workouts',
};

export const WidgetRegistry = ({ widget, data, date, onUpdate }: WidgetRegistryProps) => {
    // Helper to resolve dot notation, with fallbacks for list-shaped domains.
    const resolveData = (path: string) => {
        if (!path || path === 'root') return data;
        const parts = path?.split('.') || [];
        if (parts.length === 0) return undefined;

        const root = parts[0];
        let candidates: any[] = [data?.[root]];

        // Fallback to plural list form on the daily payload.
        const pluralKey = PLURALIZED_DOMAINS[root];
        if (pluralKey && data?.[pluralKey]) {
            const list = data[pluralKey];
            if (Array.isArray(list) && list.length > 0) {
                candidates.push(list[0]);
            }
        }

        for (const candidate of candidates) {
            if (candidate === undefined || candidate === null) continue;
            let value: any = candidate;
            for (let i = 1; i < parts.length; i++) {
                value = value?.[parts[i]];
            }
            if (value !== undefined && value !== null) return value;
        }
        return undefined;
    };

    switch (widget.type) {
        case 'score':
            const score = resolveData(widget.config.dataKey || '') || 0;
            return (
                <ScoreGaugeCanvas
                    score={typeof score === 'number' ? score : 0}
                    title={getFieldMeta(widget.config.dataKey).short ?? getFieldLabel(widget.config.dataKey)}
                    color={widget.config.color}
                />
            );
        case 'trend':
            return (
                <SmartTrendWidgetCanvas
                    widget={widget}
                    date={date || new Date().toISOString().split('T')[0]}
                    onUpdate={onUpdate}
                />
            );
        case 'metric': {
            // If the widget asks for a different day (e.g. "yesterday"), fetch
            // that day's data independently rather than using the dashboard's
            // selected-date payload.
            const dateOffset = widget.config.dateOffset as number | undefined;
            if (dateOffset && date) {
                return (
                    <OffsetMetricWidget
                        date={date}
                        dateOffset={dateOffset}
                        dataKey={widget.config.dataKey || ''}
                        color={widget.config.color}
                        unit={widget.config.unit}
                    />
                );
            }

            const rawValue = resolveData(widget.config.dataKey || '');
            const meta = getFieldMeta(widget.config.dataKey);
            const formatted = formatFieldValue(widget.config.dataKey, rawValue);
            // If the formatter already includes a unit (e.g. "8,300 steps") drop the explicit unit prop.
            const formattedHasUnit = typeof formatted === 'string' && /[a-zA-Z%°]/.test(formatted);
            return (
                <MetricWidget
                    value={formatted}
                    label={meta.label}
                    unit={formattedHasUnit ? '' : (widget.config.unit ?? meta.unit ?? '')}
                    color={widget.config.color}
                />
            );
        }
        case 'bar':
            let barData = resolveData(widget.config.dataKey || '') || [];

            // If data is an object (raw contributors), format it for Bar Chart (Static)
            // BUT check if it's actually an intraday object (has 'items' array) - if so, let SmartTrendWidget handle it
            const isIntradayObject = barData && typeof barData === 'object' && Array.isArray((barData as any).items);

            if (barData && !Array.isArray(barData) && typeof barData === 'object' && !isIntradayObject) {
                barData = Object.entries(barData).map(([key, value]) => ({
                    name: key.replace(/_/g, ' '),
                    value
                }));

                return (
                    <BarChartCanvas
                        data={Array.isArray(barData) ? barData : []}
                        dataKey="value"
                        categoryKey="name"
                        color={widget.config.color}
                    />
                );
            }

            return <SmartTrendWidgetCanvas widget={widget} date={date || new Date().toISOString()} chartType="bar" />;
        case 'table':
            return (
                <SmartTrendWidgetCanvas
                    widget={widget}
                    date={date || new Date().toISOString().split('T')[0]}
                    chartType="table"
                />
            );
        case 'pie': {
            // Build slices from each dataKey in dataKeys (or fall back to a single dataKey).
            const keys = widget.config.dataKeys && widget.config.dataKeys.length > 0
                ? widget.config.dataKeys
                : (widget.config.dataKey ? [widget.config.dataKey] : []);

            const palette = (widget.config.colors as string[] | undefined) || [
                '#6366f1', '#a78bfa', '#60a5fa', '#fbbf24',
                '#34d399', '#f87171', '#22d3ee'
            ];

            const slices: PieSlice[] = keys
                .map((key, i) => {
                    const raw = resolveData(key);
                    const value = typeof raw === 'number' ? raw : Number(raw);
                    if (!Number.isFinite(value)) return null;
                    const meta = getFieldMeta(key);
                    return {
                        label: meta.short ?? meta.label ?? key,
                        value,
                        formattedValue: formatFieldValue(key, value),
                        color: palette[i % palette.length],
                    } as PieSlice;
                })
                .filter((s): s is PieSlice => s !== null);

            // Use the first valid key's formatter for the total so the unit matches the slices.
            const firstNumericKey = keys.find((k) => {
                const raw = resolveData(k);
                return typeof raw === 'number' && Number.isFinite(raw);
            });

            // The center label can either be the sum of all slices (default)
            // or a dedicated metric resolved from `totalDataKey` — e.g. for the
            // sleep-stages pie we still show Awake as a slice but the centre
            // displays Total sleep (which excludes Awake).
            const totalDataKey = widget.config.totalDataKey as string | undefined;
            const totalRaw = totalDataKey ? resolveData(totalDataKey) : undefined;
            const totalFromKey = typeof totalRaw === 'number' && Number.isFinite(totalRaw)
                ? totalRaw
                : null;

            const sliceSum = slices.reduce((acc, s) => acc + s.value, 0);
            const centerValue = totalFromKey !== null ? totalFromKey : sliceSum;
            const centerFormatKey = totalDataKey ?? firstNumericKey;
            const totalLabel = centerFormatKey
                ? formatFieldValue(centerFormatKey, centerValue)
                : centerValue.toLocaleString();

            return (
                <PieChartCanvas
                    slices={slices}
                    totalLabel={totalLabel}
                    totalCaption={widget.config.totalCaption || 'Total'}
                />
            );
        }
        case 'radar':
            let radarData = resolveData(widget.config.dataKey || '') || [];

            // If data is an object (raw contributors), format it for Radar Chart
            if (radarData && !Array.isArray(radarData) && typeof radarData === 'object') {
                radarData = Object.entries(radarData).map(([key, value]) => ({
                    subject: key.replace(/_/g, ' '),
                    value,
                    fullMark: 100
                }));
            }

            return (
                <RadarChartCanvas
                    data={Array.isArray(radarData) ? radarData : []}
                    dataKey="value"
                    axisKey="subject"
                    color={widget.config.color}
                />
            );
        case 'json':
            // If root is selected, use the date to fetch full dump
            // Otherwise use the resolved data
            const isRoot = !widget.config.dataKey || widget.config.dataKey === 'root';
            const jsonData = resolveData(widget.config.dataKey || 'root');

            return (
                <JSONWidget
                    data={jsonData}
                    date={isRoot ? date : undefined}
                    fetchFullDump={isRoot}
                />
            );
        default:
            return (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                    Unknown Widget Type: {widget.type}
                </div>
            );
    }
};
