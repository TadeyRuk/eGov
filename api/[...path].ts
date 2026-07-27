import type { IncomingMessage, ServerResponse } from "node:http";
import { handleRequest } from "../apps/api/src/main.js";

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.url?.startsWith("/api/")) {
    req.url = req.url.slice(4) || "/";
  }
  await handleRequest(req, res);
}

export const config = {
  runtime: "nodejs",
};
