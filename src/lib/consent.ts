import type { UserConsents, ConsentGrant } from "@/types/user";

const CURRENT_POLICY_VERSION = "v1.0";

export function createDefaultConsents(
  essentialProcessing: boolean,
  sessionTelemetry: boolean,
  marketingCommunications: boolean,
  routingMemory: boolean = false
): UserConsents {
  const now = new Date().toISOString();
  return {
    essential_processing: {
      granted: essentialProcessing,
      timestamp: now,
      policy_version: CURRENT_POLICY_VERSION,
    },
    session_telemetry: {
      granted: sessionTelemetry,
      timestamp: now,
      policy_version: CURRENT_POLICY_VERSION,
    },
    marketing_communications: {
      granted: marketingCommunications,
      timestamp: now,
      policy_version: CURRENT_POLICY_VERSION,
    },
    routing_memory: {
      granted: routingMemory,
      timestamp: now,
      policy_version: CURRENT_POLICY_VERSION,
    },
  };
}

export function updateConsent(
  current: ConsentGrant,
  granted: boolean
): ConsentGrant {
  return {
    granted,
    timestamp: new Date().toISOString(),
    policy_version: CURRENT_POLICY_VERSION,
  };
}

export function shouldWriteTelemetry(consents: UserConsents): boolean {
  return consents.session_telemetry.granted;
}

export function shouldWriteRoutingMemory(consents: UserConsents): boolean {
  return consents.routing_memory?.granted ?? false;
}

export function getPolicyVersion(): string {
  return CURRENT_POLICY_VERSION;
}
