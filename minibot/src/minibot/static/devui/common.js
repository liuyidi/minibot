/* Shared helpers for minibot Dev UI pages. */
(function (global) {
  const THEME_KEY = "minibot-devui-theme";
  const TRACES_KEY = "minibot-devui-traces";
  const CHANNEL = "minibot-devui";
  const MAX_TRACES = 40;

  function earlyTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      const theme =
        saved === "light" || saved === "dark"
          ? saved
          : window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
      document.documentElement.setAttribute("data-theme", theme);
    } catch (_) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {}
  }

  function toggleTheme() {
    setTheme(currentTheme() === "light" ? "dark" : "light");
    return currentTheme();
  }

  function loadTraces() {
    try {
      const raw = localStorage.getItem(TRACES_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function saveTraces(list) {
    try {
      localStorage.setItem(TRACES_KEY, JSON.stringify(list.slice(0, MAX_TRACES)));
    } catch (_) {}
  }

  function publishTrace(entry) {
    const record = {
      id: entry.id || `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      at: entry.at || new Date().toISOString(),
      sessionId: entry.sessionId || "",
      userText: entry.userText || "",
      content: entry.content || "",
      stopReason: entry.stopReason || "",
      toolsUsed: entry.toolsUsed || [],
      source: entry.source || "rest",
      trace: entry.trace || [],
    };
    const list = [record, ...loadTraces().filter((t) => t.id !== record.id)];
    saveTraces(list);
    try {
      const ch = new BroadcastChannel(CHANNEL);
      ch.postMessage({ type: "trace", record });
      ch.close();
    } catch (_) {}
    return record;
  }

  function clearTraces() {
    saveTraces([]);
    try {
      const ch = new BroadcastChannel(CHANNEL);
      ch.postMessage({ type: "clear" });
      ch.close();
    } catch (_) {}
  }

  function onTraceEvent(handler) {
    try {
      const ch = new BroadcastChannel(CHANNEL);
      ch.onmessage = (ev) => handler(ev.data || {});
      return () => ch.close();
    } catch (_) {
      return () => {};
    }
  }

  function formatDurationMs(ms) {
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(ms >= 10000 ? 1 : 2)}s`;
  }

  function llmDurationMs(step, allSteps) {
    if (typeof step.duration_ms === "number" && Number.isFinite(step.duration_ms)) {
      return step.duration_ms;
    }
    if (
      typeof step.t_start === "number" &&
      typeof step.t_end === "number" &&
      Number.isFinite(step.t_start) &&
      Number.isFinite(step.t_end)
    ) {
      const ms = step.t_end - step.t_start;
      return ms >= 0 ? ms : null;
    }
    const endTs = step.ts;
    const startTs = step.request_ts
      || (allSteps || []).find(
        (s) => s.type === "llm_request" && s.iteration === step.iteration
      )?.ts;
    if (!endTs || !startTs) return null;
    const ms = new Date(endTs) - new Date(startTs);
    return Number.isFinite(ms) && ms >= 0 ? ms : null;
  }

  function usageLabel(step) {
    const u = step && step.usage;
    if (!u || typeof u !== "object") return "usage —";
    const p = u.prompt_tokens;
    const c = u.completion_tokens;
    if (p == null && c == null) return "usage —";
    return `in ${p ?? "—"} / out ${c ?? "—"}`;
  }

  function durationSuffix(step, allSteps) {
    const ms = llmDurationMs(step, allSteps);
    if (ms == null) return "";
    return ` · ${formatDurationMs(ms)}`;
  }

  function contextBits(step) {
    const ctx = step && step.context;
    if (!ctx || typeof ctx !== "object") return "";
    const mem = ctx.memory || {};
    const skills = ctx.skills || {};
    const memPart = mem.injected
      ? `memory=${mem.chars ?? "?"}c`
      : "memory=no";
    const always = Array.isArray(skills.always) ? skills.always : [];
    const skillPart = `skills=${skills.count ?? 0}` + (always.length ? `(always:${always.join(",")})` : "");
    return ` · ${memPart} · ${skillPart}`;
  }

  function findContextMeta(steps) {
    if (!Array.isArray(steps)) return null;
    for (const step of steps) {
      if (step && step.context && typeof step.context === "object") return step.context;
    }
    return null;
  }

  function memoryToolsUsed(toolsUsed) {
    const list = Array.isArray(toolsUsed) ? toolsUsed : [];
    return list.filter((n) => n === "read_memory" || n === "write_memory");
  }

  function traceTitle(step, allSteps) {
    const t = step.type || "?";
    const it = step.iteration != null ? `#${step.iteration}` : "";
    if (t === "prepare") {
      return `准备上下文 · ${step.message_count || 0} msgs · tools=[${(step.tool_names || []).join(", ")}]${contextBits(step)}`;
    }
    if (t === "llm_request") {
      return `第 ${it} 次调用 LLM · 送入 ${step.message_count} 条消息${contextBits(step)}`;
    }
    if (t === "llm_tool_calls") {
      const names = (step.tool_calls || []).map((c) => c.name).join(", ");
      return `第 ${it} 次 LLM → 要调工具: ${names || "(none)"}${durationSuffix(step, allSteps)}`;
    }
    if (t === "tool_result") {
      return `第 ${it} 次 · 工具 ${step.name} 返回`;
    }
    if (t === "llm_final") {
      return `第 ${it} 次 LLM → 最终文本${durationSuffix(step, allSteps)}`;
    }
    if (t === "llm_error") {
      return `第 ${it} 次 LLM 错误${durationSuffix(step, allSteps)}`;
    }
    if (t === "done") {
      return `结束 · ${step.stop_reason || ""} · tools=${(step.tools_used || []).join(",") || "—"}`;
    }
    return t;
  }

  /** Categorized Dev UI pages for the lab drawer. */
  const DEV_NAV = [
    {
      category: "产品入口（面试）",
      items: [
        {
          href: "https://liuyidi.me",
          title: "Landing",
          desc: "项目总览与 Agent 能力介绍",
        },
        {
          href: "/",
          title: "WebUI 主站",
          desc: "minibot 完整前端（接 minibot API）",
        },
        {
          href: "https://mlf.liuyidi.me",
          title: "mini-langfuse",
          desc: "Traces / Sessions / Eval 可观测",
        },
        {
          href: "https://kb.liuyidi.me",
          title: "minikb",
          desc: "知识库（部署后可用）",
        },
      ],
    },
    {
      category: "聊天与观测",
      items: [
        { href: "./", title: "Chat", desc: "会话列表、发消息、Settings" },
        { href: "./trace.html", title: "Agent Trace", desc: "LLM / 工具逐步轨迹" },
        { href: "./tools.html", title: "Tools", desc: "已注册工具、最近调用、安全拒绝" },
        { href: "./approvals.html", title: "Human-in-the-loop", desc: "高风险操作审批队列与状态机模拟" },
        { href: "./context.html", title: "Context", desc: "system 组装预览、compaction 日志" },
        { href: "./memory.html", title: "Memory", desc: "MEMORY.md 读写与注入对照" },
        { href: "./skills.html", title: "Skills", desc: "技能发现、覆盖、body 预览" },
        { href: "./mcp.html", title: "MCP", desc: "MCP presets、注入 tools、正向/异常情景" },
        { href: "./providers.html", title: "Providers", desc: "registry / Anthropic / minibot 导入" },
        { href: "./automations.html", title: "Automations", desc: "Cron jobs：创建 / 启停 / 立即跑" },
      ],
    },
    {
      category: "会话与存储",
      items: [
        {
          href: "./session-files.html",
          title: "Session Files",
          desc: "磁盘 JSONL、时间排序、删除",
        },
      ],
    },
    {
      category: "运行时与并发",
      items: [
        { href: "./runtime.html", title: "Runtime", desc: "Loop / Bus / Fallback 故障注入" },
        { href: "./race.html", title: "Race Demo", desc: "无锁破坏 vs 有锁对照" },
      ],
    },
    {
      category: "Providers / MCP",
      items: [
        {
          href: "./providers.html",
          title: "Providers 页",
          desc: "registry + 导入向导（Insight UI）",
        },
        {
          href: "/api/dev/providers",
          title: "Active provider JSON",
          desc: "当前 preset（脱敏）· 新标签打开 API",
        },
        {
          href: "/api/dev/mcp",
          title: "MCP runtime JSON",
          desc: "connected / injected tools / events",
        },
      ],
    },
  ];

  function renderDevNav(container) {
    if (!container) return;
    container.innerHTML = DEV_NAV.map((group) => {
      const links = group.items
        .map(
          (item) => `<a class="dev-nav-item" href="${item.href}" target="_blank" rel="noopener">
            <span class="dev-nav-title">${item.title}</span>
            <span class="dev-nav-desc">${item.desc || ""}</span>
          </a>`
        )
        .join("");
      return `<div class="dev-nav-group">
        <div class="dev-nav-cat">${group.category}</div>
        ${links}
      </div>`;
    }).join("");
  }

  function wireDevDrawer(opts) {
    const openBtn = opts && opts.openBtn;
    const drawer = opts && opts.drawer;
    const backdrop = opts && opts.backdrop;
    const closeBtn = opts && opts.closeBtn;
    const list = opts && opts.list;
    if (!openBtn || !drawer) return;
    renderDevNav(list);
    const open = () => {
      drawer.classList.add("open");
      if (backdrop) backdrop.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
    };
    const close = () => {
      drawer.classList.remove("open");
      if (backdrop) backdrop.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
    };
    openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
    return { open, close };
  }

  global.MinibotDevUI = {
    THEME_KEY,
    earlyTheme,
    currentTheme,
    setTheme,
    toggleTheme,
    loadTraces,
    publishTrace,
    clearTraces,
    onTraceEvent,
    formatDurationMs,
    llmDurationMs,
    usageLabel,
    contextBits,
    findContextMeta,
    memoryToolsUsed,
    traceTitle,
    DEV_NAV,
    renderDevNav,
    wireDevDrawer,
  };

  earlyTheme();
})(window);
