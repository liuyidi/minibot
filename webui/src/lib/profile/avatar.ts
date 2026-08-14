const AVATAR_COLORS = [
  "#b42318",
  "#c2410c",
  "#a16207",
  "#15803d",
  "#0f766e",
  "#1d4ed8",
  "#6d28d9",
  "#be185d",
  "#0e7490",
  "#4338ca",
];

export function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function avatarColorFromSeed(seed: string): string {
  return AVATAR_COLORS[hashSeed(seed) % AVATAR_COLORS.length];
}

export function profileInitials(name: string, fallback = "MB"): string {
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  const chars = Array.from(trimmed);
  const ascii = chars.every((ch) => ch.charCodeAt(0) < 128);
  if (!ascii) return chars.slice(0, 2).join("");
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}
