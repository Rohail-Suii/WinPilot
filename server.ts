/**
 * Custom Server Entry Point
 * Runs Next.js with Socket.IO WebSocket server for extension communication.
 * 
 * Usage: node server.ts (via tsx or ts-node)
 * Or for production: build Next.js first, then run this.
 */

import { createServer } from "http";
import next from "next";
import { initSocketServer, initRawWebSocketServer } from "./lib/websocket/server";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);
const wsPort = parseInt(process.env.WS_PORT || "3001", 10);

// Prevent unhandled errors from crashing the process
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

async function main() {
  const app = next({ dev, hostname, port, turbopack: dev });
  const handle = app.getRequestHandler();

  await app.prepare();

  // Create a separate HTTP server for WebSocket on port 3001
  const wsServer = createServer();
  initSocketServer(wsServer);
  initRawWebSocketServer(wsServer);
  wsServer.listen(wsPort, () => {
    console.log(`> WebSocket server listening on port ${wsPort}`);
  });

  // Create the main Next.js HTTP server on port 3000
  const server = createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.error("Request handler error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }
  });

  server.listen(port, () => {
    console.log(`> Next.js ready on http://${hostname}:${port}`);
    console.log(`> WebSocket ready on ws://${hostname}:${wsPort}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
