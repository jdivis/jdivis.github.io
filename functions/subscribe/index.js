const { randomUUID } = require('crypto');

function createSasToken(uri, keyName, key, expirySeconds = 3600) {
  const encodedUri = encodeURIComponent(uri.toLowerCase());
  const expiry = Math.floor(Date.now() / 1000) + expirySeconds;
  const stringToSign = `${encodedUri}\n${expiry}`;
  const hmac = require('crypto').createHmac('sha256', key).update(stringToSign).digest('base64');
  const signature = encodeURIComponent(hmac);
  return `SharedAccessSignature sr=${encodedUri}&sig=${signature}&se=${expiry}&skn=${encodeURIComponent(keyName)}`;
}

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    context.res = { status: 405, body: { error: 'method_not_allowed' } };
    return;
  }

  const subscription = req.body;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    context.res = { status: 400, body: { error: 'invalid_subscription' } };
    return;
  }

  const namespace = process.env.NH_NAMESPACE;
  const hub = process.env.NH_HUB;
  const sasName = process.env.NH_SAS_NAME || 'DefaultFullSharedAccessSignature';
  const sasKey = process.env.NH_SAS_KEY;

  if (!namespace || !hub || !sasKey) {
    context.log.error('Notification Hubs configuration missing.');
    context.res = { status: 500, body: { error: 'server_misconfigured' } };
    return;
  }

  const installationId = randomUUID();
  const resourceUri = `https://${namespace}.servicebus.windows.net/${hub}/installations/${installationId}`;
  const sas = createSasToken(resourceUri, sasName, sasKey, 900);

  const installation = {
    installationId,
    platform: 'browser',
    tags: ['all'],
    pushChannel: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  };

  try {
    const response = await fetch(`${resourceUri}?api-version=2015-01`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: sas,
      },
      body: JSON.stringify(installation),
    });

    if (!response.ok) {
      const body = await response.text();
      context.log.error('Notification Hub installation failed', response.status, body);
      context.res = { status: 502, body: { error: 'notification_hub_error' } };
      return;
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true, installationId },
    };
  } catch (error) {
    context.log.error('Failed to register push subscription', error);
    context.res = { status: 500, body: { error: 'subscription_failed' } };
  }
};
