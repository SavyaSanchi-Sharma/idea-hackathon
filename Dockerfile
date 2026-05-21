# syntax=docker/dockerfile:1.7
# ZombieHunter backend — FastAPI + scikit-learn inference service.
# Build context: repo root. Image runs `python -m ai_engine.server.run`.

FROM python:3.11-slim

LABEL org.opencontainers.image.title="zombiehunter-api" \
      org.opencontainers.image.description="ZombieHunter FastAPI inference service (Python 3.11)" \
      org.opencontainers.image.source="https://github.com/SavyaSanchi-Sharma/idea-hackathon"

# Predictable, minimal Python runtime behaviour.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install Python dependencies FIRST so this layer is cached across code edits.
COPY ai_engine/server/requirements.txt /app/ai_engine/server/requirements.txt
RUN pip install --no-cache-dir -r /app/ai_engine/server/requirements.txt

# Copy only the backend package. Trained model artifacts under ai_engine/train/
# are required at runtime (loaded by inference_pipeline.py at startup), so they
# are included here. Frontend, design, docs, and .git are excluded by .dockerignore.
COPY ai_engine/ /app/ai_engine/

# Drop root. Use a fixed UID so volume mounts behave predictably on PaaS hosts.
RUN groupadd --system --gid 1001 zombie \
 && useradd  --system --uid 1001 --gid zombie --home /app --shell /usr/sbin/nologin zombie \
 && chown -R zombie:zombie /app
USER zombie

# Defaults inside the container. Render (or any host) can override via env.
ENV ZH_HOST=0.0.0.0 \
    ZH_PORT=8000

EXPOSE 8000

# Container-level health probe. Render uses its own HTTP healthCheckPath
# (configured in render.yaml); this HEALTHCHECK helps local `docker run` users.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request, os, sys; \
url=f'http://127.0.0.1:{os.environ.get(\"ZH_PORT\",\"8000\")}/health'; \
sys.exit(0 if urllib.request.urlopen(url, timeout=3).status == 200 else 1)" \
  || exit 1

# Entry point uses the module form so the package import path resolves correctly
# (matches the documented `python -m ai_engine.server.run` local command).
CMD ["python", "-m", "ai_engine.server.run"]
