# syntax=docker/dockerfile:1
# TODO: setdown on a ltsversion of node maybe 24 soon?
FROM node:22-alpine
WORKDIR /usr/src/app
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci --omit=dev
COPY --chown=node:node . .
CMD [ "npm", "run", "start"]
