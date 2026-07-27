import { normalizeWhitespace } from './text.js'

export function getAttributeValue(element, name) {
  const value = element?.attr?.(name)

  return typeof value === 'string' ? value : undefined
}

export function findMetaByName($, name) {
  const expectedName = name.toLowerCase()

  return $('meta').filter((_, element) => {
    return normalizeWhitespace($(element).attr('name')).toLowerCase() === expectedName
  })
}

export function findLinksByRelToken($, token) {
  const expectedToken = token.toLowerCase()

  return $('link').filter((_, element) => {
    const tokens = normalizeWhitespace($(element).attr('rel'))
      .toLowerCase()
      .split(' ')
      .filter(Boolean)

    return tokens.includes(expectedToken)
  })
}

