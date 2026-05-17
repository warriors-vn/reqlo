import { useMemo } from "react";

interface Params<T> {
  items: T[];
  itemHeight: number;
  scrollTop: number;
  viewportHeight: number;
  overscan?: number;
}

export function useVirtualHistoryList<T>({
  items,
  itemHeight,
  scrollTop,
  viewportHeight,
  overscan = 6,
}: Params<T>) {
  return useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan,
    );
    return {
      totalHeight: items.length * itemHeight,
      offsetY: startIndex * itemHeight,
      visibleItems: items.slice(startIndex, endIndex),
      startIndex,
    };
  }, [itemHeight, items, overscan, scrollTop, viewportHeight]);
}
