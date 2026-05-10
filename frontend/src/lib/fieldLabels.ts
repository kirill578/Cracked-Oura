/**
 * Friendly labels, units, and value formatters for every Oura data field
 * exposed by the backend. The whole UI shares this module so widget titles,
 * tooltips, table rows, and the data-field selector all read the same way.
 */

export type FieldFormat =
    | "score"
    | "duration_seconds" // -> "7h 12m"
    | "duration_minutes" // -> "7h 12m"
    | "minutes" // -> "12 min"
    | "bpm"
    | "ms" // milliseconds (HRV)
    | "breaths_per_min"
    | "celsius_delta"
    | "celsius"
    | "percent"
    | "count"
    | "calories"
    | "meters"
    | "kilometers"
    | "steps"
    | "years"
    | "met"
    | "met_minutes"
    | "datetime"
    | "text";

export interface FieldMeta {
    label: string;
    /** Optional short axis label (defaults to `label`). */
    short?: string;
    /** Unit shown in metric tiles, e.g. "bpm" / "kcal". */
    unit?: string;
    format?: FieldFormat;
}

/* ----- Domain headings ----- */

export const DOMAIN_LABELS: Record<string, string> = {
    sleep: "Sleep",
    activity: "Activity",
    readiness: "Readiness",
    resilience: "Resilience",
    cardiovascular_age: "Cardiovascular age",
    sleep_session: "Sleep session",
    workout: "Workouts",
    meditation: "Meditation",
    ring_battery: "Ring battery",
    heart_rate: "Heart rate",
    temperature: "Skin temperature",
    ring_configuration: "Ring",
    tag: "Tags",
};

/* ----- Field-level metadata ----- */

