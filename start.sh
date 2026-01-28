#!/bin/bash


# Start the Node.js app using pm2
pm2 start /app/index.js --name "marketing"

# Keep the container running by starting pm2 in daemon mode
pm2-runtime
