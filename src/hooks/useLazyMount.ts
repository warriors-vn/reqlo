import { useEffect, useState } from "react";

/**
 * Returns true once `open` has been true at least once, and stays true after —
 * lets a caller defer mounting (and therefore lazy-importing) a component until
 * it's actually needed, without unmounting it again on close. Components that
 * assume they "stay mounted" between opens (e.g. to resync local state only on
 * the next open, or to let their own exit animation play) keep working exactly
 * as before once mounted.
 */
export function useLazyMount(open: boolean): boolean {
  const [everOpened, setEverOpened] = useState(open);
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);
  return everOpened;
}
