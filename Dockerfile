# Build Stage
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime Stage
FROM node:20-alpine

WORKDIR /app

# Kopiere package.json + aktualisierte lock-Datei aus Build Stage
COPY package.json ./
COPY --from=build /app/package-lock.json ./
RUN npm ci --omit=dev

# Kopiere gebuildetes Frontend von Build Stage
COPY --from=build /app/dist ./dist

# Kopiere Server
COPY server.js .

EXPOSE 3001

ENV NODE_ENV=production
ENV DB_TYPE=local

CMD ["node", "server.js"]
