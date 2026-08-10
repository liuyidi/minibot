import { useCallback, useEffect, useRef } from "react";

import {
  NATIVE_SIDEBAR_WIDTH,
  SIDEBAR_RAIL_WIDTH,
  SIDEBAR_WIDTH,
} from "@/layouts/constants";
import { useUiStore } from "@/stores";

export function useHostSidebarUi(showHostChrome: boolean, showMainSidebar: boolean) {
  const hostSidebarOpen = useUiStore((s) => s.hostSidebarOpen);
  const hostSidebarPreviewOpen = useUiStore((s) => s.hostSidebarPreviewOpen);
  const mobileSidebarOpen = useUiStore((s) => s.mobileSidebarOpen);
  const setHostSidebarOpen = useUiStore((s) => s.setHostSidebarOpen);
  const toggleHostSidebarOpen = useUiStore((s) => s.toggleHostSidebarOpen);
  const setHostSidebarPreviewOpen = useUiStore((s) => s.setHostSidebarPreviewOpen);
  const setMobileSidebarOpen = useUiStore((s) => s.setMobileSidebarOpen);
  const toggleMobileSidebarOpen = useUiStore((s) => s.toggleMobileSidebarOpen);

  const hostSidebarPreviewCloseTimerRef = useRef<number | null>(null);

  const clearHostSidebarPreviewCloseTimer = useCallback(() => {
    if (hostSidebarPreviewCloseTimerRef.current === null) return;
    window.clearTimeout(hostSidebarPreviewCloseTimerRef.current);
    hostSidebarPreviewCloseTimerRef.current = null;
  }, []);

  const closeHostSidebarPreview = useCallback(() => {
    clearHostSidebarPreviewCloseTimer();
    setHostSidebarPreviewOpen(false);
  }, [clearHostSidebarPreviewCloseTimer, setHostSidebarPreviewOpen]);

  const openHostSidebarPreview = useCallback(() => {
    if (!showHostChrome || !showMainSidebar || hostSidebarOpen) return;
    clearHostSidebarPreviewCloseTimer();
    setHostSidebarPreviewOpen(true);
  }, [
    clearHostSidebarPreviewCloseTimer,
    hostSidebarOpen,
    setHostSidebarPreviewOpen,
    showHostChrome,
    showMainSidebar,
  ]);

  const scheduleHostSidebarPreviewClose = useCallback(() => {
    clearHostSidebarPreviewCloseTimer();
    if (!showHostChrome || !showMainSidebar || hostSidebarOpen) {
      setHostSidebarPreviewOpen(false);
      return;
    }
    hostSidebarPreviewCloseTimerRef.current = window.setTimeout(() => {
      setHostSidebarPreviewOpen(false);
      hostSidebarPreviewCloseTimerRef.current = null;
    }, 160);
  }, [
    clearHostSidebarPreviewCloseTimer,
    hostSidebarOpen,
    setHostSidebarPreviewOpen,
    showHostChrome,
    showMainSidebar,
  ]);

  useEffect(() => {
    return () => clearHostSidebarPreviewCloseTimer();
  }, [clearHostSidebarPreviewCloseTimer]);

  useEffect(() => {
    if (!showHostChrome || !showMainSidebar || hostSidebarOpen) {
      closeHostSidebarPreview();
    }
  }, [
    closeHostSidebarPreview,
    hostSidebarOpen,
    showHostChrome,
    showMainSidebar,
  ]);

  const closeHostSidebar = useCallback(() => {
    closeHostSidebarPreview();
    setHostSidebarOpen(false);
  }, [closeHostSidebarPreview, setHostSidebarOpen]);

  const openHostSidebar = useCallback(() => {
    closeHostSidebarPreview();
    setHostSidebarOpen(true);
  }, [closeHostSidebarPreview, setHostSidebarOpen]);

  const toggleHostSidebar = useCallback(() => {
    closeHostSidebarPreview();
    toggleHostSidebarOpen();
  }, [closeHostSidebarPreview, toggleHostSidebarOpen]);

  const closeMobileSidebar = useCallback(() => {
    setMobileSidebarOpen(false);
  }, [setMobileSidebarOpen]);

  const toggleSidebar = useCallback(() => {
    const isNativeHost =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches;
    if (isNativeHost) {
      closeHostSidebarPreview();
      toggleHostSidebarOpen();
    } else {
      toggleMobileSidebarOpen();
    }
  }, [closeHostSidebarPreview, toggleHostSidebarOpen, toggleMobileSidebarOpen]);

  const hostSidebarCollapsed = showHostChrome && !hostSidebarOpen;
  const showHostSidebarPreview =
    showMainSidebar && hostSidebarCollapsed && hostSidebarPreviewOpen;
  const openSidebarWidth = showHostChrome ? NATIVE_SIDEBAR_WIDTH : SIDEBAR_WIDTH;
  const hostSidebarFlowWidth = showHostChrome
    ? (hostSidebarOpen ? openSidebarWidth : 0)
    : (hostSidebarOpen ? SIDEBAR_WIDTH : SIDEBAR_RAIL_WIDTH);
  const renderHostSidebarFlowContent = !showHostChrome || hostSidebarOpen;

  return {
    hostSidebarOpen,
    hostSidebarPreviewOpen,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    closeHostSidebar,
    openHostSidebar,
    toggleHostSidebar,
    closeMobileSidebar,
    toggleSidebar,
    openHostSidebarPreview,
    scheduleHostSidebarPreviewClose,
    hostSidebarCollapsed,
    showHostSidebarPreview,
    hostSidebarFlowWidth,
    openSidebarWidth,
    renderHostSidebarFlowContent,
  };
}
