/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 16 writes a generated AGENTS.md into web/ on dev; the repo has its own guidance.
  agentRules: false,
  experimental: {
    // Marks this app as being kept current by `next upgrade --agent=security`, so the upgrade
    // tool does not re-offer the same advisory fixes on every run.
    agentUpgrade: "security",
  },
};

export default nextConfig;
