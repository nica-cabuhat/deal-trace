#!/bin/bash
# One-command dev startup: tunnel → config → server
# Usage: ./dev.sh

set -e

echo "🔧 Starting Cloudflare tunnel..."
cloudflared tunnel --url http://localhost:3000 2>&1 &
TUNNEL_PID=$!

# Wait for cloudflared to print the tunnel URL
TUNNEL_URL=""
for i in $(seq 1 30); do
  sleep 1
  TUNNEL_URL=$(ps -p $TUNNEL_PID > /dev/null 2>&1 && \
    cat /tmp/cloudflared-$TUNNEL_PID.log 2>/dev/null | grep -o 'https://[^ ]*\.trycloudflare\.com' | head -1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
done

# Alternative: parse from cloudflared stderr directly
if [ -z "$TUNNEL_URL" ]; then
  kill $TUNNEL_PID 2>/dev/null || true
  wait $TUNNEL_PID 2>/dev/null || true

  echo "🔧 Retrying tunnel with log capture..."
  cloudflared tunnel --url http://localhost:3000 > /tmp/cf-tunnel.log 2>&1 &
  TUNNEL_PID=$!

  for i in $(seq 1 30); do
    sleep 1
    TUNNEL_URL=$(grep -o 'https://[^ ]*\.trycloudflare\.com' /tmp/cf-tunnel.log 2>/dev/null | head -1 || true)
    if [ -n "$TUNNEL_URL" ]; then
      break
    fi
  done
fi

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ Could not detect tunnel URL after 30s"
  kill $TUNNEL_PID 2>/dev/null || true
  exit 1
fi

echo "✅ Tunnel: $TUNNEL_URL"
echo ""

# Update manifest + next.config.ts
./public/gen-manifest.sh "$TUNNEL_URL"

echo ""
echo "🚀 Starting Next.js dev server..."
echo ""

# Start dev server (foreground) — Ctrl+C kills both server and tunnel
trap "echo ''; echo 'Shutting down...'; kill $TUNNEL_PID 2>/dev/null; exit 0" INT TERM

NEXTAUTH_URL="$TUNNEL_URL" npm run dev

# Cleanup
kill $TUNNEL_PID 2>/dev/null || true
