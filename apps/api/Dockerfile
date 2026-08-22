# API image (Fastify + PostGIS). The build context is the monorepo root because
# yarn workspaces resolves dependencies from the root package.json/yarn.lock.
FROM node:22-alpine

WORKDIR /app

# Manifests first: the dependency layer is only rebuilt when they change.
COPY package.json yarn.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN yarn install --frozen-lockfile

COPY apps/api apps/api
RUN yarn workspace @car-geo/api build

# NODE_ENV comes after the build: in production Fastify swaps pino-pretty for
# the JSON logger, and yarn would skip the devDependencies that tsc needs.
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
