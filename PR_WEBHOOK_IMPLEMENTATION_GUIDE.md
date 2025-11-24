# PR Webhook 功能实施指南

## 📋 功能概述

本文档描述了基于 **方案3：Webhook自动触发（企业级）** 实现的 PR 代码扫描功能。该功能允许系统在 GitHub/GitLab PR 创建或更新时自动触发代码审查。

---

## ✅ 已完成的后端实现

### 1. 数据库模型 ✅

已创建以下数据库表：

#### `pull_requests` 表
存储 PR 的基本信息和元数据：
- `id`: 主键
- `pr_number`: PR 编号
- `title`, `description`: PR 标题和描述
- `author`, `author_avatar`: 作者信息
- `source_branch`, `target_branch`: 源分支和目标分支
- `status`: PR 状态 (OPEN, CLOSED, MERGED)
- `changed_files_count`, `additions`, `deletions`: 变更统计
- `changed_files`: JSON 格式的变更文件列表
- `pr_metadata`: 额外元数据

#### `webhook_configs` 表
存储项目的 webhook 配置：
- `project_id`: 关联项目（一对一关系）
- `platform`: 平台类型 (github, gitlab, codecommit)
- `webhook_url`: 生成的 webhook URL
- `secret_token`: 用于签名验证的密钥
- `events`: 监听的事件列表
- `auto_scan_enabled`: 是否自动触发扫描
- `auto_comment_enabled`: 是否自动回复评论

#### `webhook_logs` 表
记录 webhook 事件日志：
- `event_type`, `event_action`: 事件类型和操作
- `payload`: 完整的 webhook payload (JSON)
- `response_status`: 响应状态码
- `error_message`: 错误信息
- `task_id`: 关联的 Celery 任务 ID
- `processed`: 是否已处理

#### `pr_comments` 表
跟踪 PR 评论（避免重复）：
- `comment_id`: GitHub/GitLab 评论 ID
- `comment_type`: 评论类型 (inline, general, review)
- `body`: 评论内容
- `pull_request_id`: 关联 PR
- `audit_issue_id`: 关联的审计问题

### 2. 核心服务 ✅

#### `/backend/services/repository/pr_diff_service.py`
- `fetch_pr_info()`: 获取 PR 基本信息
- `fetch_pr_diff()`: 获取 PR 差异（变更文件列表）
- `parse_diff_hunks()`: 解析 diff patch，提取变更行号
- `is_line_in_diff()`: 判断某行是否在差异范围内
- 支持 GitHub, GitLab, CodeCommit

#### `/backend/services/webhook/webhook_security.py`
- `verify_github_signature()`: 验证 GitHub webhook 签名
- `verify_gitlab_token()`: 验证 GitLab webhook token
- `validate_ip_whitelist()`: IP 白名单验证

#### `/backend/services/webhook/webhook_handler.py`
- `process_github_webhook()`: 处理 GitHub webhook 事件
- `process_gitlab_webhook()`: 处理 GitLab webhook 事件
- `_upsert_github_pr()`: 创建/更新 GitHub PR 记录
- `_trigger_pr_scan()`: 触发 PR 扫描任务

### 3. API 端点 ✅

#### Webhook 接收端点
- `POST /api/v1/webhooks/receive/github/{project_id}/{secret}`: 接收 GitHub webhook
- `POST /api/v1/webhooks/receive/gitlab/{project_id}/{secret}`: 接收 GitLab webhook

#### Webhook 管理端点
- `POST /api/v1/webhooks/configs`: 创建 webhook 配置
- `GET /api/v1/webhooks/configs/project/{project_id}`: 获取项目的 webhook 配置
- `DELETE /api/v1/webhooks/configs/{config_id}`: 删除 webhook 配置
- `GET /api/v1/webhooks/logs/{webhook_id}`: 获取 webhook 日志

#### PR 管理端点
- `GET /api/v1/pull-requests?project_id={id}`: 列出项目的 PR
- `GET /api/v1/pull-requests/{pr_id}`: 获取 PR 详情
- `POST /api/v1/pull-requests/import?project_id={id}&pr_number={number}`: 手动导入 PR
- `POST /api/v1/pull-requests/{pr_id}/scan`: 手动触发 PR 扫描

### 4. Celery 任务 ✅

#### `/backend/tasks/pr_scan_tasks.py`
- `scan_pull_request_task()`: 主扫描任务
  - 获取 PR 信息和差异
  - 只扫描变更的文件
  - 只报告变更行附近的问题（±3行）
  - 生成审计任务和问题记录
  - 自动回复 PR 评论（如果启用）

---

## 🚀 使用流程

### 第一步：配置 Webhook

1. **在系统中创建 webhook 配置**

```bash
POST /api/v1/webhooks/configs
Content-Type: application/json
Authorization: Bearer {your_token}

{
  "project_id": 1,
  "platform": "github",
  "events": ["pull_request"],
  "auto_scan_enabled": true,
  "auto_comment_enabled": true
}
```

