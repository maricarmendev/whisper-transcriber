# syntax=docker/dockerfile:1.7

# =============================================================================
# Stage 1 — Builder
#   - Compila whisper.cpp (binario nativo) con cmake
#   - Descarga los modelos tiny/base/small de Hugging Face
#   - Hace el build de Next.js
# =============================================================================
FROM node:22-bookworm AS builder

# Dependencias de build + runtime de audio (ffmpeg) + descarga (curl)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      cmake \
      build-essential \
      curl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pnpm vía corepack (respeta el packageManager field si lo agregás)
RUN corepack enable

WORKDIR /app

# Instalar deps JS primero — capa cacheable mientras el lockfile no cambie.
# `package-import-method=copy` evita hardlinks al store global, así
# node_modules se puede copiar limpio a la imagen de runtime.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.package-import-method=copy

# Ruta canónica al whisper.cpp vendoreado dentro de nodejs-whisper.
# Funciona con pnpm porque /app/node_modules/nodejs-whisper es un symlink
# al .pnpm/<version>/.../nodejs-whisper real, así no dependemos de la versión.
ENV WHISPER_CPP_DIR=/app/node_modules/nodejs-whisper/cpp/whisper.cpp

# Compilar el binario whisper-cli (sin CUDA — corre en CPU).
# Se hace en su propia capa así no se rebuildea cuando cambia el código.
#
# Notas sobre flags:
# - GGML_NATIVE=OFF: evita -march=native (no confiable dentro de un contenedor)
# - En ARM64, los intrínsecos NEON con dotprod requieren explícitamente
#   armv8.2-a+dotprod+fp16; sin esos flags, gcc 12 falla con
#   "target specific option mismatch". En x86 no se aplican.
RUN ARCH=$(uname -m) \
 && if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then \
      EXTRA_CMAKE_FLAGS="-DCMAKE_C_FLAGS=-march=armv8.2-a+dotprod+fp16 -DCMAKE_CXX_FLAGS=-march=armv8.2-a+dotprod+fp16"; \
    else \
      EXTRA_CMAKE_FLAGS=""; \
    fi \
 && cmake -B "$WHISPER_CPP_DIR/build" -S "$WHISPER_CPP_DIR" \
      -DCMAKE_BUILD_TYPE=Release \
      -DGGML_NATIVE=OFF \
      $EXTRA_CMAKE_FLAGS \
 && cmake --build "$WHISPER_CPP_DIR/build" --config Release -j "$(nproc)"

# Pre-descargar modelos en build time (no en runtime).
# Descarga directa desde Hugging Face para evitar el CLI interactivo.
RUN mkdir -p "$WHISPER_CPP_DIR/models" \
 && BASE_URL=https://huggingface.co/ggerganov/whisper.cpp/resolve/main \
 && for m in tiny base small; do \
      echo "Downloading ggml-$m.bin..." ; \
      curl -fL --retry 3 -o "$WHISPER_CPP_DIR/models/ggml-$m.bin" "$BASE_URL/ggml-$m.bin"; \
    done

# Ahora sí copiamos el código y hacemos el build de Next.
# Los layers anteriores quedan cacheados aunque toques el código.
COPY . .
RUN pnpm build

# Slim del árbol antes del COPY al runtime:
# 1) drop dev dependencies del node_modules.
# 2) dentro de whisper.cpp/build/, conservar SOLO:
#    - el binario `whisper-cli`
#    - las shared libs contra las que está enlazado (libwhisper.so*,
#      libggml*.so*) que viven en src/ y ggml/src/.
#    El resto (CMakeFiles/, tests/, examples/, .o, headers, shaders metal,
#    bench/quantize/whisper-server/etc) se descarta. Después pruneamos
#    directorios vacíos.
RUN pnpm prune --prod \
 && cd "$WHISPER_CPP_DIR/build" \
 && find . -type f \
      ! -name 'whisper-cli' \
      ! -name '*.so' \
      ! -name '*.so.*' \
      -delete \
 && find . -depth -type d -empty -delete

# =============================================================================
# Stage 2 — Runtime
#   Imagen final más liviana: solo lo necesario para ejecutar.
#   No incluye cmake/build-essential/curl.
# =============================================================================
FROM node:22-bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pnpm vía corepack para poder lanzar `pnpm start`.
RUN corepack enable

WORKDIR /app

# Copiamos el árbol del builder ya purgado (sin dev deps y sin intermediates
# de cmake). Incluye node_modules, .next, binario de whisper-cli, modelos .bin.
COPY --from=builder /app /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["pnpm", "start"]
