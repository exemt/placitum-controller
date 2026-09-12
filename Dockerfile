# Сборка из каталога controller/. UX -- статика в том же процессе, что API.
#
#     docker build -t placitum/controller .
#     docker buildx build -t placitum/controller \
#         "https://github.com/exemt/placitum-controller.git#develop"
#
# Тесты в сборке не гоняются намеренно: часть набора (src/*-http.test.ts,
# канон профилей) требует базы и фикстур платформы, то есть контура, а не
# контекста сборки. Их место -- CI с поднятой базой и e2e стенда.

FROM node:22-alpine AS ux
WORKDIR /ux
COPY ux/package.json ux/package-lock.json ./
RUN npm ci
COPY ux/ ./
# Пин fingerprint ключа контура (src/crypto/seal.ts) -- не задан по умолчанию,
# см. deploy/README.md за тем, как получить значение из deploy/secrets/contour.pub.
ARG VITE_CONTOUR_FINGERPRINT=""
ENV VITE_CONTOUR_FINGERPRINT=$VITE_CONTOUR_FINGERPRINT
RUN npm run build

FROM node:22-alpine

# Версия и ревизия приходят снаружи: .git в контекст сборки не попадает.
ARG VERSION=dev
ARG REVISION=unknown

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

# Схема базы едет в образе: её накатывает владелец данных, то есть этот же
# процесс (core/migrate/README.md). Выгрузка гео и стендовое дерево в образ не
# едут -- см. .dockerignore.
COPY schema ./schema

RUN mkdir -p /app/data/compile && chown -R node:node /app
ENV CONTROLLER_PORT=8080
ENV CONTROLLER_UX_DIR=/app/ux/dist
ENV CONTROLLER_SCHEMA_DIR=/app/schema
EXPOSE 8080
USER node
CMD ["node", "src/main.ts"]
