FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node dist ./dist
COPY --chown=node:node server ./server
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/mis-alas.sqlite
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/index.mjs"]
