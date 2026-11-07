FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=node:node server.cjs manage.cjs database.cjs rta-core.js ./
COPY --chown=node:node index.html styles.css app.js rta-portal.js rta-pdf.js portal-api.js account-ui.js login.js setup.html setup.js employee-login.html distributor-login.html ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.cjs"]