const FIELDS: Record<string, FieldMeta> = {
    // Daily Sleep summary
    "sleep.score": { label: "Sleep score", short: "Score", format: "score" },
    "sleep.average_spo2": { label: "Average SpO₂", short: "SpO₂", unit: "%", format: "percent" },
    "sleep.breathing_disturbance_index": { label: "Breathing disturbance", short: "BDI", format: "count" },
    "sleep.recommendation": { label: "Recommendation", format: "text" },
    "sleep.status": { label: "Status", format: "text" },
    "sleep.optimal_bedtime": { label: "Optimal bedtime" },
    "sleep.contributors": { label: "Sleep contributors" },

    // Sleep contributors (JSON keys)
    "sleep.contributors.deep_sleep": { label: "Deep sleep", short: "Deep" },
    "sleep.contributors.efficiency": { label: "Efficiency", format: "score" },
    "sleep.contributors.latency": { label: "Latency" },
    "sleep.contributors.rem_sleep": { label: "REM sleep", short: "REM" },
    "sleep.contributors.restfulness": { label: "Restfulness" },
    "sleep.contributors.timing": { label: "Timing" },
    "sleep.contributors.total_sleep": { label: "Total sleep" },

    // Sleep session detail
    "sleep_session.start_time": { label: "Bedtime start", format: "datetime" },
    "sleep_session.end_time": { label: "Bedtime end", format: "datetime" },
    "sleep_session.bedtime_start": { label: "Bedtime start", format: "datetime" },
    "sleep_session.bedtime_end": { label: "Bedtime end", format: "datetime" },
    "sleep_session.type": { label: "Session type", format: "text" },
    "sleep_session.efficiency": { label: "Sleep efficiency", short: "Efficiency", unit: "%", format: "percent" },
    "sleep_session.latency": { label: "Sleep latency", short: "Latency", format: "duration_seconds" },
    "sleep_session.total_sleep_duration": { label: "Total sleep", short: "Total", format: "duration_seconds" },
    "sleep_session.deep_sleep_duration": { label: "Deep sleep", short: "Deep", format: "duration_seconds" },
    "sleep_session.rem_sleep_duration": { label: "REM sleep", short: "REM", format: "duration_seconds" },
    "sleep_session.light_sleep_duration": { label: "Light sleep", short: "Light", format: "duration_seconds" },
    "sleep_session.awake_time": { label: "Awake time", short: "Awake", format: "duration_seconds" },
    "sleep_session.time_in_bed": { label: "Time in bed", short: "In bed", format: "duration_seconds" },
    "sleep_session.average_heart_rate": { label: "Average heart rate", short: "Avg HR", unit: "bpm", format: "bpm" },
    "sleep_session.lowest_heart_rate": { label: "Lowest heart rate", short: "Low HR", unit: "bpm", format: "bpm" },
    "sleep_session.average_hrv": { label: "Average HRV", short: "HRV", unit: "ms", format: "ms" },
    "sleep_session.average_breath": { label: "Average breath rate", short: "Breath", unit: "br/min", format: "breaths_per_min" },
    "sleep_session.restless_periods": { label: "Restless periods", short: "Restless", format: "count" },
    "sleep_session.period": { label: "Period", format: "count" },
    "sleep_session.low_battery_alert": { label: "Low battery alert", format: "text" },
    "sleep_session.sleep_algorithm_version": { label: "Sleep algorithm", format: "text" },
    "sleep_session.sleep_score_delta": { label: "Sleep score delta" },
    "sleep_session.readiness_score_delta": { label: "Readiness score delta" },
    "sleep_session.sleep_phase_5_min": { label: "Sleep phases (5 min)", short: "Phases" },
    "sleep_session.sleep_phase_30_sec": { label: "Sleep phases (30 sec)", short: "Phases" },
    "sleep_session.movement_30_sec": { label: "Movement (30 sec)", short: "Movement" },
    "sleep_session.hr_data": { label: "Sleep heart rate", short: "Sleep HR", unit: "bpm", format: "bpm" },
    "sleep_session.hrv_data": { label: "Sleep HRV", short: "HRV", unit: "ms", format: "ms" },
    "sleep_session.readiness": { label: "Readiness snapshot" },
    "sleep_session.day": { label: "Day" },

    // Activity summary
    "activity.score": { label: "Activity score", short: "Score", format: "score" },
    "activity.steps": { label: "Steps", short: "Steps", unit: "steps", format: "steps" },
    "activity.total_calories": { label: "Total calories", short: "Total kcal", unit: "kcal", format: "calories" },
    "activity.active_calories": { label: "Active calories", short: "Active kcal", unit: "kcal", format: "calories" },
    "activity.target_calories": { label: "Calorie target", short: "Target", unit: "kcal", format: "calories" },
    "activity.average_met": { label: "Average MET", short: "Avg MET", unit: "MET", format: "met" },
    "activity.equivalent_walking_distance": { label: "Walking distance", short: "Distance", unit: "m", format: "meters" },
    "activity.high_activity_met_minutes": { label: "High-intensity MET min", short: "High MET", unit: "min", format: "met_minutes" },
    "activity.high_activity_time": { label: "High-intensity time", short: "High", format: "duration_seconds" },
    "activity.medium_activity_met_minutes": { label: "Moderate MET min", short: "Mod MET", unit: "min", format: "met_minutes" },
    "activity.medium_activity_time": { label: "Moderate-intensity time", short: "Moderate", format: "duration_seconds" },
    "activity.low_activity_met_minutes": { label: "Low MET min", short: "Low MET", unit: "min", format: "met_minutes" },
    "activity.low_activity_time": { label: "Low-intensity time", short: "Low", format: "duration_seconds" },
    "activity.sedentary_met_minutes": { label: "Sedentary MET min", short: "Sed MET", unit: "min", format: "met_minutes" },
    "activity.sedentary_time": { label: "Sedentary time", short: "Sedentary", format: "duration_seconds" },
    "activity.inactivity_alerts": { label: "Inactivity alerts", short: "Alerts", format: "count" },
    "activity.non_wear_time": { label: "Non-wear time", short: "Non-wear", format: "duration_seconds" },
    "activity.resting_time": { label: "Resting time", short: "Resting", format: "duration_seconds" },
    "activity.meters_to_target": { label: "Meters to target", short: "To target", unit: "m", format: "meters" },
    "activity.target_meters": { label: "Distance target", short: "Target", unit: "m", format: "meters" },
    "activity.contributors": { label: "Activity contributors" },
    "activity.class_5_min": { label: "Activity classes (5 min)", short: "Classes" },
    "activity.met": { label: "MET (1 min)", short: "MET", unit: "MET", format: "met" },
    "activity.stress": { label: "Daytime stress", short: "Stress" },

    // Activity contributors (JSON keys)
    "activity.contributors.meet_daily_targets": { label: "Meet daily targets" },
    "activity.contributors.move_every_hour": { label: "Move every hour" },
    "activity.contributors.recovery_time": { label: "Recovery time" },
    "activity.contributors.stay_active": { label: "Stay active" },
    "activity.contributors.training_frequency": { label: "Training frequency" },
    "activity.contributors.training_volume": { label: "Training volume" },

    // Readiness summary
    "readiness.score": { label: "Readiness score", short: "Score", format: "score" },
    "readiness.temperature_deviation": { label: "Temperature deviation", short: "Temp Δ", unit: "°C", format: "celsius_delta" },
    "readiness.temperature_trend_deviation": { label: "Temperature trend", short: "Temp trend", unit: "°C", format: "celsius_delta" },
    "readiness.stress_high": { label: "High stress (min)", short: "High stress", unit: "min", format: "minutes" },
    "readiness.recovery_high": { label: "High recovery (min)", short: "Recovery", unit: "min", format: "minutes" },
    "readiness.day_summary": { label: "Day summary", format: "text" },
    "readiness.contributors": { label: "Readiness contributors" },

    // Readiness contributors
    "readiness.contributors.activity_balance": { label: "Activity balance" },
    "readiness.contributors.body_temperature": { label: "Body temperature" },
    "readiness.contributors.hrv_balance": { label: "HRV balance" },
    "readiness.contributors.previous_day_activity": { label: "Previous day activity" },
    "readiness.contributors.previous_night": { label: "Previous night" },
    "readiness.contributors.recovery_index": { label: "Recovery index" },
    "readiness.contributors.resting_heart_rate": { label: "Resting heart rate" },
    "readiness.contributors.sleep_balance": { label: "Sleep balance" },

    // Resilience
    "resilience.level": { label: "Resilience level", format: "text" },
    "resilience.sleep_recovery": { label: "Sleep recovery", short: "Sleep", format: "score" },
    "resilience.daytime_recovery": { label: "Daytime recovery", short: "Daytime", format: "score" },
    "resilience.stress": { label: "Stress load", short: "Stress", format: "score" },

    // Cardiovascular age
    "cardiovascular_age.vascular_age": { label: "Vascular age", short: "Age", unit: "yrs", format: "years" },

    // Heart rate / temperature time series
    "heart_rate.bpm": { label: "Heart rate", short: "HR", unit: "bpm", format: "bpm" },
    "heart_rate.source": { label: "Source", format: "text" },
    "temperature.skin_temp": { label: "Skin temperature", short: "Skin temp", unit: "°C", format: "celsius" },

    // Ring battery
    "ring_battery.level": { label: "Battery level", short: "Battery", unit: "%", format: "percent" },
    "ring_battery.charging": { label: "Charging", format: "text" },
    "ring_battery.in_charger": { label: "In charger", format: "text" },

    // Ring configuration / tags / workouts / meditation
    "ring_configuration.firmware_version": { label: "Firmware version", format: "text" },
    "ring_configuration.size": { label: "Ring size", format: "count" },
    "ring_configuration.color": { label: "Color", format: "text" },
    "ring_configuration.hardware_type": { label: "Hardware", format: "text" },
    "tag.start_time": { label: "Start", format: "datetime" },
    "tag.end_time": { label: "End", format: "datetime" },
    "tag.tag_type_code": { label: "Tag", format: "text" },
    "tag.comment": { label: "Comment", format: "text" },
    "workout.activity": { label: "Activity", format: "text" },
    "workout.calories": { label: "Calories burned", short: "kcal", unit: "kcal", format: "calories" },
    "workout.distance": { label: "Distance", unit: "m", format: "meters" },
    "workout.intensity": { label: "Intensity", format: "text" },
    "workout.label": { label: "Label", format: "text" },
    "workout.source": { label: "Source", format: "text" },
    "workout.start_time": { label: "Start time", format: "datetime" },
    "workout.end_time": { label: "End time", format: "datetime" },
    "meditation.type": { label: "Type", format: "text" },
    "meditation.mood": { label: "Mood", format: "text" },
    "meditation.start_time": { label: "Start", format: "datetime" },
    "meditation.end_time": { label: "End", format: "datetime" },
};

