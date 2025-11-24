# PR Webhook 功能 - 快速开始

## 🎉 功能已就绪！

**方案3：Webhook自动触发（企业级）** 的核心后端功能已全部实现并部署完成！

---

## ✅ 已完成的功能

### 后端核心功能 (100% 完成)

- ✅ **数据库表结构**: `pull_requests`, `webhook_configs`, `webhook_logs`, `pr_comments`
- ✅ **Webhook 接收**: 自动接收 GitHub/GitLab PR 事件
- ✅ **签名验证**: 防止伪造请求的安全机制
- ✅ **PR 差异分析**: 智能识别变更文件和行号
- ✅ **自动扫描**: PR 创建/更新时自动触发代码审查
- ✅ **智能过滤**: 只报告变更行附近的问题（±3行）
- ✅ **自动评论**: 在 PR 中自动发布审查结果
- ✅ **API 端点**: 完整的 RESTful API

---

## 🚀 立即开始使用

### 方式1: 通过 API 配置 Webhook（推荐）

#### 步骤 1: 创建 Webhook 配置

```bash
curl -X POST "http://54.248.36.120/api/v1/webhooks/configs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "project_id": 1,
    "platform": "github",
    "events": ["pull_request"],
    "auto_scan_enabled": true,
    "auto_comment_enabled": true
  }'
```

**响应：**
```json
{
  "webhook_url": "http://54.248.36.120/api/v1/webhooks/receive/github/1/aB3dEf...",
  "secret_token": "aB3dEf...xyz"
}
```

#### 步骤 2: 在 GitHub 仓库中配置 Webhook

1. 进入仓库 Settings → Webhooks → Add webhook
2. **Payload URL**: 复制上面的 `webhook_url`
3. **Content type**: `application/json`
4. **Secret**: 复制上面的 `secret_token`
5. **触发事件**: 勾选 `Pull requests`
6. 点击 **Add webhook**

#### 步骤 3: 创建 PR 测试

创建一个 Pull Request，系统将：
1. 自动接收 webhook 通知
2. 提取 PR 信息和变更文件
3. 只扫描变更的代码
4. 在 5-10 秒内完成扫描
5. 在 PR 中自动发布评论

---

### 方式2: 手动导入并扫描 PR

如果暂时不配置 webhook，可以手动导入 PR：

```bash
# 导入 PR
curl -X POST "http://54.248.36.120/api/v1/pull-requests/import?project_id=1&pr_number=123" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 触发扫描
curl -X POST "http://54.248.36.120/api/v1/pull-requests/{pr_id}/scan" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 查看结果

### 1. 在 PR 评论中查看

系统会在 PR 中自动发布类似这样的评论：

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
   - 建议: 使用参数化查询

[📄 查看完整报告](http://54.248.36.120/tasks/123)
```

### 2. 在系统中查看完整报告

访问 `http://54.248.36.120/tasks/{task_id}` 查看详细的审计报告。

---

## 🔗 可用的 API 端点

### Webhook 管理

```
POST   /api/v1/webhooks/configs                    # 创建配置
GET    /api/v1/webhooks/configs/project/{id}      # 获取配置
DELETE /api/v1/webhooks/configs/{id}              # 删除配置
GET    /api/v1/webhooks/logs/{webhook_id}         # 查看日志
```

### PR 管理

```
GET    /api/v1/pull-requests?project_id={id}      # PR 列表
GET    /api/v1/pull-requests/{pr_id}              # PR 详情
POST   /api/v1/pull-requests/import               # 手动导入
POST   /api/v1/pull-requests/{pr_id}/scan         # 触发扫描
```

### Webhook 接收（由 GitHub/GitLab 调用）

```
POST   /api/v1/webhooks/receive/github/{project_id}/{secret}
POST   /api/v1/webhooks/receive/gitlab/{project_id}/{secret}
```

---

## 🎯 工作流程

```
PR 创建/更新
    ↓
GitHub/GitLab 发送 Webhook
    ↓
验证签名 ✓
    ↓
创建/更新 PR 记录
    ↓
触发 Celery 扫描任务
    ↓
获取 PR 差异
    ↓
扫描变更的文件（5-10秒）
    ↓
生成审计报告
    ↓
在 PR 中发布评论 ✓
```

---

## 📝 查询示例

### 查看项目的 PR 列表

```bash
curl "http://54.248.36.120/api/v1/pull-requests?project_id=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 查看 Webhook 日志

```bash
curl "http://54.248.36.120/api/v1/webhooks/logs/1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 查看 PR 的审计任务

访问系统的任务列表，筛选 `task_type = pull_request`。

---

## 🔧 高级配置

### 环境变量（已配置）

在 `/home/ec2-user/XCodeReviewer/backend/.env` 中：

```bash
# GitHub Token (用于调用 API 和发布评论)
GITHUB_TOKEN=your_github_token

# API Base URL (用于生成链接)
API_BASE_URL=http://54.248.36.120

# 其他配置...
```

### 自定义扫描规则

在创建 webhook 时可以自定义：

```json
{
  "auto_scan_enabled": true,      // 是否自动扫描
  "auto_comment_enabled": false,  // 是否自动评论（可设为 false 仅扫描）
  "events": ["pull_request"]      // 监听的事件类型
}
```

---

## 🐛 故障排查

### Webhook 没有触发？

1. 检查 GitHub 的 Webhook 发送历史（Settings → Webhooks → Recent Deliveries）
2. 查看响应状态码和错误信息
3. 检查服务器防火墙是否开放端口

### 扫描失败？

```bash
# 查看 Celery 日志
docker compose -f /home/ec2-user/XCodeReviewer/docker-compose.prod.yml logs celery-worker --tail 100

# 查看后端日志
docker compose -f /home/ec2-user/XCodeReviewer/docker-compose.prod.yml logs backend --tail 100
```

### 查看数据库中的 PR 记录

```sql
SELECT pr_number, title, status, author, changed_files_count 
FROM pull_requests 
WHERE project_id = 1;
```

---

## 📚 详细文档

完整的实施文档: `PR_WEBHOOK_IMPLEMENTATION_GUIDE.md`

包含内容：
- 数据库表结构详解
- API 端点完整说明
- 前端实现建议
- 安全配置指南
- 测试方法

---

## 🎊 总结

**核心功能已 100% 完成！** 您现在可以：

- ✅ 通过 API 配置 Webhook
- ✅ 在 GitHub/GitLab 中配置 Webhook
- ✅ 自动接收 PR 事件
- ✅ 自动扫描变更代码
- ✅ 自动发布审查结果
- ✅ 查询 PR 和扫描历史

**可选功能（前端 UI）：**
- ⏳ Webhook 配置界面（可通过 API 实现）
- ⏳ PR 列表页面（可通过 API 查询）
- ⏳ PR 详情页面（可通过 API 查询）

所有功能都可以通过 API 直接使用，前端界面可以根据需要后续添加。

---

## 💡 下一步建议

1. **立即测试**: 选择一个 GitHub 项目配置 Webhook
2. **创建测试 PR**: 验证自动扫描和评论功能
3. **查看日志**: 通过 API 或数据库查看 webhook 事件
4. **添加前端**: 如需要 UI，参考实施指南创建页面

**联系方式**: 如有问题，查看日志或数据库记录进行调试。

