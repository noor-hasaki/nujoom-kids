FROM node:18-alpine

WORKDIR /app

COPY app/backend-node/package*.json ./
RUN npm install --omit=dev --prefer-offline || npm install --omit=dev

COPY app/backend-node/ ./
COPY app/frontend/ /app/frontend/

VOLUME /data

EXPOSE 3000

CMD ["node", "server.js"]