/* ----- Categorical value mappings -----
 * Some Oura time-series fields encode an enum as a small integer. The chart
 * axes & tooltips look much friendlier when those numbers are rendered as
 * the corresponding label.
 */

const SLEEP_PHASE_LABELS: Record<number, string> = {
    1: "Deep",
    2: "Light",
    3: "REM",
    4: "Awake",
};

const MOVEMENT_LABELS: Record<number, string> = {
    1: "No movement",
    2: "Restless",
    3: "Movement",
    4: "Lots of movement",
};

const ACTIVITY_CLASS_LABELS: Record<number, string> = {
    0: "Non-wear",
    1: "Rest",
    2: "Inactive",
    3: "Low",
    4: "Medium",
    5: "High",
};

/**
 * If the field at `path` encodes a small enum, return the label for the given
 * raw numeric value (or null when there is no such mapping).
 */
export function getCategoricalLabel(path: string | undefined | null, value: any): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    if (!path) return null;

    const lower = path.toLowerCase();
    if (lower.includes("sleep_phase") || lower.includes("hypnogram")) {
        return SLEEP_PHASE_LABELS[Math.round(value)] ?? null;
    }
    if (lower.includes("movement_30_sec") || lower.endsWith(".movement")) {
        return MOVEMENT_LABELS[Math.round(value)] ?? null;
    }
    if (lower.endsWith("class_5_min")) {
        return ACTIVITY_CLASS_LABELS[Math.round(value)] ?? null;
    }
    return null;
}

