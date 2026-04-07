const WEAK_SECRETS = new Set([
  'secret',
  'password',
  'changeme',
  'change-this-to-a-random-secret',
  'change-this-to-a-different-random-secret',
  'change-this-to-a-random-secret-for-cron-jobs',
  'test',
  'dev',
  'development',
  'sk_test_',
  'pk_test_',
]);

interface SecretSpec {
  name: string;
  required: boolean;
  minLength: number;
  category: 'auth' | 'provider' | 'payment' | 'infra' | 'feature';
  description: string;
}

const SECRET_SPECS: SecretSpec[] = [
  {
    name: 'JWT_SECRET',
    required: true,
    minLength: 32,
    category: 'auth',
    description: 'JWT token signing key',
  },
  {
    name: 'PROVENANCE_SIGNING_KEY',
    required: true,
    minLength: 32,
    category: 'auth',
    description:
      'DPR chain integrity signing key (must differ from JWT_SECRET)',
  },
  {
    name: 'CRON_SECRET',
    required: true,
    minLength: 16,
    category: 'auth',
    description: 'Cron job authorization secret',
  },
  {
    name: 'OLLAMA_BASE_URL',
    required: false,
    minLength: 10,
    category: 'provider',
    description:
      'Optional Ollama base URL override (defaults to http://localhost:11434)',
  },
  {
    name: 'OLLAMA_API_KEY',
    required: false,
    minLength: 8,
    category: 'provider',
    description: 'Optional Ollama API key for authenticated Ollama endpoints',
  },
  {
    name: 'OLLAMA_AUTH_HEADER',
    required: false,
    minLength: 4,
    category: 'provider',
    description: 'Optional Ollama auth header name (defaults to Authorization)',
  },
  {
    name: 'OLLAMA_AUTH_SCHEME',
    required: false,
    minLength: 4,
    category: 'provider',
    description:
      'Optional Ollama auth scheme (defaults to Bearer, use none for raw header value)',
  },
  {
    name: 'OPENAI_API_KEY',
    required: false,
    minLength: 20,
    category: 'provider',
    description: 'Optional OpenAI lifeguard API key for rare escalation paths',
  },
  {
    name: 'STRIPE_SECRET_KEY',
    required: true,
    minLength: 20,
    category: 'payment',
    description: 'Stripe secret API key',
  },
  {
    name: 'STRIPE_WEBHOOK_SECRET',
    required: true,
    minLength: 20,
    category: 'payment',
    description: 'Stripe webhook signing secret',
  },
  {
    name: 'STRIPE_PUBLISHABLE_KEY',
    required: true,
    minLength: 20,
    category: 'payment',
    description: 'Stripe publishable key',
  },
  {
    name: 'STRIPE_PRICE_ID',
    required: true,
    minLength: 5,
    category: 'payment',
    description: 'Stripe price ID for subscription plan',
  },
  {
    name: 'STRIPE_CONTINUOUS_PRICE_ID',
    required: true,
    minLength: 5,
    category: 'payment',
    description: 'Stripe metered usage price ID',
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN',
    required: true,
    minLength: 20,
    category: 'infra',
    description: 'Upstash Redis REST token',
  },
];

interface ValidationError {
  secret: string;
  reason: string;
  severity: 'critical' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  validatedAt: string;
}

const validatedSecrets = new Map<string, string>();
let validationCache: ValidationResult | null = null;

function isWeakSecret(value: string): boolean {
  const lower = value.toLowerCase().trim();
  for (const weak of WEAK_SECRETS) {
    if (lower === weak) {
      return true;
    }
  }
  return false;
}

export function hasLowEntropy(value: string): boolean {
  const unique = new Set(value.split('')).size;
  const ratio = unique / value.length;
  return ratio < 0.3;
}

