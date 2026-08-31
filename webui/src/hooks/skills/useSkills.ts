import { useCallback, useEffect, useState } from "react";

import {
  fetchSkills,
} from "@/lib/apis/skills-api";
import type { SkillSummary } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

export function useSkills(): {
  skills: SkillSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<SkillSummary[]>;
} {
  const { token } = useClient();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const { skills: next } = await fetchSkills(token);
      setSkills(next);
      setError(null);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return [];
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        const { skills: next } = await fetchSkills(token);
        if (!cancelled) {
          setSkills(next);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSkills([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { skills, loading, error, refresh };
}
