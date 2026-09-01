import { describe, expect, it } from "vitest";

import {
  isDirectoryTreeMarkdown,
  isPreviewableTreeFileName,
  parseDirectoryTree,
} from "@/lib/markdown/directory-tree";

const SAMPLE_TREE = `pm2-app/
├── app.js                 # 示例 Node.js HTTP 服务
├── ecosystem.config.js    # PM2 配置
├── package.json           # 依赖
├── .gitignore
├── README.md
└── logs/
    └── app.log
`;

describe("directory-tree", () => {
  it("detects ascii directory trees with previewable files", () => {
    expect(isDirectoryTreeMarkdown(SAMPLE_TREE)).toBe(true);
    expect(isDirectoryTreeMarkdown("```not a tree\njust one line")).toBe(false);
  });

  it("accepts common config filenames", () => {
    expect(isPreviewableTreeFileName("Dockerfile")).toBe(true);
    expect(isPreviewableTreeFileName(".gitignore")).toBe(true);
    expect(isPreviewableTreeFileName("logs/")).toBe(false);
  });

  it("builds workspace-relative preview paths from tree rows", () => {
    const rows = parseDirectoryTree(SAMPLE_TREE);
    expect(rows).not.toBeNull();
    const files = rows!.filter((row) => row.kind === "file");
    expect(files.map((row) => row.previewPath)).toEqual([
      "pm2-app/app.js",
      "pm2-app/ecosystem.config.js",
      "pm2-app/package.json",
      "pm2-app/.gitignore",
      "pm2-app/README.md",
      "pm2-app/logs/app.log",
    ]);
  });
});
