if (!process.env.MUXAI_INTERNAL_SECRET) {
  console.error(
    "[muxai] FATAL: MUXAI_INTERNAL_SECRET is not set. " +
    "Built-in MCP servers will fail to authenticate against the API. " +
    "Add MUXAI_INTERNAL_SECRET=<secret> to your .env file."
  );
  process.exit(1);
}

export const INTERNAL_SECRET = process.env.MUXAI_INTERNAL_SECRET;

export function isInternalRequest(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  return req.headers["x-muxai-internal"] === INTERNAL_SECRET;
}
