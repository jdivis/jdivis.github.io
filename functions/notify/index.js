const crypto = require('crypto');

function createSasToken(uri, keyName, key, expirySeconds = 600) {
  const encodedUri = encodeURIComponent(uri.toLowerCase());
  const expiry = Math.floor(Date.now() / 1000) + expirySeconds;
  const stringToSign = `${encodedUri}\n${expiry}`;
  const hmac = crypto.createHmac('sha256', key).update(stringToSign).digest('base64');
  const signature = encodeURIComponent(hmac);
  return `SharedAccessSignature sr=${encodedUri}&sig=${signature}&se=${expiry}&skn=${encodeURIComponent(keyName)}`;
}

module.exports = async function (context, req) {
  if (req.method !== 'POST') {
    context.res = { status: 405, body: { error: 'method_not_allowed' } };
    return;
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    context.log.error('ADMIN_SECRET is not set.');
    context.res = { status: 500, body: { error: 'server_misconfigured' } };
    return;
  }

  const providedSecret = req.headers['x-admin-secret'];
  if (!providedSecret || providedSecret !== adminSecret) {
    context.res = { status: 401, body: { error: 'unauthorized' } };
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

  const payload = {
    title: 'New from Jason',
    body: 'Fresh case studies just landed.',
    url: 'https://jdivis.github.io/',
  };

  const resourceUri = `https://${namespace}.servicebus.windows.net/${hub}/messages/`;
  const sas = createSasToken(resourceUri, sasName, sasKey, 300);

  try {
    const response = await fetch(`${resourceUri}?api-version=2015-01`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: sas,
        'servicebusnotification-format': 'browser',
        'servicebusnotification-tags': 'all',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      context.log.error('Notification Hub broadcast failed', response.status, bodyText);
      context.res = { status: 502, body: { error: 'notification_hub_error' } };
      return;
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: true, sent: 1 },
    };
  } catch (error) {
    context.log.error('Failed to send broadcast', error);
    context.res = { status: 500, body: { error: 'broadcast_failed' } };
  }
};
