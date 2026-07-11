# Use a secure Node.js base image
FROM node:24-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy dependency definition files, tsconfig, and schema
COPY package*.json tsconfig.json schema.sql ./

# Install dependencies
RUN npm ci

# Copy source code files
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# Copy sanctions assets to compiled dist folder
COPY src/domain/services/sanctions_list.json ./dist/domain/services/sanctions_list.json

# Prune devDependencies for security and smaller footprint
RUN npm prune --production

# Expose API port
EXPOSE 3000

# Configure production defaults
ENV PORT=3000
ENV NODE_ENV=production

# Start application
CMD ["node", "--experimental-sqlite", "dist/infrastructure/web/server.js"]
