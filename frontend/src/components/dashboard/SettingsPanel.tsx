import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Loader2, AlertCircle, Download, Copy, Upload, Send, MessageSquare } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { api, type AutomationStatusResponse, type ScheduleCadence, type TelegramDiscoverChatRow } from '@/lib/api';

interface SettingsPanelProps {
    onClose: () => void;
}

type AutomationStatus = AutomationStatusResponse['status'];

const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** IANA tz of the browser, used as the default for new schedules. */
const BROWSER_TZ = (() => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
        return "UTC";
    }
})();

/** Formats a UTC ISO instant as a friendly string in the browser's tz. */
function formatInBrowserTz(utcIso: string | null): string {
    if (!utcIso) return "—";
    const d = new Date(utcIso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    });
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
    const [status, setStatus] = useState<AutomationStatus>('idle');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'automation' | 'notifications' | 'layout'>('automation');

    // Schedule state. `scheduleTimeLocal` is wall-clock in `scheduleTimezone`, so
    // "08:00 America/Chicago" stays at 8 AM local through DST. The browser tz is
    // the default on first save; the user can override.
    const [cadence, setCadence] = useState<ScheduleCadence>('daily');
    const [scheduleTimeLocal, setScheduleTimeLocal] = useState("08:00");
    const [scheduleTimezone, setScheduleTimezone] = useState(BROWSER_TZ);
    const [dayOfWeek, setDayOfWeek] = useState(6); // 0=Mon..6=Sun
    const [jitterMinutes, setJitterMinutes] = useState(20);
    const [nextRunUtc, setNextRunUtc] = useState<string | null>(null);
    const [lastRunUtc, setLastRunUtc] = useState<string | null>(null);

    // Telegram notification settings
    const [telegramToken, setTelegramToken] = useState('');
    const [telegramTokenSet, setTelegramTokenSet] = useState(false);
    const [telegramTokenMasked, setTelegramTokenMasked] = useState('');
    const [telegramChatId, setTelegramChatId] = useState('');
    const [telegramTesting, setTelegramTesting] = useState(false);
    const [telegramDiscovering, setTelegramDiscovering] = useState(false);
    const [telegramDiscoverBot, setTelegramDiscoverBot] = useState<{
        first_name: string;
        username: string | null;
        open_link: string | null;
    } | null>(null);
    const [telegramDiscoverChats, setTelegramDiscoverChats] = useState<TelegramDiscoverChatRow[]>([]);
    const [telegramDiscoverHint, setTelegramDiscoverHint] = useState<string | null>(null);

    useEffect(() => {
        api.getSettings()
            .then(data => {
                if (data.email) setEmail(data.email);
                if (data.schedule_time_local) setScheduleTimeLocal(data.schedule_time_local);
                if (data.schedule_cadence) setCadence(data.schedule_cadence);
                // If the server has no real tz yet (legacy "UTC" default), seed
                // it with the browser tz so the user's choice "8 AM" lands in
                // the timezone they're sitting in right now.
                if (data.schedule_timezone && data.schedule_timezone !== "UTC") {
                    setScheduleTimezone(data.schedule_timezone);
                } else {
                    setScheduleTimezone(BROWSER_TZ);
                }
                if (typeof data.schedule_day_of_week === 'number') setDayOfWeek(data.schedule_day_of_week);
                if (typeof data.schedule_jitter_minutes === 'number') setJitterMinutes(data.schedule_jitter_minutes);
                setNextRunUtc(data.next_run_utc ?? null);
                setLastRunUtc(data.last_run_utc ?? null);
                setTelegramTokenSet(data.telegram_bot_token_set ?? false);
                setTelegramTokenMasked(data.telegram_bot_token_masked ?? '');
                setTelegramChatId(data.telegram_chat_id ?? '');
            })
            .catch(err => console.error("Failed to fetch settings", err));

        // Reflect the persisted Playwright session on the server so the panel
        // doesn't pretend the user is logged out after a page reload — without
        // this you'd see the email/login form again even though the next sync
        // would happily reuse the saved cookies.
        api.getAuthStatus()
            .then(({ logged_in }) => {
                if (logged_in) setStatus('logged_in');
            })
            .catch(err => console.error("Failed to fetch auth status", err));
    }, []);

    useEffect(() => {
        setTelegramDiscoverBot(null);
        setTelegramDiscoverChats([]);
        setTelegramDiscoverHint(null);
    }, [telegramToken]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const refreshNextRun = async () => {
        try {
            const data = await api.getSettings();
            setNextRunUtc(data.next_run_utc ?? null);
            setLastRunUtc(data.last_run_utc ?? null);
        } catch (e) {
            // Non-fatal — display stale.
        }
    };

    const handleSaveTelegram = async () => {
        setLoading(true);
        setError(null);
        try {
            const payload: Record<string, string> = { telegram_chat_id: telegramChatId };
            // Only send the token if the user actually typed something new
            if (telegramToken) payload.telegram_bot_token = telegramToken;
            await api.saveSettings(payload);
            addLog('Telegram settings saved.');
            // Refresh masked token display
            const updated = await api.getSettings();
            setTelegramTokenSet(updated.telegram_bot_token_set);
            setTelegramTokenMasked(updated.telegram_bot_token_masked);
            setTelegramToken(''); // clear plaintext field after save
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleTestTelegram = async () => {
        setTelegramTesting(true);
        setError(null);
        try {
            const result = await api.testTelegramNotification();
            addLog(`Telegram test: ${result.message}`);
        } catch (err: any) {
            setError(err.message);
            addLog(`Telegram test failed: ${err.message}`);
        } finally {
            setTelegramTesting(false);
        }
    };

    const handleDiscoverTelegramChats = async () => {
        setTelegramDiscovering(true);
        setError(null);
        setTelegramDiscoverHint(null);
        try {
            const tokenArg = telegramToken.trim() || undefined;
            const data = await api.discoverTelegramChats(tokenArg);
            setTelegramDiscoverBot(data.bot);
            setTelegramDiscoverChats(data.chats);
            setTelegramDiscoverHint(data.hint ?? null);
            const n = data.chats.length;
            addLog(
                n > 0
                    ? `Telegram: found ${n} chat(s); pick one below or save its ID.`
                    : 'Telegram: no chats in recent updates yet — send a message to your bot and try again.'
            );
        } catch (err: any) {
            setError(err.message);
            addLog(`Telegram discover failed: ${err.message}`);
        } finally {
            setTelegramDiscovering(false);
        }
    };

    const handleSaveSettings = async () => {
        setLoading(true);
        try {
            await api.saveSettings({
                email,
                schedule_cadence: cadence,
                schedule_time_local: scheduleTimeLocal,
                schedule_timezone: scheduleTimezone,
                schedule_day_of_week: dayOfWeek,
                schedule_jitter_minutes: jitterMinutes,
            });
            const cadenceText = cadence === 'weekly'
                ? `${WEEKDAY_LABELS[dayOfWeek]}s at ${scheduleTimeLocal}`
                : `daily at ${scheduleTimeLocal}`;
            addLog(`Schedule saved: ${cadenceText} ${scheduleTimezone} (±${jitterMinutes}m jitter)`);
            await refreshNextRun();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleClearSession = async () => {
        if (!confirm("Are you sure you want to clear the login session? You will need to login again.")) return;

        setLoading(true);
        try {
            await api.clearSession();
            setStatus('idle');
            addLog("Session cleared.");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleStartLogin = async () => {
        setLoading(true);
        setError(null);
        addLog(`Starting login for ${email}...`);
        try {
            // Persist just the email so a re-open prefills it. The full schedule
            // is saved separately via the explicit Save button.
            await api.saveSettings({ email });

            const data = await api.startLogin(email);
            addLog(data.message);
            setStatus('otp_needed');
        } catch (err: any) {
            setError(err.message);
            addLog(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitOtp = async () => {
        setLoading(true);
        setError(null);
        addLog(`Submitting OTP...`);
        try {
            const data = await api.submitOtp(otp);
            addLog(data.message);
            setStatus('logged_in');
        } catch (err: any) {
            setError(err.message);
            addLog(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleRequestExport = async () => {
        setLoading(true);
        setError(null);
        addLog(`Requesting data export...`);
        try {
            const data = await api.requestExport();
            addLog(data.message);
            setStatus('exporting');
            // Start polling
            pollStatus();
        } catch (err: any) {
            setError(err.message);
            addLog(`Error: ${err.message}`);
            setLoading(false);
        }
    };

    const pollStatus = async () => {
        const interval = setInterval(async () => {
            try {
                const data = await api.checkStatus();

                if (data.status === 'completed' || data.status === 'ready_to_download') {
                    clearInterval(interval);
                    setStatus('ready_to_download');
                    setLoading(false);
                    addLog("Export ready for download!");
                } else if (data.status === 'error') {
                    clearInterval(interval);
                    setStatus('error');
                    setError("Export failed on server.");
                    setLoading(false);
                } else {
                    // Still processing
                    addLog(`Status: ${data.status}`);
                }
            } catch (err) {
                console.error("Polling error", err);
            }
        }, 5000);
    };

    const handleDownload = async () => {
        setLoading(true);
        setError(null);
        addLog(`Downloading and ingesting data...`);
        try {
            const data = await api.downloadExport();
            addLog(data.message);
            setStatus('completed');
        } catch (err: any) {
            setError(err.message);
            addLog(`Error: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);
        addLog(`Uploading ${file.name}...`);

        try {
            const data = await api.uploadZip(file);
            addLog(data.message || "Upload complete");
            setStatus('completed');
        } catch (err: any) {
            setError(err.message);
            addLog(`Error: ${err.message}`);
        } finally {
            setLoading(false);
            // Reset input
            event.target.value = '';
        }
    };

    return (
        <div className="w-[400px] border-l bg-card flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-lg font-semibold">Settings</h2>
                <Button variant="ghost" size="icon" onClick={onClose}>
                    <X className="h-4 w-4" />
                </Button>
            </div>

            {/* Tabs */}
            <div className="flex border-b">
                {(["automation", "notifications", "layout"] as const).map(tab => (
                    <button
                        key={tab}
                        className={cn(
                            "flex-1 py-3 text-xs font-medium border-b-2 transition-colors capitalize",
                            activeTab === tab
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === 'automation' ? 'Automation' : tab === 'notifications' ? 'Notify' : 'Layout'}
                    </button>
                ))}
            </div>

            <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                {activeTab === 'automation' && (
                    <>
                        {/* Schedule */}
                        <div className="space-y-4">
                            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Schedule</h3>

                            <div className="space-y-2">
                                <Label>Cadence</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        type="button"
                                        variant={cadence === 'daily' ? 'default' : 'outline'}
                                        onClick={() => setCadence('daily')}
                                    >
                                        Once a day
                                    </Button>
                                    <Button
                                        type="button"
                                        variant={cadence === 'weekly' ? 'default' : 'outline'}
                                        onClick={() => setCadence('weekly')}
                                    >
                                        Once a week
                                    </Button>
                                </div>
                            </div>

                            {cadence === 'weekly' && (
                                <div className="space-y-2">
                                    <Label>Day of week</Label>
                                    <Select value={String(dayOfWeek)} onValueChange={v => setDayOfWeek(Number(v))}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {WEEKDAY_LABELS.map((label, idx) => (
                                                <SelectItem key={idx} value={String(idx)}>{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>Time of day</Label>
                                <Input
                                    type="time"
                                    value={scheduleTimeLocal}
                                    onChange={e => setScheduleTimeLocal(e.target.value)}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Wall-clock time in <span className="font-mono">{scheduleTimezone}</span>.
                                    DST-stable: 8:00 stays 8:00 across spring/fall changes.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Timezone</Label>
                                <div className="flex gap-2">
                                    <Input
                                        value={scheduleTimezone}
                                        onChange={e => setScheduleTimezone(e.target.value)}
                                        placeholder="Region/City"
                                        className="font-mono text-xs"
                                    />
                                    {scheduleTimezone !== BROWSER_TZ && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setScheduleTimezone(BROWSER_TZ)}
                                            title={`Use browser timezone (${BROWSER_TZ})`}
                                        >
                                            Use browser
                                        </Button>
                                    )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Browser timezone: <span className="font-mono">{BROWSER_TZ}</span>.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label>Random delay window (minutes)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={240}
                                    value={jitterMinutes}
                                    onChange={e => setJitterMinutes(Math.max(0, Math.min(240, Number(e.target.value) || 0)))}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Each fire is delayed by a uniform random amount between 0 and this many minutes
                                    after the scheduled time, so requests don't all hit at the exact same instant.
                                </p>
                            </div>

                            <Button onClick={handleSaveSettings} disabled={loading} className="w-full">
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save schedule
                            </Button>

                            <div className="rounded-md border bg-secondary/30 p-3 space-y-1 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Next run</span>
                                    <span className="font-medium">{formatInBrowserTz(nextRunUtc)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Last run</span>
                                    <span className="font-medium">{formatInBrowserTz(lastRunUtc)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Manual Actions */}
                        <div className="space-y-4">
                            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Sync Status</h3>

                            {/* Status Indicator */}
                            <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg">
                                <div className={cn("h-2.5 w-2.5 rounded-full",
                                    status === 'completed' || status === 'logged_in' ? "bg-green-500" :
                                        status === 'error' ? "bg-red-500" :
                                            loading ? "bg-yellow-500 animate-pulse" : "bg-gray-500"
                                )} />
                                <span className="text-sm font-medium">
                                    {status === 'idle' && "Ready"}
                                    {status === 'login_needed' && "Login required"}
                                    {status === 'otp_needed' && "Enter OTP"}
                                    {status === 'logged_in' && "Logged in"}
                                    {status === 'exporting' && "Exporting data..."}
                                    {status === 'ready_to_download' && "Export ready"}
                                    {status === 'completed' && "Sync complete"}
                                    {status === 'error' && "Error occurred"}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {/* Login Flow */}
                                {status === 'idle' && (
                                    <div className="space-y-3 p-3 border rounded-lg">
                                        <Label>Login</Label>
                                        <Input
                                            placeholder="email@example.com"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                        />
                                        <Button className="w-full" onClick={handleStartLogin} disabled={!email || loading}>
                                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Start Login
                                        </Button>
                                    </div>
                                )}

                                {status === 'otp_needed' && (
                                    <div className="space-y-3 p-3 border rounded-lg bg-secondary/10">
                                        <Alert>
                                            <AlertCircle className="h-4 w-4" />
                                            <AlertTitle>OTP Sent</AlertTitle>
                                            <AlertDescription>Check your email.</AlertDescription>
                                        </Alert>
                                        <Input
                                            placeholder="OTP Code"
                                            value={otp}
                                            onChange={e => setOtp(e.target.value)}
                                        />
                                        <Button className="w-full" onClick={handleSubmitOtp} disabled={!otp || loading}>
                                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            Submit OTP
                                        </Button>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="space-y-2">
                                    <Label>Data Sync</Label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={handleRequestExport}
                                            disabled={loading || status === 'exporting'}
                                            className="h-auto py-3 flex flex-col gap-1"
                                        >
                                            <span className="font-semibold">Request New</span>
                                            <span className="text-xs font-normal text-muted-foreground">Request & Wait</span>
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={handleDownload}
                                            disabled={loading}
                                            className="h-auto py-3 flex flex-col gap-1"
                                        >
                                            <span className="font-semibold">Download Latest</span>
                                            <span className="text-xs font-normal text-muted-foreground">Ingest Existing</span>
                                        </Button>
                                    </div>
                                </div>

                                {/* Manual Import */}
                                <div className="space-y-2">
                                    <Label>Manual Upload</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            type="file"
                                            accept=".zip"
                                            onChange={handleFileUpload}
                                            disabled={loading}
                                            className="cursor-pointer"
                                        />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                        Upload an Oura export ZIP file manually.
                                    </p>
                                </div>
                            </div>

                            {status === 'ready_to_download' && (
                                <Alert className="bg-blue-500/10 border-blue-500/20">
                                    <Download className="h-4 w-4 text-blue-500" />
                                    <AlertTitle>Export Ready</AlertTitle>
                                    <AlertDescription>
                                        Data is ready. Click "Download Latest" to ingest.
                                    </AlertDescription>
                                </Alert>
                            )}

                            {error && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Error</AlertTitle>
                                    <AlertDescription>{error}</AlertDescription>
                                </Alert>
                            )}
                        </div>

                        {/* Logs Console */}
                        <div className="space-y-2">
                            <Label>Activity Log</Label>
                            <div className="bg-black/50 rounded-md p-3 h-32 overflow-y-auto font-mono text-xs text-muted-foreground space-y-1">
                                {logs.length === 0 && <span className="opacity-50">No activity yet...</span>}
                                {logs.map((log, i) => (
                                    <div key={i}>{log}</div>
                                ))}
                            </div>
                        </div>

                        {/* Session Management (Bottom) */}
                        <div className="pt-4 border-t space-y-4">
                            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Session</h3>
                            <Button
                                variant="destructive"
                                className="w-full"
                                onClick={handleClearSession}
                                disabled={loading}
                            >
                                Clear Login Session
                            </Button>
                        </div>
                    </>
                )}

                {activeTab === 'notifications' && (
                    <div className="space-y-6">
                        <div className="space-y-1">
                            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Telegram</h3>
                            <p className="text-[11px] text-muted-foreground">
                                After each successful sync a message is sent to your Telegram chat:
                            </p>
                            <div className="rounded-md bg-secondary/40 p-3 font-mono text-[10px] text-foreground/80 leading-relaxed whitespace-pre">
{`📊 Oura Daily Summary — Mon Jan 19

Scores
🟡 Sleep       54
🟢 Readiness   74
🔴 Activity    33

👟 Yesterday's steps: 8,432

😴 Sleep: 6h 12m
  🔵 Deep   1h 12m
  🟣 REM    0h 42m
  ⚪ Light   4h 18m`}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label>Bot Token</Label>
                                {telegramTokenSet && !telegramToken && (
                                    <p className="text-[11px] text-muted-foreground">
                                        Currently saved: <span className="font-mono">{telegramTokenMasked}</span>
                                    </p>
                                )}
                                <Input
                                    type="password"
                                    placeholder={telegramTokenSet ? "Enter new token to replace…" : "123456789:ABC-…"}
                                    value={telegramToken}
                                    onChange={e => setTelegramToken(e.target.value)}
                                    autoComplete="off"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Create a bot via{' '}
                                    <a
                                        href="https://t.me/BotFather"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="underline"
                                    >
                                        @BotFather
                                    </a>{' '}
                                    and paste the token here.
                                </p>
                            </div>

                            <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-3">
                                <div className="flex items-start gap-2">
                                    <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                    <div className="space-y-2 min-w-0">
                                        <p className="text-xs font-medium text-foreground">
                                            Find your chat (no ID needed)
                                        </p>
                                        <ol className="text-[11px] text-muted-foreground list-decimal pl-4 space-y-1">
                                            <li>
                                                Save your token below, or leave it in the field above — it is sent only to your server for this lookup.
                                            </li>
                                            <li>
                                                Open your bot in Telegram and send any message (for example &quot;hello&quot;).
                                            </li>
                                            <li>
                                                Click <span className="text-foreground/90">Find my chat</span>, then choose the row that matches your message.
                                            </li>
                                        </ol>
                                        {telegramDiscoverBot?.open_link && (
                                            <p className="text-[11px]">
                                                <a
                                                    href={telegramDiscoverBot.open_link}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="underline font-medium text-foreground"
                                                >
                                                    Open {telegramDiscoverBot.first_name}
                                                    {telegramDiscoverBot.username
                                                        ? ` (@${telegramDiscoverBot.username})`
                                                        : ''}{' '}
                                                    in Telegram
                                                </a>
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    className="w-full"
                                    onClick={handleDiscoverTelegramChats}
                                    disabled={
                                        telegramDiscovering || (!telegramToken.trim() && !telegramTokenSet)
                                    }
                                >
                                    {telegramDiscovering ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <MessageSquare className="mr-2 h-4 w-4" />
                                    )}
                                    Find my chat
                                </Button>
                                {telegramDiscoverHint && (
                                    <p className="text-[11px] text-muted-foreground">{telegramDiscoverHint}</p>
                                )}
                                {telegramDiscoverChats.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                            Tap a chat to fill Chat ID
                                        </p>
                                        <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                                            {telegramDiscoverChats.map(row => (
                                                <li key={row.chat_id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setTelegramChatId(row.chat_id);
                                                            addLog(`Chat ID set from: ${row.title}`);
                                                        }}
                                                        className={cn(
                                                            'w-full text-left rounded-md border border-border px-2.5 py-2 text-[11px]',
                                                            'bg-background/80 hover:bg-accent/60 transition-colors',
                                                            telegramChatId === row.chat_id &&
                                                                'ring-1 ring-primary border-primary/50'
                                                        )}
                                                    >
                                                        <div className="font-medium text-foreground truncate">
                                                            {row.title}
                                                        </div>
                                                        <div className="text-muted-foreground truncate mt-0.5">
                                                            {row.last_message_preview}
                                                        </div>
                                                        <div className="font-mono text-[10px] text-muted-foreground/80 mt-1">
                                                            {row.chat_id}
                                                            {row.chat_type ? ` · ${row.chat_type}` : ''}
                                                        </div>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label>Chat ID</Label>
                                <Input
                                    placeholder="e.g. 123456789 or -100…"
                                    value={telegramChatId}
                                    onChange={e => setTelegramChatId(e.target.value)}
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Optional if you used Find my chat above.
                                    Otherwise forward a message to{' '}
                                    <a
                                        href="https://t.me/userinfobot"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="underline"
                                    >
                                        @userinfobot
                                    </a>{' '}
                                    to read your numeric ID.
                                </p>
                            </div>

                            <Button
                                onClick={handleSaveTelegram}
                                disabled={loading || (!telegramToken && !telegramChatId)}
                                className="w-full"
                            >
                                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save
                            </Button>

                            <div className="pt-1 border-t space-y-2">
                                <Button
                                    variant="outline"
                                    onClick={handleTestTelegram}
                                    disabled={telegramTesting || !telegramTokenSet}
                                    className="w-full"
                                >
                                    {telegramTesting
                                        ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        : <Send className="mr-2 h-4 w-4" />}
                                    Send now
                                </Button>
                                <p className="text-[11px] text-muted-foreground text-center">
                                    {telegramTokenSet
                                        ? "Sends the summary using current data. Automatic messages are only sent after a scheduled sync completes."
                                        : "Save a bot token and chat ID first to enable notifications."}
                                </p>
                            </div>
                        </div>

                        {error && (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {/* Shared activity log */}
                        <div className="space-y-2">
                            <Label>Activity Log</Label>
                            <div className="bg-black/50 rounded-md p-3 h-24 overflow-y-auto font-mono text-xs text-muted-foreground space-y-1">
                                {logs.length === 0 && <span className="opacity-50">No activity yet…</span>}
                                {logs.map((log, i) => <div key={i}>{log}</div>)}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'layout' && (
                    <div className="space-y-4">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Layout Actions</h3>

                        <div className="grid grid-cols-1 gap-3">
                            <Button variant="outline" onClick={() => {
                                api.getLayout()
                                    .then(data => {
                                        const layoutJson = JSON.stringify(data, null, 2);
                                        navigator.clipboard.writeText(layoutJson);
                                        addLog("Layout config copied to clipboard.");
                                    })
                                    .catch(err => {
                                        console.error("Failed to fetch layout", err);
                                    });
                            }}>
                                <Copy className="mr-2 h-4 w-4" />
                                Copy Layout to Clipboard
                            </Button>

                            <div className="space-y-2">
                                <Label>Import Layout</Label>
                                <textarea
                                    placeholder="Paste layout JSON here..."
                                    className="flex min-h-[150px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono text-[10px]"
                                    id="import-layout-area"
                                />
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={async () => {
                                        const el = document.getElementById('import-layout-area') as HTMLTextAreaElement;
                                        if (!el || !el.value) return;

                                        try {
                                            const rawJson = JSON.parse(el.value);
                                            let payload = rawJson;

                                            // Handle case where export is wrapped in "dashboard" key
                                            if (rawJson.dashboard && rawJson.dashboard.dashboards) {
                                                payload = rawJson.dashboard;
                                            }

                                            // Validation
                                            if (!payload.dashboards && !payload.widgets) {
                                                alert("Invalid JSON: Must contain 'dashboards' or 'widgets' property.");
                                                return;
                                            }

                                            await api.saveLayout(payload);
                                            alert("Layout imported successfully! The page will reload.");
                                            window.location.reload();
                                            el.value = "";
                                        } catch (e: any) {
                                            alert("Import Failed: " + e.message);
                                        }
                                    }}
                                >
                                    <Upload className="mr-2 h-4 w-4" />
                                    Import Layout
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
