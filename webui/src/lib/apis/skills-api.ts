import type { SkillDetail, SkillsPayload } from "@/lib/types";

import { request } from "./api";

const API_READ_TIMEOUT_MS = 20_000;

export async function fetchSkills(
  token: string,
  base: string = "",
): Promise<SkillsPayload> {
  return request<SkillsPayload>(
    `${base}/api/webui/skills`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function fetchSkillDetail(
  token: string,
  name: string,
  base: string = "",
): Promise<SkillDetail> {
  return request<SkillDetail>(
    `${base}/api/webui/skills/${encodeURIComponent(name)}`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function installSkill(
  token: string,
  body: { markdown: string; name?: string },
  base: string = "",
): Promise<SkillDetail> {
  return request<SkillDetail>(`${base}/api/webui/skills`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function setSkillEnabled(
  token: string,
  name: string,
  enabled: boolean,
  base: string = "",
): Promise<SkillDetail> {
  const action = enabled ? "enable" : "disable";
  return request<SkillDetail>(
    `${base}/api/webui/skills/${encodeURIComponent(name)}/${action}`,
    token,
    { method: "POST" },
  );
}

export async function uninstallSkill(
  token: string,
  name: string,
  base: string = "",
): Promise<SkillsPayload> {
  return request<SkillsPayload>(
    `${base}/api/webui/skills/${encodeURIComponent(name)}`,
    token,
    { method: "DELETE" },
  );
}

export type SkillCatalogTemplate = {
  id: string;
  label: string;
  label_zh?: string;
  description: string;
  description_zh?: string;
  source?: string;
  repo?: string;
  path?: string;
  homepage?: string;
};

export type SkillCatalogPayload = {
  templates: SkillCatalogTemplate[];
};

export async function fetchSkillCatalog(
  token: string,
  base: string = "",
): Promise<SkillCatalogPayload> {
  return request<SkillCatalogPayload>(
    `${base}/api/webui/skills/catalog`,
    token,
    undefined,
    API_READ_TIMEOUT_MS,
  );
}

export async function installSkillFromCatalog(
  token: string,
  templateId: string,
  base: string = "",
): Promise<SkillsPayload & { skill?: SkillDetail; ok?: boolean }> {
  return request(`${base}/api/webui/skills/from-catalog`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: templateId }),
  });
}
