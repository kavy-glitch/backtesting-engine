# syntax=docker/dockerfile:1
# Build context is the REPOSITORY ROOT (see docker-compose.yml): the image needs engine/, backend/, database/, data/.
#
# Stages
#   engine-build  - compiles the C++ engine (Debian bookworm = same glibc as the runtime image)
#   engine-tests  - optional: `docker build --target engine-tests -f backend/Dockerfile .` runs the C++ unit tests
#   runtime       - Python API + the engine binary (default target)
#   test          - runtime + pytest, used by `docker compose --profile test run --rm tests`

FROM debian:bookworm-slim AS engine-build
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY engine /src/engine
RUN cmake -S /src/engine -B /build -DCMAKE_BUILD_TYPE=Release -DPBE_BUILD_TESTS=OFF \
        -DCMAKE_EXE_LINKER_FLAGS="-static-libstdc++ -static-libgcc" \
    && cmake --build /build --target engine -j2

FROM engine-build AS engine-tests
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
RUN cmake -S /src/engine -B /build-test -DCMAKE_BUILD_TYPE=Release -DPBE_BUILD_TESTS=ON \
    && cmake --build /build-test -j2 \
    && ctest --test-dir /build-test --output-on-failure

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    PBE_ENGINE_PATH=/usr/local/bin/engine
WORKDIR /srv/pbe/backend
COPY backend/requirements.txt requirements.txt
RUN pip install -r requirements.txt
COPY --from=engine-build /build/engine /usr/local/bin/engine
COPY backend/app app
COPY backend/scripts scripts
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY database /srv/pbe/database
COPY data /srv/pbe/data
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && useradd --create-home --uid 10001 pbe && chown -R pbe /srv/pbe
USER pbe
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4).status == 200 else 1)"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM runtime AS test
USER root
COPY backend/requirements-dev.txt requirements-dev.txt
RUN pip install -r requirements-dev.txt
COPY backend/tests tests
RUN chown -R pbe /srv/pbe
USER pbe
ENTRYPOINT []
CMD ["python", "-m", "pytest", "tests", "-q"]
