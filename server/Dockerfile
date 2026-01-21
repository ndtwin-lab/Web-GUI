FROM node:18-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY server/package.json server/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy server code
COPY server/index.js ./index.js

EXPOSE 3001

CMD ["node", "index.js"]

