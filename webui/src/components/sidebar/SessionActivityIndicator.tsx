import { useTranslation } from "react-i18next";

export function SessionActivityIndicator({
  state,
}: {
  state: "running" | "updated" | null;
}) {
  const { t } = useTranslation();

  if (state === "running") {
    const label = t("chat.activity.running");
    return (
      <span
        aria-label={label}
        title={label}
        className="grid h-4 w-4 shrink-0 place-items-center"
      >
        <span className="h-3 w-3 animate-spin rounded-full border border-blue-500/25 border-t-blue-500 [animation-duration:1.4s] motion-reduce:animate-none dark:border-blue-400/25 dark:border-t-blue-400" />
      </span>
    );
  }

  if (state === "updated") {
    const label = t("chat.activity.updated");
    return (
      <span
        aria-label={label}
        title={label}
        className="grid h-4 w-4 shrink-0 place-items-center"
      >
        <span className="h-2 w-2 rounded-full bg-[#ff8a3d] shadow-[0_0_0_2px_rgba(255,138,61,0.16)]" />
      </span>
    );
  }

  return <span className="h-4 w-4 shrink-0" aria-hidden="true" />;
}
