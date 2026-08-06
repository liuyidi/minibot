import { useEffect, useState } from "react";

import { fetchSkillDetail } from "@/lib/apis/api";
import type { SkillDetail, SkillSummary } from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

/** Loads skill detail when the detail sheet is open. */
export function useSkillDetail(
  skill: SkillSummary | null,
  open: boolean,
): {
  detail: SkillDetail | null;
  loading: boolean;
  loadFailed: boolean;
} {
  const { token } = useClient();
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!open || !skill) return;
    let cancelled = false;
    setDetail(null);
    setLoading(true);
    setLoadFailed(false);
    fetchSkillDetail(token, skill.name)
      .then((payload) => {
        if (!cancelled) setDetail(payload);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, skill, token]);

  return { detail, loading, loadFailed };
}
