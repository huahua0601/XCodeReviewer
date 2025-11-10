#!/bin/bash

# 强制完全重建 - 清除所有缓存

set -e

cd /home/ec2-user/XCodeReviewer

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# 检测 Docker Compose 命令
DOCKER_COMPOSE=""
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo -e "${RED}错误: Docker Compose 未安装${NC}"
    exit 1
fi

echo "=========================================="
echo "  强制完全重建（清除所有缓存）"
echo "=========================================="
echo ""
echo -e "${BLUE}检测到的 Docker Compose 命令: $DOCKER_COMPOSE${NC}"
echo ""

echo -e "${RED}⚠️  这将完全清除并重建，可能需要 15-20 分钟${NC}"
echo ""
read -p "确定继续? (y/n): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "取消操作"
    exit 0
fi

echo ""
echo -e "${BLUE}[1/6]${NC} 停止所有服务..."
$DOCKER_COMPOSE -f docker-compose.prod.yml down 2>&1 || true

echo ""
echo -e "${BLUE}[2/6]${NC} 删除相关 Docker 镜像..."
# 查找并删除 xcodereviewer 相关镜像
IMAGES=$(docker images | grep -E 'xcodereviewer|docker-compose' | awk '{print $3}' | sort -u)
if [ ! -z "$IMAGES" ]; then
    echo "      找到 $(echo "$IMAGES" | wc -l) 个镜像，正在删除..."
    echo "$IMAGES" | xargs -r docker rmi -f 2>/dev/null || true
    echo -e "${GREEN}      ✓ 镜像已删除${NC}"
else
    echo "      没有找到相关镜像"
fi

echo ""
echo -e "${BLUE}[3/6]${NC} 清理 Docker 构建缓存..."
docker builder prune -af

echo ""
echo -e "${BLUE}[4/6]${NC} 重新构建镜像（完全不使用缓存）..."
echo "      这可能需要 10-15 分钟..."
$DOCKER_COMPOSE -f docker-compose.prod.yml build --no-cache --pull

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ 构建失败${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}[5/6]${NC} 启动所有服务..."
$DOCKER_COMPOSE -f docker-compose.prod.yml up -d

echo ""
echo -e "${BLUE}[6/6]${NC} 等待服务就绪 (50秒)..."
for i in {50..1}; do
  echo -ne "\r      等待 $i 秒...   "
  sleep 1
done
echo ""

echo ""
echo "=========================================="
echo "  服务状态"
echo "=========================================="
$DOCKER_COMPOSE -f docker-compose.prod.yml ps

echo ""
echo "=========================================="
echo "  后端日志（检查迁移是否成功）"
echo "=========================================="
docker logs xcodereviewer-backend 2>&1 | grep -A 10 "alembic\|Default admin\|Started server"

echo ""
echo -e "${GREEN}=========================================="
echo "  完成!"
echo "==========================================${NC}"
echo ""
echo "如果看到 '✅ Default admin user created successfully!'，说明迁移成功！"
echo ""
echo "访问地址:"
echo "  前端: http://$(hostname -I | awk '{print $1}')"
echo "  API:  http://$(hostname -I | awk '{print $1}'):8000/docs"
echo ""

