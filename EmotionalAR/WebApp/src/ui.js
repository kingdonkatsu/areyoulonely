// ═══════════════════════════════════════════════════════════════
// UI Controller — DOM overlay interactions
// ═══════════════════════════════════════════════════════════════

import { postMessage, postResponse, fetchResponses, updatePresence, getPresenceCount } from './firebase.js';
import { getPosition } from './gps.js';
import { setPresenceDots, syncNodes } from './nodes.js';
import { checkModeration } from './moderation.js';

// ── DOM refs ──────────────────────────────────────────────────
const $ = (s) => document.querySelector(s);
let _onNodeDeselect = null;
let _selectedNodeEntry = null;

// ── EMOTION COLORS ────────────────────────────────────────────
const BADGE_COLORS = {
    comfort: { bg: '#6EE7B7', text: '#064E3B' },
    hope: { bg: '#FFD93D', text: '#78350F' },
    sadness: { bg: '#6B9BD1', text: '#1E3A5F' },
    stress: { bg: '#A78BFA', text: '#2E1065' },
    loneliness: { bg: '#F9A8D4', text: '#831843' },
};

/** Wire up all DOM events. */
export function initUI(onNodeDeselect) {
    _onNodeDeselect = onNodeDeselect;

    // ── Card close ──────────────────────────────────────────
    $('#card-close').addEventListener('click', closeCard);

    // ── New message FAB ─────────────────────────────────────
    $('#btn-new-message').addEventListener('click', openInput);
    $('#btn-share-first').addEventListener('click', openInput);

    // ── Text input ──────────────────────────────────────────
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

    // ── Send support ────────────────────────────────────────
    // ── Send support ────────────────────────────────────────
    $('#btn-send-support').addEventListener('click', openResponseInput);

    // ── Emotion Selector ────────────────────────────────────
    initEmotionSelector();
}

// ── Message Card ──────────────────────────────────────────────

