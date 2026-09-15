# Controller image: API and panel in one process.
#
#     docker build -t placitum/controller .

FROM node:22-alpine AS ux
WORKDIR /ux
COPY ux/package.json ux/package-lock.json ./
RUN npm ci
COPY ux/ ./
# Contour key fingerprint for the panel: `sh bootstrap/secrets.sh --fingerprint` in placitum-core.
ARG VITE_CONTOUR_FINGERPRINT=""
ENV VITE_CONTOUR_FINGERPRINT=$VITE_CONTOUR_FINGERPRINT
RUN npm run build

FROM node:22-alpine

ARG VERSION=dev
ARG REVISION=unknown
ENV CONTROLLER_VERSION=${VERSION} \
    CONTROLLER_REVISION=${REVISION}

LABEL org.opencontainers.image.title="placitum/controller" \
      org.opencontainers.image.description="Placitum controller: panel, API, configuration delivery" \
      org.opencontainers.image.source="https://github.com/exemt/placitum-controller" \
      org.opencontainers.image.licenses="LicenseRef-Placitum" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY --from=ux /ux/dist ./ux/dist
COPY schema ./schema

RUN mkdir -p /app/data/compile && chown -R node:node /app
ENV CONTROLLER_PORT=8080
ENV CONTROLLER_UX_DIR=/app/ux/dist
ENV CONTROLLER_SCHEMA_DIR=/app/schema
EXPOSE 8080
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.CONTROLLER_PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "src/main.ts"]
