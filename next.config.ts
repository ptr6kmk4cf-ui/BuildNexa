import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The dev server is opened at 127.0.0.1 while hostname is 0.0.0.0.
  // Next only allows localhost by default, which blocks the HMR socket
  // and leaves the React debug channel unfinished, so the app never hydrates.
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
