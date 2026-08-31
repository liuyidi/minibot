import { useEffect, useState } from "react";
import { Check, ChevronDown, CircleHelp, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  inferProviderFromModelName,
  providerBrand,
} from "@/lib/constants/provider-brand";
import { cn } from "@/lib/utils";

export type ComposerModelOptionKind = "auto" | "platform" | "preset";

export interface ComposerModelOption {
  id: string;
  kind: ComposerModelOptionKind;
  label: string;
  detail?: string;
  provider?: string | null;
  active?: boolean;
  disabled?: boolean;
}

export function ComposerModelBadge({
  label,
  provider,
  providerLabel,
  needsSetup,
  isHero,
  options = [],
  disabled,
  onSelectOption,
  onClick,
  onConfigure,
}: {
  label: string;
  provider?: string | null;
  providerLabel?: string | null;
  needsSetup?: boolean;
  isHero: boolean;
  options?: ComposerModelOption[];
  disabled?: boolean;
  onSelectOption?: (option: ComposerModelOption) => void;
  onClick?: () => void;
  onConfigure?: () => void;
}) {
  const { t } = useTranslation();
  const inferredProvider = needsSetup ? null : provider || inferProviderFromModelName(label);
  const brand = providerBrand(inferredProvider);
  const [logoIndex, setLogoIndex] = useState(0);
  const logoUrl = brand?.logoUrls[logoIndex];
  const showLogo = !!logoUrl;
  const title = providerLabel ? `${label} · ${providerLabel}` : label;
  const hasMenu = options.length > 0 && Boolean(onSelectOption) && !disabled;
  const interactive = hasMenu || Boolean(onClick);

  useEffect(() => setLogoIndex(0), [inferredProvider]);

  const badgeClassName = cn(
    "inline-flex min-w-0 items-center rounded-full border border-border/65 bg-background font-medium text-foreground/88",
    "shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
    "dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none",
    interactive && "cursor-pointer hover:bg-accent/70 hover:text-foreground dark:hover:bg-white/[0.08]",
    needsSetup && "border-amber-500/40 bg-amber-50/85 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200",
    isHero
      ? "h-8 max-w-[min(12.5rem,44vw)] gap-1.5 px-2.5 text-[12px]"
      : "h-9 max-w-[min(12rem,44vw)] gap-2 px-3 text-[12.5px]",
  );

  const badgeBody = (
    <>
      <span
        data-testid={
          needsSetup
            ? "composer-model-setup-icon"
            : inferredProvider
              ? `composer-model-logo-${inferredProvider}`
              : "composer-model-logo"
        }
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden",
          needsSetup
            ? "text-amber-800 dark:text-amber-200"
            : "rounded-full border bg-background",
          isHero ? "h-[18px] w-[18px]" : "h-5 w-5",
        )}
        style={{
          borderColor: !needsSetup && brand ? `${brand.color}28` : undefined,
          boxShadow: !needsSetup && brand ? `inset 0 0 0 1px ${brand.color}18` : undefined,
        }}
        aria-hidden
      >
        {needsSetup ? (
          <CircleHelp className={cn(isHero ? "h-3 w-3" : "h-3.5 w-3.5")} strokeWidth={1.8} />
        ) : showLogo ? (
          <img
            src={logoUrl}
            alt=""
            className={cn("object-contain", isHero ? "h-3 w-3" : "h-3.5 w-3.5")}
            onError={() => setLogoIndex((index) => index + 1)}
          />
        ) : brand ? (
          <span
            className={cn(
              "grid h-full w-full place-items-center rounded-full text-white",
              isHero ? "text-[7.5px]" : "text-[8px]",
            )}
            style={{ backgroundColor: brand.color }}
          >
            {brand.initials.slice(0, 2)}
          </span>
        ) : (
          <Sparkles className={cn("text-muted-foreground/65", isHero ? "h-3 w-3" : "h-3 w-3")} />
        )}
      </span>
      <span className="truncate">{label}</span>
      {hasMenu ? (
        <ChevronDown
          className={cn("shrink-0 opacity-55", isHero ? "h-3 w-3" : "h-3.5 w-3.5")}
          aria-hidden
        />
      ) : null}
    </>
  );

  if (!hasMenu) {
    const Container = interactive ? "button" : "span";
    return (
      <Container
        title={title}
        type={interactive ? "button" : undefined}
        onClick={onClick}
        className={badgeClassName}
      >
        {badgeBody}
      </Container>
    );
  }

  const autoOptions = options.filter((item) => item.kind === "auto");
  const platformOptions = options.filter((item) => item.kind === "platform");
  const presetOptions = options.filter((item) => item.kind === "preset");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={title}
          aria-label={title}
          className={badgeClassName}
          data-testid="composer-model-picker"
        >
          {badgeBody}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px] max-w-[min(20rem,92vw)]">
        {autoOptions.length > 0 ? (
          <>
            {autoOptions.map((option) => (
              <DropdownMenuItem
                key={`${option.kind}:${option.id}`}
                disabled={option.disabled}
                onClick={() => onSelectOption?.(option)}
                className="gap-2"
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.active ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              </DropdownMenuItem>
            ))}
            {platformOptions.length > 0 || presetOptions.length > 0 ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {platformOptions.length > 0 ? (
          <>
            <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
              {t("settings.models.platformModels", { defaultValue: "Platform models" })}
            </DropdownMenuLabel>
            {platformOptions.map((option) => (
              <DropdownMenuItem
                key={`${option.kind}:${option.id}`}
                disabled={option.disabled}
                onClick={() => onSelectOption?.(option)}
                className="gap-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.detail ? (
                    <span className="block truncate text-[11px] text-muted-foreground">{option.detail}</span>
                  ) : null}
                </span>
                {option.active ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              </DropdownMenuItem>
            ))}
            {presetOptions.length > 0 ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {presetOptions.length > 0 ? (
          <>
            <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
              {t("settings.models.yourConfigurations", { defaultValue: "Your configurations" })}
            </DropdownMenuLabel>
            {presetOptions.map((option) => (
              <DropdownMenuItem
                key={`${option.kind}:${option.id}`}
                disabled={option.disabled}
                onClick={() => onSelectOption?.(option)}
                className="gap-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.detail ? (
                    <span className="block truncate text-[11px] text-muted-foreground">{option.detail}</span>
                  ) : null}
                </span>
                {option.active ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        {onConfigure ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onConfigure()}>
              {t("thread.composer.configureModel", { defaultValue: "Configure model" })}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
