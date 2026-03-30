export interface ConsentGrant {
  granted: boolean;
  timestamp: string;
  policy_version: string;
}

export interface UserConsents {
  essential_processing: ConsentGrant;
  session_telemetry: ConsentGrant;
  marketing_communications: ConsentGrant;
  routing_memory: ConsentGrant;
}

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "pending";

export type SubscriptionTier = "trial" | "continuous";

export type RoutingTaskType = "coding" | "analysis" | "quick" | "general";
export type RoutingScope = "fast" | "balanced" | "deep_read";
export type RoutingSentiment = "positive" | "neutral" | "frustrated";
export type RoutingProvider = "ollama" | "openai";

export interface RoutingModelPerformance {
  provider: RoutingProvider;
  success_count: number;
  failure_count: number;
  average_latency_ms: number;
  last_used_at: string;
}

export interface RoutingTaskMemory {
  last_intent: string;
  recent_intents: string[];
  last_task_type: RoutingTaskType;
  sentiment: RoutingSentiment;
  deep_read_preference: number;
}

export interface RoutingEscalationStats {
  openai_auto_count: number;
  openai_forced_count: number;
  last_escalated_at: string | null;
}

export interface RoutingMemoryProfile {
  user_id: string;
  created_at: string;
  updated_at: string;
  preferred_models: string[];
  model_performance: Record<string, RoutingModelPerformance>;
  task_memory: RoutingTaskMemory;
  escalation: RoutingEscalationStats;
}

export interface UserRecord {
  user_id: string;
  stripe_customer_id: string;
  subscription_status: SubscriptionStatus;
  subscription_tier: SubscriptionTier;
  billing_cycle_anchor: string;
  consents: UserConsents;
  stripe_subscription_item_id?: string;
  display_name?: string;
  email_preference?: string;
  pending_deletion?: {
    requested_at: string;
    deletion_date: string;
  } | null;
}
