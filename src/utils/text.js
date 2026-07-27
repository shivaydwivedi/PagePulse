export function normalizeWhitespace(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.replace(/\s+/g, ' ').trim()
}

export function boundedText(value, maxLength = 300) {
  const normalized = normalizeWhitespace(value)
  const codePoints = []

  for (const character of normalized) {
    const code = character.charCodeAt(0)
    const safeCharacter = character.length === 1 && code >= 0xD800 && code <= 0xDFFF
      ? '\uFFFD'
      : character

    codePoints.push(safeCharacter)

    if (codePoints.length >= maxLength) {
      break
    }
  }

  return codePoints.join('')
}
