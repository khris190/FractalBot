# syntax=docker/dockerfile:1
# TODO: setdown on a ltsversion of node maybe 24 soon?
FROM node:22-alpine as node
WORKDIR /usr/src/app
RUN --mount=type=bind,source=package.json,target=package.json \
    --mount=type=bind,source=package-lock.json,target=package-lock.json \
    npm ci --omit=dev

COPY --chown=node:node . .

CMD [ "npm", "run", "start"]

FROM python:3.12 as python

WORKDIR /app
COPY ./python .
# Add other build dependencies here as needed
# e.g., postgresql-dev, mysql-dev, etc.
RUN python3 -m venv .venv && \
    . .venv/bin/activate && \
    pip install --no-cache-dir --upgrade pip &&\
    pip install --no-cache-dir -U transformers huggingface_hub

CMD [  ".venv/bin/python", "server.py" ]
