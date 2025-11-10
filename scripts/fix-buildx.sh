#!/bin/bash

# 修复 buildx 版本问题
# 下载并安装最新的 buildx

set -e

echo "=========================================="
echo "  修复 Docker Buildx 版本"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 检查当前版本
echo -e "${BLUE}当前 buildx 版本:${NC}"
docker buildx version || true
echo ""

# 设置最新版本
BUILDX_VERSION="v0.17.1"
echo -e "${YELLOW}将安装 buildx ${BUILDX_VERSION}${NC}"
echo ""

# 检测系统架构
ARCH=$(uname -m)
case $ARCH in
    x86_64)
        ARCH="amd64"
        ;;
    aarch64)
        ARCH="arm64"
        ;;
    *)
        echo -e "${RED}不支持的架构: $ARCH${NC}"
        exit 1
        ;;
esac

echo "系统架构: $ARCH"
echo ""

# 下载 buildx
echo -e "${BLUE}下载 buildx ${BUILDX_VERSION}...${NC}"
BUILDX_URL="https://github.com/docker/buildx/releases/download/${BUILDX_VERSION}/buildx-${BUILDX_VERSION}.linux-${ARCH}"

# 创建插件目录
mkdir -p ~/.docker/cli-plugins

# 下载
if curl -sSL "$BUILDX_URL" -o ~/.docker/cli-plugins/docker-buildx; then
    echo -e "${GREEN}✓ 下载成功${NC}"
else
    echo -e "${RED}✗ 下载失败${NC}"
    exit 1
fi

# 添加执行权限
chmod +x ~/.docker/cli-plugins/docker-buildx

# 验证安装
echo ""
echo -e "${BLUE}验证新版本:${NC}"
if docker buildx version; then
    echo ""
    echo -e "${GREEN}=========================================="
    echo -e "  ✓ Buildx 升级成功!"
    echo -e "==========================================${NC}"
    echo ""
    echo "现在可以运行: ./scripts/docker-start.sh"
else
    echo -e "${RED}安装验证失败${NC}"
    exit 1
fi

