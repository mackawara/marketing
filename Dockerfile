FROM node:20-slim

# Install Chromium and all necessary dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    git \
    python3 \
    make \
    g++ \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-khmeros \
    fonts-freefont-ttf \
    fonts-liberation \
    libxss1 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libnss3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_BIN=/usr/bin/chromium

# Create and set working directory
RUN mkdir -p /code
WORKDIR /code

# Copy only necessary files (ignored in .dockerignore)
COPY package.json package-lock.json /code/
RUN npm ci --omit=optional

# Copy the rest of the source code
COPY . /code

# Create directory for WhatsApp session data with proper permissions
RUN mkdir -p /code/.wwebjs_auth && chmod 777 /code/.wwebjs_auth

# Build the project
RUN npm run build

EXPOSE 4000
CMD ["npm", "start"]