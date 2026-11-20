# Image API của Zahu!Messenger (amd64 + arm64). Build từ thư mục gốc repo:
#   docker build -f services/api/Dockerfile .
FROM node:24-slim
WORKDIR /app
# Chỉ cài phụ thuộc production của API (+ gói contracts dùng chung trong workspace).
COPY package.json package-lock.json ./
COPY packages/contracts packages/contracts
COPY services/api/package.json services/api/package.json
COPY apps/windows/package.json apps/windows/package.json
RUN npm ci -w services/api --omit=dev --no-audit --no-fund && npm cache clean --force
COPY services/api/src services/api/src
WORKDIR /app/services/api
ENV NODE_ENV=production YC_API_HOST=0.0.0.0 YC_API_PORT=8080
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "src/server.ts"]
