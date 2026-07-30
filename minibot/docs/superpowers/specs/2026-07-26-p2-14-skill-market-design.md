# P2-14 · Skill Market (Design)

> 对齐 `chengxiaobang/apps/backend/src/tools/skill-market-service.ts`  
> 简化版：只做**本地/远程 Git 索引 + 一键安装**，不做携程门户代理。

## 1. 目标

- 内置技能市场：本地 index（yaml/json）或远程 GitHub raw url 提供技能列表
- 一键安装到 `~/.minibot/skills/`（不进插件目录，属于 workspace-agnostic 独立技能）
- 内置 `skill-creator` 让模型引导用户创建技能
- 技能审核：安装前 preview，diff 可读

## 2. Index 结构

```yaml
# ~/.minibot/skill-index.yaml 或远程 URL 内容
version: 1
skills:
  - name: docx-cleaner
    description: 清洗 Word 文档
    version: 0.1.0
    author: xxx
    source:
      type: git
      url: https://github.com/x/y
      path: skills/docx-cleaner
      ref: main
  - name: web-summarizer
    description: 快速摘要网页
    source:
      type: tarball
      url: https://.../web-summarizer-0.1.0.tgz
      sha256: abc...
```

## 3. 安装流程

```
list()                       # 拉 index
show(name)                   # 详情 + README preview
install(name, version?)      # 下载 → sha256 校验 → 解压到 ~/.minibot/skills/<name>/
uninstall(name)              # 删目录
```

- 校验：远程内容 sha256 必须匹配（tarball 强制；git ref 用 commit SHA 锁定）
- 保留 `.installed.json` 元数据

## 4. 更新

- `check_updates()` 遍历本地已装 → 对比 index 版本
- 更新是"重装"：先 mv old → tmp，装新，成功后删 tmp

## 5. skill-creator

内置 skill（不是市场里下载的）：`~/.minibot/plugins/builtin/skills/skill-creator/`  
它引导模型：

- 问用户想解决的问题
- 生成 SKILL.md（frontmatter + 说明）
- 落 `~/.minibot/skills/<slug>/SKILL.md`
- 提示"是否上传/分享"（此阶段不做发布，只是本地）

## 6. 工具

```
skill_market(action, ...)
  action: list | show | install | uninstall | check_updates | update
```

## 7. REST

- `GET /api/skill-market/index`
- `POST /api/skill-market/install` `{name, version?}`
- `DELETE /api/skill-market/skills/{name}`

## 8. 安全

- 拒绝解压时含 `..` 路径
- 网络下载走 P0-1 approval（安装是 mutating 且外部内容，值得人工确认）
- 远程 index url 白名单：默认允许 `https://raw.githubusercontent.com/` + 用户显式添加

## 9. 与插件关系

- 独立技能 `~/.minibot/skills/*` 与插件 skills 并存
- 技能 registry 遍历时合并两个来源
