import { normalizeWhitespace } from '../utils/text.js'

function issue(code, message, suggestion) {
  return { code, severity: 'warning', category: 'content', message, suggestion }
}

function classifyHref(href, finalUrl) {
  const trimmed = normalizeWhitespace(href)

  if (!trimmed) {
    return 'empty'
  }

  const lower = trimmed.toLowerCase()

  if (lower.startsWith('#')) return 'fragment'
  if (lower.startsWith('javascript:')) return 'javascript'
  if (lower.startsWith('mailto:')) return 'mailto'
  if (lower.startsWith('tel:')) return 'tel'

  try {
    const pageOrigin = new URL(finalUrl).origin
    const resolved = new URL(trimmed, finalUrl)

    if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
      return resolved.origin === pageOrigin ? 'internalHttp' : 'externalHttp'
    }
  } catch {
    return 'unsupported'
  }

  return 'unsupported'
}

export function analyseLinks($, { finalUrl }) {
  const anchors = $('a').toArray()
  const details = {
    totalAnchors: anchors.length,
    anchorsWithHref: 0,
    anchorsMissingHref: 0,
    emptyHrefCount: 0,
    javascriptHrefCount: 0,
    mailtoCount: 0,
    telCount: 0,
    internalHttpCount: 0,
    externalHttpCount: 0,
    fragmentCount: 0,
    unsupportedProtocolCount: 0
  }

  for (const element of anchors) {
    const href = $(element).attr('href')

    if (href === undefined) {
      details.anchorsMissingHref += 1
      continue
    }

    details.anchorsWithHref += 1

    const classification = classifyHref(href, finalUrl)
    if (classification === 'empty') details.emptyHrefCount += 1
    if (classification === 'javascript') details.javascriptHrefCount += 1
    if (classification === 'mailto') details.mailtoCount += 1
    if (classification === 'tel') details.telCount += 1
    if (classification === 'internalHttp') details.internalHttpCount += 1
    if (classification === 'externalHttp') details.externalHttpCount += 1
    if (classification === 'fragment') details.fragmentCount += 1
    if (classification === 'unsupported') details.unsupportedProtocolCount += 1
  }

  const issues = []

  if (details.emptyHrefCount > 0) {
    issues.push(issue(
      'EMPTY_LINK_HREF',
      'One or more links have empty href values.',
      'Remove empty links or provide meaningful destinations.'
    ))
  }

  if (details.javascriptHrefCount > 0) {
    issues.push(issue(
      'JAVASCRIPT_LINK',
      'One or more links use javascript: URLs.',
      'Prefer buttons for actions and HTTP links for navigation.'
    ))
  }

  return {
    page: { linkCount: anchors.length },
    check: {
      status: issues.length > 0 ? 'warning' : 'pass',
      summary: issues.length > 0
        ? 'Some links use weak or risky href values.'
        : 'No empty or javascript link href values were detected.',
      details
    },
    issues
  }
}

