import { useState, useEffect } from 'react';

import { api, DATA_REFRESH_EVENT } from '@/lib/api';

interface QueryResult {
    date: string;
    value: number;
}

export function useOuraQuery(path: string, startDate?: string, endDate?: string) {
    const [data, setData] = useState<QueryResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const onRefresh = () => setRefreshKey(k => k + 1);
        window.addEventListener(DATA_REFRESH_EVENT, onRefresh);
        return () => window.removeEventListener(DATA_REFRESH_EVENT, onRefresh);
    }, []);

    useEffect(() => {
        if (!path) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const json = await api.getQuery(path, startDate, endDate);
                setData(json);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Unknown error');
                console.error("Query Error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [path, startDate, endDate, refreshKey]);

    return { data, loading, error };
}
