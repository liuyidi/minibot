import { useTranslation } from "react-i18next";

export function ThirdPartyBrandNotice() {
  const { t } = useTranslation();
  return (
    <p className="px-1 text-[11.5px] leading-5 text-muted-foreground/75">
      {t("settings.legal.thirdPartyBrands", {
        defaultValue:
          "Product names, logos, and brands are property of their respective owners. Use is for identification only and does not imply endorsement.",
      })}
    </p>
  );
}
