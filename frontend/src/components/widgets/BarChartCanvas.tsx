import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
    type ChartOptions
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useTheme } from '@/components/theme-provider';
import { formatFieldValue, getFieldMeta } from '@/lib/fieldLabels';

// Register ChartJS components
ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend
);

interface BarChartCanvasProps {
    data: any[];
    dataKey: string;
    categoryKey?: string;
    color?: string;
}

export function BarChartCanvas({ data, dataKey, categoryKey = "name", color = "#8AB4F8" }: BarChartCanvasProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const meta = getFieldMeta(dataKey);
    const seriesLabel = meta.short ?? meta.label ?? dataKey;

    const chartData = {
        labels: data.map(d => d[categoryKey]),
        datasets: [
            {
                label: seriesLabel,
                data: data.map(d => d[dataKey]),
                backgroundColor: color,
                borderRadius: 4, // Rounded corners like Recharts radius={[4, 4, 0, 0]}
                borderSkipped: 'bottom' as const,
            },
        ],
    };

    const options: ChartOptions<'bar'> = {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 0 // Instant resize
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
                callbacks: {
                    label: (context) => {
                        if (context.parsed.y === null || context.parsed.y === undefined) return seriesLabel;
                        return `${seriesLabel}: ${formatFieldValue(dataKey, context.parsed.y)}`;
                    }
                }
            }
        },
        scales: {
            x: {
                grid: {
                    display: false,
                },
                ticks: {
                    color: isDark ? '#9ca3af' : '#6b7280',
                    font: {
                        size: 10
                    },
                    callback: function (val) {
                        const label = this.getLabelForValue(val as number);
                        // Check if it's a date YYYY-MM-DD
                        if (typeof label === 'string' && label.match(/^\d{4}-\d{2}-\d{2}$/)) {
                            const parts = label.split('-');
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
                position: 'left',
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
                    }
                }
            }
        }
    };

    return (
        <div className="w-full h-full min-h-[150px]">
            <Bar data={chartData} options={options} />
        </div>
    );
}
