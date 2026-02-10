import { postMessage, postResponse, fetchResponses, updatePresence, getPresenceCount } from './firebase.js';
import { getPosition } from './gps.js';
import { setPresenceDots, syncNodes } from './nodes.js';

const $ = (s) => document.querySelector(s);
let _onNodeDeselect = null;
let _selectedNodeEntry = null;

const BADGE_COLORS = {
  comfort: { bg: '#6EE7B7', text: '#064E3B' },
  hope: { bg: '#FFD93D', text: '#78350F' },
  sadness: { bg: '#6B9BD1', text: '#1E3A5F' },
  stress: { bg: '#A78BFA', text: '#2E1065' },
  loneliness: { bg: '#F9A8D4', text: '#831843' },
};

export function initUI(onNodeDeselect) {
  _onNodeDeselect = onNodeDeselect;

  $('#card-close').addEventListener('click', closeCard);

  $('#btn-new-message').addEventListener('click', openInput);
  $('#btn-share-first').addEventListener('click', openInput);

  const textarea = $('#input-text');
  const charCount = $('#char-count');
  const btnSubmit = $('#btn-submit');
  const overlay = $('#input-overlay');

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    charCount.textContent = `${len} / 280`;
    btnSubmit.disabled = len === 0;
    if (len >= 260) {
      charCount.style.color = len >= 280 ? '#EF4444' : '#FCD34D';
    } else {
      charCount.style.color = '';
    }
  });

  btnSubmit.addEventListener('click', handleSubmit);
  $('#btn-cancel').addEventListener('click', closeInput);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeInput();
  });

  $('#btn-send-support').addEventListener('click', openResponseInput);

  initEmotionSelector();
}

export function showCard(nodeEntry) {
  _selectedNodeEntry = nodeEntry;
  const msg = nodeEntry.data;
  const card = $('#message-card');

  const badge = $('#card-badge');
  const emotion = msg.emotion || 'stress';
  badge.textContent = emotion.toUpperCase();
  const colors = BADGE_COLORS[emotion] || BADGE_COLORS.stress;
  badge.style.background = colors.bg;
  badge.style.color = colors.text;

  $('#card-text').textContent = msg.text;

  const created = msg.createdAt ? new Date(msg.createdAt) : new Date();
  const ago = timeAgo(created);
  $('#card-time').textContent = ago;

  $('#card-responses').textContent = `${msg.responseCount || 0} responses`;

  loadResponses(msg.id);
  loadPresence(msg.id);

  card.classList.remove('hidden');
  $('#btn-new-message').classList.add('hidden');
}

export function closeCard() {
  $('#message-card').classList.add('hidden');
  $('#card-response-list').innerHTML = '';
  $('#btn-new-message').classList.remove('hidden');
  if (_onNodeDeselect) _onNodeDeselect();
  _selectedNodeEntry = null;
}

async function loadResponses(messageId) {
  const list = $('#card-response-list');
  list.innerHTML = '';

  try {
    const responses = await fetchResponses(messageId);
    for (const r of responses) {
      const div = document.createElement('div');
      div.className = 'response-item';
      div.textContent = r.text;
      list.appendChild(div);
    }
  } catch (err) {
    console.warn('[UI] Error loading responses:', err);
  }
}

async function loadPresence(messageId) {
  try {
    await updatePresence(messageId);
    const count = await getPresenceCount(messageId);
    setPresenceDots(messageId, count);
  } catch (err) {
    console.warn('[UI] Presence error:', err);
  }
}

let _isResponseMode = false;
let _selectedEmotion = 'hope';

function openInput() {
  _isResponseMode = false;
  const inputTitle = document.querySelector('.input-title');
  inputTitle.textContent = 'Share Anonymously';
  $('#input-text').value = '';
  $('#char-count').textContent = '0 / 280';
  $('#btn-submit').disabled = true;
  $('#btn-submit').textContent = 'Send';
  $('#input-overlay').classList.remove('hidden');

  document.querySelectorAll('.emotion-btn').forEach((b) => b.classList.remove('selected'));
  _selectedEmotion = 'hope';
  const defaultBtn = document.querySelector('[data-emotion="hope"]');
  if (defaultBtn) defaultBtn.classList.add('selected');

  setTimeout(() => $('#input-text').focus(), 100);
}

function initEmotionSelector() {
  const container = document.createElement('div');
  container.id = 'emotion-selector';
  container.className = 'emotion-selector';

  Object.keys(BADGE_COLORS).forEach((emotion) => {
    const btn = document.createElement('button');
    btn.className = 'emotion-btn';
    btn.dataset.emotion = emotion;
    btn.style.backgroundColor = BADGE_COLORS[emotion].bg;
    btn.style.color = BADGE_COLORS[emotion].text;
    btn.textContent = emotion;
    btn.onclick = () => {
      _selectedEmotion = emotion;
      document.querySelectorAll('.emotion-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
    container.appendChild(btn);
  });

  const overlay = $('#input-content');
  if (overlay) {
    overlay.insertBefore(container, $('#input-text'));
  }
}

function openResponseInput() {
  _isResponseMode = true;
  const inputTitle = document.querySelector('.input-title');
  inputTitle.textContent = 'Send Support';
  $('#input-text').value = '';
  $('#char-count').textContent = '0 / 280';
  $('#btn-submit').disabled = true;
  $('#btn-submit').textContent = 'Send Support';
  $('#input-overlay').classList.remove('hidden');
  setTimeout(() => $('#input-text').focus(), 100);
}

function closeInput() {
  $('#input-overlay').classList.add('hidden');
}

async function handleSubmit() {
  const text = $('#input-text').value.trim();
  if (!text) return;

  const btnSubmit = $('#btn-submit');
  btnSubmit.disabled = true;
  btnSubmit.textContent = 'Sending…';

  try {
    if (_isResponseMode && _selectedNodeEntry) {
      await postResponse(_selectedNodeEntry.data.id, text);
      showToast('Support sent', 'success');
      loadResponses(_selectedNodeEntry.data.id);
    } else {
      const pos = getPosition();

      const tempId = `temp_${Date.now()}`;
      syncNodes([
        {
          id: tempId,
          text,
          emotion: _selectedEmotion,
          colorHex: BADGE_COLORS[_selectedEmotion].bg,
          latitude: pos.lat,
          longitude: pos.lng,
          createdAt: new Date().toISOString(),
          intensity: 1.0,
          responseCount: 0,
        },
      ]);

      await postMessage(text, pos.lat, pos.lng, _selectedEmotion);
      showToast('Shared anonymously', 'success');
    }
    closeInput();
  } catch (err) {
    console.error('[UI] Submit error:', err);
    showToast('Unable to send. Retrying…', 'error');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = _isResponseMode ? 'Send Support' : 'Send';
  }
}

export function hideLoadingScreen() {
  $('#loading-screen').classList.add('fade-out');
}

export function showEmptyState(show) {
  if (show) {
    $('#empty-state').classList.remove('hidden');
  } else {
    $('#empty-state').classList.add('hidden');
  }
}

export function updateHUD(count) {
  $('#hud-count').textContent = `${count} nearby`;
}

export function showToast(message, type = '') {
  const toast = $('#moderation-toast');
  const text = $('#toast-text');
  text.textContent = message;
  toast.className = `toast ${type}`;
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

