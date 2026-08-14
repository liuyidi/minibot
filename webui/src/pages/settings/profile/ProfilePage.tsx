import { SETTINGS_SHOW_PROFILE_USAGE } from "@/lib/configs/ui-entry";

import { ProfileSettings } from "./ProfileSettings";
import { ProfileUsagePanel } from "./ProfileUsagePanel";
import { useProfileSettings } from "./useProfileSettings";
import { useSettingsShell } from "../SettingsShellContext";

export function ProfilePage() {
  const model = useProfileSettings();
  const { settings } = useSettingsShell();

  return (
    <div className="space-y-8">
      <ProfileSettings
        displayName={model.displayName}
        avatarSeed={model.avatarSeed}
        userId={model.userId}
        createdAtLabel={model.createdAtLabel}
        onSaveDisplayName={model.saveDisplayName}
        onRandomizeAvatar={model.randomizeAvatar}
      />
      {SETTINGS_SHOW_PROFILE_USAGE ? (
        <ProfileUsagePanel usage={settings?.usage} timeZone={settings?.agent.timezone} />
      ) : null}
    </div>
  );
}
