#!/bin/bash
# Usage: ./public/gen-manifest.sh https://your-tunnel.trycloudflare.com
# Can be run from the project root or from public/

TUNNEL_URL=$1

if [ -z "$TUNNEL_URL" ]; then
  echo "Usage: ./public/gen-manifest.sh https://your-tunnel-url.trycloudflare.com"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/manifest.xml"
OUTPUT="$SCRIPT_DIR/manifest-dev.xml"
CONFIG="$PROJECT_ROOT/next.config.ts"
HOSTNAME=$(echo "$TUNNEL_URL" | sed 's|https://||;s|http://||;s|/.*||')

if [ ! -f "$MANIFEST" ]; then
  echo "❌ manifest.xml not found at $MANIFEST"
  exit 1
fi

# 1. Generate manifest-dev.xml with tunnel URL
sed -E "s|https://deal-trace-gse\.vercel\.app|$TUNNEL_URL|g" "$MANIFEST" > "$OUTPUT"
echo "✅ manifest-dev.xml generated"

# 2. Update next.config.ts with new allowedDevOrigins
if [ -f "$CONFIG" ]; then
  cat > "$CONFIG" << EOF
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["$HOSTNAME"],
};

export default nextConfig;
EOF
  echo "✅ next.config.ts updated with allowedDevOrigins: ['$HOSTNAME']"
fi

echo ""
echo "Next steps:"
echo "  1. NEXTAUTH_URL=$TUNNEL_URL npm run dev"
echo "  2. Upload manifest-dev.xml to https://aka.ms/olksideload"
