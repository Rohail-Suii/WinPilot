import mongoose, { Schema, type Document, type Model } from "mongoose";

export type CampaignStatus = "active" | "paused" | "stopped";

export interface ILeadComment {
  postUrl: string;
  postAuthor: string;
  comment: string;
  keyword: string;
  commentedAt: Date;
}

export interface ILeadGenCampaign extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  keywords: string[];
  /** Handlebars-style templates, e.g. "Hey {authorName}, saw your post about needing a website..." */
  commentTemplates: string[];
  /** Brief description of what you offer — fed to AI for context */
  serviceDescription: string;
  /** Who you're targeting (e.g. "small business owners", "startups") */
  targetAudience: string;
  useAI: boolean;
  status: CampaignStatus;
  /** Max comments this campaign can post per calendar day */
  dailyCommentLimit: number;
  /** How many posts to process per keyword per run */
  postsPerKeyword: number;
  stats: {
    totalCommented: number;
    totalFound: number;
    lastRun?: Date;
  };
  /** Post URLs already commented on — prevents duplicate comments */
  alreadyCommentedUrls: string[];
  recentComments: ILeadComment[];
  createdAt: Date;
  updatedAt: Date;
}

const LeadCommentSchema = new Schema<ILeadComment>(
  {
    postUrl: { type: String, required: true },
    postAuthor: { type: String, default: "" },
    comment: { type: String, required: true },
    keyword: { type: String, default: "" },
    commentedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const LeadGenCampaignSchema = new Schema<ILeadGenCampaign>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, maxlength: 100 },
    keywords: { type: [String], default: [] },
    commentTemplates: { type: [String], default: [] },
    serviceDescription: { type: String, default: "" },
    targetAudience: { type: String, default: "" },
    useAI: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["active", "paused", "stopped"],
      default: "paused",
    },
    dailyCommentLimit: { type: Number, default: 10, min: 1, max: 15 },
    postsPerKeyword: { type: Number, default: 5, min: 1, max: 20 },
    stats: {
      totalCommented: { type: Number, default: 0 },
      totalFound: { type: Number, default: 0 },
      lastRun: { type: Date },
    },
    alreadyCommentedUrls: { type: [String], default: [] },
    recentComments: { type: [LeadCommentSchema], default: [] },
  },
  { timestamps: true }
);

// Indexes
LeadGenCampaignSchema.index({ userId: 1 });
LeadGenCampaignSchema.index({ userId: 1, status: 1 });

const LeadGenCampaign: Model<ILeadGenCampaign> =
  mongoose.models.LeadGenCampaign ||
  mongoose.model<ILeadGenCampaign>("LeadGenCampaign", LeadGenCampaignSchema);

export default LeadGenCampaign;
