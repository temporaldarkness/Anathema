FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts/download_voices.py /tmp/download_voices.py
RUN python /tmp/download_voices.py

COPY app/ ./app/

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PIPER_VOICES_DIR=/app/voices

EXPOSE 8008
CMD ["python", "-m", "app.main"]