/**
 * Custom Server Entry Point
 * Runs Next.js with the Socket.IO WebSocket server for extension communication.
 *
 * Both the HTTP app and the WebSocket server share a SINGLE port, because PaaS
 * hosts (Render, Railway, Fly, Heroku) only route traffic to one port per
 * service. Socket.IO is mounted on the Next.js server at path /api/ws.
 *
 * Dev:  npm run dev    (tsx server.ts)
 * Prod: npm start      (tsx server.ts with NODE_ENV=production)
 */

import { createServer } from "http";
import next from "next";
import { initSocketServer, initRawWebSocketServer } from "./lib/websocket/server";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

// Address to bind. Deliberately does NOT read HOSTNAME: container runtimes
// (Docker, Kubernetes, Render) set that to the container's *name*, which
// resolves to a single interface. Binding to it leaves nothing listening on
// localhost, so the platform's port detection and health checks fail and every
// request 502s. Use BIND_HOST for an explicit override.
const hostname = process.env.BIND_HOST || (dev ? "localhost" : "0.0.0.0");

// Optional: bind a second HTTP listener for the WebSocket server. Only used by
// deployments that expose more than one port (e.g. the docker-compose stack).
// Leave WS_PORT unset on single-port hosts like Render.
const wsPort = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : null;

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

  // Main HTTP server: serves Next.js *and* upgrades WebSocket connections.
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

  // Mount Socket.IO (path /api/ws) and the raw-WS endpoint on the same server.
  initSocketServer(server);
  initRawWebSocketServer(server);

  // The Autopilot clock. Must live in this process, not a Next route handler:
  // it needs to outlive any single request and it dispatches over the very
  // WebSocket servers mounted above.
  //
  // Imported dynamically, and only after app.prepare(): the scheduler reaches
  // lib/db/connection, which throws at module-evaluation time when MONGODB_URI
  // is missing. Next loads .env during prepare(), so a static import at the top
  // of this file would evaluate that check before the variable exists and crash
  // the process on boot.
  const { startAutopilotScheduler } = await import("./lib/autopilot/scheduler");
  startAutopilotScheduler();

  // The job-application sender. Same reasoning as above — it outlives requests,
  // and it must be imported after prepare() so .env is loaded before the DB
  // connection module is evaluated.
  const { startOutreachWorker } = await import("./lib/outreach/worker");
  startOutreachWorker();

  server.listen(port, hostname, () => {
    console.log(`> Next.js ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO ready on the same port at path /api/ws`);
  });

  if (wsPort && wsPort !== port) {
    // Legacy dual-port mode: proxy-free second listener that shares the same
    // Socket.IO instance is not possible, so just warn instead of silently
    // starting a listener nothing is attached to.
    console.warn(
      `> WS_PORT=${wsPort} is set but ignored — WebSocket now shares port ${port}. ` +
        `Point NEXT_PUBLIC_WS_URL at the app origin and unset WS_PORT.`
    );
  }
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
