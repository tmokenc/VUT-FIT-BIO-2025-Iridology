# ---------------------------
# 1. Build Stage
# ---------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Build Vite app
COPY . .
RUN npm run build

# ---------------------------
# 2. Run Stage
# ---------------------------
FROM node:20-alpine
WORKDIR /app

# Install http-server globally
RUN npm install -g http-server

# Copy built files
COPY --from=build /app .

# Expose port
EXPOSE 8000

# Start http-server
CMD ["http-server", ".", "-p", "8000", "-a", "0.0.0.0"]
