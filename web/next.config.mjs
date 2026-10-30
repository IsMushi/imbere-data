/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16 writes a generated AGENTS.md into web/ on dev; the repo has its own guidance.
  agentRules: false,
};

export default nextConfig;
