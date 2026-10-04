/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  serverExternalPackages: ["@anthropic-ai/sdk"],
  transpilePackages: ["lucide-react"],
  experimental: {
    optimizePackageImports: ["recharts", "date-fns", "@dnd-kit/core"],
  },
  webpack: (config) => {
    config.cache = {
      type: "filesystem",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    };
    return config;
  },
};

export default nextConfig;
