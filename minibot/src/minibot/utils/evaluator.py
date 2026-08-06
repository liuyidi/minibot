"""Post-run notification evaluation for heartbeat checks."""

from __future__ import annotations

import logging
from typing import Any

from minibot.providers.base import LLMProvider

logger = logging.getLogger(__name__)

_DEFAULT_SYSTEM = (
    "You are a notification gate for a background agent. You will be given the "
    "original task and the agent's response. Call the evaluate_notification tool "
    "to decide whether the user should be notified.\n\n"
    "Notify when the response contains actionable information, errors, completed "
    "deliverables, scheduled reminder/timer completions, or anything the user "
    "explicitly asked to be reminded about.\n\n"
    "Suppress when the response is a routine status check with nothing new, a "
    "confirmation that everything is normal, or essentially empty.\n\n"
    "Also suppress when the response contains meta-reasoning about the task itself "
    "— descriptions of internal instructions, references to configuration files "
    "(e.g. HEARTBEAT.md), or decision logic about whether to notify the user."
)

_EVALUATE_TOOL: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "evaluate_notification",
            "description": (
                "Decide whether the user should be notified about this background task result."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "should_notify": {
                        "type": "boolean",
                        "description": (
                            "true = actionable/important; false = routine or empty"
                        ),
                    },
                    "reason": {
                        "type": "string",
                        "description": "One-sentence reason for the decision",
                    },
                },
                "required": ["should_notify"],
            },
        },
    }
]


def default_evaluator_prompt() -> str:
    return _DEFAULT_SYSTEM


async def evaluate_response(
    response: str,
    task_context: str,
    provider: LLMProvider,
    model: str,
    *,
    evaluator_prompt: str | None = None,
    default_notify: bool = False,
) -> bool:
    """Decide whether a heartbeat result should be delivered. Fail closed by default."""
    try:
        llm_response = await provider.chat(
            messages=[
                {"role": "system", "content": evaluator_prompt or default_evaluator_prompt()},
                {
                    "role": "user",
                    "content": (
                        f"## Original task\n{task_context}\n\n## Agent response\n{response}"
                    ),
                },
            ],
            tools=_EVALUATE_TOOL,
            model=model,
            temperature=0.0,
        )
        if not llm_response.has_tool_calls:
            logger.warning("evaluate_response: no tool call; default notify=%s", default_notify)
            return default_notify
        args = llm_response.tool_calls[0].arguments or {}
        if isinstance(args, str):
            import json

            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                return default_notify
        should_notify = args.get("should_notify", default_notify)
        logger.info(
            "evaluate_response: should_notify=%s reason=%s",
            should_notify,
            args.get("reason", ""),
        )
        return bool(should_notify)
    except Exception:
        logger.exception("evaluate_response failed; default notify=%s", default_notify)
        return default_notify
