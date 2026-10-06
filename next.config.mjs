/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  // Build enxuto para o container: gera .next/standalone (server.js + só as dependências usadas).
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk"],
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "@dnd-kit/core"],
  },
  // Headers de segurança no próprio app: valem atrás do Caddy, atrás do Cloudflare Tunnel
  // ou até sem proxy. (O Caddyfile repete alguns; duplicar é inofensivo.)
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
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
