#!/bin/sh
git pull &&
    npx drizzle-kit migrate &&
    docker compose up --build
