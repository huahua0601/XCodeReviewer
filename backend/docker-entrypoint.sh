#!/bin/bash
# Docker entrypoint script for XCodeReviewer Backend
# This script runs database migrations before starting the FastAPI server

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║   🚀 XCodeReviewer Backend 启动中...                          ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# 等待数据库连接
echo "🔄 等待数据库连接..."
echo "   DATABASE_URL: ${DATABASE_URL:-未设置}"
sleep 5

# 运行数据库迁移
echo ""
echo "📦 运行数据库迁移..."
echo "   执行: alembic upgrade head"
echo ""

alembic upgrade head

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 数据库迁移完成"
    echo ""
else
    echo ""
    echo "❌ 数据库迁移失败"
    echo ""
    exit 1
fi

# 启动 FastAPI 服务
echo "🚀 启动 FastAPI 服务..."
echo "   监听地址: 0.0.0.0:8000"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║   ✅ Backend 服务已就绪                                       ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

exec uvicorn app.main:app --host 0.0.0.0 --port 8000

