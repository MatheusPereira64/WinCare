import { useCallback, useEffect, useState } from "react";
import { getNative, isNative } from "./bridge";

export function useAdmin() {
  const [elevated, setElevated] = useState<boolean | null>(null);
  const native = isNative();

  const refresh = useCallback(async () => {
    const bridge = getNative();
    if (!bridge?.isElevated) {
      setElevated(null);
      return;
    }
    setElevated(await bridge.isElevated());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const restartAsAdmin = useCallback(async () => {
    const bridge = getNative();
    if (!bridge?.restartAsAdmin) return { ok: false as const, reason: "unavailable" };
    return bridge.restartAsAdmin();
  }, []);

  return { native, elevated, refresh, restartAsAdmin };
}
