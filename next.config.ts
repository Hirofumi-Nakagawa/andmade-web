import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js blocks cross-origin requests to dev-only assets/HMR by default,
  // allowing only `localhost`. Testing on an actual phone over the LAN hits
  // the dev server via its LAN IP instead, so those requests were silently
  // blocked — the server-rendered HTML still painted fine (hence header/
  // footer, which don't depend on any JS reveal, showing up), but hydration
  // never completed, so every JS-driven reveal effect (mobile-project-list.tsx,
  // mobile-home.tsx's rail) never ran and stayed stuck at its default
  // opacity-0 state (reported as "ヘッダー・フッター以外表示されない", only
  // reproducing via the LAN IP, not localhost). Listing the whole
  // 192.168.3.0/24 subnet (a wildcard prefix, not just the one current IP)
  // so this keeps working if the phone/router hands out a different address
  // later.
  allowedDevOrigins: ["192.168.3.*"],
};

export default nextConfig;
