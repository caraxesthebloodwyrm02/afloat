import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateSession = vi.fn();
const mockRetrieveSession = vi.fn();
const mockConstructEvent = vi.fn();
const mockMeterEventCreate = vi.fn();
const mockCustomerDelete = vi.fn();
const mockStripeConstructor = vi.fn();

class MockStripe {
  checkout = {
    sessions: {
      create: mockCreateSession,
      retrieve: mockRetrieveSession,
    },
  };

  webhooks = {
    constructEvent: mockConstructEvent,
  };

  billing = {
    meterEvents: {
      create: mockMeterEventCreate,
    },
  };

  customers = {
    del: mockCustomerDelete,
  };

  constructor(key: string) {
    mockStripeConstructor(key);
  }
}

vi.mock('stripe', () => ({
  default: MockStripe,
}));

describe('stripe helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it('reports whether Stripe is configured', async () => {
    const { isStripeConfigured } = await import('@/lib/stripe');

    expect(isStripeConfigured()).toBe(false);

    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    expect(isStripeConfigured()).toBe(true);
  });

  it('throws when creating a client without STRIPE_SECRET_KEY', async () => {
    const { getStripe } = await import('@/lib/stripe');

    expect(() => getStripe()).toThrow(/Missing STRIPE_SECRET_KEY/);
  });

  it('creates a standard checkout session with subscription mode', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    mockCreateSession.mockResolvedValueOnce({ id: 'cs_123' });

    const { createCheckoutSession } = await import('@/lib/stripe');
    await createCheckoutSession(
      'price_trial',
      'https://afloat.example/success',
      'https://afloat.example/cancel'
    );

    expect(mockCreateSession).toHaveBeenCalledWith({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: 'price_trial', quantity: 1 }],
      success_url:
        'https://afloat.example/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://afloat.example/cancel',
    });
  });

  it('creates a metered checkout session without forcing quantity', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    mockCreateSession.mockResolvedValueOnce({ id: 'cs_metered' });

    const { createMeteredCheckoutSession } = await import('@/lib/stripe');
    await createMeteredCheckoutSession(
      'price_metered',
      'https://afloat.example/success',
      'https://afloat.example/cancel'
    );

    expect(mockCreateSession).toHaveBeenCalledWith({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: 'price_metered' }],
      success_url:
        'https://afloat.example/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://afloat.example/cancel',
    });
  });

  it('retrieves checkout sessions with expansion options', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    mockRetrieveSession.mockResolvedValueOnce({ id: 'cs_123' });

    const { retrieveCheckoutSession } = await import('@/lib/stripe');
    await retrieveCheckoutSession('cs_123');

    expect(mockRetrieveSession).toHaveBeenCalledWith('cs_123', {
      expand: ['subscription', 'customer'],
    });
  });

  it('throws when constructing a webhook event without a webhook secret', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');

    const { constructWebhookEvent } = await import('@/lib/stripe');
    await expect(constructWebhookEvent('{}', 'sig_123')).rejects.toThrow(
      /Missing STRIPE_WEBHOOK_SECRET/
    );
  });

  it('constructs webhook events when configuration is present', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_123');
    mockConstructEvent.mockReturnValueOnce({ id: 'evt_123' });

    const { constructWebhookEvent } = await import('@/lib/stripe');
    const event = await constructWebhookEvent('{}', 'sig_123');

    expect(event).toEqual({ id: 'evt_123' });
    expect(mockConstructEvent).toHaveBeenCalledWith(
      '{}',
      'sig_123',
      'whsec_123'
    );
  });

  it('reports usage with the default meter event name', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');

    const { reportUsage } = await import('@/lib/stripe');
    await reportUsage('cus_123', 5, 1_700_000_000);

    expect(mockMeterEventCreate).toHaveBeenCalledWith({
      event_name: 'afloat_sessions',
      payload: {
        stripe_customer_id: 'cus_123',
        value: '5',
      },
      timestamp: 1_700_000_000,
    });
  });

  it('reports usage with a custom meter event name', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');
    vi.stubEnv('STRIPE_METER_EVENT_NAME', 'custom_event');

    const { reportUsage } = await import('@/lib/stripe');
    await reportUsage('cus_123', 8, 1_700_000_001);

    expect(mockMeterEventCreate).toHaveBeenCalledWith({
      event_name: 'custom_event',
      payload: {
        stripe_customer_id: 'cus_123',
        value: '8',
      },
      timestamp: 1_700_000_001,
    });
  });

  it('deletes Stripe customers', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');

    const { deleteStripeCustomer } = await import('@/lib/stripe');
    await deleteStripeCustomer('cus_delete');

    expect(mockCustomerDelete).toHaveBeenCalledWith('cus_delete');
  });
});
