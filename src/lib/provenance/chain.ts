import { createHash } from 'crypto';

export function computeHash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function computeChainHash(
  parentChainHash: string | null,
  serializedRecord: string
): string {
  const seed = parentChainHash ?? 'genesis';
  return computeHash(seed + serializedRecord);
}

export function verifyChainIntegrity(
  records: Array<{ chain_hash: string; parent_dpr_id: string | null }>,
  recomputeHash: (index: number) => string
): { valid: boolean; broken_at: number | null } {
  for (let i = 0; i < records.length; i++) {
    const expected = recomputeHash(i);
    if (records[i].chain_hash !== expected) {
      return { valid: false, broken_at: i };
    }
  }
  return { valid: true, broken_at: null };
}
