export interface ConsentGrant {
  granted: boolean;
  timestamp: string;
  policy_version: string;
}

export interface UserConsents {
  essential_processing: ConsentGrant;
  session_telemetry: ConsentGrant;
  marketing_communications: ConsentGrant;
}

export type SubscriptionStatus = "active" | "past_due" | "canceled" | "pending";

export interface UserRecord {
  user_id: string;
  stripe_customer_id: string;
  subscription_status: SubscriptionStatus;
  billing_cycle_anchor: string;
  consents: UserConsents;
  display_name?: string;
  email_preference?: string;
  pending_deletion?: {
    requested_at: string;
    deletion_date: string;
  } | null;
}
