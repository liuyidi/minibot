import { defineLoader } from "vitepress";
import {
  EMPTY_MANIFEST,
  mergeManifest,
  RELEASE_MANIFEST_URL,
} from "./releaseManifest.js";

export interface Data {
  manifest: typeof EMPTY_MANIFEST;
}

declare const data: Data;
export { data };

export default defineLoader({
  async load(): Promise<Data> {
    try {
      const response = await fetch(RELEASE_MANIFEST_URL);
      if (!response.ok) {
        console.warn(`[releases.data] ${RELEASE_MANIFEST_URL} → ${response.status}`);
        return { manifest: EMPTY_MANIFEST };
      }
      const payload = await response.json();
      return { manifest: mergeManifest(EMPTY_MANIFEST, payload) };
    } catch (error) {
      console.warn(`[releases.data] fetch failed:`, error);
      return { manifest: EMPTY_MANIFEST };
    }
  },
});
