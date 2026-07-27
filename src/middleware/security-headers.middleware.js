const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "form-action 'self'"
].join('; ')

const permissionsPolicy = [
  'camera=()',
  'geolocation=()',
  'microphone=()',
  'payment=()',
  'usb=()'
].join(', ')

export function securityHeadersMiddleware(_req, res, next) {
  res.set({
    'Content-Security-Policy': contentSecurityPolicy,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': permissionsPolicy,
    'X-Frame-Options': 'DENY'
  })

  next()
}