**响应示例：**
```json
{
  "id": 1,
  "project_id": 1,
  "platform": "github",
  "webhook_url": "http://your-domain.com/api/v1/webhooks/receive/github/1/aB3dEf...xyz",
  "secret_token": "aB3dEf...xyz",
  "events": ["pull_request"],
  "is_active": true,
  "auto_scan_enabled": true,
  "auto_comment_enabled": true
}
```

2. **在 GitHub 仓库中配置 webhook**

   - 访问仓库设置 → Webhooks → Add webhook
   - Payload URL: 复制上面返回的 `webhook_url`
   - Content type: `application/json`
   - Secret: 复制上面返回的 `secret_token`
   - 选择事件: `Pull requests`
   - 保存

### 第二步：自动触发

当 PR 被创建或更新时：

1. GitHub 发送 webhook 请求到您的服务器
2. 系统验证签名并记录事件
3. 自动创建/更新 PR 记录
4. 如果启用了 `auto_scan_enabled`，触发 Celery 扫描任务
5. 扫描完成后，如果启用了 `auto_comment_enabled`，在 PR 中添加评论

### 第三步：查看结果

**自动评论示例：**

```markdown
## 🔍 XCodeReviewer - 代码审查结果

发现 **3** 个问题需要关注:

- 🟠 高: 1 个
- 🟡 中: 2 个

📊 **扫描统计**:
- 扫描文件: 5 个
- 变更行数: +120 -45

### 主要问题:

1. 🟠 **SQL注入风险**
   - 文件: `src/api/users.py:45`
   - 建议: 使用参数化查询替代字符串拼接

2. 🟡 **未处理的异常**
   - 文件: `src/utils/parser.py:78`
   - 建议: 添加 try-catch 块处理可能的错误

[📄 查看完整报告](http://your-domain.com/tasks/123)

---
*由 XCodeReviewer 自动生成*
```

---

## 📱 前端实现建议（待完成）

### 1. Webhook 配置页面

**位置**: `/src/pages/WebhookConfig.tsx`

**功能要求：**
- 显示当前项目的 webhook 配置状态
- 一键生成 webhook URL 和 Secret
- 显示配置步骤指南
- 开关控制：自动扫描、自动评论
- 显示最近的 webhook 事件日志

**UI 设计建议：**

```
┌─────────────────────────────────────────┐
│  Webhook 配置                            │
├─────────────────────────────────────────┤
│                                          │
│  [√] Webhook 已启用                      │
│                                          │
│  平台: GitHub                            │
│  Webhook URL:                            │
│  ┌────────────────────────┐ [复制]      │
│  │ http://...             │             │
│  └────────────────────────┘             │
│                                          │
│  Secret Token:                           │
│  ┌────────────────────────┐ [复制]      │
│  │ aB3dEf...xyz           │             │
│  └────────────────────────┘             │
│                                          │
│  设置:                                   │
│  [√] 自动扫描 PR                        │
│  [√] 自动回复评论                       │
│                                          │
│  ┌──────────────────────────────┐      │
│  │ 配置步骤                     │      │
│  │ 1. 复制上面的 Webhook URL     │      │
│  │ 2. 进入 GitHub 仓库设置       │      │
│  │ 3. 添加 webhook...            │      │
│  └──────────────────────────────┘      │
│                                          │
│  最近事件:                              │
│  ┌──────────────────────────────────┐  │
│  │ [✓] PR #123 opened - 5分钟前     │  │
│  │ [✓] PR #122 synchronize - 1小时前│  │
│  └──────────────────────────────────┘  │
│                                          │
│  [禁用 Webhook] [删除配置]              │
└─────────────────────────────────────────┘
```

### 2. PR 列表页面

**位置**: `/src/pages/PullRequests.tsx`

**功能要求：**
- 列出项目的所有 PR
- 按状态筛选 (Open, Closed, Merged)
- 显示每个 PR 的扫描状态
- 点击查看 PR 详情和扫描结果

**UI 设计建议：**

```
┌─────────────────────────────────────────┐
│  Pull Requests                           │
│                                          │
│  [全部] [Open] [Closed] [Merged]        │
├─────────────────────────────────────────┤
│                                          │
│  #123 新功能: 用户认证                  │
│  作者: @username  |  main ← feature-auth│
│  [扫描完成] 发现 3 个问题               │
│  +120 -45  |  2小时前                   │
│  ──────────────────────────────────────│
│                                          │
│  #122 修复: 修复登录 bug                │
│  作者: @user2  |  main ← fix-login       │
│  [扫描中] 进度 45%                       │
│  +20 -10  |  5小时前                    │
│  ──────────────────────────────────────│
│                                          │
│  #121 重构: 优化数据库查询              │
│  作者: @user3  |  main ← refactor-db     │
│  [✓ 通过] 未发现问题                    │
│  +80 -65  |  1天前                      │
└─────────────────────────────────────────┘
```

### 3. PR 详情页面

**位置**: `/src/pages/PullRequestDetail.tsx`

**功能要求：**
- 显示 PR 基本信息
- 显示变更文件列表
- 显示扫描结果（按文件分组）
- 手动触发重新扫描

