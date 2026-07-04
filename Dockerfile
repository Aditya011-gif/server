FROM node:20-bullseye-slim

# Install python3, python3-pip, ffmpeg, and curl
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        ffmpeg \
        curl && \
    rm -rf /var/lib/apt/lists/*

# Install yt-dlp globally
RUN pip3 install --no-cache-dir --break-system-packages yt-dlp

# Set working directory
WORKDIR /app

# Copy package dependencies and install
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose the API port
EXPOSE 3000

# Run the app
CMD ["node", "index.js"]
