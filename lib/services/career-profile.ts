/**
 * Career Profile Service
 * Standalone career data bank for AI resume source = "data"
 */

import connectDB from "@/lib/db/connection";
import CareerProfile, { type ICareerProfile } from "@/lib/db/models/career-profile";

export type CareerProfileData = {
  contactInfo: ICareerProfile["contactInfo"];
  summary: string;
  experience: ICareerProfile["experience"];
  education: ICareerProfile["education"];
  skills: string[];
  certifications: ICareerProfile["certifications"];
  projects: ICareerProfile["projects"];
};

const emptyProfile = (): CareerProfileData => ({
  contactInfo: {},
  summary: "",
  experience: [],
  education: [],
  skills: [],
  certifications: [],
  projects: [],
});

export async function getCareerProfile(userId: string): Promise<CareerProfileData | null> {
  await connectDB();
  const doc = await CareerProfile.findOne({ userId }).lean();
  if (!doc) return null;
  return {
    contactInfo: doc.contactInfo || {},
    summary: doc.summary || "",
    experience: doc.experience || [],
    education: doc.education || [],
    skills: doc.skills || [],
    certifications: doc.certifications || [],
    projects: doc.projects || [],
  };
}

export async function upsertCareerProfile(
  userId: string,
  data: Partial<CareerProfileData>
): Promise<CareerProfileData> {
  await connectDB();

  const update: Record<string, unknown> = {};
  if (data.contactInfo !== undefined) update.contactInfo = data.contactInfo;
  if (data.summary !== undefined) update.summary = data.summary;
  if (data.experience !== undefined) update.experience = data.experience;
  if (data.education !== undefined) update.education = data.education;
  if (data.skills !== undefined) update.skills = data.skills;
  if (data.certifications !== undefined) update.certifications = data.certifications;
  if (data.projects !== undefined) update.projects = data.projects;

  const doc = await CareerProfile.findOneAndUpdate(
    { userId },
    { $set: update, $setOnInsert: { userId } },
    { upsert: true, new: true, lean: true }
  );

  if (!doc) return emptyProfile();

  return {
    contactInfo: doc.contactInfo || {},
    summary: doc.summary || "",
    experience: doc.experience || [],
    education: doc.education || [],
    skills: doc.skills || [],
    certifications: doc.certifications || [],
    projects: doc.projects || [],
  };
}

export function careerProfileHasContent(profile: CareerProfileData | null | undefined): boolean {
  if (!profile) return false;
  return (
    (profile.experience?.length || 0) > 0 ||
    (profile.projects?.length || 0) > 0 ||
    (profile.skills?.length || 0) > 0 ||
    !!profile.summary?.trim() ||
    (profile.education?.length || 0) > 0
  );
}