/** Returns the full label dictionary for a path, used to build categorical y-axes. */
export function getCategoricalDomain(path: string | undefined | null): Record<number, string> | null {
    if (!path) return null;
    const lower = path.toLowerCase();
    if (lower.includes("sleep_phase") || lower.includes("hypnogram")) return SLEEP_PHASE_LABELS;
    if (lower.includes("movement_30_sec") || lower.endsWith(".movement")) return MOVEMENT_LABELS;
    if (lower.endsWith("class_5_min")) return ACTIVITY_CLASS_LABELS;
    return null;
}

/* ----- Helpers ----- */

const titleCase = (s: string): string =>
    s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Lower-case a sentence except for the first character. */
const sentenceCase = (s: string): string =>
    s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Returns metadata for a `domain.field[.json_key]` path, with sensible fallback. */
export function getFieldMeta(path: string | undefined | null): FieldMeta {
    if (!path || path === "root") return { label: "Full day data" };

    if (FIELDS[path]) return FIELDS[path];

    const parts = path.split(".");
    if (parts.length >= 2) {
        const last = parts[parts.length - 1];
        const domain = parts[0];
        // Special-case: nested JSON contributor keys we don't have an explicit entry for
        return { label: `${DOMAIN_LABELS[domain] ?? titleCase(domain)} · ${sentenceCase(last.replace(/_/g, " "))}` };
    }

    return { label: titleCase(path) };
}

/** Friendly label for a `domain.field` path. */
export function getFieldLabel(path: string | undefined | null): string {
    return getFieldMeta(path).label;
}

/** Friendly label for a domain string (e.g. `"sleep_session"` -> `"Sleep session"`). */
export function getDomainLabel(domain: string): string {
    return DOMAIN_LABELS[domain] ?? titleCase(domain);
}

/** Friendly label for the trailing field name within a domain. */
export function getLeafFieldLabel(domain: string, field: string): string {
    const full = `${domain}.${field}`;
    if (FIELDS[full]) {
        const m = FIELDS[full];
        return m.short ?? m.label;
    }
    return sentenceCase(field.replace(/_/g, " "));
}

/* ----- Value formatting ----- */

const formatDurationSeconds = (sec: number): string => {
    if (sec == null || isNaN(sec)) return "-";
    if (sec < 60) return `${Math.round(sec)}s`;
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
};

const formatDurationMinutes = (m: number): string => formatDurationSeconds(m * 60);

const formatNumber = (n: number, digits = 0): string => {
    if (n == null || isNaN(n)) return "-";
    return n.toLocaleString(undefined, {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits ? digits : 0,
    });
};

const formatSigned = (n: number, digits = 2): string => {
    if (n == null || isNaN(n)) return "-";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(digits)}`;
};

/**
 * Format a raw value for display using a field's metadata. If a `format` is
 * registered for the path it's used, otherwise we fall back to a generic
 * number/string formatter.
 */
export function formatFieldValue(path: string | undefined | null, value: any): string {
    if (value === null || value === undefined || value === "") return "-";

    // Categorical (enum) fields like sleep_phase_*, movement_30_sec.
    const categorical = getCategoricalLabel(path, value);
    if (categorical) return categorical;

    const meta = getFieldMeta(path);
    const format = meta.format;

    if (typeof value === "number") {
        switch (format) {
            case "score":
                return Math.round(value).toString();
            case "duration_seconds":
                return formatDurationSeconds(value);
            case "duration_minutes":
                return formatDurationMinutes(value);
            case "minutes":
                return `${formatNumber(value)} min`;
            case "bpm":
                return `${Math.round(value)} bpm`;
            case "ms":
                return `${Math.round(value)} ms`;
            case "breaths_per_min":
                return `${value.toFixed(1)} br/min`;
            case "celsius_delta":
                return `${formatSigned(value, 2)} °C`;
            case "celsius":
                return `${value.toFixed(2)} °C`;
            case "percent":
                return `${value.toFixed(1)}%`;
            case "calories":
                return `${formatNumber(value)} kcal`;
            case "meters":
                if (value >= 1000) return `${(value / 1000).toFixed(2)} km`;
                return `${formatNumber(value)} m`;
            case "kilometers":
                return `${value.toFixed(2)} km`;
            case "steps":
                return formatNumber(value);
            case "years":
                return `${Math.round(value)} yrs`;
            case "met":
                return value.toFixed(2);
            case "met_minutes":
                return `${formatNumber(value)} min`;
            case "count":
                return formatNumber(value);
            default:
                return Number.isInteger(value)
                    ? formatNumber(value)
                    : formatNumber(value, 2);
        }
    }

    if (typeof value === "string") {
        if (format === "datetime" && value.includes("T")) {
            try {
                const d = new Date(value);
                return d.toLocaleString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    month: "short",
                    day: "numeric",
                });
            } catch {
                return value;
            }
        }
        return value;
    }

    if (typeof value === "boolean") return value ? "Yes" : "No";

    return String(value);
}
