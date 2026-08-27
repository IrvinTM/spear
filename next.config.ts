import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native modules (better-sqlite3, argon2) must not be bundled
  serverExternalPackages: ["better-sqlite3", "argon2"],
  allowedDevOrigins: [
    "3000-neptuno.cluster-qgzqnig265elesojp3aivvl2nk.cloudworkstations.dev",
    "stunning-acorn-pv7p7rq6r6q376vr-3000.app.github.dev", "localhost:3000",
  ],
  experimental: {
    serverActions: {
      // Allow Server Actions requests from the GitHub Codespace host.
      // allowedDevOrigins only covers dev-asset requests; Server Actions
      // have a separate CSRF origin check that requires this list.
      allowedOrigins: [
        "3000-neptuno.cluster-qgzqnig265elesojp3aivvl2nk.cloudworkstations.dev",
        "stunning-acorn-pv7p7rq6r6q376vr-3000.app.github.dev", "localhost:3000",
      ],
    },
  },
};

export default nextConfig;
