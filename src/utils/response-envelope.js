export function successEnvelope({ requestId, data }) {
  return {
    success: true,
    requestId,
    data
  }
}

export function errorEnvelope({ requestId, code, message, details = [] }) {
  return {
    success: false,
    requestId,
    error: {
      code,
      message,
      details
    }
  }
}
