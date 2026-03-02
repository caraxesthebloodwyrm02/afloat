import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateSecrets, hasLowEntropy, resetValidationCache } from '../src/lib/secrets';

const originalEnv = { ...process.env };

/** Helper: set all required secrets with high-entropy valid values */
function setValidEnv() {
  process.env.JWT_SECRET = 'B9WqS5sMazj8bfDlHkktwSv7jI6r74nxYnMkA1Re4E';
  process.env.PROVENANCE_SIGNING_KEY = 'NsRYe4D6gqT8mh300LKybRZ0kTRBfoAXTPTEmOPGG1I';
  process.env.CRON_SECRET = 'RcyltHzXg2mH6Fwag4ARwXz5';
  process.env.OPENAI_API_KEY = 'sk-Xt9mW3kR7vL2nQ8sY4hB6cJ1fA5dE';
  process.env.STRIPE_SECRET_KEY = 'sk_live_5add2fd69527664455fbd6b05e1207e10b72e9f29c464bab';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_Kx7mW3kR7vL2nQ8sY4hB6cJ1fA5dE';
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'XpT9mW3kR7vL2nQ8sY4hB6cJ';
}

describe('Secret Validation', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    resetValidationCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetValidationCache();
  });

  describe('hasLowEntropy function', () => {
    it('should detect low entropy in hex strings', () => {
      const hexString = '6602544f7a44d48f4411c843d28e827621bcef84fc522ce1ca9616185d8b3e7b';
      expect(hasLowEntropy(hexString)).toBe(true);
    });

    it('should accept high entropy base64 strings', () => {
      const base64String = 'B9WqS5sMazj8bfDlHkktwSv7jI6r74nxYnMkA1Re4E';
      expect(hasLowEntropy(base64String)).toBe(false);
    });

    it('should detect low entropy in repetitive strings', () => {
      const repetitiveString = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      expect(hasLowEntropy(repetitiveString)).toBe(true);
    });

    it('should accept sequential strings with high unique ratio', () => {
      // 25 unique chars in 50 length = 0.50 ratio — passes the 0.3 threshold
      const sequentialString = 'abcdefghijklmnopqrstuvwxyabcdefghijklmnopqrstuvwxy';
      expect(hasLowEntropy(sequentialString)).toBe(false);
    });

    it('should accept strings with good character distribution', () => {
      const goodString = 'B9WqS5sMazj8bfDlHkktwSv7jI6r74nxYnMkA1Re4E';
      expect(hasLowEntropy(goodString)).toBe(false);
    });
  });

  describe('validateSecrets function', () => {
    it('should pass with valid high-entropy secrets', () => {
      setValidEnv();

      const result = validateSecrets();
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.valid).toBe(true);
    });

    it('should fail with missing required secrets', () => {
      setValidEnv();
      delete process.env.JWT_SECRET;
      delete process.env.PROVENANCE_SIGNING_KEY;

      const result = validateSecrets();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.valid).toBe(false);

      const jwtError = result.errors.find(e => e.secret === 'JWT_SECRET');
      expect(jwtError).toBeDefined();
      expect(jwtError?.reason).toContain('Missing required secret');
    });

    it('should fail with secrets below minimum length', () => {
      setValidEnv();
      process.env.JWT_SECRET = 'short';
      process.env.PROVENANCE_SIGNING_KEY = 'also_short';

      const result = validateSecrets();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.valid).toBe(false);

      const jwtError = result.errors.find(e => e.secret === 'JWT_SECRET');
      expect(jwtError).toBeDefined();
      expect(jwtError?.reason).toContain('Below minimum length');
    });

    it('should warn about low entropy secrets', () => {
      setValidEnv();
      // Override with hex-encoded (low entropy) values
      process.env.JWT_SECRET = '6602544f7a44d48f4411c843d28e827621bcef84fc522ce1ca9616185d8b3e7b';
      process.env.PROVENANCE_SIGNING_KEY = 'cc4c44f0576884f82b8fd5b80200e2ab0c8ac8fcf3a10028514214ea0e36c74d';
      process.env.CRON_SECRET = 'a65ec9f7994188a097353bcd90a95e20922967a3ce3ec3b3926bef1bcf17f368';

      const result = validateSecrets();
      expect(result.warnings.length).toBeGreaterThan(0);

      const lowEntropyWarnings = result.warnings.filter(w => w.reason.includes('Low entropy'));
      expect(lowEntropyWarnings.length).toBeGreaterThan(0);
    });

    it('should detect weak default values', () => {
      setValidEnv();
      process.env.JWT_SECRET = 'change-this-to-a-random-secret';
      process.env.PROVENANCE_SIGNING_KEY = 'change-this-to-a-different-random-secret';
      process.env.CRON_SECRET = 'change-this-to-a-random-secret-for-cron-jobs';

      const result = validateSecrets();
      expect(result.errors.length).toBeGreaterThan(0);

      const weakErrors = result.errors.filter(e => e.reason.includes('weak or default value'));
      expect(weakErrors.length).toBe(3);
    });

    it('should detect JWT_SECRET and PROVENANCE_SIGNING_KEY collision', () => {
      setValidEnv();
      const sameSecret = 'B9WqS5sMazj8bfDlHkktwSv7jI6r74nxYnMkA1Re4E';
      process.env.JWT_SECRET = sameSecret;
      process.env.PROVENANCE_SIGNING_KEY = sameSecret;

      const result = validateSecrets();
      expect(result.errors.length).toBeGreaterThan(0);

      const collisionError = result.errors.find(e => e.reason.includes('must differ'));
      expect(collisionError).toBeDefined();
    });
  });
});

describe('Secret Generation Utilities', () => {
  beforeEach(() => {
    resetValidationCache();
  });

  describe('Entropy Analysis', () => {
    it('should analyze entropy of different encoding methods', async () => {
      const crypto = await import('node:crypto');

      // Hex encoding (low entropy ratio)
      const hexSecret = crypto.randomBytes(32).toString('hex');
      const hexEntropy = new Set(hexSecret.split('')).size / hexSecret.length;
      expect(hexEntropy).toBeLessThan(0.3);

      // Base64 encoding (high entropy ratio)
      const base64Secret = crypto.randomBytes(32).toString('base64').replace(/[+/=]/g, '');
      const base64Entropy = new Set(base64Secret.split('')).size / base64Secret.length;
      expect(base64Entropy).toBeGreaterThan(0.5);
    });
  });

  describe('Secret Generation Functions', () => {
    it('should generate secrets with proper entropy', async () => {
      const crypto = await import('node:crypto');

      function generateStrongSecret(byteLength: number): string {
        return crypto.randomBytes(byteLength)
          .toString('base64')
          .replace(/[+/=]/g, '')
          .substring(0, byteLength * 2);
      }

      const jwtSecret = generateStrongSecret(32);
      const cronSecret = generateStrongSecret(16);

      expect(hasLowEntropy(jwtSecret)).toBe(false);
      expect(hasLowEntropy(cronSecret)).toBe(false);
      expect(jwtSecret.length).toBeGreaterThanOrEqual(32);
      expect(cronSecret.length).toBeGreaterThanOrEqual(16);
    });
  });
});
