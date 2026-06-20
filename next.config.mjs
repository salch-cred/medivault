/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdf-parse and the 0G SDK pull in Node built-ins; keep them external on the server.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
  webpack: (config, { isServer, webpack }) => {
    // Browser bundlers need Node polyfills for the 0G storage SDK + ethers.
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        stream: false,
        path: false,
        fs: false,
        os: false,
        http: false,
        https: false,
        zlib: false,
        net: false,
        tls: false,
      }
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        }),
      )
    }
    config.externals = config.externals || []
    return config
  },
}

export default nextConfig
