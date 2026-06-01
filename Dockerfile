# PyQuest — single-image deploy (serves API + frontend). Works on Render/Railway/Fly/any VM.
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend ./backend
COPY frontend ./frontend
ENV PYQUEST_DB=/data/pyquest.db
VOLUME ["/data"]
EXPOSE 8100
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8100"]
