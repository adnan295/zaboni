# Builds the three static web artifacts (admin panel, zaboni-web legal pages,
# restaurant-portal) and serves all three from one nginx image, path-routed
# the same way the Replit deployment does it (/admin/, /zaboni-web/,
# /restaurant-portal/), plus a reverse proxy to the api-server container for
# /api, /support, /privacy, /delete-my-account.
#
# IMPORTANT: build this from the REPO ROOT so the whole pnpm workspace is in
# the build context:
#
#   docker build -f docker/web.Dockerfile -t zaboni-web .
#
# docker-compose.yml already does this for you.

FROM node:24-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build-admin
ENV NODE_ENV=production
ENV BASE_PATH=/admin/
RUN pnpm --filter @workspace/admin run build

FROM deps AS build-zaboni-web
ENV NODE_ENV=production
ENV BASE_PATH=/zaboni-web/
RUN pnpm --filter @workspace/zaboni-web run build

FROM deps AS build-restaurant-portal
ENV NODE_ENV=production
ENV BASE_PATH=/restaurant-portal/
RUN pnpm --filter @workspace/restaurant-portal run build

FROM nginx:1.27-alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build-admin /repo/artifacts/admin/dist/public /usr/share/nginx/html/admin
COPY --from=build-zaboni-web /repo/artifacts/zaboni-web/dist/public /usr/share/nginx/html/zaboni-web
COPY --from=build-restaurant-portal /repo/artifacts/restaurant-portal/dist/public /usr/share/nginx/html/restaurant-portal

EXPOSE 80
