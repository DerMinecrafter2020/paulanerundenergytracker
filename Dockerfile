# Build Stage
FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Runtime Stage
FROM node:20-alpine

WORKDIR /app

# Installiere nur Production Dependencies
COPY package*.json ./
RUN npm ci --only=production

# Kopiere gebuildetes Frontend von Build Stage
COPY --from=build /app/dist ./dist

# Kopiere Server
COPY server.js .
COPY .env.local .

EXPOSE 3001

ENV NODE_ENV=production

CMD ["node", "server.js"]
