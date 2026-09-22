import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../utils/errorMessage";

type Page<T> = { items: T[]; nextCursor: number | null };

export function useCursorPage<T extends { id: number }>(
  fetchPage: (cursor?: number, signal?: AbortSignal) => Promise<Page<T>>,
) {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  const load = useCallback(
    async (cursor?: number) => {
      if (!mounted.current) return;
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setLoading(true);
      setError(null);
      try {
        const page = await fetchPage(cursor, controller.signal);
        if (controller.signal.aborted) return;
        setItems((current) =>
          cursor === undefined
            ? page.items
            : [
                ...new Map(
                  [...current, ...page.items].map((item) => [item.id, item]),
                ).values(),
              ],
        );
        setNextCursor(page.nextCursor);
      } catch (reason) {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
    };
  }, [load]);

  return { items, nextCursor, loading, error, load };
}
