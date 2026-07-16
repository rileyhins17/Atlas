/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Produces a self-contained server bundle for the Docker image.
  output: 'standalone',
  // Transpile the shared workspace package (it ships as TS/ESM source).
  transpilePackages: ['@atlas/shared'],
};

export default nextConfig;
