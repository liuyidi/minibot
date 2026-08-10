import { useEffect, useState } from "react";

export type MacArch = "arm" | "intel";

/** Prefer Apple Silicon when arch cannot be detected (Safari / Firefox). */
export function usePreferredMacArch(): MacArch {
  const [arch, setArch] = useState<MacArch>("arm");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const uaData = (
        navigator as Navigator & {
          userAgentData?: {
            getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
          };
        }
      ).userAgentData;
      if (uaData?.getHighEntropyValues) {
        try {
          const { architecture } = await uaData.getHighEntropyValues(["architecture"]);
          if (!cancelled && architecture) {
            setArch(architecture === "arm" ? "arm" : "intel");
            return;
          }
        } catch {
          // fall through
        }
      }
      if (!cancelled) setArch("arm");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return arch;
}
