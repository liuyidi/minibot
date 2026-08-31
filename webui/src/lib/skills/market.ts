/** Curated Skill Market metadata for optional catalog templates. */

export type MarketCategoryId =
  | "featured"
  | "content"
  | "tools"
  | "marketing"
  | "product"
  | "data"
  | "org"
  | "finance";

export type MarketSortId = "popular" | "name" | "newest";

export type MarketSkillMeta = {
  category: MarketCategoryId;
  tags: string[];
  /** Stable display popularity for market cards. */
  popularity: number;
};

export type SkillPackDef = {
  id: string;
  skillIds: string[];
  /** i18n keys under settings.skills.packs.<id> */
};

/** Categories shown in the market filter bar (order matches product reference). */
export const MARKET_CATEGORIES: MarketCategoryId[] = [
  "featured",
  "content",
  "tools",
  "marketing",
  "product",
  "data",
  "org",
  "finance",
];

export const MARKET_SORTS: MarketSortId[] = ["popular", "name", "newest"];

const META: Record<string, MarketSkillMeta> = {
  "frontend-dev": {
    category: "product",
    tags: ["Engineering", "Frontend"],
    popularity: 5_894_055,
  },
  "fullstack-dev": {
    category: "product",
    tags: ["Engineering", "Fullstack"],
    popularity: 4_210_332,
  },
  "android-native-dev": {
    category: "product",
    tags: ["Engineering", "Android"],
    popularity: 2_156_881,
  },
  "ios-application-dev": {
    category: "product",
    tags: ["Engineering", "iOS"],
    popularity: 2_089_440,
  },
  "flutter-dev": {
    category: "product",
    tags: ["Engineering", "Cross-platform"],
    popularity: 1_742_119,
  },
  "react-native-dev": {
    category: "product",
    tags: ["Engineering", "Cross-platform"],
    popularity: 1_980_774,
  },
  "shader-dev": {
    category: "product",
    tags: ["Engineering", "Graphics"],
    popularity: 986_221,
  },
  "gif-sticker-maker": {
    category: "content",
    tags: ["Content", "Stickers"],
    popularity: 3_412_008,
  },
  "minimax-pdf": {
    category: "content",
    tags: ["Content", "PDF"],
    popularity: 2_774_560,
  },
  "pptx-generator": {
    category: "content",
    tags: ["Content", "Slides"],
    popularity: 4_055_912,
  },
  "minimax-xlsx": {
    category: "data",
    tags: ["Data", "Spreadsheet"],
    popularity: 3_188_441,
  },
  "minimax-docx": {
    category: "content",
    tags: ["Content", "Docs"],
    popularity: 2_901_003,
  },
  "vision-analysis": {
    category: "data",
    tags: ["Data", "Vision"],
    popularity: 2_445_670,
  },
  "minimax-multimodal-toolkit": {
    category: "tools",
    tags: ["Tools", "Multimodal"],
    popularity: 5_120_889,
  },
  "minimax-music-gen": {
    category: "content",
    tags: ["Content", "Music"],
    popularity: 1_667_230,
  },
  "buddy-sings": {
    category: "content",
    tags: ["Content", "Fun"],
    popularity: 812_445,
  },
  "minimax-music-playlist": {
    category: "content",
    tags: ["Content", "Playlist"],
    popularity: 1_055_120,
  },
  "landing-page-generator": {
    category: "marketing",
    tags: ["Marketing", "Landing page"],
    popularity: 1_543_000,
  },
  "ui-ux-pro-max": {
    category: "product",
    tags: ["Design", "UI/UX"],
    popularity: 39_762_000,
  },
  "stakeholder-update": {
    category: "org",
    tags: ["Organization", "Status"],
    popularity: 2_880_000,
  },
  "financial-statements": {
    category: "finance",
    tags: ["Finance", "Statements"],
    popularity: 3_420_000,
  },
  stock: {
    category: "finance",
    tags: ["Finance", "Markets"],
    popularity: 6_157_000,
  },
};

export const SKILL_PACKS: SkillPackDef[] = [
  {
    id: "product-dev",
    skillIds: [
      "frontend-dev",
      "fullstack-dev",
      "android-native-dev",
      "ios-application-dev",
      "flutter-dev",
      "react-native-dev",
      "ui-ux-pro-max",
    ],
  },
  {
    id: "content-creation",
    skillIds: [
      "gif-sticker-maker",
      "minimax-pdf",
      "pptx-generator",
      "minimax-docx",
      "minimax-music-gen",
      "landing-page-generator",
    ],
  },
  {
    id: "multimodal",
    skillIds: [
      "minimax-multimodal-toolkit",
      "vision-analysis",
      "minimax-music-gen",
      "minimax-music-playlist",
      "buddy-sings",
      "shader-dev",
    ],
  },
  {
    id: "org-ops",
    skillIds: ["stakeholder-update"],
  },
  {
    id: "finance-ops",
    skillIds: ["financial-statements", "stock"],
  },
];

export function getMarketMeta(skillId: string): MarketSkillMeta {
  return (
    META[skillId] ?? {
      category: "tools",
      tags: ["Tools"],
      popularity: 100_000,
    }
  );
}

export function resolveMarketTags(skillId: string): string[] {
  return getMarketMeta(skillId).tags;
}

export function resolveCatalogLabel(
  tpl: { id: string; label: string; label_zh?: string },
  preferZh: boolean,
): string {
  if (preferZh) {
    return tpl.label_zh || tpl.label || tpl.id;
  }
  return tpl.label || tpl.id;
}

export function resolveCatalogDescription(
  tpl: { description?: string; description_zh?: string; id: string },
  preferZh: boolean,
): string {
  if (preferZh) return tpl.description_zh || tpl.description || tpl.id;
  return tpl.description || tpl.description_zh || tpl.id;
}

export function formatPopularity(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export function packPopularity(skillIds: string[]): number {
  return skillIds.reduce((sum, id) => sum + getMarketMeta(id).popularity, 0);
}
