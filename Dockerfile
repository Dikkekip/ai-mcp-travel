# Build stage
FROM node:22-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:22-slim AS production
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/build ./build
# Remove dev dependencies and cache
RUN npm ci --omit=dev && npm cache clean --force

# Install Python runtime for travel assistant servers
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Create a virtual environment for Python packages
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

COPY travel-servers ./travel-servers
RUN python3 -m pip install --no-cache-dir -r travel-servers/requirements.txt

# Use a non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
RUN chown -R appuser:appgroup /app
USER appuser
ENV DEBUG="*"
CMD ["node", "./build/index.js"]
