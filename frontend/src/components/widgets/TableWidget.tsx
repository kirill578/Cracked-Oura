import { ScrollArea } from "@/components/ui/scroll-area";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { formatFieldValue, getFieldLabel, getFieldMeta } from "@/lib/fieldLabels";

interface TableWidgetProps {
    data: any[];
    dataKeys: string[];
    selectedDate?: string;
}

export function TableWidget({ data, dataKeys, selectedDate }: TableWidgetProps) {
    // 1. Find the relevant row for the selected date
    const selectedRow = data.find(row => {
        if (!selectedDate) return true; // Fallback to first if no date

        // Check timestamp match
        if (row.timestamp) {
            const rowDate = row.timestamp.split('T')[0];
            return rowDate === selectedDate;
        }
        // Check date/day match
        if (row.date === selectedDate) return true;
        if (row.day === selectedDate) return true;

        return false;
    });

    if (!selectedRow) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4 text-center">
                <span className="text-sm font-medium">No data for {selectedDate || "selected date"}</span>
            </div>
        );
    }

    // 2. Determine keys to display
    // If keys provided, use them. Otherwise use all keys except meta.
    const displayKeys = dataKeys.length > 0
        ? dataKeys
        : Object.keys(selectedRow).filter(k => !['timestamp', 'date', 'day', 'id'].includes(k));

    // Helper to get nested value
    const getValue = (obj: any, path: string) => {
        if (obj[path] !== undefined) return obj[path];
        return path.split('.').reduce((acc, part) => acc && acc[part], obj);
    };

    // Friendly label & value formatting come from the shared registry so the
    // whole UI stays consistent.
    const formatKey = (key: string) => {
        const meta = getFieldMeta(key);
        return meta.short ?? meta.label ?? getFieldLabel(key);
    };

    const formatValue = (val: any, key: string) => {
        if (val === null || val === undefined) return '-';
        // The registry handles dates as `datetime` already, but legacy data may
        // include raw ISO strings (e.g. 'sleep_session.bedtime_start'). Trim
        // them to local time when no formatter applies.
        const meta = getFieldMeta(key);
        if (typeof val === 'string' && val.includes('T') && !meta.format) {
            try {
                return format(parseISO(val), 'HH:mm');
            } catch {
                return val;
            }
        }
        return formatFieldValue(key, val);
    };

    return (
        <div className="w-full h-full flex flex-col">
            {/* Header with Date */}
            <div className="px-1 pb-3 pt-1 border-b border-white/10 mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {selectedDate ? format(parseISO(selectedDate), 'MMMM do, yyyy') : 'Latest'}
                </span>

            </div>

            <ScrollArea className="flex-1 -mr-3 pr-3">
                <div className="flex flex-col gap-0.5">
                    {displayKeys.map(key => {
                        const rawVal = getValue(selectedRow, key);
                        const displayVal = formatValue(rawVal, key);
                        const label = formatKey(key);

                        return (
                            <div
                                key={key}
                                className="flex items-center justify-between py-2 px-2 hover:bg-white/5 rounded transition-colors group"
                            >
                                <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                                    {label}
                                </span>
                                <span className={cn(
                                    "text-sm font-semibold",
                                    typeof rawVal === 'number' && "tabular-nums"
                                )}>
                                    {displayVal}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </ScrollArea>
        </div>
    );
}
