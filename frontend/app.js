const API_BASE = 'https://api.yourdomain.com'; // TODO: Replace with your APIM endpoint.
const VAPID_PUBLIC_KEY = 'TODO_SET_VAPID_PUBLIC_KEY'; // TODO: Paste Notification Hubs VAPID public key.
const DAILY_QUOTA = 20;

let demoToken = null;
let tokenFetchedAt = 0;
let cooldownUntil = 0;
let currentMode = '90s';

const selectors = {
  form: document.getElementById('fit-form'),
  textarea: document.getElementById('fit-text'),
  feedback: document.getElementById('form-feedback'),
  usage: document.getElementById('usage-meter'),
  resultsContainer: document.getElementById('results-container'),
  emptyState: document.getElementById('empty-state'),
  quotaState: document.getElementById('quota-state'),
  summaryText: document.getElementById('summary-text'),
  scoreText: document.getElementById('score-text'),
  reasonsList: document.getElementById('reasons-list'),
  followupsList: document.getElementById('followups-list'),
  subscribeButton: document.getElementById('subscribe-button'),
  quotaSubscribeButton: document.getElementById('quota-subscribe'),
  accordionToggle: document.querySelector('.accordion-toggle'),
  resultsSection: document.querySelector('.results'),
};

const modeTabs = Array.from(document.querySelectorAll('.mode-switch [role="tab"]'));
const chips = Array.from(document.querySelectorAll('.chip'));
const clearButton = document.getElementById('clear-button');

const FETCH_TIMEOUT = 15000;
const TURNSTILE_TIMEOUT = 8000;

