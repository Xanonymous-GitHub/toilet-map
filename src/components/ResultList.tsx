import type { ReactNode } from "react";
import { useScrollRestoration } from "../hooks/useScrollRestoration";

type Props = {
  children: ReactNode;
  ready: boolean;
  restoreKey: string;
  offset: number;
  onOffset: (offset: number) => void;
  className?: string;
  live?: boolean;
};
export function ResultList({
  children,
  ready,
  restoreKey,
  offset,
  onOffset,
  className = "toilet-list",
  live = true,
}: Props) {
  const { ref, onScroll } = useScrollRestoration(offset, restoreKey, onOffset, ready);
  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={className}
      aria-live={live ? "polite" : undefined}
    >
      {children}
    </div>
  );
}