---

## 🔧 配置说明

### 环境变量配置

在 `/backend/.env` 中添加：

```bash
# API Base URL (用于生成 webhook URL 和报告链接)
API_BASE_URL=http://your-domain.com

# GitHub Token (用于调用 GitHub API)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx

# GitLab Token (用于调用 GitLab API)
GITLAB_TOKEN=glpat-xxxxxxxxxxxxx

# AWS Credentials (用于 CodeCommit)
AWS_ACCESS_KEY_ID=xxxxx
AWS_SECRET_ACCESS_KEY=xxxxx
AWS_DEFAULT_REGION=us-east-1
```

### Webhook IP 白名单（可选）

如需增强安全性，可在 webhook 配置中添加 IP 白名单：

**GitHub IP 范围：**
- 192.30.252.0/22
- 185.199.108.0/22
- 140.82.112.0/20
- 143.55.64.0/20

**GitLab IP 范围：**
- 34.74.90.64/28
- 34.74.226.0/24

---

## 🎯 测试方法

### 1. 测试 Webhook 接收

```bash
# 模拟 GitHub webhook 事件
curl -X POST "http://localhost:8000/api/v1/webhooks/receive/github/1/your-secret" \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -H "X-Hub-Signature-256: sha256=..." \
  -d @test_pr_payload.json
```

### 2. 测试 PR 扫描

```bash
# 手动导入 PR
curl -X POST "http://localhost:8000/api/v1/pull-requests/import?project_id=1&pr_number=123" \
  -H "Authorization: Bearer your-token"

# 手动触发扫描
curl -X POST "http://localhost:8000/api/v1/pull-requests/1/scan" \
  -H "Authorization: Bearer your-token"
```

### 3. 查看 Webhook 日志

```bash
curl "http://localhost:8000/api/v1/webhooks/logs/1" \
  -H "Authorization: Bearer your-token"
```

---

## 📊 数据库查询示例

```sql
-- 查看所有 webhook 配置
SELECT * FROM webhook_configs;

-- 查看 webhook 日志
SELECT id, event_type, event_action, processed, created_at 
FROM webhook_logs 
ORDER BY created_at DESC 
LIMIT 10;

-- 查看 PR 列表
SELECT pr_number, title, status, author, changed_files_count, additions, deletions
FROM pull_requests
WHERE project_id = 1
ORDER BY created_at DESC;

-- 查看 PR 的审计任务
SELECT t.id, t.name, t.status, t.total_issues, t.created_at
FROM audit_tasks t
JOIN pull_requests pr ON t.pull_request_id = pr.id
WHERE pr.id = 1;

-- 查看 PR 相关的问题（只显示变更行的问题）
SELECT i.id, i.title, i.severity, i.file_path, i.line_start
FROM audit_issues i
JOIN audit_tasks t ON i.task_id = t.id
WHERE t.pull_request_id = 1 AND i.is_in_diff = true;
```

---

## 🔒 安全建议

1. **签名验证**: 已实现 GitHub/GitLab webhook 签名验证，防止伪造请求
2. **Secret 管理**: Webhook secret token 使用加密存储
3. **IP 白名单**: 可配置 IP 白名单限制请求来源
4. **速率限制**: 建议添加 Nginx 速率限制（同一 PR 5分钟内只处理一次）
5. **HTTPS**: 生产环境务必使用 HTTPS
6. **Token 权限**: GitHub token 只需 `repo:status` 和 `public_repo` 权限

---

## 🐛 故障排查

### Webhook 未触发

1. 检查 webhook 配置是否正确
2. 查看 GitHub/GitLab 的 webhook 发送历史
3. 检查服务器防火墙和端口
4. 查看 `webhook_logs` 表是否有记录

### 签名验证失败

1. 确认 secret token 一致
2. 检查请求头 `X-Hub-Signature-256` (GitHub) 或 `X-Gitlab-Token` (GitLab)
3. 查看后端日志

### PR 扫描失败

1. 检查 Celery worker 是否运行
2. 查看 `audit_tasks.error_message`
3. 检查项目的 GitHub/GitLab token 权限
4. 查看 Celery 日志: `docker compose logs celery-worker`

---

## 📚 相关文档

- [GitHub Webhooks 文档](https://docs.github.com/en/webhooks)
- [GitLab Webhooks 文档](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html)
- [Celery 文档](https://docs.celeryproject.org/)

---

## ✅ 总结

**后端已完成：**
- ✅ 数据库模型和迁移
- ✅ Webhook 接收和验证
- ✅ PR 信息获取和解析
- ✅ 自动扫描任务
- ✅ 自动评论反馈
- ✅ API 端点

**待完成（前端）：**
- ⏳ Webhook 配置界面
- ⏳ PR 列表页面
- ⏳ PR 详情页面

**使用方式：**
- 方式1: 配置 Webhook，完全自动化
- 方式2: 手动导入 PR 并触发扫描（API 已就绪）

核心功能已经完整实现，可以通过 API 直接使用。前端界面可以根据需要逐步完善。

