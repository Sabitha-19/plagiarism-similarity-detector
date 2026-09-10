FROM python:3.11-slim

# Install g++ to compile the C++ DSA algorithms
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Compile the C++ algorithms
RUN mkdir -p algorithms/bin && \
    g++ -std=c++17 -O2 algorithms/rabin_karp.cpp -o algorithms/bin/rabin_karp && \
    g++ -std=c++17 -O2 algorithms/hashing.cpp -o algorithms/bin/hashing && \
    g++ -std=c++17 -O2 algorithms/lcs.cpp -o algorithms/bin/lcs && \
    g++ -std=c++17 -O2 algorithms/edit_distance.cpp -o algorithms/bin/edit_distance

RUN mkdir -p uploads reports

# Railway injects PORT at runtime
EXPOSE 8080

# 1 worker keeps things simple with the in-process job-polling model;
# threads let Flask handle several requests (including uploads) at once
# while a comparison runs in its own background thread.
CMD ["sh", "-c", "gunicorn app:app --chdir backend --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 8 --timeout 120"]
