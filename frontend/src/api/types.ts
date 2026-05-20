export interface ProfileCreatePayload {
  name: string;
  current_role: string;
  years_experience: number;
  bio: string;
  skills: string[];
}

export interface DetectedSkill {
  name: string;
  level: string;
  confidence: number;
}

export interface Analysis {
  detected_skills: DetectedSkill[];
  interests: string[];
  analyzed_at: string;
}

export interface RecommendationStep {
  title: string;
  skills_to_develop: string[];
  duration_weeks: number;
}

export interface Recommendation {
  title: string;
  description: string;
  duration_months: number;
  steps: RecommendationStep[];
}

export type ProfileStatus = "pending_analysis" | "analyzing" | "completed";

export interface ProfileCreateResponse {
  id: string;
  name: string;
  status: ProfileStatus;
  created_at: string;
}

export interface ProfileResponse {
  id: string;
  name: string;
  current_role: string;
  years_experience: number;
  bio: string;
  status: ProfileStatus;
  analysis: Analysis | null;
  recommendations: Recommendation[];
}

export interface AnalyzeResponse {
  status: string;
  message: string;
}
