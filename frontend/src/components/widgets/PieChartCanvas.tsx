import { useMemo } from 'react';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    type ChartOptions
} from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useTheme } from '@/components/theme-provider';

ChartJS.register(ArcElement, Tooltip, Legend);

export interface PieSlice {
    label: string;
    value: number;
    formattedValue: string;
    color: string;
}

interface PieChartCanvasProps {
    slices: PieSlice[];
    /** Optional pre-formatted total label (e.g. "5h 23m"). Defaults to sum of slices. */
    totalLabel?: string;
    /** Caption shown above the total in the center (e.g. "Total sleep"). */
    totalCaption?: string;
}

const FALLBACK_PALETTE = [
    '#6366f1', // indigo
    '#a78bfa', // violet
    '#60a5fa', // light blue
    '#fbbf24', // amber
    '#34d399', // emerald
    '#f87171', // red
    '#22d3ee', // cyan
];

export function PieChartCanvas({ slices, totalLabel, totalCaption = 'Total' }: PieChartCanvasProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const cleanSlices = useMemo(
        () =>
            slices
                .map((s, i) => ({
                    ...s,
                    color: s.color || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length],
                    value: typeof s.value === 'number' && Number.isFinite(s.value) ? s.value : 0,
                }))
                .filter((s) => s.value > 0),
        [slices]
    );

    const total = useMemo(
        () => cleanSlices.reduce((acc, s) => acc + s.value, 0),
        [cleanSlices]
    );

    if (cleanSlices.length === 0 || total <= 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                No data available for pie chart
            </div>
        );
    }

    const chartData = {
        labels: cleanSlices.map((s) => s.label),
        datasets: [
            {
                data: cleanSlices.map((s) => s.value),
                backgroundColor: cleanSlices.map((s) => s.color),
                borderColor: isDark ? '#0a0a0a' : '#ffffff',
                borderWidth: 2,
                hoverOffset: 6,
            },
        ],
    };

    const options: ChartOptions<'doughnut'> = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { duration: 0 },
        plugins: {
            legend: { display: false },
            tooltip: {
                enabled: true,
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                titleColor: isDark ? '#f3f4f6' : '#111827',
                bodyColor: isDark ? '#f3f4f6' : '#111827',
                borderColor: isDark ? '#374151' : '#e5e7eb',
                borderWidth: 1,
                callbacks: {
                    label: (context) => {
                        const slice = cleanSlices[context.dataIndex];
                        const pct = total > 0 ? (slice.value / total) * 100 : 0;
                        return `${slice.label}: ${slice.formattedValue} (${pct.toFixed(1)}%)`;
                    },
                },
            },
        },
    };

    return (
        <div className="flex h-full w-full items-center gap-4 min-h-[160px]">
            <div className="relative h-full aspect-square shrink-0">
                <Doughnut data={chartData} options={options} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {totalCaption}
                    </div>
                    <div className="text-lg font-bold leading-tight">
                        {totalLabel ?? total.toLocaleString()}
                    </div>
                </div>
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 overflow-hidden">
                {cleanSlices.map((slice) => {
                    const pct = total > 0 ? (slice.value / total) * 100 : 0;
                    return (
                        <div
                            key={slice.label}
                            className="flex items-center gap-2 text-xs min-w-0"
                        >
                            <span
                                className="h-2.5 w-2.5 rounded-sm shrink-0"
                                style={{ backgroundColor: slice.color }}
                            />
                            <span className="truncate text-muted-foreground">{slice.label}</span>
                            <span className="ml-auto font-medium tabular-nums">
                                {slice.formattedValue}
                            </span>
                            <span className="text-muted-foreground tabular-nums w-10 text-right shrink-0">
                                {pct.toFixed(0)}%
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
