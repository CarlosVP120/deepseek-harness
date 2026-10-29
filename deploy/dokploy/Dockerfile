# EQIDIS AI web for several people, built from this repository.
# Build context: the repository root (see docker-compose.yml).

FROM node:24-bookworm AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 ELECTRON_SKIP_BINARY_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# musl-tools builds the static Landlock launcher the Linux sandbox confines commands with.
RUN apt-get update && apt-get install -y --no-install-recommends musl-tools && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN cd native/system && pnpm build:native
# The image carries no .git; the browser build records this commit instead (0000000 when unset).
ARG EQIDIS_COMMIT=0000000
RUN DSH_CLIENT_COMMIT_HASH=$EQIDIS_COMMIT pnpm run build

FROM node:24-bookworm-slim
# Fonts for the WASM LibreOffice engine that recalculates workpapers and writes PDFs;
# git, ripgrep and python3 for the agent's tools.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git ripgrep python3 tini \
      fonts-liberation fonts-dejavu-core fonts-crosextra-carlito fonts-crosextra-caladea fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --home-dir /home/eqidis --uid 10001 eqidis \
    && mkdir -p /data /usuarios && chown eqidis:eqidis /data /usuarios
COPY --from=build --chown=eqidis:eqidis /app /app
WORKDIR /app
USER eqidis
ENV NODE_ENV=production \
    DSH_HOME=/data \
    EQIDIS_CUENTAS=1 \
    EQIDIS_ESCUCHAR_RED=1 \
    EQIDIS_CARPETAS=/usuarios \
    EQIDIS_COOKIES_SEGURAS=1
EXPOSE 3080
VOLUME ["/data", "/usuarios"]
ENTRYPOINT ["/usr/bin/tini", "--", "/app/deploy/dokploy/start.sh"]
