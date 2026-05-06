import { NextResponse } from "next/server";
import mongoose from "mongoose";
import connectDB from "@/lib/db/connection";

// Track server start time for uptime calculation
const startTime = Date.now();

// MongoDB connection state labels
const MONGO_STATES: Record<number, string> = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const verbose = searchParams.get("verbose") === "true";

  try {
    await connectDB();

    const uptimeMs = Date.now() - startTime;
    const memoryUsage = process.memoryUsage();
    const mongoState = mongoose.connection.readyState;

    // Basic health response (backward compatible)
    const healthData: Record<string, unknown> = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.1.0",
      uptime: {
        ms: uptimeMs,
        seconds: Math.floor(uptimeMs / 1000),
        human: formatUptime(uptimeMs),
      },
      mongodb: {
        state: MONGO_STATES[mongoState] || "unknown",
        stateCode: mongoState,
      },
    };

    // Include detailed info only when verbose is requested
    if (verbose) {
      healthData.memory = {
        rss: formatBytes(memoryUsage.rss),
        heapTotal: formatBytes(memoryUsage.heapTotal),
        heapUsed: formatBytes(memoryUsage.heapUsed),
        external: formatBytes(memoryUsage.external),
        rssBytes: memoryUsage.rss,
        heapTotalBytes: memoryUsage.heapTotal,
        heapUsedBytes: memoryUsage.heapUsed,
      };
      healthData.environment = {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        env: process.env.NODE_ENV || "development",
      };
    }

    return NextResponse.json(healthData);
  } catch {
    const uptimeMs = Date.now() - startTime;
    const mongoState = mongoose.connection.readyState;

    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "0.1.0",
        uptime: {
          ms: uptimeMs,
          seconds: Math.floor(uptimeMs / 1000),
          human: formatUptime(uptimeMs),
        },
        mongodb: {
          state: MONGO_STATES[mongoState] || "unknown",
          stateCode: mongoState,
        },
        error: "Database connection failed",
      },
      { status: 200 }
    );
  }
}

/**
 * Format milliseconds into a human-readable uptime string.
 */
function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format bytes into a human-readable string.
 */
function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let value = bytes;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}
