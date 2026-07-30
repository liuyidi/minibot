# minibot mini-langfuse Phase B Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Opt-in mini-langfuse tracing for minibot turns (Trace + Generation + Tool spans).

**Architecture:** Soft-import adapter; wire at loop/runner/compact; lifespan init/shutdown.

**Tech Stack:** mini-langfuse-sdk (`mini_langfuse`), pydantic-settings, existing AgentLoop/AgentRunner.

### Task 1: Settings + adapter
### Task 2: Wire loop / runner / compact / lifespan
### Task 3: Tests + local install + smoke
