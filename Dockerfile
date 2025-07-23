FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install 2>&1

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build 2>&1

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start the gateway server
CMD ["node", "dist/gateway.js"] 