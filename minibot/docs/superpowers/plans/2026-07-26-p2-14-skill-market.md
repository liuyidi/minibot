# P2-14 · Skill Market (Plan)

> spec：`specs/2026-07-26-p2-14-skill-market-design.md`  
> 依赖：P0-1 审批（网络下载 + 解压走审批）、P2-13 插件（技能加载共享）

## Constraints

- Index 白名单校验；安装 sha256 强校验
- 不做携程门户代理
- skill-creator 只写本地文件，不做外部推送

## File map

| File | Role |
|---|---|
| `minibot/skills/market/models.py` |  |
| `minibot/skills/market/service.py` | list/install/uninstall |
| `minibot/skills/market/download.py` | git/tarball 下载 |
| `minibot/agent/tools/skill_market.py` |  |
| `minibot/api/routes/skill_market.py` |  |
| `minibot/plugins/builtin/skills/skill-creator/` | 内置 |
| `tests/test_market_service.py` |  |
| `tests/test_market_download.py` |  |
| `tests/test_skill_creator.py` |  |

## Task 1 — Index & Service

- [ ] YAML 加载 + 远程 fetch
- [ ] list/show
- [ ] 单测：假 index

## Task 2 — 下载与解压

- [ ] tarball 下载 + sha256 校验
- [ ] git 浅克隆 + commit ref 锁定
- [ ] 单测

## Task 3 — Install/Uninstall

- [ ] 装到 `~/.minibot/skills/`
- [ ] 元数据 .installed.json
- [ ] 单测

## Task 4 — 更新

- [ ] check_updates
- [ ] update（重装）
- [ ] 单测

## Task 5 — skill-creator

- [ ] SKILL.md 模板
- [ ] 交互 prompt
- [ ] 落盘工具（复用 memory 类穿越校验）
- [ ] 单测

## Task 6 — 工具 & REST

- [ ] `skill_market` 工具
- [ ] REST
- [ ] TestClient

## Task 7 — 文档

- [ ] `docs-plan/phase-p2-14-skill-market.md`

## 验收

- 手工：从 GitHub tarball 装一个技能 → 在会话中被 SkillsRegistry 识别
- 手工：sha256 不匹配 → 拒绝安装
- 手工：`skill-creator` 引导创建一个 SKILL.md 落地
