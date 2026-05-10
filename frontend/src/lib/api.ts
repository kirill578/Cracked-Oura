// Derive the app's base URL from the page's own URL so API calls work both
// when accessed directly (http://host:8000/) and through HA ingress
// (https://ha-host/api/hassio_ingress/<token>/), where an absolute '/api/…'
// path would bypass the ingress proxy and hit HA's own API instead.
const BASE_URL = new URL('.', document.baseURI).href.replace(/\/$/, '');

export interface AutomationStatusResponse {
    status: 'idle' | 'login_needed' | 'otp_needed' | 'logged_in' | 'exporting' | 'ready_to_download' | 'downloading' | 'completed' | 'error';
    message?: string;
}

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    thoughts?: any[];
}

export type ScheduleCadence = 'daily' | 'weekly';

/** GET /api/settings response. Times are exchanged as either:
 *  - the user's wall-clock + IANA tz (the source of truth, DST-stable), or
 *  - precomputed UTC instants for derived fields like `next_run_utc`.
 */
export interface SettingsResponse {
    daily_sync_time: string;
    email: string;
    schedule_cadence: ScheduleCadence;
    schedule_time_local: string;        // HH:MM in schedule_timezone
    schedule_timezone: string;          // IANA, e.g. "America/Chicago"
    schedule_day_of_week: number;       // 0=Mon..6=Sun
    schedule_jitter_minutes: number;
    next_run_utc: string | null;
    last_run_utc: string | null;
    telegram_bot_token_set: boolean;
    telegram_bot_token_masked: string;  // first 10 chars + "…", or "" if not set
    telegram_chat_id: string;
}

export interface TelegramDiscoverChatRow {
    chat_id: string;
    title: string;
    chat_type: string;
    last_message_preview: string;
}

export interface TelegramDiscoverResponse {
    bot: {
        first_name: string;
        username: string | null;
        open_link: string | null;
    };
    chats: TelegramDiscoverChatRow[];
    hint?: string;
}

export interface SettingsUpdate {
    email?: string;
    schedule_cadence?: ScheduleCadence;
    schedule_time_local?: string;
    schedule_timezone?: string;
    schedule_day_of_week?: number;
    schedule_jitter_minutes?: number;
    daily_sync_time?: string;
    telegram_bot_token?: string;
    telegram_chat_id?: string;
}

export const api = {
    // --- Settings & Automation ---
    getSettings: async (): Promise<SettingsResponse> => {
        const res = await fetch(`${BASE_URL}/api/settings`);
        if (!res.ok) throw new Error('Failed to fetch settings');
        return res.json();
    },

    saveSettings: async (settings: SettingsUpdate) => {
        const res = await fetch(`${BASE_URL}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        if (!res.ok) throw new Error('Failed to save settings');
        return res.json();
    },

    clearSession: async () => {
        const res = await fetch(`${BASE_URL}/api/automation/clear-session`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to clear session');
        return res.json();
    },

    startLogin: async (email: string) => {
        const res = await fetch(`${BASE_URL}/api/automation/start-login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Login failed');
        return data;
    },

    submitOtp: async (otp: string) => {
        const res = await fetch(`${BASE_URL}/api/automation/submit-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'OTP failed');
        return data;
    },

    requestExport: async () => {
        const res = await fetch(`${BASE_URL}/api/automation/request-export`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Export request failed');
        return data;
    },

    checkStatus: async (): Promise<AutomationStatusResponse> => {
        const res = await fetch(`${BASE_URL}/api/automation/check-status`, { method: 'POST' });
        if (!res.ok) throw new Error('Failed to check status');
        return res.json();
    },

    downloadExport: async () => {
        const res = await fetch(`${BASE_URL}/api/automation/download`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Download failed');
        return data;
    },

    uploadZip: async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${BASE_URL}/api/ingest/zip`, {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Upload failed');
        return data;
    },

    // --- Dashboard Data ---
    getDailyData: async (date: string) => {
        const res = await fetch(`${BASE_URL}/api/days/${date}`);
        if (!res.ok) throw new Error('Failed to fetch daily data');
        return res.json();
    },

    getQuery: async (path: string, startDate?: string, endDate?: string) => {
        const params = new URLSearchParams({ path });
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);

        const res = await fetch(`${BASE_URL}/api/query?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch query data');
        return res.json();
    },

    getSchema: async () => {
        const res = await fetch(`${BASE_URL}/api/schema`);
        if (!res.ok) throw new Error('Failed to fetch schema');
        return res.json();
    },

    getTrends: async (metric: string, startDate: string, endDate: string) => {
        return api.getQuery(metric, startDate, endDate);
    },

    // --- Layout ---
    getLayout: async () => {
        const res = await fetch(`${BASE_URL}/api/dashboard`);
        if (!res.ok) throw new Error('Failed to fetch layout');
        return res.json();
    },

    saveLayout: async (layout: any) => {
        const res = await fetch(`${BASE_URL}/api/dashboard`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(layout)
        });
        if (!res.ok) throw new Error('Failed to save layout');
        return res.json();
    },

    // --- Notifications ---
    testTelegramNotification: async () => {
        const res = await fetch(`${BASE_URL}/api/notifications/test`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to send notification');
        return data;
    },

    discoverTelegramChats: async (
        telegram_bot_token?: string
    ): Promise<TelegramDiscoverResponse> => {
        const res = await fetch(`${BASE_URL}/api/notifications/telegram/discover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
                telegram_bot_token ? { telegram_bot_token } : {}
            ),
        });
        const data = await res.json();
        if (!res.ok) {
            const d = data.detail;
            const msg =
                typeof d === 'string'
                    ? d
                    : Array.isArray(d)
                      ? d.map((x: { msg?: string }) => x.msg).join(', ')
                      : 'Discover failed';
            throw new Error(msg);
        }
        return data;
    },

    // --- Chat ---
    sendChatMessage: async (message: string, history: ChatMessage[], context?: any) => {
        const res = await fetch(`${BASE_URL}/api/advisor/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, history, context })
        });
        if (!res.ok) throw new Error('Chat request failed');
        return res.json();
    }
};
