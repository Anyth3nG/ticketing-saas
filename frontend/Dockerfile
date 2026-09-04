# ---- build ----------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# npm ci installs exactly the lockfile, so a build is reproducible and cannot
# silently pick up a newer transitive dependency between deploys.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_ variables are baked in HERE, at build time -- not at container start.
# A missing build arg produces an empty string with no error, so the deploy
# workflow asserts this is non-empty before the build runs.
#
# There is deliberately no VITE_API_URL: the app is served same-origin behind
# the shared proxy and calls /api directly. See src/api/config.js.
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

RUN npm run build

# ---- serve ----------------------------------------------------------------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
