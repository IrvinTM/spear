import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules (better-sqlite3, argon2) must not be bundled
  serverExternalPackages: ["better-sqlite3", "argon2"],
};

export default nextConfig;
