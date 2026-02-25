import { getRedis } from "../redis";
import type { DecisionProvenanceRecord } from "./types";

const DPR_STREAM_PREFIX = "provenance:";
const DPR_SESSION_PREFIX = "provenance:session:";

export async function storeDPR(
  dpr: DecisionProvenanceRecord,
  sessionId?: string
): Promise<void> {
  const redis = getRedis();
  const dateKey = dpr.timestamp.split("T")[0];

  await redis.rpush(
    `${DPR_STREAM_PREFIX}${dateKey}`,
    JSON.stringify(dpr)
  );

  if (sessionId) {
    await redis.rpush(
      `${DPR_SESSION_PREFIX}${sessionId}`,
      JSON.stringify(dpr)
    );
  }
}

export async function getSessionDPRs(
  sessionId: string
): Promise<DecisionProvenanceRecord[]> {
  const redis = getRedis();
  const entries = await redis.lrange(
    `${DPR_SESSION_PREFIX}${sessionId}`,
    0,
    -1
  );
  return entries.map((e) =>
    (typeof e === "string" ? JSON.parse(e) : e) as DecisionProvenanceRecord
  );
}

export async function getDPRById(
  dprId: string,
  sessionId: string
): Promise<DecisionProvenanceRecord | null> {
  const chain = await getSessionDPRs(sessionId);
  return chain.find((d) => d.dpr_id === dprId) ?? null;
}

export async function verifySessionChain(
  sessionId: string
): Promise<{ valid: boolean; total: number; broken_at: number | null }> {
  const { computeChainHash } = await import("./chain");
  const { serializeDPRForHashing } = await import("./record");
  const { verifySignature } = await import("./signer");

  const chain = await getSessionDPRs(sessionId);
  if (chain.length === 0) {
    return { valid: true, total: 0, broken_at: null };
  }

  for (let i = 0; i < chain.length; i++) {
    const dpr = chain[i];

    const { chain_hash, signature, ...rest } = dpr;
    const serialized = serializeDPRForHashing(
      rest as Omit<DecisionProvenanceRecord, "chain_hash" | "signature">
    );
    const parentHash = i > 0 ? chain[i - 1].chain_hash : null;
    const expectedChainHash = computeChainHash(parentHash, serialized);

    if (dpr.chain_hash !== expectedChainHash) {
      return { valid: false, total: chain.length, broken_at: i };
    }

    const withChain = { ...rest, chain_hash: dpr.chain_hash };
    const fullSerialized = JSON.stringify(withChain, Object.keys(withChain).sort());
    if (!verifySignature(fullSerialized, dpr.signature)) {
      return { valid: false, total: chain.length, broken_at: i };
    }
  }

  return { valid: true, total: chain.length, broken_at: null };
}
