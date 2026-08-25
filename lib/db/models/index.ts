export { default as User } from "./user";
export type { IUser } from "./user";

export { default as Resume } from "./resume";
export type { IResume } from "./resume";

export { default as JobSearch } from "./job-search";
export type { IJobSearch } from "./job-search";

export { default as JobApplication } from "./job-application";
export type { IJobApplication, ApplicationStatus } from "./job-application";

export { default as HeroProfile } from "./hero-profile";
export type { IHeroProfile } from "./hero-profile";

export { default as Post } from "./post";
export type { IPost, PostType, PostStatus } from "./post";

export { default as ScrapedData } from "./scraped-data";
export type { IScrapedData } from "./scraped-data";

export { default as ScraperConfig } from "./scraper-config";
export type { IScraperConfig } from "./scraper-config";

export { default as ActivityLog } from "./activity-log";
export type { IActivityLog } from "./activity-log";

export { default as DailyUsage } from "./daily-usage";
export type { IDailyUsage } from "./daily-usage";

export { default as Notification } from "./notification";
export type { INotification } from "./notification";

export { default as VerificationToken } from "./verification-token";
export type { IVerificationToken } from "./verification-token";
export { generateOTP, generateResetToken } from "./verification-token";

export { default as OutreachTemplate } from "./outreach-template";
export type { IOutreachTemplate } from "./outreach-template";

export { default as ConnectionRequest } from "./connection-request";
export type { IConnectionRequest, ConnectionRequestStatus } from "./connection-request";

export { default as ProfileAnalysis } from "./profile-analysis";
export type { IProfileAnalysis } from "./profile-analysis";

export { default as InterviewPrep } from "./interview-prep";
export type { IInterviewPrep, IInterviewQuestion, ICompanyResearch, ISalaryInsights } from "./interview-prep";

export { default as MarketInsight } from "./market-insight";
export type { IMarketInsight, MarketInsightType } from "./market-insight";

export { default as LeadGenCampaign } from "./lead-gen-campaign";
export type { ILeadGenCampaign, CampaignStatus, ILeadComment } from "./lead-gen-campaign";

export { default as LinkedInJobOptimization } from "./linkedin-job-optimization";
export type {
  ILinkedInJobOptimization,
  IProfileSnapshot,
  IJobOptimizationAnalysis,
} from "./linkedin-job-optimization";

// ─── Autopilot ──────────────────────────────────────────────────────────────

export { default as AgentConfig, TASK_KINDS, IMPLEMENTED_TASK_KINDS, DEFAULT_WEEKLY_BUDGETS, autonomyFor } from "./agent-config";
export type { IAgentConfig, TaskKind, AutonomyMode, IWeeklyBudgets } from "./agent-config";

export { default as AgentGoal } from "./agent-goal";
export type {
  IAgentGoal,
  ISuccessMetric,
  ISubGoal,
  IGoalConstraints,
  IPersonaSnapshot,
} from "./agent-goal";

export { default as AgentCycle, DEFAULT_CHANNEL_MIX } from "./agent-cycle";
export type {
  IAgentCycle,
  CycleStatus,
  IChannelMix,
  ICycleTarget,
  ICycleActual,
} from "./agent-cycle";

export { default as AgentMemory } from "./agent-memory";
export type { IAgentMemory, MemoryKind, IMemoryEvidence } from "./agent-memory";

export { default as AgentJournal } from "./agent-journal";
export type { IAgentJournal, JournalEntryType, IJournalRefs } from "./agent-journal";

export { default as AgentTask, ACTIVE_TASK_STATES } from "./agent-task";
export type { IAgentTask, TaskState } from "./agent-task";

export { default as AgentTarget, ACTIVE_STAGES } from "./agent-target";
export type { IAgentTarget, TargetStage, TouchpointKind, ITouchpoint } from "./agent-target";

export { default as AgentThread } from "./agent-thread";
export type { IAgentThread, ThreadIntent, ThreadUrgency } from "./agent-thread";
