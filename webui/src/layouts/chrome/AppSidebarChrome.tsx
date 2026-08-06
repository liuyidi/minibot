import { useTranslation } from "react-i18next";

import { SessionSearchDialog } from "@/components/SessionSearchDialog";
import { Sidebar } from "@/components/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MOBILE_SIDEBAR_WIDTH, SIDEBAR_WIDTH } from "@/layouts/constants";
import type { AppLayoutModel } from "@/layouts/hooks/useAppLayoutModel";
import { cn } from "@/lib/utils";

export function AppSidebarChrome({ model }: { model: AppLayoutModel }) {
  const { t } = useTranslation();
  const {
    workspace,
    hostSidebar,
    sidebarProps,
    sessionSearchOpen,
    setSessionSearchOpen,
    chatActions,
  } = model;
  const { showMainSidebar, showHostChrome } = workspace;
  const {
    hostSidebarFlowWidth,
    renderHostSidebarFlowContent,
    hostSidebarOpen,
    showHostSidebarPreview,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    closeHostSidebar,
    openHostSidebar,
    openHostSidebarPreview,
    scheduleHostSidebarPreviewClose,
    closeMobileSidebar,
  } = hostSidebar;

  return (
    <>
      {showMainSidebar ? (
        <aside
          data-testid="host-sidebar-flow"
          className={cn(
            "relative z-20 hidden shrink-0 overflow-hidden lg:block",
            "transition-[width] duration-300 ease-out",
          )}
          style={{
            width: hostSidebarFlowWidth,
          }}
        >
          {renderHostSidebarFlowContent ? (
            <div
              className={cn(
                "absolute inset-y-0 left-0 h-full w-full overflow-hidden",
                showHostChrome
                  ? "host-sidebar-glass"
                  : "bg-sidebar shadow-inner-right",
              )}
            >
              <Sidebar
                {...sidebarProps}
                collapsed={!showHostChrome && !hostSidebarOpen}
                hostChromeInset={showHostChrome}
                onCollapse={closeHostSidebar}
                onExpand={openHostSidebar}
              />
            </div>
          ) : null}
        </aside>
      ) : null}

      {showHostSidebarPreview ? (
        <aside
          data-testid="host-sidebar-preview"
          className="absolute inset-y-0 left-0 z-30 hidden overflow-hidden lg:block animate-in fade-in-0 slide-in-from-left-2 duration-150"
          style={{ width: SIDEBAR_WIDTH }}
          onMouseEnter={openHostSidebarPreview}
          onMouseLeave={scheduleHostSidebarPreviewClose}
        >
          <div className="h-full w-full overflow-hidden host-sidebar-glass shadow-2xl">
            <Sidebar
              {...sidebarProps}
              hostChromeInset={showHostChrome}
              onCollapse={closeHostSidebar}
              onExpand={openHostSidebar}
            />
          </div>
        </aside>
      ) : null}

      {showMainSidebar ? (
        <Sheet
          open={mobileSidebarOpen}
          onOpenChange={setMobileSidebarOpen}
        >
          <SheetContent
            side="left"
            showCloseButton={false}
            aria-describedby={undefined}
            className="p-0 lg:hidden"
            style={{ width: MOBILE_SIDEBAR_WIDTH, maxWidth: MOBILE_SIDEBAR_WIDTH }}
          >
            <SheetTitle className="sr-only">{t("sidebar.navigation")}</SheetTitle>
            <Sidebar
              {...sidebarProps}
              onCollapse={closeMobileSidebar}
              containActionMenus
            />
          </SheetContent>
        </Sheet>
      ) : null}

      <SessionSearchDialog
        open={sessionSearchOpen}
        onOpenChange={setSessionSearchOpen}
        sessions={sidebarProps.sessions}
        activeKey={sidebarProps.activeKey}
        loading={sidebarProps.loading}
        titleOverrides={sidebarProps.titleOverrides ?? {}}
        onSelect={chatActions.onSelectSearchResult}
      />
    </>
  );
}
