import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend,
    type ChartOptions,
    type ScriptableContext
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useTheme } from '@/components/theme-provider';
import { formatFieldValue, getFieldMeta, getCategoricalDomain, getCategoricalLabel } from '@/lib/fieldLabels';

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend
);

interface TrendChartCanvasProps {
    data: any[];
    dataKey?: string;
    dataKeys?: string[];
    title: string;
    color: string;
    showPoints?: boolean;
}

export function TrendChartCanvas({ data, dataKey, dataKeys, title, color, showPoints = false }: TrendChartCanvasProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Determine keys to plot
    const keys = (dataKeys && dataKeys.length > 0) ? dataKeys : (dataKey ? [dataKey] : []);

    // Categorical domain (e.g. sleep phases). When set, the y-axis uses
    // discrete labels instead of raw numbers.
    const categoricalDomain = keys.length > 0 ? getCategoricalDomain(keys[0]) : null;
    const categoricalKey = categoricalDomain ? keys[0] : null;
    const categoricalEntries = categoricalDomain
        ? Object.entries(categoricalDomain).map(([k, v]) => ({ value: Number(k), label: v }))
        : [];
    const categoricalMin = categoricalEntries.length ? Math.min(...categoricalEntries.map(e => e.value)) : undefined;
    const categoricalMax = categoricalEntries.length ? Math.max(...categoricalEntries.map(e => e.value)) : undefined;

    // Color palette for multi-series
    const colors = [
        color,
        '#FF6B6B', // Red
        '#4ECDC4', // Teal
        '#FFE66D', // Yellow
        '#1A535C', // Dark Teal
        '#FF9F1C', // Orange
        '#2EC4B6', // Cyan
        '#E71D36', // Red
        '#7209B7', // Purple
    ];

    // Prepare data for Chart.js
    const chartData = {
        labels: data.map(d => d.date),
        datasets: keys.map((key, index) => {


            const seriesColor = colors[index % colors.length];
            const meta = getFieldMeta(key);
            const label = meta.short ?? meta.label ?? title;

            return {
                label: label,
                __dataKey: key,
                data: data.map(d => d[key] !== undefined ? d[key] : d.value),
                borderColor: seriesColor,
                backgroundColor: (context: ScriptableContext<'line'>) => {
                    const ctx = context.chart.ctx;
                    const gradient = ctx.createLinearGradient(0, 0, 0, context.chart.height);
                    gradient.addColorStop(0, `${seriesColor}80`); // 50% opacity
                    gradient.addColorStop(1, `${seriesColor}00`); // 0% opacity
                    return gradient;
                },
                fill: !categoricalDomain,
                tension: 0, // No smoothing (linear)
                stepped: categoricalDomain ? ('after' as const) : false,
                pointRadius: showPoints ? 3 : 0, // Show points if enabled
                pointHoverRadius: 4,
                borderWidth: 2,
            };
        }),
    };

    const options: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 0
        },
        interaction: {
            mode: 'index',
            intersect: false,
        },
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                enabled: true,
                backgroundColor: isDark ? '#1f2937' : '#ffffff',
                titleColor: isDark ? '#f3f4f6' : '#111827',
                bodyColor: isDark ? '#f3f4f6' : '#111827',
                borderColor: isDark ? '#374151' : '#e5e7eb',
                borderWidth: 1,
                padding: 10,
                displayColors: true,
                callbacks: {
                    title: (tooltipItems) => {
                        const label = tooltipItems[0].label;
                        if (!label) return '';

                        // Intraday
                        if (label.includes('T')) {
                            const date = new Date(label);
                            const day = date.getDate().toString().padStart(2, '0');
                            const month = (date.getMonth() + 1).toString().padStart(2, '0');
                            const year = date.getFullYear();
                            const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                            return `${day}.${month}.${year} ${time}`;
                        }

                        // Daily
                        const [y, m, d] = label.split('-').map(Number);
                        const day = d.toString().padStart(2, '0');
                        const month = m.toString().padStart(2, '0');
                        return `${day}.${month}.${y}`;
                    },
                    label: (context) => {
                        const baseLabel = context.dataset.label || '';
                        if (context.parsed.y === null) return baseLabel;
                        const ds: any = context.dataset;
                        const valueStr = ds.__dataKey
                            ? formatFieldValue(ds.__dataKey, context.parsed.y)
                            : String(context.parsed.y);
                        return baseLabel ? `${baseLabel}: ${valueStr}` : valueStr;
                    }
                }
            }
        },
        scales: {
            x: {
                display: true, // Show X axis
                grid: {
                    display: false
                },
                ticks: {
                    color: isDark ? '#9ca3af' : '#6b7280',
                    font: {
                        size: 10
                    },
                    maxRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: 12, // More frequent labels
                    callback: function (val) {
                        const label = this.getLabelForValue(val as number);
                        if (!label) return '';

                        // Intraday
                        if (label.includes('T')) {
                            const date = new Date(label);
                            return date.toLocaleString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false
                            });
                        }

                        // Daily
                        const parts = label.split('-');
                        if (parts.length === 3) {
                            const [y, m, d] = parts.map(Number);
                            const date = new Date(y, m - 1, d);
                            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        }

                        return label;
                    }
                },
                border: {
                    display: false
                }
            },
            y: {
                display: true,
                position: 'left', // Move to left
                grid: {
                    color: isDark ? '#374151' : '#e5e7eb',
                    drawTicks: false,
                },
                border: {
                    display: false
                },
                ticks: {
                    color: isDark ? '#9ca3af' : '#6b7280',
                    font: {
                        size: 10
                    },
                    ...(categoricalDomain
                        ? {
                            stepSize: 1,
                            callback: function (val: any) {
                                const num = typeof val === 'number' ? val : Number(val);
                                return getCategoricalLabel(categoricalKey, num) ?? '';
                            },
                        }
                        : {}),
                },
                ...(categoricalDomain
                    ? {
                        min: typeof categoricalMin === 'number' ? categoricalMin - 0.5 : undefined,
                        max: typeof categoricalMax === 'number' ? categoricalMax + 0.5 : undefined,
                    }
                    : {}),
            }
        }
    };

    // Custom plugin to draw vertical line on hover
    const verticalLinePlugin = {
        id: 'verticalLine',
        afterDraw: (chart: any) => {
            if (chart.tooltip?._active?.length) {
                const ctx = chart.ctx;
                const x = chart.tooltip._active[0].element.x;
                const topY = chart.scales.y.top;
                const bottomY = chart.scales.y.bottom;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(x, topY);
                ctx.lineTo(x, bottomY);
                ctx.lineWidth = 1;
                ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
                ctx.stroke();
                ctx.restore();
            }
        }
    };

    return (
        <div className="w-full h-full min-h-[100px]">
            <Line data={chartData} options={options} plugins={[verticalLinePlugin]} />
        </div>
    );
}
