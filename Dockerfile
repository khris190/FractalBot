# syntax=docker/dockerfile:1
FROM node:current-alpine

WORKDIR /usr/src/app
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci
COPY --chown=node:node . .
CMD npm run start
