import { cn } from "@/lib/utils";
import { avatarColorFromSeed, profileInitials } from "@/lib/profile";

type ProfileAvatarSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<ProfileAvatarSize, string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-8 w-8 text-[11px]",
  lg: "h-20 w-20 text-[28px]",
};

export function ProfileAvatar({
  name,
  seed,
  size = "md",
  className,
}: {
  name: string;
  seed: string;
  size?: ProfileAvatarSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight text-white",
        SIZE_CLASS[size],
        className,
      )}
      style={{ backgroundColor: avatarColorFromSeed(seed) }}
    >
      {profileInitials(name)}
    </span>
  );
}
