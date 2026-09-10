import type { NextConfig } from "next";

// distDir override: the default `.next/` directory on this machine is owned
// by a previous Windows install's SID (project was copied E:→F:) and cannot
// be deleted/renamed without elevation, which breaks `next build` cleanup.
// Build output goes to `.next-fresh/` instead. To revert once the stale
// directory is removed (elevated `takeown /f .next /r` + delete), set
// NEXT_DIST_DIR=.next or remove this option.
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next-fresh",
  // Minimal self-contained server (`.next-fresh/standalone/server.js`) for
  // Docker/VPS deploys: traces only the files needed at runtime, so the
  // production image does not need a full node_modules install.
  output: "standalone",
};

export default nextConfig;