function fetchWithTimeout(resource, options = {}, timeout = FETCH_TIMEOUT) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(resource, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

function getTurnstileToken() {
  return new Promise((resolve, reject) => {
    if (!window.turnstile) {
      reject(new Error('Turnstile is still loading.'));
      return;
    }
    const token = window.turnstile.getResponse();
    if (token) {
      resolve(token);
      return;
    }
    const timeoutId = setTimeout(() => {
      reject(new Error('Timed out waiting for the Turnstile challenge.'));
    }, TURNSTILE_TIMEOUT);
    window.turnstile.execute(undefined, {
      async callback(response) {
        clearTimeout(timeoutId);
        if (!response) {
          reject(new Error('Turnstile challenge failed.'));
        } else {
          resolve(response);
        }
      },
    });
  });
}

function setBusy(isBusy) {
  selectors.resultsSection.setAttribute('aria-busy', String(isBusy));
  selectors.form.querySelectorAll('button, textarea').forEach((el) => {
    el.disabled = isBusy;
  });
}

function setFeedback(message, tone = 'info') {
  selectors.feedback.textContent = message;
  selectors.feedback.dataset.tone = tone;
}

function resetStates() {
  selectors.resultsContainer.hidden = true;
  selectors.emptyState.hidden = false;
  selectors.quotaState.hidden = true;
  selectors.summaryText.textContent = '\u00a0';
  selectors.scoreText.textContent = '--';
  selectors.reasonsList.innerHTML = '';
  selectors.followupsList.innerHTML = '';
  selectors.accordionToggle.setAttribute('aria-expanded', 'false');
  selectors.reasonsList.hidden = true;
}

function applyMode(mode) {
  currentMode = mode;
  modeTabs.forEach((tab) => {
    const isSelected = tab.dataset.mode === mode;
    tab.setAttribute('aria-selected', String(isSelected));
    tab.tabIndex = isSelected ? 0 : -1;
  });
  const expandHighlights = mode !== '90s';
  toggleHighlights(expandHighlights);
  document.documentElement.dataset.mode = mode;
}

function toggleHighlights(shouldOpen) {
  selectors.accordionToggle.setAttribute('aria-expanded', String(shouldOpen));
  selectors.reasonsList.hidden = !shouldOpen;
  selectors.accordionToggle.textContent = shouldOpen ? 'Collapse' : 'Expand';
}

function updateUsageMeter(used = null, remaining = null) {
  if (remaining != null) {
    const usedCount = Math.min(DAILY_QUOTA, Math.max(0, DAILY_QUOTA - remaining));
    selectors.usage.textContent = `Usage: ${usedCount}/${DAILY_QUOTA} today`;
  } else if (used != null) {
    selectors.usage.textContent = `Usage: ${used}/${DAILY_QUOTA} today`;
  } else {
    selectors.usage.textContent = `Usage: --/${DAILY_QUOTA} today`;
  }
}

async function fetchUsage() {
  try {
    const response = await fetchWithTimeout(`${API_BASE}/me`, { credentials: 'include' });
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    if (typeof data.remaining === 'number' && typeof data.quota === 'number') {
      const used = Math.min(data.quota, Math.max(0, data.quota - data.remaining));
      selectors.usage.textContent = `Usage: ${used}/${data.quota} today`;
    }
  } catch (error) {
    console.warn('Failed to fetch usage', error);
  }
}

function isTokenFresh() {
  if (!demoToken) return false;
  const minutesElapsed = (Date.now() - tokenFetchedAt) / (1000 * 60);
  return minutesElapsed < 40;
}

async function ensureToken() {
  if (isTokenFresh()) return demoToken;
  const turnstileToken = await getTurnstileToken();
  const response = await fetchWithTimeout(`${API_BASE}/issue-demo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turnstileToken }),
  });
  if (!response.ok) {
    const message = response.status === 429 ? 'Too many demo tokens from this device today.' : 'Could not verify the challenge.';
    throw new Error(message);
  }
  const payload = await response.json();
  demoToken = payload.token;
  tokenFetchedAt = Date.now();
  return demoToken;
}

function renderResult(result) {
  selectors.summaryText.textContent = result.summary;
  selectors.scoreText.textContent = `${result.fitScore} / 100`;
  selectors.reasonsList.innerHTML = '';
  result.keyReasons.forEach((reason) => {
    const li = document.createElement('li');
    li.textContent = reason;
    selectors.reasonsList.appendChild(li);
  });
  selectors.followupsList.innerHTML = '';
  result.suggestedFollowUps.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = item;
    selectors.followupsList.appendChild(li);
  });
  selectors.resultsContainer.hidden = false;
  selectors.emptyState.hidden = true;
  selectors.quotaState.hidden = true;
  if (currentMode === '90s') {
    toggleHighlights(false);
  } else {
    toggleHighlights(true);
  }
}

function showQuotaState() {
  selectors.resultsContainer.hidden = true;
  selectors.emptyState.hidden = true;
  selectors.quotaState.hidden = false;
}

function startCooldown(seconds) {
  cooldownUntil = Date.now() + seconds * 1000;
  const update = () => {
    const diff = cooldownUntil - Date.now();
    if (diff <= 0) {
      selectors.form.querySelector('[type="submit"]').disabled = false;
      setFeedback('Ready when you are.');
      return;
    }
    const remainingSeconds = Math.ceil(diff / 1000);
    selectors.form.querySelector('[type="submit"]').disabled = true;
    setFeedback(`Cooling down… try again in ${remainingSeconds}s.`, 'warning');
    requestAnimationFrame(update);
  };
  update();
}

async function handleSubmit(event) {
  event.preventDefault();
  if (Date.now() < cooldownUntil) {
    startCooldown((cooldownUntil - Date.now()) / 1000);
    return;
  }
  const prompt = selectors.textarea.value.trim();
  if (!prompt) {
    setFeedback('Please share what you need from Jason.');
    selectors.textarea.focus();
    return;
  }
  try {
    setBusy(true);
    setFeedback('Checking the fit…');
    const token = await ensureToken();
    const response = await fetchWithTimeout(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ prompt }),
    });

    const quotaRemainingHeader = response.headers.get('X-Quota-Remaining');
    if (quotaRemainingHeader !== null) {
      const remaining = Number.parseInt(quotaRemainingHeader, 10);
      if (!Number.isNaN(remaining)) {
        updateUsageMeter(null, remaining);
      }
    }

    if (response.status === 401) {
      demoToken = null;
      tokenFetchedAt = 0;
      setFeedback('Session expired. Solve the challenge again.');
      return;
    }

    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get('Retry-After') || '30', 10);
      startCooldown(retryAfter);
      updateUsageMeter(DAILY_QUOTA, 0);
      showQuotaState();
      return;
    }

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      if (response.status === 400 && errorPayload?.reason === 'schema_validation_failed') {
        setFeedback('We hit a snag interpreting the results. Please try another prompt.', 'warning');
      } else if (response.status === 400) {
        setFeedback('Your prompt needs a quick edit before we can run it.', 'warning');
      } else {
        setFeedback('Something went wrong. Please try again shortly.', 'error');
      }
      return;
    }

    const result = await response.json();
    renderResult(result);
    setFeedback('Here’s what we found.');
  } catch (error) {
    console.error(error);
    setFeedback(error.message || 'Unexpected error occurred.', 'error');
  } finally {
    setBusy(false);
  }
}

function handleChipClick(event) {
  const prompt = event.currentTarget.dataset.prompt;
  selectors.textarea.value = prompt;
  selectors.textarea.focus();
}

function handleModeSwitch(event) {
  const mode = event.currentTarget.dataset.mode;
  applyMode(mode);
}

async function subscribeToPush() {
  if (!('serviceWorker' in navigator)) {
    setFeedback('Push notifications require a browser update.', 'warning');
    return;
  }
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.startsWith('TODO')) {
    setFeedback('Push notifications are not configured yet.', 'warning');
    return;
  }
  if (Notification.permission === 'denied') {
    setFeedback('Notifications are blocked. Update your browser settings.', 'warning');
    return;
  }
  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setFeedback('We need permission to send updates.', 'warning');
      return;
    }
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const response = await fetchWithTimeout(`${API_BASE}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });
    if (!response.ok) {
      throw new Error('Unable to save your subscription.');
    }
    const data = await response.json();
    setFeedback('You’re subscribed! We’ll share new highlights soon.');
    console.info('Installation ID', data.installationId);
  } catch (error) {
    setFeedback(error.message || 'Push subscription failed.', 'error');
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('sw.js')
      .catch((error) => console.error('Service worker registration failed', error));
  }
}

