const { randomUUID } = require('crypto');
const { signDemoJWT } = require('../shared/jwt');

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    context.res = { status: 405, body: { error: 'method_not_allowed' } };
    return;
  }

  const turnstileToken = req.body?.turnstileToken;
  if (!turnstileToken) {
    context.res = { status: 400, body: { error: 'missing_turnstile_token' } };
    return;
  }

  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    context.log.error('TURNSTILE_SECRET is not configured.');
    context.res = { status: 500, body: { error: 'server_misconfigured' } };
    return;
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', secret);
    params.append('response', turnstileToken);
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim();
    if (ip) {
      params.append('remoteip', ip);
    }

    const verification = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: params,
    });

    if (!verification.ok) {
      context.log.warn('Turnstile verification failed with status', verification.status);
      context.res = { status: 502, body: { error: 'turnstile_unreachable' } };
      return;
    }

    const verificationResult = await verification.json();
    if (!verificationResult.success) {
      context.log.warn('Turnstile verification unsuccessful', verificationResult);
      context.res = { status: 400, body: { error: 'turnstile_failed' } };
      return;
    }

    // TODO: Persist issuance counters per IP/ASN in Table Storage for additional throttling.

    const jwtSecret = process.env.JWT_SECRET;
    const issuer = process.env.JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE;
    if (!jwtSecret || !issuer || !audience) {
      context.log.error('JWT configuration missing.');
      context.res = { status: 500, body: { error: 'server_misconfigured' } };
      return;
    }

    const token = signDemoJWT(
      {
        sub: randomUUID(),
        ttlMinutes: Number.parseInt(process.env.JWT_TTL_MINUTES || '45', 10),
        issuer,
        audience,
      },
      jwtSecret
    );

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { token },
    };
  } catch (error) {
    context.log.error('Failed to verify Turnstile token', error);
    context.res = { status: 500, body: { error: 'turnstile_verification_error' } };
  }
};
