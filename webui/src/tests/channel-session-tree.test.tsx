import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChannelSessionTree } from "@/components/ChannelSessionTree";
import type { ChatSummary } from "@/lib/types";

function session(partial: Partial<ChatSummary> & Pick<ChatSummary, "key">): ChatSummary {
  const key = partial.key;
  const idx = key.indexOf(":");
  return {
    channel: idx >= 0 ? key.slice(0, idx) : "websocket",
    chatId: idx >= 0 ? key.slice(idx + 1) : key,
    createdAt: null,
    updatedAt: null,
    preview: "",
    ...partial,
  };
}

describe("ChannelSessionTree", () => {
  it("offers pin, rename, and archive actions without delete", async () => {
    const onTogglePin = vi.fn();
    const onRequestRename = vi.fn();
    const onToggleArchive = vi.fn();
    const row = session({
      key: "websocket:feishu:ou_abc123456789",
      updatedAt: "2026-08-05T12:00:00Z",
    });

    render(
      <ChannelSessionTree
        sessions={[row]}
        activeKey={null}
        onSelect={vi.fn()}
        onTogglePin={onTogglePin}
        onRequestRename={onRequestRename}
        onToggleArchive={onToggleArchive}
        pinnedKeys={[]}
        archivedKeys={[]}
        titleOverrides={{}}
        showArchived={false}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText(/actions for/i), { button: 0 });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /pin/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /rename/i })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /archive/i })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /delete/i })).not.toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("menuitem", { name: /pin/i }));
    expect(onTogglePin).toHaveBeenCalledWith(row.key);

    fireEvent.pointerDown(screen.getByLabelText(/actions for/i), { button: 0 });
    fireEvent.click(await screen.findByRole("menuitem", { name: /rename/i }));
    expect(onRequestRename).toHaveBeenCalledWith(row.key, expect.any(String));

    fireEvent.pointerDown(screen.getByLabelText(/actions for/i), { button: 0 });
    fireEvent.click(await screen.findByRole("menuitem", { name: /archive/i }));
    expect(onToggleArchive).toHaveBeenCalledWith(row.key);
  });

  it("hides archived channel sessions until show archived is on", () => {
    const active = session({
      key: "websocket:feishu:ou_live",
      updatedAt: "2026-08-05T12:00:00Z",
    });
    const archived = session({
      key: "websocket:feishu:ou_gone",
      updatedAt: "2026-08-05T13:00:00Z",
      title: "Archived peer",
    });

    const { rerender } = render(
      <ChannelSessionTree
        sessions={[active, archived]}
        activeKey={null}
        onSelect={vi.fn()}
        onTogglePin={vi.fn()}
        onRequestRename={vi.fn()}
        onToggleArchive={vi.fn()}
        pinnedKeys={[]}
        archivedKeys={[archived.key]}
        titleOverrides={{}}
        showArchived={false}
      />,
    );

    expect(screen.queryByText("Archived peer")).not.toBeInTheDocument();

    rerender(
      <ChannelSessionTree
        sessions={[active, archived]}
        activeKey={null}
        onSelect={vi.fn()}
        onTogglePin={vi.fn()}
        onRequestRename={vi.fn()}
        onToggleArchive={vi.fn()}
        pinnedKeys={[]}
        archivedKeys={[archived.key]}
        titleOverrides={{}}
        showArchived
      />,
    );

    expect(screen.getByText("Archived peer")).toBeInTheDocument();
  });
});
