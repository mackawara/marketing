FROM node:latest

# Install Redis
RUN apt-get update && apt-get install -y && apt-get clean

# Set the working directory
WORKDIR /app

# Copy your application files into the container
COPY . .

# Install your Node.js application dependencies
RUN npm install

# Build your application
RUN npm run build

# Install pm2 globally
RUN npm install -g pm2

# Copy the start script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Expose the port your application runs on
EXPOSE 3000

# Start both Redis and the Node.js application using the start script
CMD ["/start.sh"]
