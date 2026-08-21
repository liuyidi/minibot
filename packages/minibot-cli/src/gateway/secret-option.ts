/** Normalize cac `--secret [secret]`: bare `--secret` becomes `true`. */
export function resolveSecretOption(secret: string | boolean | undefined): string | undefined {
  if (secret === true || secret === false || secret === undefined) return undefined;
  const trimmed = String(secret).trim();
  return trimmed || undefined;
}
