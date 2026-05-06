import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI!;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  retryCount: number;
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 2000;

declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null, retryCount: 0 };
global.mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      maxPoolSize: 10,
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
    cached.retryCount = 0; // Reset on success
  } catch (e) {
    cached.promise = null;
    cached.retryCount++;

    if (cached.retryCount >= MAX_RETRIES) {
      console.error(`[DB] Failed to connect after ${MAX_RETRIES} attempts. Giving up.`);
      cached.retryCount = 0; // Reset for future attempts
      throw e;
    }

    console.error(`[DB] Connection failed (attempt ${cached.retryCount}/${MAX_RETRIES}). Retrying in ${RETRY_DELAY_MS}ms...`);
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * cached.retryCount));
    return connectDB(); // Retry with backoff
  }

  return cached.conn;
}

export default connectDB;