export function showCard(nodeEntry) {
    _selectedNodeEntry = nodeEntry;
    const msg = nodeEntry.data;
    const card = $('#message-card');

    // Emotion & Color Logic
    const emotion = msg.emotion || 'stress';
    const colors = BADGE_COLORS[emotion] || BADGE_COLORS.stress;

    // Update Text
    const badgeText = $('#card-badge');
    badgeText.textContent = `Feeling ${emotion.charAt(0).toUpperCase() + emotion.slice(1)}`;
    badgeText.style.color = colors.bg; // Use the bright color for text

    // Update Pulse Icon Color
    const pulseIcon = $('#card-pulse-icon');
    if (pulseIcon) pulseIcon.style.color = colors.bg;

    const pulseRing = $('#card-pulse-ring');
    if (pulseRing) pulseRing.style.borderColor = colors.bg;

    // Text
    $('#card-text').textContent = `"${msg.text}"`;

    // Time
    const created = msg.createdAt ? new Date(msg.createdAt) : new Date();
    $('#card-time').textContent = timeAgo(created);

    // Responses Count
    $('#card-responses').textContent = msg.responseCount || 0;

    // Load responses
    loadResponses(msg.id);

    // Presence
    loadPresence(msg.id);

    // Show
    card.classList.remove('hidden');

    // Hide FAB
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
        if (responses.length === 0) {
            // Optional: Show empty state text
        }
        for (const r of responses) {
            const div = document.createElement('div');
            // Tailwind + Custom Speech Cloud classes
            div.className = 'p-4 rounded-2xl rounded-bl-sm bg-white/5 backdrop-blur-md border border-white/10 text-white/80 font-light italic text-sm';
            div.textContent = `"${r.text}"`;
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

// ── Input Overlay ─────────────────────────────────────────────

let _isResponseMode = false;

function openInput() {
    _isResponseMode = false;
    const inputTitle = document.querySelector('.input-title');
    inputTitle.textContent = 'Share Anonymously';
    $('#input-text').value = '';
    $('#char-count').textContent = '0 / 280';
    $('#btn-submit').disabled = true;
    $('#btn-submit').textContent = 'Send';
    $('#input-overlay').classList.remove('hidden');

    // Show emotion selector
    const emotionSelector = $('#emotion-selector');
    if (emotionSelector) emotionSelector.style.display = 'flex';

    // Reset emotion selection
    document.querySelectorAll('.emotion-pill-btn').forEach(b => b.classList.remove('selected'));
    _selectedEmotion = 'hope'; // Default
    $(`[data-emotion="hope"]`)?.classList.add('selected');

    setTimeout(() => $('#input-text').focus(), 100);
}

let _selectedEmotion = 'hope';

function initEmotionSelector() {
    const container = document.createElement('div');
    container.id = 'emotion-selector';
    container.className = 'emotion-selector-container';

    Object.keys(BADGE_COLORS).forEach(emotion => {
        const btn = document.createElement('button');
        btn.className = 'emotion-pill-btn';
        btn.dataset.emotion = emotion;

        // Inline colors
        const colors = BADGE_COLORS[emotion];
        btn.style.backgroundColor = colors.bg;
        btn.style.color = colors.text;
        btn.textContent = emotion;

        btn.onclick = () => {
            _selectedEmotion = emotion;
            // Clear selection from all
            Array.from(container.children).forEach(b => b.classList.remove('selected'));
            // Select this one
            btn.classList.add('selected');
        };

        // Auto-select 'hope'
        if (emotion === 'hope') {
            btn.classList.add('selected');
        }

        container.appendChild(btn);
    });

    // Insert before text area
    const overlay = $('#input-content');
    if (overlay) {
        overlay.insertBefore(container, $('#input-text'));
    }
}

function openResponseInput() {
    _isResponseMode = true;
    const inputTitle = document.querySelector('.input-title');
    inputTitle.textContent = 'Send Support';

    // Hide emotion selector
    const emotionSelector = $('#emotion-selector');
    if (emotionSelector) emotionSelector.style.display = 'none';

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
    btnSubmit.textContent = 'Checking content…';

    try {
        const isAppropriate = await checkModeration(text);
        if (!isAppropriate) {
            showToast('Please keep messages helpful and kind.', 'error');
            btnSubmit.disabled = false;
            btnSubmit.textContent = _isResponseMode ? 'Send Support' : 'Send';
            return;
        }

        btnSubmit.textContent = 'Sending…';
        if (_isResponseMode && _selectedNodeEntry) {
            await postResponse(_selectedNodeEntry.data.id, text);
            showToast('Support sent 💫', 'success');
            // Refresh responses
            loadResponses(_selectedNodeEntry.data.id);
        } else {
            const pos = getPosition();

            // Immediate local feedback (Optimistic UI)
            const tempId = `temp_${Date.now()}`;
            syncNodes([{
                id: tempId,
                text: text,
                emotion: _selectedEmotion,
                colorHex: BADGE_COLORS[_selectedEmotion].bg,
                latitude: pos.lat,
                longitude: pos.lng,
                createdAt: new Date().toISOString(),
                intensity: 1.0,
                responseCount: 0
            }]);

            await postMessage(text, pos.lat, pos.lng, _selectedEmotion);
            showToast('Shared anonymously ✨', 'success');
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

// ── Loading Screen ────────────────────────────────────────────

export function hideLoadingScreen() {
    $('#loading-screen').classList.add('fade-out');
}

// ── Empty State ───────────────────────────────────────────────

export function showEmptyState(show) {
    if (show) {
        $('#empty-state').classList.remove('hidden');
    } else {
        $('#empty-state').classList.add('hidden');
    }
}

// ── HUD ───────────────────────────────────────────────────────

export function updateHUD(count) {
    $('#hud-count').textContent = `${count} nearby`;
}

// ── Toast ─────────────────────────────────────────────────────

export function showToast(message, type = '') {
    const toast = $('#moderation-toast');
    const text = $('#toast-text');
    text.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => { toast.classList.add('hidden'); }, 3000);
}

// ── Helpers ───────────────────────────────────────────────────

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
