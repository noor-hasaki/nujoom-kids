FROM node:18-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY app/backend-node/package*.json ./
RUN npm install --omit=dev --prefer-offline || npm install --omit=dev

COPY app/backend-node/ ./
COPY app/frontend/ /app/frontend/

RUN mkdir -p /data && chown appuser:appgroup /data /app

VOLUME /data

USER appuser

EXPOSE 3000

CMD ["node", "server.js"]
