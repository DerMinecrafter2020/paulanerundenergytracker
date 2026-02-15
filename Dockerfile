# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Runtime stage
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install only runtime deps for API
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy API server and built frontend
COPY server.js ./server.js
COPY dist ./dist

# Serve frontend via API server (static)
EXPOSE 3001
CMD ["node", "server.js"]
