# Jason Fit Checker Demo

## Overview
Jason Fit Checker is a lightweight demo experience that helps visitors decide whether Jason is the right hire. It combines a static, installable web front end with a small Azure Functions backend that intermediates access to Azure OpenAI, manages anonymous usage quotas, and supports push notifications through Azure Notification Hubs.

```
+-------------------+        +------------------------+        +---------------------------+
| GitHub Pages PWA  |<------>| Azure API Management   |<------>| Azure Functions (Node 18) |
| (/frontend)       |        | (JWT + rate limits)    |        |  ├ issue-demo (Turnstile) |
|  ├ Fit Checker UI |        |                        |        |  ├ chat (Azure OpenAI)    |
|  ├ Service Worker |        |                        |        |  ├ subscribe (NH install) |
|  └ Push handling  |        |                        |        |  └ notify (broadcast)     |
+-------------------+        +------------------------+        +---------------------------+
                                                                    |
                                                                    v
                                                           Azure Notification Hubs
```

The anonymous flow requires a Cloudflare Turnstile challenge to mint a short-lived JWT. That token is throttled and quota-limited by Azure API Management (APIM) before requests reach Azure Functions. Responses from Azure OpenAI are validated against a strict JSON schema before rendering. Visitors can optionally subscribe to push notifications driven by Notification Hubs.

## Prerequisites
- Azure subscription with permissions to create Function Apps, API Management (Consumption tier), Azure OpenAI, and Notification Hubs (Free tier).
- Cloudflare Turnstile site and secret keys.
- Node.js 18+ locally if you want to run Azure Functions for development.
- GitHub repository (`jdivis-fit-demo`) with GitHub Pages enabled for the `/frontend` directory.

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/<your-account>/jdivis-fit-demo.git
   cd jdivis-fit-demo
   ```

2. **Provision Azure Notification Hubs**
   - Create a namespace and hub (Free tier is sufficient).
   - Enable the **Browser (Web Push)** platform.
   - Generate or paste VAPID keys. Copy the **Public Key** and paste it into `frontend/app.js` (`VAPID_PUBLIC_KEY`). Keep the private key secret.

3. **Create the Function App**
   - Target Node.js 18 or later (Functions v4).
   - Create an Azure Storage account if one does not exist.
   - Populate configuration settings using `.env.sample` as a guide (see [Configuration](#configuration)).
   - Deploy the contents of the `/functions` directory using `func azure functionapp publish` or your preferred CI/CD tool.

4. **Azure API Management**
   - Create an APIM instance (Consumption tier keeps costs low).
   - Import the Function App endpoints (`issue-demo`, `chat`, `subscribe`, `notify`).
   - Apply `frontend/apim-policy.xml` to the `/chat` operation so APIM validates JWTs, throttles bursts, and enforces the daily quota. Update the signing key placeholder with your Base64-encoded symmetric secret or JWKS.
   - Expose the other endpoints via APIM and enable any additional throttling you require.

5. **Cloudflare Turnstile**
   - Create a site for your GitHub Pages domain.
   - Set the **site key** inside `frontend/index.html` where indicated (`<!-- TURNSTILE_SITE_KEY -->`).
   - Set the **secret key** as `TURNSTILE_SECRET` in your Function App configuration.

6. **Frontend configuration**
   - Edit `frontend/app.js` and update `API_BASE` with your APIM endpoint (e.g., `https://api.yourdomain.com`).
   - Ensure the CSP meta tag in `frontend/index.html` matches your API origin.
   - Replace the placeholder SVG icons in `frontend/images/` with your branded artwork (update `manifest.webmanifest` if you change file names or formats).
   - Commit and push the `/frontend` directory to the `main` branch so GitHub Pages can serve it. Configure Pages to publish from the repository root (or `/frontend` depending on your preference).

7. **Notification Hub broadcast secret**
   - Set `NH_SAS_NAME` and `NH_SAS_KEY` in your Function App (defaults assume `DefaultFullSharedAccessSignature`).
   - Provide an `ADMIN_SECRET` value for the `/notify` function. This header gate prevents unauthorized broadcasts.

8. **Configuration**
   - Copy `.env.sample` to `.env` (not committed) and fill in your values.
   - The same keys should be populated as app settings within Azure Functions.

## Testing & Verification

- **Anonymous quota**: Trigger `/issue-demo` + `/chat` more than 20 times to confirm APIM quota enforcement and UI messaging.
- **Burst control**: Submit rapid requests to validate the 3-per-minute rate limit.
- **Turnstile**: Fail the Turnstile challenge (or disable it temporarily) to confirm the backend denies token issuance.
- **Schema validation**: Modify the Azure OpenAI response or simulate invalid JSON to ensure `/chat` returns HTTP 400 with `schema_validation_failed` and that the front end surfaces the error.
- **Push subscription**: Subscribe from a supported browser, verify the installation in Notification Hubs, and send a broadcast via `/notify` to confirm delivery.
- **PWA installability**: Use Chrome or Edge Lighthouse to confirm the app is installable and works offline for the cached shell.
- **Mobile layout**: Test on small screens to ensure the responsive layout, focus styles, and accordions behave as expected.

## Repository Layout

```
README.md
.env.sample
frontend/
  index.html
  styles.css
  app.js
  manifest.webmanifest
  sw.js
  apim-policy.xml
functions/
  issue-demo/index.js
  chat/index.js
  subscribe/index.js
  notify/index.js
  shared/jwt.js
  shared/schema.js
```

## Notes
- Do **not** commit secrets or production configuration to the repository.
- The Turnstile widget requires the Cloudflare script, which is dynamically loaded to keep the initial payload small.
- To extend abuse controls, consider integrating Azure AI Content Safety or maintaining issuance counters via Azure Table Storage (see TODO in `/functions/issue-demo/index.js`).
