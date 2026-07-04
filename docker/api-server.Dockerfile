# Builds and runs the Zaboni/Marsool API server (Express 5 + Socket.IO) as a
# self-contained image.
#
# The esbuild bundle produced by `pnpm --filter @workspace/api-server run build`
# externalizes some native/optional packages (firebase-admin, googleapis,
# @google-cloud/*, sharp, bcrypt, etc. — see artifacts/api-server/build.mjs).
# That means the runtime image still needs the workspace's installed
# node_modules, not just the bundled dist/index.mjs file. We keep the full
# built workspace around in the final image rather than hand-pruning it.
#
# IMPORTANT: build this from the REPO ROOT, not from inside docker/, so the
# whole pnpm workspace is in the build context:
#
#   docker build -f docker/api-server.Dockerfile -t zaboni-api-server .
#
# docker-compose.yml already does this for you.

FROM node:24-slim AS build
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run typecheck:libs
RUN pnpm --filter @workspace/api-server run build

FROM node:24-slim AS runtime
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
WORKDIR /repo

COPY --from=build /repo /repo

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
