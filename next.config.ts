import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["nodejs-whisper"],
};

export default nextConfig;
