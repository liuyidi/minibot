import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  fetchSkillCatalog,
  fetchSkills,
  type SkillCatalogTemplate,
} from "@/lib/apis/skills-api";
import {
  type ResolveSlashLabelOptions,
} from "@/lib/skills/display";
import type { SkillSummary } from "@/lib/types";

/** Load installed skills + market catalog for slash-palette localization. */
export function useComposerSkillCatalog(authToken: string | null | undefined): {
  skills: SkillSummary[];
  slashLabelOpts: ResolveSlashLabelOptions;
} {
  const { i18n } = useTranslation();
  const preferZh = (i18n.language || "").toLowerCase().startsWith("zh");
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [skillTemplates, setSkillTemplates] = useState<SkillCatalogTemplate[]>([]);

  useEffect(() => {
    if (!authToken) {
      setSkills([]);
      setSkillTemplates([]);
      return;
    }
    let cancelled = false;
    void fetchSkills(authToken)
      .then((payload) => {
        if (!cancelled) setSkills(payload.skills);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      });
    void fetchSkillCatalog(authToken)
      .then((payload) => {
        if (!cancelled) setSkillTemplates(payload.templates ?? []);
      })
      .catch(() => {
        if (!cancelled) setSkillTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [authToken]);

  const slashLabelOpts = useMemo<ResolveSlashLabelOptions>(() => {
    const catalogById = new Map(
      skillTemplates.map((tpl) => [tpl.id.toLowerCase(), tpl]),
    );
    return { preferZh, catalogById };
  }, [preferZh, skillTemplates]);

  return { skills, slashLabelOpts };
}
