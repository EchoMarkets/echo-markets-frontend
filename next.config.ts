import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Webpack config for browser polyfills (needed for Bitcoin libs)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: require.resolve("crypto-browserify"),
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        process: require.resolve("process/browser"),
      };
    }
    return config;
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_NETWORK: "testnet4",
    NEXT_PUBLIC_MEMPOOL_API: "https://mempool.space/testnet4/api",
    NEXT_PUBLIC_PROVER_URL: "https://v8.charms.dev/spells/prove",
  },
};

export default nextConfig;
