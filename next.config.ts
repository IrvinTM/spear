import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules (better-sqlite3, argon2) must not be bundled
  serverExternalPackages: ["better-sqlite3", "argon2"],
  allowedDevOrigins: ["3000-neptuno.cluster-qgzqnig265elesojp3aivvl2nk.cloudworkstations.dev"]
};

export default nextConfig;
