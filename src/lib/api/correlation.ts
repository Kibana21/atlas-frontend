/** Correlation IDs sent with every API request (contract header pattern ^[A-Za-z0-9_-]{8,64}$). */
export const CORRELATION_HEADER = "X-Correlation-ID";
export const CORRELATION_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function newCorrelationId(): string {
  return `web_${crypto.randomUUID().replaceAll("-", "")}`;
}
