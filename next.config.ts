import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 예전 주소를 새 화면으로 보냅니다.
  async redirects() {
    return [
      { source: "/planner", destination: "/", permanent: false },
      // 트렌드는 사이트별 화면으로 나뉘었습니다(EO planet이 첫 화면).
      { source: "/news", destination: "/news/eo", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
