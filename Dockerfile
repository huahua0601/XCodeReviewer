# 多阶段构建 - 构建阶段
FROM node:18-alpine AS builder

# 设置工作目录
WORKDIR /app

# 禁用代理并安装 pnpm
ENV HTTP_PROXY=""
ENV HTTPS_PROXY=""
ENV http_proxy=""
ENV https_proxy=""
ENV NO_PROXY="*"
ENV no_proxy="*"

RUN npm config set registry https://registry.npmjs.org/ && \
    npm config delete proxy 2>/dev/null || true && \
    npm config delete https-proxy 2>/dev/null || true && \
    npm config delete http-proxy 2>/dev/null || true && \
    npm install -g pnpm

# 声明构建参数 - 这些参数可以在 docker build 时传入
# API 配置
ARG VITE_API_BASE_URL

# GitHub/GitLab 集成
ARG VITE_GITHUB_TOKEN

# 应用配置（本地数据库模式已移除）
ARG VITE_APP_ID
ARG VITE_MAX_ANALYZE_FILES
ARG VITE_LLM_CONCURRENCY
ARG VITE_LLM_GAP_MS
ARG VITE_OUTPUT_LANGUAGE

# 注意: LLM 相关配置已移除，现在由后端统一管理
# 不再需要前端配置 API Keys (VITE_*_API_KEY)

# 将构建参数转换为环境变量（Vite 构建时会读取这些环境变量）
# API 配置
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# GitHub/GitLab 集成
ENV VITE_GITHUB_TOKEN=$VITE_GITHUB_TOKEN

# 应用配置（本地数据库模式已移除）
ENV VITE_APP_ID=$VITE_APP_ID
ENV VITE_MAX_ANALYZE_FILES=$VITE_MAX_ANALYZE_FILES
ENV VITE_LLM_CONCURRENCY=$VITE_LLM_CONCURRENCY
ENV VITE_LLM_GAP_MS=$VITE_LLM_GAP_MS
ENV VITE_OUTPUT_LANGUAGE=$VITE_OUTPUT_LANGUAGE

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --no-frozen-lockfile

# 复制项目文件（不包括 .env，因为我们使用构建参数）
COPY . .

# 构建应用（环境变量会在构建时被 Vite 读取并硬编码到代码中）
RUN pnpm build

# 生产阶段 - 使用 nginx 提供静态文件服务
FROM nginx:alpine

# 复制自定义 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 从构建阶段复制构建产物
COPY --from=builder /app/dist /usr/share/nginx/html

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
