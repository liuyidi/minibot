"""Unit tests for AgentRunner trace output + Phase 0.6 timing/usage."""

from __future__ import annotations

import asyncio

from fake_provider import FakeProvider, text_response, tool_response

from minibot.agent.runner import AgentRunner
from minibot.agent.tools.echo import EchoTool
from minibot.agent.tools.registry import ToolRegistry
from minibot.providers.openai_compat import extract_usage


def test_runner_trace_with_tool_then_final() -> None:
    tools = ToolRegistry()
    tools.register(EchoTool())
    provider = FakeProvider(
        responses=[
            tool_response(
                "echo",
                {"text": "hi"},
                usage={"prompt_tokens": 8, "completion_tokens": 2, "total_tokens": 10},
            ),
            text_response(
                "echoed: hi",
                usage={"prompt_tokens": 20, "completion_tokens": 5, "total_tokens": 25},
            ),
        ]
    )
    runner = AgentRunner(provider)
    result = asyncio.run(
        runner.run(
            messages=[{"role": "user", "content": "please echo hi"}],
            tools=tools,
            model="test-model",
            system="sys",
        )
    )

    assert result.stop_reason == "completed"
    assert result.tools_used == ["echo"]
    types = [step["type"] for step in result.trace]
    assert types == [
        "prepare",
        "llm_request",
        "llm_tool_calls",
        "tool_result",
        "llm_request",
        "llm_final",
        "done",
    ]
    assert result.trace[0]["tool_names"] == ["echo"]
    assert result.trace[2]["tool_calls"][0]["name"] == "echo"
    assert result.trace[3]["result"]
    assert result.trace[-1]["iterations_used"] == 2
    # llm_request / llm_tool_calls / llm_final carry timing
    assert "ts" in result.trace[1] and result.trace[1]["type"] == "llm_request"
    assert result.trace[2]["type"] == "llm_tool_calls"
    assert "duration_ms" in result.trace[2]
    assert result.trace[2]["request_ts"] == result.trace[1]["ts"]
    assert result.trace[5]["type"] == "llm_final"
    assert "duration_ms" in result.trace[5]
    assert result.trace[5]["request_ts"] == result.trace[4]["ts"]


def test_every_trace_step_has_monotonic_t_start_t_end() -> None:
    tools = ToolRegistry()
    tools.register(EchoTool())
    provider = FakeProvider(
        responses=[
            tool_response("echo", {"text": "x"}),
            text_response("done"),
        ]
    )
    result = asyncio.run(
        AgentRunner(provider).run(
            messages=[{"role": "user", "content": "hi"}],
            tools=tools,
            model="m",
        )
    )
    prev_end = 0
    for step in result.trace:
        assert "t_start" in step and "t_end" in step
        assert isinstance(step["t_start"], int)
        assert isinstance(step["t_end"], int)
        assert step["t_end"] >= step["t_start"]
        assert step["t_start"] >= prev_end or step["type"] in {"llm_final", "llm_tool_calls", "llm_error"}
        # Overall timeline: each step's t_start should be >= previous step's t_start
        # (llm_final shares t_start with its llm_request, so compare loosely).
        prev_end = max(prev_end, step["t_start"])
    starts = [s["t_start"] for s in result.trace]
    assert starts == sorted(starts)


def test_llm_final_carries_usage() -> None:
    tools = ToolRegistry()
    provider = FakeProvider(
        responses=[
            text_response(
                "hello",
                usage={"prompt_tokens": 11, "completion_tokens": 3, "total_tokens": 14},
            )
        ]
    )
    result = asyncio.run(
        AgentRunner(provider).run(
            messages=[{"role": "user", "content": "hi"}],
            tools=tools,
            model="m",
        )
    )
    final = next(s for s in result.trace if s["type"] == "llm_final")
    assert final["usage"]["prompt_tokens"] == 11
    assert final["usage"]["completion_tokens"] == 3


def test_extract_usage_from_openai_body() -> None:
    assert extract_usage({}) is None
    assert extract_usage({"usage": {}}) is None
    assert extract_usage(
        {"usage": {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}}
    ) == {"prompt_tokens": 1, "completion_tokens": 2, "total_tokens": 3}
    assert extract_usage({"usage": {"input_tokens": 4, "output_tokens": 5}}) == {
        "prompt_tokens": 4,
        "completion_tokens": 5,
    }
