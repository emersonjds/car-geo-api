# Developer portal image (Vite + React). Build context is the monorepo root.
FROM node:22-alpine

WORKDIR /app

COPY package.json yarn.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN yarn install --frozen-lockfile

COPY apps/web apps/web

# Vite inlines the API URL into the bundle at build time, so it must be the
# address the BROWSER sees (localhost:3000), not the compose service name --
# the fetch happens in the user's tab, not inside the container.
ARG VITE_API_BASE_URL=http://localhost:3000
RUN yarn workspace @car-geo/web build

EXPOSE 5173
# `vite preview` serves the static build, which is enough to run locally.
# Swap it for nginx only if this ever becomes a real deployment.
CMD ["yarn", "workspace", "@car-geo/web", "preview", "--host", "0.0.0.0"]
