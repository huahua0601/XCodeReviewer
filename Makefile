.PHONY: help build up down restart logs ps clean health migrate init-admin backup

# 检测 Docker Compose 命令
DOCKER_COMPOSE := $(shell docker compose version > /dev/null 2>&1 && echo "docker compose" || echo "docker-compose")

# 默认目标
help:
	@echo "XCodeReviewer Docker Compose 管理命令"
	@echo ""
	@echo "使用方法: make [目标]"
	@echo ""
	@echo "可用目标:"
	@echo "  help          - 显示此帮助信息"
	@echo "  build         - 构建所有 Docker 镜像"
	@echo "  up            - 启动所有服务"
	@echo "  down          - 停止所有服务"
	@echo "  restart       - 重启所有服务"
	@echo "  logs          - 查看所有服务日志"
	@echo "  ps            - 查看服务状态"
	@echo "  clean         - 停止服务并清理容器"
	@echo "  clean-all     - 停止服务并清理所有数据 (危险操作)"
	@echo "  health        - 检查服务健康状态"
	@echo "  migrate       - 运行数据库迁移"
	@echo "  init-admin    - 创建管理员账号"
	@echo "  init-minio    - 初始化 MinIO 存储"
	@echo "  backup        - 备份数据"
	@echo ""
	@echo "服务管理:"
	@echo "  restart-frontend   - 重启前端服务"
	@echo "  restart-backend    - 重启后端服务"
	@echo "  restart-worker     - 重启 Celery Worker"
	@echo ""
	@echo "日志查看:"
	@echo "  logs-frontend - 查看前端日志"
	@echo "  logs-backend  - 查看后端日志"
	@echo "  logs-worker   - 查看 Worker 日志"
	@echo "  logs-flower   - 查看 Flower 日志"
	@echo ""

# 构建镜像
build:
	@echo "构建 Docker 镜像..."
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml build

# 构建并启动服务
up:
	@echo "启动所有服务..."
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml up -d
	@echo ""
	@echo "✅ 服务已启动!"
	@echo "前端: http://localhost"
	@echo "API:  http://localhost:8000/docs"

# 启动服务并查看日志
up-logs:
	@echo "启动服务并查看日志..."
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml up

# 停止服务
down:
	@echo "停止所有服务..."
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml down

# 重启服务
restart:
	@echo "重启所有服务..."
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml restart

# 查看日志
logs:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f

# 查看服务状态
ps:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml ps

# 清理容器
clean:
	@echo "停止并清理容器..."
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml down
	@echo "✅ 清理完成"

# 清理所有数据
clean-all:
	@echo "⚠️  警告: 这将删除所有数据!"
	@read -p "确定要继续吗? (yes/no): " confirm; \
	if [ "$$confirm" = "yes" ]; then \
		$(DOCKER_COMPOSE) -f docker-compose.prod.yml down -v; \
		echo "✅ 所有数据已清理"; \
	else \
		echo "❌ 操作已取消"; \
	fi

# 检查服务健康状态
health:
	@echo "检查服务健康状态..."
	@docker ps --filter "name=xcodereviewer" --format "table {{.Names}}\t{{.Status}}"

# 运行数据库迁移
migrate:
	@echo "运行数据库迁移..."
	docker exec xcodereviewer-backend alembic upgrade head
	@echo "✅ 数据库迁移完成"

# 查看迁移状态
migrate-status:
	@echo "数据库迁移状态:"
	docker exec xcodereviewer-backend alembic current

# 创建管理员账号
init-admin:
	@echo "创建管理员账号..."
	docker exec -it xcodereviewer-backend python scripts/init_admin.py

# 初始化 MinIO 存储
init-minio:
	@echo "初始化 MinIO 存储..."
	docker exec xcodereviewer-backend python -c "from services.storage.minio_storage import MinIOStorage; storage = MinIOStorage(); print('MinIO 初始化成功')"

# 备份数据
backup:
	@echo "备份数据..."
	mkdir -p ./backups
	docker run --rm \
		-v xcodereviewer_minio_data:/data \
		-v $$(pwd)/backups:/backup \
		alpine tar czf /backup/minio-$$(date +%Y%m%d-%H%M%S).tar.gz /data
	@echo "✅ 备份完成,文件保存在 ./backups/"

# 重启特定服务
restart-frontend:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml restart frontend

restart-backend:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml restart backend

restart-worker:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml restart celery-worker

restart-beat:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml restart celery-beat

restart-flower:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml restart flower

# 查看特定服务日志
logs-frontend:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f frontend

logs-backend:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f backend

logs-worker:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f celery-worker

logs-beat:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f celery-beat

logs-flower:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f flower

logs-minio:
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml logs -f minio

# 进入容器
shell-backend:
	docker exec -it xcodereviewer-backend bash

shell-frontend:
	docker exec -it xcodereviewer-frontend sh

# 测试外部服务连接
test-db:
	@echo "测试数据库连接..."
	docker exec xcodereviewer-backend python -c "from sqlalchemy import create_engine; from app.config import settings; engine = create_engine(settings.DATABASE_URL.replace('asyncpg', 'psycopg2')); conn = engine.connect(); print('✅ 数据库连接成功'); conn.close()"

test-redis:
	@echo "测试 Redis 连接..."
	docker exec xcodereviewer-backend python -c "import redis; from app.config import settings; r = redis.from_url(settings.REDIS_URL); print('✅ Redis 连接成功:', r.ping())"

# 查看资源使用情况
stats:
	docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# 更新并重启
update:
	@echo "更新应用..."
	git pull
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml build --no-cache
	$(DOCKER_COMPOSE) -f docker-compose.prod.yml up -d
	@echo "✅ 更新完成"

# 快速启动 (使用脚本)
quick-start:
	./scripts/docker-start.sh

# 快速停止 (使用脚本)
quick-stop:
	./scripts/docker-stop.sh

