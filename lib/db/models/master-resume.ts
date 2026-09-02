import mongoose, { Schema, type Document, type Model } from "mongoose";

/**
 * The user's own resume file, byte for byte.
 *
 * Deliberately NOT the generated/tailored PDF the rest of the app builds: an
 * application email attaches the document the user actually wants recruiters to
 * read, and they were explicit that it must not be regenerated per post. The
 * file is stored in Mongo rather than on disk because the app runs on hosts
 * with an ephemeral filesystem, and a resume PDF is a few hundred kilobytes —
 * three orders of magnitude inside the 16MB document limit.
 *
 * One per user: uploading again replaces it, so there is never a question of
 * which file went out with an application.
 */

export interface IMasterResume extends Document {
  userId: mongoose.Types.ObjectId;
  filename: string;
  contentType: string;
  size: number;
  data: Buffer;
  /** Extracted text, when we have it — lets the email prompt cite real detail. */
  textPreview?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MasterResumeSchema = new Schema<IMasterResume>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    filename: { type: String, required: true },
    contentType: { type: String, default: "application/pdf" },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    textPreview: { type: String, maxlength: 20000 },
  },
  { timestamps: true }
);

const MasterResume: Model<IMasterResume> =
  mongoose.models.MasterResume ||
  mongoose.model<IMasterResume>("MasterResume", MasterResumeSchema);

export default MasterResume;
