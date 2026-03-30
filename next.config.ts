import type { NextConfig } from "next";

const tunnelHost = process.env.NEXTAUTH_URL?.replace(/^https?:\/\//, "");

const nextConfig: NextConfig = {
  allowedDevOrigins: tunnelHost ? [tunnelHost] : [],
};

export default nextConfig;
