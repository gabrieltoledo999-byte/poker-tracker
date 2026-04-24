FROM node:20-alpine

# Install pnpm globally
RUN npm install -g pnpm

WORKDIR /app

# Copy only lockfile + manifests first — this layer is cached unless deps change
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install dependencies (cached layer reused on code-only changes)
RUN pnpm install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Force cache bust on each deploy
ARG CACHEBUST=20260421p

# Build the project
RUN pnpm build

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js"]
