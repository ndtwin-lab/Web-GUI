FROM node:18-alpine AS builder

ARG NDT_API_BASE_URL
ARG VITE_NODE_POSITIONS_API_URL

# Map NDT_API_BASE_URL to VITE_NDT_API_BASE_URL for Vite client-side access
ENV VITE_NDT_API_BASE_URL=$NDT_API_BASE_URL
ENV VITE_NODE_POSITIONS_API_URL=$VITE_NODE_POSITIONS_API_URL

WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:18-alpine AS production
RUN npm install -g serve
WORKDIR /app

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]