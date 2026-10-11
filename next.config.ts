import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/transfer", destination: "/product/transfer", permanent: false },
      { source: "/deposit", destination: "/product/deposit", permanent: false },
      { source: "/withdraw", destination: "/product/withdraw", permanent: false },
      { source: "/aave", destination: "/lab/aave", permanent: false },
    ];
  },
};

export default nextConfig;
