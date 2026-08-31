import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { FilePreviewPanel } from "@/components/thread/preview/FilePreviewPanel";
import { useFilePreviewController } from "@/components/thread/preview/useFilePreviewController";
import { PromptNavigator } from "@/components/thread/shell/PromptNavigator";
import { SessionInfoPopover } from "@/components/thread/shell/SessionInfoPopover";
import { ThreadComposer } from "@/components/thread/composer/ThreadComposer";
import { useComposerModelOptions } from "@/components/thread/composer/composerModelOptions";
import { ThreadHeader } from "@/components/thread/shell/ThreadHeader";
import { toModelBadgeInfo } from "@/components/thread/composer/modelBadgeInfo";
import { StreamErrorNotice } from "@/components/thread/messages/StreamErrorNotice";
import { ApprovalCard } from "@/components/thread/messages/ApprovalCard";
import {
  FeedbackDetailDialog,
  useAssistantFeedback,
} from "@/components/thread/messages/assistantFeedback";
import { ThreadViewport, type ThreadViewportHandle } from "@/components/thread/viewport/ThreadViewport";
import {
  useThreadMessageCacheStore,
  useThreadMessageCacheSync,
} from "@/components/thread/useThreadMessageCache";
import { useMinibotStream, type SendImage, type SendOptions } from "@/hooks/sessions";
import { useSessionHistory } from "@/hooks/sessions";
import { useInstalledSettingItems } from "@/hooks/ui/useInstalledSettingItems";
import {
  fetchInstalledCliApps,
  fetchMcpPresets,
  fetchSettings,
  listSlashCommands,
} from "@/lib/apis/api";
import {
  CLI_APPS_CHANGED_EVENT,
  installedCliAppsFromPayload,
  isCliAppsPayload,
} from "@/lib/chat/cli-app-events";
import {
  MCP_PRESETS_CHANGED_EVENT,
  installedMcpPresetsFromPayload,
  isMcpPresetsPayload,
} from "@/lib/chat/mcp-preset-events";
import { projectWebuiThreadMessages } from "@/lib/chat/threadMessageProjection";
import type {
  ChatSummary,
  SettingsPayload,
  SlashCommand,
  WorkspaceScopePayload,
  WorkspacesPayload,
} from "@/lib/types";
import { useClient } from "@/providers/ClientProvider";

interface ThreadShellProps {
  session: ChatSummary | null;
  title: string;
  onToggleSidebar: () => void;
  onGoHome?: () => void;
  onNewChat?: () => void;
  onCreateChat?: (workspaceScope?: WorkspaceScopePayload | null) => Promise<string | null>;
  onForkChat?: (sourceChatId: string, beforeUserIndex: number) => Promise<string | null>;
  onTurnEnd?: () => void;
  theme?: "light" | "dark";
  onToggleTheme?: () => void;
  hideSidebarToggleForHostChrome?: boolean;
  hostChromeTitleInset?: boolean;
  hideThemeButton?: boolean;
  hideHeader?: boolean;
  onRenameTitle?: (title: string) => void;
  workspaceScope?: WorkspaceScopePayload | null;
  workspaceDefaultScope?: WorkspaceScopePayload | null;
  workspaceControls?: WorkspacesPayload["controls"] | null;
  workspaceScopeDisabled?: boolean;
  workspaceError?: string | null;
  onWorkspaceScopeChange?: (scope: WorkspaceScopePayload) => void;
  settingsSnapshot?: SettingsPayload | null;
  onOpenModelSettings?: () => void;
}

const HERO_GREETING_KEYS = [
  "thread.empty.greetings.workOn",
  "thread.empty.greetings.start",
  "thread.empty.greetings.build",
  "thread.empty.greetings.tackle",
] as const;

function randomHeroGreetingKey(): (typeof HERO_GREETING_KEYS)[number] {
  const index = Math.floor(Math.random() * HERO_GREETING_KEYS.length);
  return HERO_GREETING_KEYS[index] ?? HERO_GREETING_KEYS[0];
}

interface PendingFirstMessage {
  content: string;
  images?: SendImage[];
  options?: SendOptions;
}

