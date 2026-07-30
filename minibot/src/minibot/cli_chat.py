"""Interactive CLI chat via AgentLoop (same path as REST/WS)."""

from __future__ import annotations

import asyncio
import sys

from minibot.app_state import build_app_state


async def _chat_loop() -> None:
    state = build_app_state()
    session = state.sessions.create(title="cli")
    print("minibot CLI chat (empty line to quit)")
    print(f"model={state.config.model} tools={state.tools.names()} session={session.id}")
    while True:
        try:
            line = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            break
        result = await state.loop.handle_turn(session.id, line, entry="cli")
        print(f"bot> {result.content}")
        if result.tools_used:
            print(f"     tools_used={result.tools_used} stop={result.stop_reason}")


def main() -> None:
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())  # type: ignore[attr-defined]
    asyncio.run(_chat_loop())


if __name__ == "__main__":
    main()
