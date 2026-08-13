import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "@/i18n";
import { ContextUsageButton } from "@/components/thread/ContextUsageButton";
import type { ContextUsagePayload } from "@/lib/types";

const fetchContextUsage = vi.fn();

vi.mock("@/lib/apis/api", () => ({
  fetchContextUsage: (...args: unknown[]) => fetchContextUsage(...args),
}));

const sampleUsage: ContextUsagePayload = {
  context_window_tokens: 128_000,
  used_tokens: 20_000,
  free_tokens: 108_000,
  used_pct: 15.6,
  estimate_method: "chars/4",
  used_label: "20k",
  free_label: "108k",
  window_label: "128k",
  categories: [
    {
      id: "system_tools",
      label: "System tools",
      tokens: 1000,
      count: 3,
      color: "#5b8def",
      pct: 0.8,
      tokens_label: "1k",
    },
    {
      id: "messages",
      label: "Messages",
      tokens: 19_000,
      count: 4,
      color: "#3ecf8e",
      pct: 14.8,
      tokens_label: "19k",
    },
    {
      id: "free",
      label: "Free space",
      tokens: 108_000,
      count: 0,
      color: "#6b7280",
      pct: 84.4,
      tokens_label: "108k",
    },
  ],
};

describe("ContextUsageButton", () => {
  beforeEach(() => {
    fetchContextUsage.mockReset();
    fetchContextUsage.mockResolvedValue(sampleUsage);
  });

  it("renders the ring trigger and opens the usage popover", async () => {
    const user = userEvent.setup();
    render(
      <ContextUsageButton sessionKey="websocket:chat-1" token="tok" draftText="hello" />,
    );

    const trigger = await screen.findByRole("button", { name: /show context usage/i });
    await waitFor(() => expect(fetchContextUsage).toHaveBeenCalled());
    expect(fetchContextUsage).toHaveBeenCalledWith("tok", "websocket:chat-1", "hello");

    await user.click(trigger);

    expect(await screen.findByText("Context Usage")).toBeInTheDocument();
    expect(screen.getByText("15.6% Full")).toBeInTheDocument();
    expect(screen.getByText("~20k / 128k Tokens")).toBeInTheDocument();
    expect(screen.getByText("System tools")).toBeInTheDocument();
    expect(screen.getByText("Messages")).toBeInTheDocument();
    expect(screen.queryByText("Free space")).not.toBeInTheDocument();
  });

  it("shows an empty-state hint when no session is selected", async () => {
    const user = userEvent.setup();
    render(<ContextUsageButton sessionKey={null} token="tok" />);
    await user.click(await screen.findByRole("button", { name: /show context usage/i }));
    expect(
      await screen.findByText(/open a chat to estimate context usage/i),
    ).toBeInTheDocument();
    expect(fetchContextUsage).not.toHaveBeenCalled();
  });

  it("renders localized copy in Chinese", async () => {
    await i18n.changeLanguage("zh-CN");

    const user = userEvent.setup();
    render(
      <ContextUsageButton sessionKey="websocket:chat-1" token="tok" draftText="hello" />,
    );

    await waitFor(() => expect(fetchContextUsage).toHaveBeenCalled());
    await user.click(await screen.findByRole("button", { name: /显示上下文占用/i }));

    expect(await screen.findByText("上下文占用")).toBeInTheDocument();
    expect(screen.getByText("15.6% 已使用")).toBeInTheDocument();
    expect(screen.getByText("约 20k / 128k Token")).toBeInTheDocument();
    expect(screen.getByText("系统工具")).toBeInTheDocument();
    expect(screen.getByText("消息")).toBeInTheDocument();
  });
});