export function ThreadShell({
  session,
  title,
  onToggleSidebar,
  onCreateChat,
  onForkChat,
  onTurnEnd,
  theme = "light",
  onToggleTheme = () => {},
  hideSidebarToggleForHostChrome = false,
  hostChromeTitleInset = false,
  hideThemeButton = false,
  hideHeader = false,
  onRenameTitle,
  workspaceScope = null,
  workspaceDefaultScope = null,
  workspaceControls = null,
  workspaceScopeDisabled = false,
  workspaceError = null,
  onWorkspaceScopeChange,
  settingsSnapshot = null,
  onOpenModelSettings,
}: ThreadShellProps) {
  const { t } = useTranslation();
  const chatId = session?.chatId ?? null;
  const historyKey = session?.key ?? null;
  const {
    messages: historical,
    loading,
    loadingOlder,
    loadOlder,
    hasMoreBefore,
    userMessageOffset,
    hasPendingToolCalls,
    refresh: refreshHistory,
    version: historyVersion,
    forkBoundaryMessageCount,
  } = useSessionHistory(historyKey);
  const { client, modelName, token } = useClient();
  const [booting, setBooting] = useState(false);
  const [slashCommands, setSlashCommands] = useState<SlashCommand[]>([]);
  const cliApps = useInstalledSettingItems({
    token,
    eventName: CLI_APPS_CHANGED_EVENT,
    fetchPayload: fetchInstalledCliApps,
    isPayload: isCliAppsPayload,
    selectItems: installedCliAppsFromPayload,
  });
  const mcpPresets = useInstalledSettingItems({
    token,
    eventName: MCP_PRESETS_CHANGED_EVENT,
    fetchPayload: fetchMcpPresets,
    isPayload: isMcpPresetsPayload,
    selectItems: installedMcpPresetsFromPayload,
  });
  const [settings, setSettings] = useState<SettingsPayload | null>(settingsSnapshot);
  const [heroGreetingKey, setHeroGreetingKey] = useState(randomHeroGreetingKey);
  const [scrollToBottomSignal, setScrollToBottomSignal] = useState(0);
  const shellRef = useRef<HTMLElement | null>(null);
  const pendingFirstRef = useRef<PendingFirstMessage | null>(null);
  const viewportRef = useRef<ThreadViewportHandle | null>(null);

  const { initial, store: messageCacheStore } = useThreadMessageCacheStore(chatId, historical);
  const handleTurnEnd = useCallback(() => {
    onTurnEnd?.();
  }, [onTurnEnd]);
  const {
    messages,
    isStreaming,
    runStartedAt,
    goalState,
    pendingApproval,
    approvalResolving,
    resolveApproval,
    send,
    transcribeAudio,
    stop,
    setMessages,
    streamError,
    dismissStreamError,
  } = useMinibotStream(chatId, initial, hasPendingToolCalls, handleTurnEnd);

  useThreadMessageCacheSync({
    store: messageCacheStore,
    chatId,
    historyKey,
    historical,
    historyVersion,
    loading,
    messages,
    setMessages,
    client,
    refreshHistory,
  });

  const filePreview = useFilePreviewController({ shellRef, resetKey: historyKey });
  const feedbackEnabled = settings?.observability?.langfuse_enabled === true;
  const feedback = useAssistantFeedback({ chatId, token, enabled: feedbackEnabled });
  const { modelOptions, handleSelectModelOption } = useComposerModelOptions({
    settings,
    token,
    onSettingsChange: setSettings,
  });

  const displayMessages = useMemo(() => projectWebuiThreadMessages(messages), [messages]);
  const showHeroComposer = messages.length === 0 && !loading;
  const wasShowingHeroComposerRef = useRef(showHeroComposer);
  const modelBadge = useMemo(
    () => toModelBadgeInfo(modelName, settings),
    [modelName, settings],
  );
  const modelBadgeLabel = modelBadge.needsSetup
    ? t("thread.composer.modelNotConfigured", { defaultValue: "Model not configured" })
    : modelBadge.label;

  useEffect(() => {
    if (showHeroComposer && !wasShowingHeroComposerRef.current) {
      setHeroGreetingKey(randomHeroGreetingKey());
    }
    wasShowingHeroComposerRef.current = showHeroComposer;
  }, [showHeroComposer]);

  const withWorkspaceScope = useCallback(
    (options?: SendOptions): SendOptions | undefined => {
      if (!workspaceScope) return options;
      return {
        ...(options ?? {}),
        workspaceScope,
      };
    },
    [workspaceScope],
  );

  const refreshModelSettings = useCallback(async () => {
    try {
      setSettings(await fetchSettings(token));
    } catch {
      if (!settingsSnapshot) setSettings(null);
    }
  }, [settingsSnapshot, token]);

  useEffect(() => {
    if (settingsSnapshot) {
      setSettings(settingsSnapshot);
      return;
    }
    void refreshModelSettings();
  }, [refreshModelSettings, settingsSnapshot]);

  useEffect(() => {
    return client.onRuntimeModelUpdate(() => {
      void refreshModelSettings();
    });
  }, [client, refreshModelSettings]);

  useEffect(() => {
    if (!chatId || loading) return;
    setScrollToBottomSignal((value) => value + 1);
  }, [chatId, loading, historical]);

  useEffect(() => {
    if (!chatId) return;
    const pending = pendingFirstRef.current;
    if (!pending) return;
    pendingFirstRef.current = null;
    setScrollToBottomSignal((value) => value + 1);
    send(pending.content, pending.images, pending.options);
    setBooting(false);
  }, [chatId, send]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const commands = await listSlashCommands(token);
        if (!cancelled) setSlashCommands(commands);
      } catch {
        if (!cancelled) setSlashCommands([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleWelcomeSend = useCallback(
    async (content: string, images?: SendImage[], options?: SendOptions) => {
      if (booting) return;
      setBooting(true);
      pendingFirstRef.current = { content, images, options: withWorkspaceScope(options) };
      const newId = await onCreateChat?.(workspaceScope);
      if (!newId) {
        pendingFirstRef.current = null;
        setBooting(false);
      }
    },
    [booting, onCreateChat, withWorkspaceScope, workspaceScope],
  );

  const handleThreadSend = useCallback(
    (content: string, images?: SendImage[], options?: SendOptions) => {
      setScrollToBottomSignal((value) => value + 1);
      send(content, images, withWorkspaceScope(options));
    },
    [send, withWorkspaceScope],
  );

  const handleForkFromMessage = useCallback(
    async (beforeUserIndex: number) => {
      if (!chatId || !onForkChat) return;
      const forkedChatId = await onForkChat(chatId, beforeUserIndex);
      if (!forkedChatId) return;
      messageCacheStore.prepareForkedChat(forkedChatId);
    },
    [chatId, onForkChat, messageCacheStore.prepareForkedChat],
  );

  const composerShared = {
    modelLabel: modelBadgeLabel,
    modelProvider: modelBadge.provider,
    modelProviderLabel: modelBadge.providerLabel,
    modelNeedsSetup: modelBadge.needsSetup,
    modelOptions,
    onSelectModelOption: handleSelectModelOption,
    onModelBadgeClick: onOpenModelSettings,
    slashCommands,
    cliApps,
    mcpPresets,
    onTranscribeAudio: transcribeAudio,
    authToken: token,
    runStartedAt,
    goalState,
    workspaceScope,
    workspaceDefaultScope,
    workspaceControls,
    workspaceScopeDisabled,
    workspaceError,
    onWorkspaceScopeChange,
  };

  const composer = (
    <>
      {streamError ? (
        <StreamErrorNotice error={streamError} onDismiss={dismissStreamError} />
      ) : null}
      {pendingApproval ? (
        <ApprovalCard
          approval={pendingApproval}
          resolving={approvalResolving}
          onDecision={resolveApproval}
        />
      ) : null}
      {session ? (
        <ThreadComposer
          {...composerShared}
          onSend={handleThreadSend}
          disabled={!chatId}
          isStreaming={isStreaming}
          placeholder={
            showHeroComposer
              ? t("thread.composer.placeholderHero")
              : t("thread.composer.placeholderThread")
          }
          variant={showHeroComposer ? "hero" : "thread"}
          onStop={stop}
          contextSessionKey={historyKey}
          pendingQueueKey={chatId}
        />
      ) : (
        <ThreadComposer
          {...composerShared}
          onSend={handleWelcomeSend}
          disabled={booting}
          isStreaming={isStreaming}
          placeholder={
            booting
              ? t("thread.composer.placeholderOpening")
              : t("thread.composer.placeholderHero")
          }
          variant="hero"
          contextSessionKey={null}
        />
      )}
    </>
  );

  const emptyState = loading ? (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {t("thread.loadingConversation")}
    </div>
  ) : (
    <div className="flex w-full flex-col items-center text-center animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <h1 className="max-w-[30rem] text-balance text-[34px] font-normal leading-[1.08] tracking-normal text-foreground sm:text-[48px] sm:leading-tight">
        {t(heroGreetingKey)}
      </h1>
    </div>
  );
  const sessionInfoAction = historyKey ? (
    <SessionInfoPopover sessionKey={historyKey} token={token} title={title} />
  ) : undefined;
  const promptNavigatorAction = historyKey ? (
    <PromptNavigator
      messages={displayMessages}
      onJumpToPrompt={(promptId) => viewportRef.current?.jumpToUserPrompt(promptId)}
    />
  ) : undefined;

  return (
    <section ref={shellRef} className="relative flex min-h-0 flex-1 overflow-hidden">
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {!hideHeader ? (
          <ThreadHeader
            title={title}
            onToggleSidebar={onToggleSidebar}
            theme={theme}
            onToggleTheme={onToggleTheme}
            hideSidebarToggleForHostChrome={hideSidebarToggleForHostChrome}
            hostChromeTitleInset={hostChromeTitleInset}
            hideThemeButton={hideThemeButton}
            minimal={!session && !loading}
            onRenameTitle={session ? onRenameTitle : undefined}
            promptNavigatorAction={promptNavigatorAction}
            sessionInfoAction={sessionInfoAction}
          />
        ) : null}
        <ThreadViewport
          ref={viewportRef}
          messages={displayMessages}
          isStreaming={isStreaming}
          emptyState={emptyState}
          composer={composer}
          scrollToBottomSignal={scrollToBottomSignal}
          conversationKey={historyKey}
          showScrollToBottomButton={!!session}
          cliApps={cliApps}
          mcpPresets={mcpPresets}
          forkBoundaryMessageCount={forkBoundaryMessageCount}
          hasMoreBefore={hasMoreBefore}
          loadingOlder={loadingOlder}
          userMessageOffset={userMessageOffset}
          onLoadOlder={loadOlder}
          onOpenFilePreview={historyKey ? filePreview.openFilePreview : undefined}
          onForkFromMessage={onForkChat ? handleForkFromMessage : undefined}
          feedbackEnabled={feedbackEnabled}
          feedbackByMessageId={feedback.feedbackByMessageId}
          onAssistantFeedback={feedback.handleAssistantFeedback}
        />
      </div>
      {filePreview.filePreviewPath && historyKey ? (
        <FilePreviewPanel
          sessionKey={historyKey}
          path={filePreview.filePreviewPath}
          token={token}
          desktopWidth={filePreview.filePreviewWidth}
          isClosing={filePreview.filePreviewClosing}
          onResizeStart={filePreview.handleFilePreviewResizeStart}
          onClose={filePreview.closeFilePreview}
        />
      ) : null}
      <FeedbackDetailDialog
        open={feedback.feedbackDetailMessage !== null}
        reason={feedback.feedbackReason}
        comment={feedback.feedbackComment}
        submitting={feedback.feedbackDetailSubmitting}
        onReasonChange={feedback.setFeedbackReason}
        onCommentChange={feedback.setFeedbackComment}
        onOpenChange={(open) => {
          if (!open && !feedback.feedbackDetailSubmitting) {
            feedback.setFeedbackDetailMessage(null);
          }
        }}
        onSkip={() => feedback.setFeedbackDetailMessage(null)}
        onSubmit={() => void feedback.submitFeedbackDetail()}
      />
    </section>
  );
}
