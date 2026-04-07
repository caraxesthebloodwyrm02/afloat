import { describe, it, expect } from 'vitest';
import {
  createDefaultConsents,
  updateConsent,
  shouldWriteTelemetry,
  shouldWriteRoutingMemory,
} from '@/lib/consent';

describe('consent management', () => {
  it('creates default consents with specified values', () => {
    const consents = createDefaultConsents(true, false, false);
    expect(consents.essential_processing.granted).toBe(true);
    expect(consents.session_telemetry.granted).toBe(false);
    expect(consents.marketing_communications.granted).toBe(false);
    expect(consents.routing_memory.granted).toBe(false);
  });

  it('includes timestamps and policy version', () => {
    const consents = createDefaultConsents(true, true, false);
    expect(consents.essential_processing.timestamp).toBeTruthy();
    expect(consents.essential_processing.policy_version).toBe('v1.0');
  });

  it('updates a consent grant', () => {
    const consents = createDefaultConsents(true, false, false);
    const updated = updateConsent(consents.session_telemetry, true);
    expect(updated.granted).toBe(true);
    expect(updated.policy_version).toBe('v1.0');
  });

  it('shouldWriteTelemetry returns true when consented', () => {
    const consents = createDefaultConsents(true, true, false);
    expect(shouldWriteTelemetry(consents)).toBe(true);
  });

  it('shouldWriteTelemetry returns false when not consented', () => {
    const consents = createDefaultConsents(true, false, false);
    expect(shouldWriteTelemetry(consents)).toBe(false);
  });

  it('shouldWriteRoutingMemory returns true when consented', () => {
    const consents = createDefaultConsents(true, true, false, true);
    expect(shouldWriteRoutingMemory(consents)).toBe(true);
  });
});
