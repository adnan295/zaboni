import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiConfig";
import { CoverageArea } from "@/utils/geo";

/**
 * Fetch the active delivery coverage polygons. Fetched once when `enabled`
 * becomes true (e.g. when the map picker opens). On any error it resolves to an
 * empty list, which the callers treat as "no coverage limit".
 */
export function useCoverageAreas(enabled: boolean): CoverageArea[] {
  const [areas, setAreas] = useState<CoverageArea[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/coverage-areas`);
        if (!res.ok) return;
        const data = (await res.json()) as CoverageArea[];
        if (!cancelled && Array.isArray(data)) setAreas(data);
      } catch {
        // ignore — leave areas empty (no coverage limit)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return areas;
}
