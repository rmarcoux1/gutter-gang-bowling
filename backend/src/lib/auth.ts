import type { APIGatewayProxyEventV2 } from "aws-lambda";

/**
 * v1 access control: a shared secret passed as the `x-api-key` header,
 * checked against the API_KEY_SECRET env var (set from a CDK-generated
 * Secrets Manager value). No per-user login — good enough for a small
 * team tool that isn't meant to be publicly writable.
 *
 * Swap this for Cognito or API Gateway native API keys later if you need
 * per-user auth or usage tracking.dsff
 */
export function isAuthorized(event: APIGatewayProxyEventV2): boolean {
  const expected = process.env.API_KEY_SECRET;
  if (!expected) return false;
  const provided = event.headers?.["x-api-key"] ?? event.headers?.["X-Api-Key"];
  return provided === expected;
}
