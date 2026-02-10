using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace EmotionalAR
{
    /// <summary>
    /// Canvas-based UI: message card, text input overlay, loading/empty states.
    /// </summary>
    public class MessageUIController : MonoBehaviour
    {
        // ── Inspector: Card Panel ──────────────────────────────────────────────
        [Header("Message Card")]
        [SerializeField] private RectTransform  cardPanel;
        [SerializeField] private CanvasGroup    cardCanvasGroup;
        [SerializeField] private TMP_Text       emotionBadgeText;
        [SerializeField] private Image          emotionBadgeBG;
        [SerializeField] private TMP_Text       messageText;
        [SerializeField] private TMP_Text       timestampText;
        [SerializeField] private TMP_Text       responseCountText;
        [SerializeField] private Button         sendSupportBtn;
        [SerializeField] private Button         closeCardBtn;

        [Header("Input Overlay")]
        [SerializeField] private RectTransform  inputOverlay;
        [SerializeField] private CanvasGroup    inputCanvasGroup;
        [SerializeField] private TMP_InputField inputField;
        [SerializeField] private TMP_Text       charCountText;
        [SerializeField] private Button         submitBtn;
        [SerializeField] private TMP_Text       submitBtnText;
        [SerializeField] private Image          submitBtnImage;
        [SerializeField] private Button         cancelInputBtn;

        [Header("Loading State")]
        [SerializeField] private RectTransform  loadingPanel;
        [SerializeField] private TMP_Text       loadingText;

        [Header("Empty State")]
        [SerializeField] private RectTransform  emptyPanel;
        [SerializeField] private TMP_Text       emptyTitleText;
        [SerializeField] private TMP_Text       emptySubText;
        [SerializeField] private Button         shareEmotionBtn;

        [Header("Moderation State")]
        [SerializeField] private RectTransform  moderationPanel;
        [SerializeField] private TMP_Text       moderationText;

        [Header("Response List")]
        [SerializeField] private RectTransform  responseListPanel;
        [SerializeField] private CanvasGroup    responseListCanvasGroup;
        [SerializeField] private Transform      responseListContent;
        [SerializeField] private GameObject      responseItemPrefab;
        [SerializeField] private Button         closeResponseListBtn;

        [Header("Animation")]
        [SerializeField] private float cardSlideDuration = 0.4f;
        [SerializeField] private float fadeDuration      = 0.3f;

        // ── State ──────────────────────────────────────────────────────────────
        private MessageData _currentMessage;
        private EmotionNodeController _currentNode;
        private bool _isCardOpen;
        private bool _isInputOpen;
        private const int MAX_CHARS = 280;

        // ── Emotion display names ──────────────────────────────────────────────
        private static readonly Dictionary<string, string> EmotionLabels = new()
        {
            { "comfort",    "COMFORT" },
            { "hope",       "HOPE" },
            { "sadness",    "SADNESS" },
            { "stress",     "STRESS" },
            { "loneliness", "LONELINESS" },
        };

        // ════════════════════════════════════════════════════════════════════════
        // Lifecycle
        // ════════════════════════════════════════════════════════════════════════

        private void Awake()
        {
            // Hide all panels initially
            SetPanelActive(cardPanel, false);
            SetPanelActive(inputOverlay, false);
            SetPanelActive(loadingPanel, false);
            SetPanelActive(emptyPanel, false);
            SetPanelActive(moderationPanel, false);
            SetPanelActive(responseListPanel, false);

            // Wire buttons
            sendSupportBtn?.onClick.AddListener(OpenInputOverlay);
            closeCardBtn?.onClick.AddListener(() => CloseCard());
            submitBtn?.onClick.AddListener(SubmitResponse);
            cancelInputBtn?.onClick.AddListener(CloseInputOverlay);
            shareEmotionBtn?.onClick.AddListener(OpenNewMessageInput);
            closeResponseListBtn?.onClick.AddListener(CloseResponseList);

            // Input field events
            if (inputField != null)
            {
                inputField.characterLimit = MAX_CHARS;
                inputField.onValueChanged.AddListener(OnInputChanged);
            }
        }

        // ════════════════════════════════════════════════════════════════════════
        // Message Card
        // ════════════════════════════════════════════════════════════════════════

        /// <summary>Open the message card for a tapped node.</summary>
        public void ShowMessageCard(MessageData data, EmotionNodeController node)
        {
            if (_isCardOpen) CloseCardImmediate();

            _currentMessage = data;
            _currentNode = node;

            // Populate UI
            string label = EmotionLabels.GetValueOrDefault(data.emotion, data.emotion.ToUpper());
            if (emotionBadgeText != null) emotionBadgeText.text = label;
            if (emotionBadgeBG != null)   emotionBadgeBG.color = data.GetColor();
            if (messageText != null)      messageText.text = data.text;
            if (timestampText != null)    timestampText.text = FormatTimestamp(data.createdAt);
            if (responseCountText != null)
                responseCountText.text = data.responseCount > 0
                    ? $"{data.responseCount} {(data.responseCount == 1 ? "person" : "people")} sent support"
                    : "Be the first to send support";

            // Animate in
            StartCoroutine(AnimateCardIn());
            _isCardOpen = true;

            // Update presence
            _ = FirebaseManager.Instance.UpdatePresence(data.id);
        }

        public void CloseCard()
        {
            if (!_isCardOpen) return;
            StartCoroutine(AnimateCardOut());
        }

        private void CloseCardImmediate()
        {
            _isCardOpen = false;
            SetPanelActive(cardPanel, false);
            if (cardCanvasGroup != null) cardCanvasGroup.alpha = 0;
        }

        private IEnumerator AnimateCardIn()
        {
            SetPanelActive(cardPanel, true);
            if (cardCanvasGroup != null) cardCanvasGroup.alpha = 0;

            Vector2 startPos = cardPanel.anchoredPosition;
            startPos.y = -cardPanel.rect.height;
            cardPanel.anchoredPosition = startPos;

            Vector2 endPos = startPos;
            endPos.y = 0;

            float el = 0;
            while (el < cardSlideDuration)
            {
                el += Time.deltaTime;
                float t = EaseOutCubic(el / cardSlideDuration);
                cardPanel.anchoredPosition = Vector2.Lerp(startPos, endPos, t);
                if (cardCanvasGroup != null)
                    cardCanvasGroup.alpha = Mathf.Lerp(0, 1, el / fadeDuration);
                yield return null;
            }

            cardPanel.anchoredPosition = endPos;
            if (cardCanvasGroup != null) cardCanvasGroup.alpha = 1;
        }

        private IEnumerator AnimateCardOut()
        {
            Vector2 startPos = cardPanel.anchoredPosition;
            Vector2 endPos = startPos;
            endPos.y = -cardPanel.rect.height;

            float el = 0;
            while (el < fadeDuration)
            {
                el += Time.deltaTime;
                float t = EaseInCubic(el / fadeDuration);
                cardPanel.anchoredPosition = Vector2.Lerp(startPos, endPos, t);
                if (cardCanvasGroup != null)
                    cardCanvasGroup.alpha = Mathf.Lerp(1, 0, t);
                yield return null;
            }

            _isCardOpen = false;
            SetPanelActive(cardPanel, false);
        }

        // ════════════════════════════════════════════════════════════════════════
        // Input Overlay
        // ════════════════════════════════════════════════════════════════════════

        private void OpenInputOverlay()
        {
            if (inputField != null) inputField.text = "";
            UpdateCharCount(0);
            UpdateSubmitButton(false);
            SetPanelActive(inputOverlay, true);
            if (inputCanvasGroup != null) inputCanvasGroup.alpha = 1;
            inputField?.ActivateInputField();
            _isInputOpen = true;
        }

        private void OpenNewMessageInput()
        {
            // For creating a new message from empty state
            SetPanelActive(emptyPanel, false);
            OpenInputOverlay();
        }

        private void CloseInputOverlay()
        {
            _isInputOpen = false;
            SetPanelActive(inputOverlay, false);
            if (inputField != null) inputField.text = "";
        }

        private void OnInputChanged(string text)
        {
            int len = text?.Length ?? 0;
            UpdateCharCount(len);
            UpdateSubmitButton(len > 0 && len <= MAX_CHARS);
        }

        private void UpdateCharCount(int count)
        {
            if (charCountText != null)
                charCountText.text = $"{count} / {MAX_CHARS}";
        }

        private void UpdateSubmitButton(bool enabled)
        {
            if (submitBtn != null) submitBtn.interactable = enabled;
            if (submitBtnImage != null)
                submitBtnImage.color = enabled
                    ? (_currentMessage != null ? _currentMessage.GetColor() : Color.white)
                    : new Color(0.61f, 0.64f, 0.69f, 0.5f); // #9CA3AF 50%
        }

        // ════════════════════════════════════════════════════════════════════════
        // Submit
        // ════════════════════════════════════════════════════════════════════════

        private async void SubmitResponse()
        {
            string text = inputField?.text?.Trim();
            if (string.IsNullOrEmpty(text) || text.Length > MAX_CHARS) return;

            // Show moderation state
            SetPanelActive(inputOverlay, false);
            ShowModerationState("Sharing your support...");

            bool success;
            if (_currentMessage != null)
            {
                success = await FirebaseManager.Instance.PostResponse(_currentMessage.id, text);
            }
            else
            {
                // New message (from empty state)
                var (lat, lng) = FindObjectOfType<ARWorldManager>().GetUserPosition();
                success = await FirebaseManager.Instance.PostMessage(text, lat, lng);
            }

            if (success)
            {
                ShowModerationSuccess();
                yield return new WaitForSeconds(0.8f); // Coroutine needed — handled below
            }
            else
            {
                ShowModerationError();
            }
        }

        private void ShowModerationState(string msg)
        {
            SetPanelActive(moderationPanel, true);
            if (moderationText != null) moderationText.text = msg;
            StartCoroutine(ModerationTimeout());
        }

        private IEnumerator ModerationTimeout()
        {
            yield return new WaitForSeconds(2f);
            if (moderationPanel != null && moderationPanel.gameObject.activeSelf)
            {
                if (moderationText != null) moderationText.text = "Making sure message is kind...";
            }
        }

        private void ShowModerationSuccess()
        {
            if (moderationText != null) moderationText.text = "✓ Shared";
            StartCoroutine(CloseModerationAfterDelay(0.8f));
        }

        private void ShowModerationError()
        {
            if (moderationText != null)
                moderationText.text = "Please rephrase more supportively";
            StartCoroutine(CloseModerationAfterDelay(2f));
        }

        private IEnumerator CloseModerationAfterDelay(float delay)
        {
            yield return new WaitForSeconds(delay);
            SetPanelActive(moderationPanel, false);
            CloseInputOverlay();
        }

        // ════════════════════════════════════════════════════════════════════════
        // Loading & Empty States
        // ════════════════════════════════════════════════════════════════════════

        public void ShowLoading()
        {
            SetPanelActive(loadingPanel, true);
            if (loadingText != null) loadingText.text = "Finding nearby emotions...";
            StartCoroutine(MinimumLoadingTime());
        }

        private IEnumerator MinimumLoadingTime()
        {
            yield return new WaitForSeconds(1.5f);
        }

        public void HideLoading() => SetPanelActive(loadingPanel, false);

        public void ShowEmptyState()
        {
            SetPanelActive(emptyPanel, true);
            if (emptyTitleText != null) emptyTitleText.text = "The emotional landscape is quiet here";
            if (emptySubText != null) emptySubText.text = "Be the first to share how you're feeling";
            if (shareEmotionBtn != null) shareEmotionBtn.gameObject.SetActive(false);
            StartCoroutine(ShowShareButtonDelayed());
        }

        private IEnumerator ShowShareButtonDelayed()
        {
            yield return new WaitForSeconds(2f);
            if (shareEmotionBtn != null) shareEmotionBtn.gameObject.SetActive(true);
        }

        public void HideEmptyState() => SetPanelActive(emptyPanel, false);

        // ════════════════════════════════════════════════════════════════════════
        // Response List
        // ════════════════════════════════════════════════════════════════════════

        public async void ShowResponseList(string messageId)
        {
            SetPanelActive(responseListPanel, true);
            if (responseListCanvasGroup != null) responseListCanvasGroup.alpha = 1;

            // Clear existing items
            if (responseListContent != null)
                foreach (Transform child in responseListContent)
                    Destroy(child.gameObject);

            var responses = await FirebaseManager.Instance.FetchResponses(messageId);
            foreach (var resp in responses)
            {
                if (responseItemPrefab != null && responseListContent != null)
                {
                    var item = Instantiate(responseItemPrefab, responseListContent);
                    var txt = item.GetComponentInChildren<TMP_Text>();
                    if (txt != null) txt.text = resp.text;
                }
            }
        }

        private void CloseResponseList()
        {
            SetPanelActive(responseListPanel, false);
        }

        // ════════════════════════════════════════════════════════════════════════
        // Helpers
        // ════════════════════════════════════════════════════════════════════════

        private void SetPanelActive(RectTransform panel, bool active)
        {
            if (panel != null) panel.gameObject.SetActive(active);
        }

        private string FormatTimestamp(string iso)
        {
            if (string.IsNullOrEmpty(iso)) return "";
            if (!DateTime.TryParse(iso, out DateTime dt)) return iso;
            var diff = DateTime.UtcNow - dt;
            if (diff.TotalMinutes < 1) return "Just now";
            if (diff.TotalMinutes < 60) return $"{(int)diff.TotalMinutes} min ago";
            if (diff.TotalHours < 24) return $"{(int)diff.TotalHours} hours ago";
            return $"{(int)diff.TotalDays} days ago";
        }

        private float EaseOutCubic(float t) => 1f - Mathf.Pow(1f - Mathf.Clamp01(t), 3f);
        private float EaseInCubic(float t)  { t = Mathf.Clamp01(t); return t * t * t; }

        public bool IsCardOpen => _isCardOpen;
        public bool IsInputOpen => _isInputOpen;
    }
}
