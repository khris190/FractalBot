#!/bin/sh
git pull &&
    npx drizzle-kit migrate
