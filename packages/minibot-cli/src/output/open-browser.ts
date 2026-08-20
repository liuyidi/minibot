import open from "open";

export async function openVerificationUrl(url: string): Promise<void> {
  await open(url);
}
