FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

# Test dependencies are installed only when asked for, so the image that
# reaches the server carries nothing it does not need. Local compose sets this
# to true; the deploy build leaves it false.
ARG INSTALL_DEV=false

COPY requirements.txt requirements-dev.txt ./
RUN if [ "$INSTALL_DEV" = "true" ]; then \
        pip install --no-cache-dir -r requirements-dev.txt; \
    else \
        pip install --no-cache-dir -r requirements.txt; \
    fi

# This backend keeps its modules at the package root rather than under a
# single app/ directory, so each one is copied explicitly. Anything new at
# that level has to be added here too.
COPY alembic.ini pytest.ini ./
COPY migrations ./migrations
COPY models ./models
COPY routes ./routes
COPY services ./services
COPY tests ./tests
COPY auth.py custom_board.py database.py main.py schemas.py ./

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# Migrations run on start: Alembic is idempotent per revision, which keeps a
# deploy to a single `docker compose up -d` with no separate migrate step to
# forget. The container will not serve traffic on a failed migration, which is
# the correct outcome -- a half-migrated schema behind a live app is worse.
CMD ["sh", "-c", "alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000"]
