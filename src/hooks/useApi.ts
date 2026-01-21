import { useState, useCallback, useRef } from 'react';
import { API_CONSTANTS } from '../utils/constants';

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface ApiOptions {
  retryAttempts?: number;
  timeout?: number;
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
}

export const useApi = <T>() => {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (
      apiCall: () => Promise<T>,
      options: ApiOptions = {}
    ): Promise<T | null> => {
      const {
        retryAttempts = API_CONSTANTS.RETRY_ATTEMPTS,
        timeout = API_CONSTANTS.TIMEOUT,
        onSuccess,
        onError,
      } = options;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      setState(prev => ({ ...prev, loading: true, error: null }));

      let lastError: string | null = null;

      let timeoutId: NodeJS.Timeout | null = null;
      for (let attempt = 0; attempt <= retryAttempts; attempt++) {
        try {
          timeoutId = setTimeout(() => {
            abortControllerRef.current?.abort();
          }, timeout);

          const result = await apiCall();

          clearTimeout(timeoutId);

          setState({
            data: result,
            loading: false,
            error: null,
          });

          onSuccess?.(result);
          return result;
        } catch (error) {
          clearTimeout(timeoutId ?? 0);

          if (error instanceof Error && error.name === 'AbortError') {
            setState(prev => ({ ...prev, loading: false }));
            return null;
          }

          lastError =
            error instanceof Error ? error.message : 'Unknown error occurred';

          if (attempt < retryAttempts) {
            await new Promise(resolve =>
              setTimeout(resolve, 1000 * (attempt + 1))
            );
            continue;
          }

          setState({
            data: null,
            loading: false,
            error: lastError,
          });

          onError?.(lastError);
          return null;
        }
      }

      return null;
    },
    []
  );

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
    });
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    ...state,
    execute,
    reset,
    cancel,
  };
};
