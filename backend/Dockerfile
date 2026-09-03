# The API image: uvicorn serving the FastAPI app on 8000.
#
# Single stage -- there is nothing to compile, and the dependencies are the
# runtime, so a builder stage would save nothing.
FROM python:3.13-slim

# PYTHONDONTWRITEBYTECODE: .pyc files are useless in a container that is
# rebuilt rather than mutated. PYTHONUNBUFFERED: send logs straight to the
# stream so `docker logs` shows them as they happen rather than in bursts.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copied and installed before the source so that editing a .py file does not
# invalidate the dependency layer and force a full reinstall.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run as a non-root user: a compromise in the app then has no privileges to
# escalate with inside the container.
RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Compose gates the frontend on this, so nginx never starts against an API that
# is not yet accepting connections. urllib avoids installing curl for one call.
HEALTHCHECK --interval=60s --timeout=3s --start-period=5s --retries=5 \
    CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2).status == 200 else 1)"

# 0.0.0.0, not 127.0.0.1: the port has to be reachable from outside the
# container's own network namespace.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
