import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { submitSessionFeedbackDetail, submitSessionScore } from "@/lib/apis/api";
import type { UIMessage } from "@/lib/types";

const FEEDBACK_STORAGE_PREFIX = "minibot.assistant-feedback.";
export const FEEDBACK_REASONS = ["incorrect", "incomplete", "style", "tool", "other"] as const;
export type FeedbackReason = (typeof FEEDBACK_REASONS)[number];

function readStoredFeedback(chatId: string | null): Record<string, boolean> {
  if (!chatId) return {};
  try {
    const raw = window.localStorage.getItem(`${FEEDBACK_STORAGE_PREFIX}${chatId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === "boolean"),
    );
  } catch {
    return {};
  }
}

export function useAssistantFeedback({
  chatId,
  token,
  enabled,
}: {
  chatId: string | null;
  token: string;
  enabled: boolean;
}) {
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<string, boolean>>({});
  const [feedbackDetailMessage, setFeedbackDetailMessage] = useState<UIMessage | null>(null);
  const [feedbackReason, setFeedbackReason] = useState<FeedbackReason>("incorrect");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackDetailSubmitting, setFeedbackDetailSubmitting] = useState(false);

  useEffect(() => {
    setFeedbackByMessageId(readStoredFeedback(chatId));
  }, [chatId]);

  const handleAssistantFeedback = useCallback(
    async (message: UIMessage, helpful: boolean) => {
      if (!chatId || !enabled) return;

      // Optimistic UI first: thumbs-down must open the detail dialog even if
      // the score POST is slow or fails (otherwise the click feels dead).
      setFeedbackByMessageId((current) => {
        const next = { ...current, [message.id]: helpful };
        try {
          window.localStorage.setItem(`${FEEDBACK_STORAGE_PREFIX}${chatId}`, JSON.stringify(next));
        } catch {
          // Keep in-memory selection even if browser storage is unavailable.
        }
        return next;
      });
      if (!helpful) {
        setFeedbackReason("incorrect");
        setFeedbackComment("");
        setFeedbackDetailMessage(message);
      }

      // Fire-and-forget score so the click path stays snappy; empty ID resolves to
      // the latest session trace when history rows lack a runtime Langfuse ID.
      void submitSessionScore(token, chatId, message.langfuseTraceId ?? "", helpful).catch(() => {
        // Local feedback + detail dialog already applied.
      });
    },
    [chatId, enabled, token],
  );

  const submitFeedbackDetail = useCallback(async () => {
    if (!chatId || !feedbackDetailMessage || feedbackDetailSubmitting) return;
    setFeedbackDetailSubmitting(true);
    try {
      await submitSessionFeedbackDetail(
        token,
        chatId,
        feedbackDetailMessage.langfuseTraceId ?? "",
        feedbackReason,
        feedbackComment,
      );
      setFeedbackDetailMessage(null);
    } finally {
      setFeedbackDetailSubmitting(false);
    }
  }, [chatId, feedbackComment, feedbackDetailMessage, feedbackDetailSubmitting, feedbackReason, token]);

  return {
    feedbackByMessageId,
    feedbackDetailMessage,
    feedbackReason,
    setFeedbackReason,
    feedbackComment,
    setFeedbackComment,
    feedbackDetailSubmitting,
    setFeedbackDetailMessage,
    handleAssistantFeedback,
    submitFeedbackDetail,
  };
}

export function FeedbackDetailDialog({
  open,
  reason,
  comment,
  submitting,
  onReasonChange,
  onCommentChange,
  onOpenChange,
  onSkip,
  onSubmit,
}: {
  open: boolean;
  reason: FeedbackReason;
  comment: string;
  submitting: boolean;
  onReasonChange: (reason: FeedbackReason) => void;
  onCommentChange: (comment: string) => void;
  onOpenChange: (open: boolean) => void;
  onSkip: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="relative max-w-md rounded-[22px] border-border/70 bg-popover p-5 shadow-2xl">
        <DialogHeader className="text-left">
          <DialogTitle>{t("message.feedbackDialog.title")}</DialogTitle>
          <DialogDescription>{t("message.feedbackDialog.description")}</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2" disabled={submitting}>
          <legend className="sr-only">{t("message.feedbackDialog.reasonLabel")}</legend>
          {FEEDBACK_REASONS.map((item) => (
            <label
              key={item}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/60"
            >
              <input
                type="radio"
                name="feedback-reason"
                value={item}
                checked={reason === item}
                onChange={() => onReasonChange(item)}
              />
              <span>{t(`message.feedbackDialog.reasons.${item}`)}</span>
            </label>
          ))}
        </fieldset>
        <Textarea
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          placeholder={t("message.feedbackDialog.commentPlaceholder")}
          maxLength={2000}
          disabled={submitting}
        />
        <DialogFooter className="gap-2 sm:space-x-0">
          <Button type="button" variant="ghost" onClick={onSkip} disabled={submitting}>
            {t("message.feedbackDialog.skip")}
          </Button>
          <Button type="button" onClick={onSubmit} disabled={submitting}>
            {t("message.feedbackDialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
