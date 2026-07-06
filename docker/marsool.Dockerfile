# Builds the @workspace/marsool landing page + Expo static bundle host and
# serves it with the zero-dependency server in artifacts/marsool/server.
#
# What this serves at the site root (/):
#   - GET /            → Arabic marketing landing page (no expo-platform header)
#   - GET / | /manifest with `expo-platform: ios|android` → Expo update manifest
#   - /<timestamp>/_expo/static/js/...                    → JS bundles + assets
#
# scripts/build.js boots Metro, snapshots minified iOS/Android bundles,
# manifests and assets into static-build/, and rewrites asset URLs to
# absolute https://$PUBLIC_DOMAIN/... URLs — so the domain is baked in at
# image build time.
#
# IMPORTANT: build from the REPO ROOT so the whole pnpm workspace is in the
# build context (docker-compose.yml already does this).

FROM node:24-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG PUBLIC_DOMAIN=zaboni.app
ENV EXPO_PUBLIC_DOMAIN=$PUBLIC_DOMAIN
ENV CI=1
# Keep Metro/expo-cli from calling out to Expo's servers during the build.
ENV EXPO_OFFLINE=1
RUN pnpm --filter @workspace/marsool run build

FROM node:24-slim AS runtime
WORKDIR /app
# serve.js resolves ../static-build, ./templates and ../app.json relative to
# itself and uses only Node built-ins — no node_modules needed here.
COPY --from=build /repo/artifacts/marsool/static-build ./static-build
COPY --from=build /repo/artifacts/marsool/server ./server
COPY --from=build /repo/artifacts/marsool/app.json ./app.json

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server/serve.js"]
