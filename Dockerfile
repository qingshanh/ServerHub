# 基于极轻量 Alpine Node.js 镜像 (体积约 50MB)
FROM node:22-alpine

WORKDIR /app

# 拷贝项目文件 (零外部构建步骤，零臃肿依赖)
COPY package.json ./
COPY src ./src
COPY public ./public
COPY server.js ./

# 暴露数据持久化卷
VOLUME ["/app/data"]

# 默认运行端口
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000

# 启动服务
CMD ["node", "server.js"]