export function validateSecrets(): ValidationResult {
  if (validationCache) {
    return validationCache;
  }

  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  for (const spec of SECRET_SPECS) {
    const value = process.env[spec.name];

    if (!value) {
      if (spec.required) {
        errors.push({
          secret: spec.name,
          reason: `Missing required secret: ${spec.description}`,
          severity: 'critical',
        });
      }
      continue;
    }

    if (value.length < spec.minLength) {
      errors.push({
        secret: spec.name,
        reason: `Below minimum length (${value.length}/${spec.minLength} chars)`,
        severity: 'critical',
      });
    }

    if (isWeakSecret(value)) {
      errors.push({
        secret: spec.name,
        reason: 'Contains weak or default value',
        severity: 'critical',
      });
    }

    if (value.length >= 16 && hasLowEntropy(value)) {
      warnings.push({
        secret: spec.name,
        reason: 'Low entropy detected — consider using a stronger random value',
        severity: 'warning',
      });
    }

    validatedSecrets.set(spec.name, '[REDACTED]');
  }

  const jwtSecret = process.env.JWT_SECRET;
  const provSecret = process.env.PROVENANCE_SIGNING_KEY;
  if (jwtSecret && provSecret && jwtSecret === provSecret) {
    errors.push({
      secret: 'JWT_SECRET/PROVENANCE_SIGNING_KEY',
      reason:
        'JWT_SECRET and PROVENANCE_SIGNING_KEY must differ for key isolation',
      severity: 'critical',
    });
  }

  const openaiOverrideEnabled =
    (process.env.OPENAI_LIFEGUARD_ENABLED ?? '').trim().toLowerCase() ===
    'true';
  if (openaiOverrideEnabled && !process.env.OPENAI_API_KEY) {
    warnings.push({
      secret: 'OPENAI_API_KEY',
      reason:
        'OPENAI_LIFEGUARD_ENABLED=true but OPENAI_API_KEY is not set. Rare lifeguard escalation will be unavailable.',
      severity: 'warning',
    });
  }

  if (isProduction) {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (stripeKey && stripeKey.startsWith('sk_test_')) {
      warnings.push({
        secret: 'STRIPE_SECRET_KEY',
        reason: 'Using test key in production environment',
        severity: 'warning',
      });
    }
  }

  validationCache = {
    valid: errors.length === 0,
    errors,
    warnings,
    validatedAt: new Date().toISOString(),
  };

  return validationCache;
}

export function getValidatedSecret(name: string): string | undefined {
  const result = validateSecrets();
  const error = result.errors.find((e) => e.secret === name);
  if (error) {
    throw new Error(`Secret validation failed for ${name}: ${error.reason}`);
  }
  return process.env[name];
}

export function scrubSecrets(): void {
  for (const key of validatedSecrets.keys()) {
    validatedSecrets.set(key, '[SCRUBBED]');
  }
  validationCache = null;
}

/** Clear validation cache — exposed for test isolation only. */
export function resetValidationCache(): void {
  validationCache = null;
  validatedSecrets.clear();
}

export function getSecretStatus(): Record<
  string,
  { present: boolean; valid: boolean }
> {
  const result = validateSecrets();
  const status: Record<string, { present: boolean; valid: boolean }> = {};

  for (const spec of SECRET_SPECS) {
    const hasError = result.errors.some((e) => e.secret === spec.name);
    status[spec.name] = {
      present: !!process.env[spec.name],
      valid: !hasError,
    };
  }

  return status;
}

export function enforceSecretGovernance(): void {
  const result = validateSecrets();

  if (!result.valid) {
    const critical = result.errors.filter((e) => e.severity === 'critical');
    const messages = critical
      .map((e) => `  - ${e.secret}: ${e.reason}`)
      .join('\n');
    throw new Error(
      `Secret governance validation failed:\n${messages}\n\nFix these issues before starting the application.`
    );
  }

  if (result.warnings.length > 0) {
    const messages = result.warnings
      .map((w) => `  - ${w.secret}: ${w.reason}`)
      .join('\n');
    console.warn(`[secrets] Validation warnings:\n${messages}`);
  }

  console.log(`[secrets] Governance check passed at ${result.validatedAt}`);
}

export function createRedactedEnv(): Record<string, string> {
  const redacted: Record<string, string> = {};
  const sensitivePatterns = [
    /SECRET/i,
    /KEY/i,
    /TOKEN/i,
    /PASSWORD/i,
    /API_KEY/i,
    /SIGNING/i,
  ];

  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    const isSensitive = sensitivePatterns.some((p) => p.test(key));
    redacted[key] = isSensitive ? '[REDACTED]' : value;
  }

  return redacted;
}
