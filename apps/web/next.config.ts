import type { NextConfig } from "next";
import path from "path";
import { config } from "dotenv";

// Load root .env so NEXT_PUBLIC_* vars are available from the monorepo root
config({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
    NEXT_PUBLIC_API_KEY: process.env.API_KEY ?? "",
  },
};

export default nextConfig;
