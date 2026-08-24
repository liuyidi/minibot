import { useEffect } from "react";

import { PORTAL } from "@/lib/configs/portal";

/** Old `#/download` bookmarks redirect to the public site download page. */
export function DownloadPage() {
  useEffect(() => {
    window.location.replace(PORTAL.download);
  }, []);

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-sm text-muted-foreground">
      <p>Redirecting to the download page…</p>
      <a className="font-medium text-foreground underline underline-offset-4" href={PORTAL.download}>
        Continue to download
      </a>
    </main>
  );
}