function initYear() {
  document.getElementById('year').textContent = new Date().getFullYear();
}

function attachEvents() {
  selectors.form.addEventListener('submit', handleSubmit);
  clearButton.addEventListener('click', () => {
    selectors.textarea.value = '';
    resetStates();
    setFeedback('Cleared. Ready for another idea?');
  });
  selectors.accordionToggle.addEventListener('click', () => {
    const expanded = selectors.accordionToggle.getAttribute('aria-expanded') === 'true';
    toggleHighlights(!expanded);
  });
  modeTabs.forEach((tab) => {
    tab.addEventListener('click', handleModeSwitch);
    tab.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        applyMode(tab.dataset.mode);
      }
    });
  });
  chips.forEach((chip) => chip.addEventListener('click', handleChipClick));
  selectors.subscribeButton.addEventListener('click', subscribeToPush);
  selectors.quotaSubscribeButton.addEventListener('click', subscribeToPush);
}

async function requestNotificationPermissionIfNeeded() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (error) {
      console.warn('Notification permission request failed', error);
    }
  }
}

async function init() {
  initYear();
  registerServiceWorker();
  attachEvents();
  resetStates();
  applyMode(currentMode);
  fetchUsage();
  requestNotificationPermissionIfNeeded();
}

document.addEventListener('DOMContentLoaded', init);
