import { useEffect, useState } from 'react';
import { format, addDays } from 'date-fns';
import { api } from '@/lib/api';
import { MetricWidget } from './MetricWidget';
import { formatFieldValue, getFieldMeta } from '@/lib/fieldLabels';

// Mirrors the adapter in WidgetRegistry / useOuraData so dot-paths like
// `sleep_session.foo` resolve from the plural list returned by /api/days.
const PLURALIZED_DOMAINS: Record<string, string> = {
    sleep_session: 'sleep_sessions',
    workout: 'workouts',
};

function resolveValue(data: any, path: string) {
    if (!path || !data) return undefined;
    const parts = path.split('.');
    if (parts.length === 0) return undefined;

    const root = parts[0];
    const candidates: any[] = [data?.[root]];
    const pluralKey = PLURALIZED_DOMAINS[root];
    if (pluralKey && Array.isArray(data?.[pluralKey]) && data[pluralKey].length > 0) {
        // Pick the longest sleep session, matching the dashboard adapter.
        if (root === 'sleep_session') {
            const longest = data[pluralKey].reduce((best: any, cur: any) => {
                if (!best) return cur;
                return (cur.total_sleep_duration || 0) > (best.total_sleep_duration || 0) ? cur : best;
            }, null);
            candidates.push(longest);
        } else {
            candidates.push(data[pluralKey][0]);
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
}

interface OffsetMetricWidgetProps {
    /** Anchor date in YYYY-MM-DD; offset is applied relative to this. */
    date: string;
    /** Days to add to `date` before fetching (e.g. -1 for yesterday). */
    dateOffset: number;
    dataKey: string;
    color?: string;
    unit?: string;
}

export function OffsetMetricWidget({
    date,
    dateOffset,
    dataKey,
    color,
    unit,
}: OffsetMetricWidgetProps) {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!date) return;
        const targetDate = format(addDays(new Date(date), dateOffset), 'yyyy-MM-dd');
        let cancelled = false;
        setLoading(true);
        api.getDailyData(targetDate)
            .then((d) => {
                if (!cancelled) setData(d);
            })
            .catch(() => {
                if (!cancelled) setData(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [date, dateOffset]);

    const meta = getFieldMeta(dataKey);
    const rawValue = resolveValue(data, dataKey);
    const formatted = loading ? '…' : formatFieldValue(dataKey, rawValue);
    const formattedHasUnit = typeof formatted === 'string' && /[a-zA-Z%°]/.test(formatted);

    return (
        <MetricWidget
            value={formatted}
            label={meta.label}
            unit={formattedHasUnit ? '' : unit ?? meta.unit ?? ''}
            color={color}
        />
    );
}
