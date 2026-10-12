import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

export function useScrollRestoration(
  offset: number,
  restoreKey: string,
  onOffset: (offset: number) => void,
  ready = true,
) {
  const ref = useRef<HTMLDivElement>(null);
  const applied = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onOffset);
  latest.current = onOffset;
  const restore = useCallback(() => {
    if (ready && ref.current && applied.current !== restoreKey) {
      ref.current.scrollTop = offset;
      applied.current = restoreKey;
    }
  }, [ready, restoreKey, offset]);
  useLayoutEffect(restore, [restore]);
  useEffect(() => {
    const flush = () => {
      if (ref.current) latest.current(ref.current.scrollTop);
    };
    addEventListener("pagehide", flush);
    return () => {
      removeEventListener("pagehide", flush);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const onScroll = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (ref.current) latest.current(ref.current.scrollTop);
    }, 120);
  };
  return { ref, onScroll, restore };
}
