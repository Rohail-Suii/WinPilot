import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface IScrapedData extends Document {
  userId: mongoose.Types.ObjectId;
  isGuest: boolean;
  expiresAt?: Date;
  scraperConfigId?: mongoose.Types.ObjectId;
  type: "post" | "profile" | "company" | "job";
  data: Record<string, unknown>;
  source: {
    url: string;
    scrapedAt: Date;
  };
  tags: string[];
  actions: {
    type: "commented" | "reached_out" | "saved" | "dismissed";
    at: Date;
    content?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const ScrapedDataSchema = new Schema<IScrapedData>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    scraperConfigId: { type: Schema.Types.ObjectId, ref: "ScraperConfig" },
    type: {
      type: String,
      enum: ["post", "profile", "company", "job"],
      required: true,
    },
    data: { type: Schema.Types.Mixed, default: {} },
    source: {
      url: { type: String, required: true },
      scrapedAt: { type: Date, default: Date.now },
    },
    tags: [String],
    actions: [
      {
        type: {
          type: String,
          enum: ["commented", "reached_out", "saved", "dismissed"],
        },
        at: { type: Date, default: Date.now },
        content: String,
      },
    ],
    isGuest: { type: Boolean, default: false, index: true },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

// Auto-delete guest scraped data after expiresAt
ScrapedDataSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
ScrapedDataSchema.index({ userId: 1, type: 1 });
ScrapedDataSchema.index({ "source.scrapedAt": -1 });
ScrapedDataSchema.index({ userId: 1, tags: 1 });

const ScrapedData: Model<IScrapedData> =
  mongoose.models.ScrapedData ||
  mongoose.model<IScrapedData>("ScrapedData", ScrapedDataSchema);

export default ScrapedData;
