# The web image: nginx serving the built bundle and proxying /api to the API.
#
# Two stages, so Node and node_modules stay in the builder and the shipped
# image is just static files plus nginx -- tens of megabytes rather than
# hundreds, with no JavaScript runtime present to be attacked.

FROM node:22-alpine AS build

WORKDIR /app

# package-lock.json is copied too: `npm ci` installs exactly what it pins,
# which `npm install` does not guarantee. Both come before the source so the
# dependency layer survives a source-only edit.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Empty by default, which makes the app request relative paths that nginx
# proxies. Pass a value only when deploying the frontend somewhere that is not
# fronting the API for it. Vite inlines this at build time, so it is an ARG,
# not a runtime setting.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build


FROM nginx:1.29-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=60s --timeout=3s --start-period=5s --retries=5 \
    CMD wget --quiet --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
