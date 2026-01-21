import { useEffect, useRef, useState, useCallback } from 'react';

interface UsePollingOptions<T> {
  fetcher: () => Promise<T>;
  interval?: number;
  autoStart?: boolean;
  dependencies?: any[];
}

export function usePolling<T = any>({
  fetcher,
  interval = 1000,
  autoStart = true,
  dependencies = [],
}: UsePollingOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);
  const [isPolling, setIsPolling] = useState<boolean>(autoStart);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    if (!isPolling) return;
    fetchData();
    intervalRef.current = setInterval(fetchData, interval);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPolling, interval, fetchData]);

  const start = () => setIsPolling(true);
  const stop = () => setIsPolling(false);
  const manualRefresh = fetchData;

  return { data, loading, error, isPolling, start, stop, manualRefresh };
}
