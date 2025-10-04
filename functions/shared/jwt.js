const crypto = require('crypto');

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  const pad = 4 - (str.length % 4 || 4);
  const normalized = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad === 4 ? 0 : pad);
  return Buffer.from(normalized, 'base64');
}

function signDemoJWT({ sub, ttlMinutes, issuer, audience }, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    iss: issuer,
    aud: audience,
    iat: nowSeconds,
    exp: nowSeconds + ttlMinutes * 60,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

function verifyJWT(token, secret, { issuer, audience } = {}) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('invalid_token');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8'));
  if (header.alg !== 'HS256') {
    throw new Error('unsupported_algorithm');
  }
  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest();

  const actualSignature = base64UrlDecode(encodedSignature);
  const signaturesMatch = crypto.timingSafeEqual(expectedSignature, actualSignature);
  if (!signaturesMatch) {
    throw new Error('invalid_signature');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && nowSeconds >= payload.exp) {
    throw new Error('token_expired');
  }
  if (issuer && payload.iss !== issuer) {
    throw new Error('invalid_issuer');
  }
  if (audience && payload.aud !== audience) {
    throw new Error('invalid_audience');
  }
  return payload;
}

module.exports = {
  signDemoJWT,
  verifyJWT,
};
