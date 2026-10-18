# Node 24 is required for the built-in node:sqlite module.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# Public URL of the deployment, e.g. https://proofflow.example.com (used for the CSRF origin check).
ARG ORIGIN
ENV ORIGIN=$ORIGIN
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/proofflow.db
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "build/index.js"]
