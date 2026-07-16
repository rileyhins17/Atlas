/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image. Only enabled when building
  // for Docker (BUILD_STANDALONE=1): its trace step creates symlinks, which fail
  // with EPERM on Windows. Local `next dev` / `next build` skip it.
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  // Transpile the shared workspace package (it ships as TS/ESM source).
  transpilePackages: ['@atlas/shared'],
};

export default nextConfig;
