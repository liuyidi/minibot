# downloads.liuyidi.me → 真正的阿里云 CDN 边缘

## 现状（问题）

`downloads.liuyidi.me` 的 DNS 目前是：

```text
downloads.liuyidi.me
  CNAME → liuyidi.cn-hangzhou.taihangcda.cn   # OSS 自定义域名 CNAME
  A     → 杭州 OSS
```

响应头是 `Server: AliyunOSS`，**没有** `X-Cache: HIT`。  
这是「绑定了自定义域名的 OSS 源站」，**不是**全国边缘节点缓存。同城可能很快，跨区/弱网下半兆 gzip 仍可能要数秒。

OSS **不支持** HTTP/2；要 HTTP/2/3 必须走 CDN。

## 目标

| 项 | 期望 |
|----|------|
| DNS | CNAME → 阿里云 CDN 分配域名（如 `*.w.kunlun*.com` / `*.kunluna*.com`） |
| 源站 | `liuyidi.oss-cn-hangzhou.aliyuncs.com`（Bucket `liuyidi`） |
| 缓存 | 带 hash / `immutable` 的 `/minibot/webui/**` 长缓存；二次请求 `X-Cache: HIT` |
| 协议 | HTTPS + **HTTP/2**（可选 HTTP/3） |
| 压缩 | **保持** 对象上已有的 `Content-Encoding: gzip`（Publish WebUI 预压缩）；CDN **关闭智能压缩**，避免二次压缩 |
| CORS | 允许 `bot.liuyidi.me` 拉 module script（已在 OSS CORS；CDN 出站头建议再配一遍） |

## 推荐操作（控制台，约 10 分钟）

域名 DNS 在万网（`dns9/10.hichina.com`），与阿里云账号同一体系时最省事。

### 1. 给 downloads 开 CDN 加速

任选其一：

**A. OSS 控制台一键（推荐）**

1. [OSS 控制台](https://oss.console.aliyun.com/) → Bucket `liuyidi` → **Bucket 配置 → 域名管理**
2. 找到已绑定的 `downloads.liuyidi.me`
3. 开启 **CDN 加速**（会创建/关联 CDN 加速域名，并给出**新的** CNAME 目标）
4. 记下 CDN 给的 CNAME（不再是 `*.taihangcda.cn`）

**B. CDN 控制台手动**

1. [CDN 控制台](https://cdn.console.aliyun.com/) → 添加域名
2. 加速域名：`downloads.liuyidi.me`
3. 业务类型：图片小文件 / 全站（静态资源即可）
4. 源站类型：**OSS 域名** → `liuyidi.oss-cn-hangzhou.aliyuncs.com`
5. 端口 443；开启 **OSS 私有 Bucket 回源**仅当 Bucket 非公共读（当前 ACL 为 public-read，一般不需要）

### 2. 改 DNS CNAME

万网 / 云解析：

| 主机记录 | 类型 | 记录值 |
|----------|------|--------|
| `downloads` | CNAME | CDN 控制台给出的域名（**替换**原来的 `liuyidi.cn-hangzhou.taihangcda.cn`） |

等解析生效（可 `dig +short downloads.liuyidi.me`）。

### 3. CDN 域名配置清单

在 CDN → 该域名 → 配置：

1. **HTTPS**：上传/选用已有证书（与 `downloads.liuyidi.me` 匹配）；开启强制 HTTPS  
2. **HTTP/2**：开启  
3. **HTTP/3（QUIC）**：可选开启  
4. **智能压缩**：关闭（我们已预 gzip 上传）  
5. **缓存**：
   - 目录 `/minibot/webui/` → 缓存时间 **30 天+**（或遵循源站 `Cache-Control`）
   - 建议「遵循源站」：对象已是 `public,max-age=31536000,immutable`
6. **出站响应头**（CORS，可选但建议）：
   - `Access-Control-Allow-Origin: *`（或精确 `https://bot.liuyidi.me`）
   - `Access-Control-Allow-Methods: GET, HEAD`
   - `Access-Control-Expose-Headers: ETag, Content-Length, Content-Encoding`
7. **Range 回源**：大安装包可开；WebUI 小文件可开可关

### 4. 验收

```bash
chmod +x scripts/verify-downloads-cdn.sh
REQUIRE_CDN_HIT=1 REQUIRE_HTTP2=1 scripts/verify-downloads-cdn.sh
```

期望：

- 第二次请求响应含 `X-Cache: …HIT…`（或 `Age` / Swift 标记）
- `proto=2` 或 `3`
- 仍有 `Content-Encoding: gzip`
- 不再是「只有 `Server: AliyunOSS`、毫无缓存头」

Publish WebUI 验收步骤也会调用该脚本；仓库变量 `CDN_EDGE_REQUIRED=1` 时命中失败会打断发布。

## OpenAPI / CI（可选）

若 RAM 用户除 `oss:*` 外还有 CDN 写权限，可用：

```bash
# 需 ALIBABA_CLOUD_ACCESS_KEY_ID / SECRET（或 OSS_* 同源且已授 CDN）
gh workflow run "Configure Downloads CDN" --ref main
```

工作流会尝试创建/查询加速域名并打印应写入的 CNAME；**DNS 切换仍需你在云解析确认**。

## 回滚

把 `downloads` 的 CNAME 改回 OSS 控制台「CNAME 域名」（`*.taihangcda.cn`）即可回到纯 OSS；对象本身无需改动。
