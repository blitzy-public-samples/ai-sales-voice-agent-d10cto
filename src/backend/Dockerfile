# ===== Build Stage =====
FROM node:18-slim AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies for build
RUN npm ci

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript code
RUN npm run build

# Prune dev dependencies for production
RUN npm prune --production

# ===== Production Stage =====
FROM node:18-slim AS production

# Set working directory
WORKDIR /app

# Create non-root user/group
RUN groupadd -r docshield -g 1001 && \
    useradd -r -g docshield -u 1001 docshield && \
    mkdir -p /app/dist /app/node_modules && \
    chown -R docshield:docshield /app

# Set production environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=512" \
    PORT=8080 \
    TZ=UTC \
    MALLOC_ARENA_MAX=2

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy compiled JavaScript from builder
COPY --from=builder --chown=docshield:docshield /app/dist ./dist

# Set up tmpfs for runtime temporary files
VOLUME ["/tmp"]

# Configure security restrictions
RUN chmod -R 550 /app && \
    chmod -R 550 /app/dist && \
    chmod -R 550 /app/node_modules

# Switch to non-root user
USER docshield

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Set metadata labels
LABEL maintainer="DocShield Engineering" \
    com.docshield.component="voice-agent-worker" \
    com.docshield.version="${VERSION}" \
    com.docshield.build-date="${BUILD_DATE}"

# Configure security options
SECURITY_OPTS --security-opt=no-new-privileges:true \
    --security-opt=seccomp=unconfined \
    --cap-drop=ALL

# Set entry point
ENTRYPOINT ["node", "dist/worker/index.js"]