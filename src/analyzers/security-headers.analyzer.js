function issue(code, message, suggestion) {
  return { code, severity: 'warning', category: 'security', message, suggestion }
}

function getHeader(headers, name) {
  const value = headers?.[name]

  return typeof value === 'string' ? value.trim() : ''
}

function subcheck(status, present, extra = {}) {
  return { status, present, ...extra }
}

function groupedStatus(results) {
  const statuses = Object.values(results).map((result) => result.status)

  if (statuses.includes('fail')) return 'fail'
  if (statuses.includes('warning')) return 'warning'
  if (statuses.every((status) => status === 'not_applicable')) return 'not_applicable'
  return 'pass'
}

export function analyseSecurityHeaders(headers, { finalUrl }) {
  const isHttps = new URL(finalUrl).protocol === 'https:'
  const details = {}
  const issues = []

  const csp = getHeader(headers, 'content-security-policy')
  details.contentSecurityPolicy = subcheck(csp ? 'pass' : 'warning', Boolean(csp))
  if (!csp) {
    issues.push(issue(
      'MISSING_CONTENT_SECURITY_POLICY',
      'The response does not include a Content-Security-Policy header.',
      'Add a Content-Security-Policy header appropriate for the application.'
    ))
  }

  const hsts = getHeader(headers, 'strict-transport-security')
  details.strictTransportSecurity = isHttps
    ? subcheck(hsts ? 'pass' : 'warning', Boolean(hsts), { applicable: true })
    : subcheck('not_applicable', Boolean(hsts), { applicable: false })
  if (isHttps && !hsts) {
    issues.push(issue(
      'MISSING_STRICT_TRANSPORT_SECURITY',
      'The HTTPS response does not include Strict-Transport-Security.',
      'Add HSTS after confirming HTTPS is enforced for the site.'
    ))
  }

  const xContentTypeOptions = getHeader(headers, 'x-content-type-options')
  const hasNosniff = xContentTypeOptions.toLowerCase() === 'nosniff'
  details.xContentTypeOptions = subcheck(hasNosniff ? 'pass' : 'warning', Boolean(xContentTypeOptions), {
    expected: 'nosniff'
  })
  if (!hasNosniff) {
    issues.push(issue(
      'INVALID_X_CONTENT_TYPE_OPTIONS',
      'The response does not include X-Content-Type-Options: nosniff.',
      'Set X-Content-Type-Options to nosniff.'
    ))
  }

  const xFrameOptions = getHeader(headers, 'x-frame-options')
  const validFrameOption = ['deny', 'sameorigin'].includes(xFrameOptions.toLowerCase())
  details.xFrameOptions = subcheck(validFrameOption ? 'pass' : 'warning', Boolean(xFrameOptions), {
    expected: 'DENY or SAMEORIGIN'
  })
  if (!validFrameOption) {
    issues.push(issue(
      'MISSING_X_FRAME_OPTIONS',
      'The response does not include a basic X-Frame-Options protection value.',
      'Set X-Frame-Options to DENY or SAMEORIGIN, or enforce frame-ancestors with CSP in a later policy.'
    ))
  }

  const referrerPolicy = getHeader(headers, 'referrer-policy')
  details.referrerPolicy = subcheck(referrerPolicy ? 'pass' : 'warning', Boolean(referrerPolicy))
  if (!referrerPolicy) {
    issues.push(issue(
      'MISSING_REFERRER_POLICY',
      'The response does not include a Referrer-Policy header.',
      'Add a Referrer-Policy header that matches the site privacy model.'
    ))
  }

  const permissionsPolicy = getHeader(headers, 'permissions-policy')
  details.permissionsPolicy = subcheck(permissionsPolicy ? 'pass' : 'warning', Boolean(permissionsPolicy))
  if (!permissionsPolicy) {
    issues.push(issue(
      'MISSING_PERMISSIONS_POLICY',
      'The response does not include a Permissions-Policy header.',
      'Add a Permissions-Policy header to limit browser features where appropriate.'
    ))
  }

  const status = groupedStatus(details)
  const presentCount = Object.values(details).filter((result) => result.present).length

  return {
    check: {
      status,
      summary: status === 'pass'
        ? 'The retained response headers include the recommended basic security headers.'
        : `${presentCount} of 6 recommended security headers are present or applicable.`,
      details
    },
    issues
  }
}

