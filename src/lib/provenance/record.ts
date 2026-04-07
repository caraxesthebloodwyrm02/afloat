import { v4 as uuidv4 } from 'uuid';
import { computeHash, computeChainHash } from './chain';
import { signRecord } from './signer';
import type { DecisionProvenanceRecord, DPRCreateInput } from './types';

const PROVENANCE_VERSION = '1.0.0';

export function serializeDPRForHashing(
  dpr: Omit<DecisionProvenanceRecord, 'chain_hash' | 'signature'>
): string {
  const ordered = JSON.stringify(dpr, Object.keys(dpr).sort());
  return ordered;
}

export function createDPR(
  input: DPRCreateInput,
  parentDPR: {
    dpr_id: string;
    chain_hash: string;
    sequence_number: number;
  } | null
): DecisionProvenanceRecord {
  const dpr_id = uuidv4();
  const timestamp = new Date().toISOString();
  const sequence_number = parentDPR ? parentDPR.sequence_number + 1 : 0;

  const output_hash = input.output_content
    ? computeHash(input.output_content)
    : computeHash('');

  const input_context_hash = input.input_context
    ? computeHash(input.input_context)
    : computeHash('');

  const partial: Omit<DecisionProvenanceRecord, 'chain_hash' | 'signature'> = {
    dpr_id,
    parent_dpr_id: parentDPR?.dpr_id ?? null,
    timestamp,
    sequence_number,
    decision_type: input.decision_type,
    action_taken: input.action_taken,
    output_hash,
    input_context_hash,
    model_id: input.model_id ?? null,
    model_parameters: input.model_parameters ?? null,
    confidence: input.confidence ?? null,
    reasoning_summary: input.reasoning_summary,
    authority_type: input.authority_type,
    actor_id: input.actor_id,
    consent_reference: input.consent_reference ?? null,
    safety_verdicts: input.safety_verdicts ?? [],
    risk_tier: input.risk_tier ?? null,
    jurisdiction: input.jurisdiction ?? null,
    provenance_version: PROVENANCE_VERSION,
  };

  const serialized = serializeDPRForHashing(partial);
  const chain_hash = computeChainHash(
    parentDPR?.chain_hash ?? null,
    serialized
  );

  const withChain = { ...partial, chain_hash };
  const fullSerialized = JSON.stringify(
    withChain,
    Object.keys(withChain).sort()
  );
  const signature = signRecord(fullSerialized);

  return { ...withChain, signature };
}

export function getChainRef(dpr: DecisionProvenanceRecord): {
  dpr_id: string;
  chain_hash: string;
  sequence_number: number;
} {
  return {
    dpr_id: dpr.dpr_id,
    chain_hash: dpr.chain_hash,
    sequence_number: dpr.sequence_number,
  };
}
