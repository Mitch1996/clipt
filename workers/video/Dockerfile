FROM python:3.12-slim

# System deps:
#   - ffmpeg / ffprobe — for Prompt 1.10's reframe + audio extraction
#   - libgl1 + libglib2.0-0 — runtime libs MediaPipe will need in 1.10
#   - ca-certificates + curl — TLS + healthchecks during deploy
#   - tini — proper signal handling for `python -m uvicorn`
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      libgl1 \
      libglib2.0-0 \
      ca-certificates \
      curl \
      tini \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so layer caching kicks in across iterations.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

# tini reaps zombies + forwards signals so SIGTERM from Fly's autoscaler
# actually shuts uvicorn down cleanly.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
