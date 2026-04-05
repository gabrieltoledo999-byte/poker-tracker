FROM node:20-alpine

# Install pnpm globally
RUN npm install -g pnpm

WORKDIR /app

# Copy all files
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the project
RUN pnpm build

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js"]
