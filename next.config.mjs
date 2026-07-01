/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a self-contained .next/standalone bundle used by the Docker image.
  output: "standalone",
};

export default nextConfig;
