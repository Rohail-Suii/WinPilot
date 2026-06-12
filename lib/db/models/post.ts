import mongoose, { Schema, type Document, type Model } from "mongoose";

export type PostType = "text" | "image" | "carousel" | "poll" | "video" | "article";
export type PostStatus = "draft" | "scheduled" | "posting" | "posted" | "failed";

export interface IPost extends Document {
  userId: mongoose.Types.ObjectId;
  isGuest: boolean;
  expiresAt?: Date;
  heroProfileId?: mongoose.Types.ObjectId;
  content: string;
  type: PostType;
  hashtags: string[];
  targetGroups: string[];
  status: PostStatus;
  scheduledFor?: Date;
  postedAt?: Date;
  engagement: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    impressions: number;
  };
  linkedinPostUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PostSchema = new Schema<IPost>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    heroProfileId: { type: Schema.Types.ObjectId, ref: "HeroProfile" },
    content: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "image", "carousel", "poll", "video", "article"],
      default: "text",
    },
    hashtags: [String],
    targetGroups: [String],
    status: {
      type: String,
      enum: ["draft", "scheduled", "posting", "posted", "failed"],
      default: "draft",
    },
    scheduledFor: Date,
    postedAt: Date,
    engagement: {
      views: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      impressions: { type: Number, default: 0 },
    },
    linkedinPostUrl: String,
    isGuest: { type: Boolean, default: false, index: true },
    expiresAt: { type: Date },
  },
  { timestamps: true }
);

// Auto-delete guest posts after expiresAt
PostSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });
PostSchema.index({ userId: 1, status: 1 });
PostSchema.index({ userId: 1, scheduledFor: 1 });

const Post: Model<IPost> =
  mongoose.models.Post || mongoose.model<IPost>("Post", PostSchema);

export default Post;
