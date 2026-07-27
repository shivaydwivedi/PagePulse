const supportedHtmlTypes = new Set([
  'text/html',
  'application/xhtml+xml'
])

export function getMediaType(contentType) {
  if (typeof contentType !== 'string') {
    return undefined
  }

  const [mediaType] = contentType.split(';', 1)
  const normalizedMediaType = mediaType.trim().toLowerCase()

  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalizedMediaType)
    ? normalizedMediaType
    : undefined
}

export function isSupportedHtmlContentType(contentType) {
  const mediaType = getMediaType(contentType)

  return mediaType ? supportedHtmlTypes.has(mediaType) : false
}
