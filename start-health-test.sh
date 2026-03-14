#!/bin/bash

set -e

echo "Starting marketing bot in health-test mode..."
echo "- CLIENT_HEARTBEAT_MS: ${CLIENT_HEARTBEAT_MS:-10000}"

export CLIENT_HEARTBEAT_MS="${CLIENT_HEARTBEAT_MS:-10000}"

node index.js