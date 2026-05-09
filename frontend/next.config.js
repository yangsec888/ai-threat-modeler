const path = require('path')

// Surface the root project version (single source of truth in /package.json)
// to the browser bundle as NEXT_PUBLIC_APP_VERSION. Falls back to the frontend's
// own package.json version if the root file is unreadable for any reason.
function resolveAppVersion() {
  try {
    return require(path.resolve(__dirname, '..', 'package.json')).version
  } catch {
    try {
      return require('./package.json').version
    } catch {
      return 'unknown'
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    NEXT_PUBLIC_APP_VERSION: resolveAppVersion(),
  },
}

module.exports = nextConfig

