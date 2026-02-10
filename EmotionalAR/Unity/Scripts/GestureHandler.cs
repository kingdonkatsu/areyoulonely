using UnityEngine;
using UnityEngine.EventSystems;

namespace EmotionalAR
{
    /// <summary>
    /// Touch gesture handler: pinch-to-zoom, drag-to-rotate/pan, tap-to-select.
    /// </summary>
    public class GestureHandler : MonoBehaviour
    {
        [Header("References")]
        [SerializeField] private Camera             arCamera;
        [SerializeField] private Transform          worldPivot;
        [SerializeField] private MessageUIController uiController;
        [SerializeField] private ARWorldManager     worldManager;

        [Header("Zoom")]
        [SerializeField] private float minZoom       = 0.5f;
        [SerializeField] private float maxZoom       = 3f;
        [SerializeField] private float zoomSpeed     = 0.01f;
        [SerializeField] private float zoomSmoothing = 8f;

        [Header("Rotation/Pan")]
        [SerializeField] private float rotateSpeed   = 0.3f;
        [SerializeField] private float panSpeed      = 0.005f;
        [SerializeField] private float dragSmoothing = 10f;

        [Header("Tap")]
        [SerializeField] private float tapMaxDuration   = 0.3f;
        [SerializeField] private float tapMaxMovement   = 20f;
        [SerializeField] private LayerMask nodeMask     = ~0;

        private float _currentZoom = 1f;
        private float _targetZoom  = 1f;
        private float _targetRotY;
        private float _currentRotY;
        private Vector3 _targetPanOffset;
        private Vector3 _currentPanOffset;

        // Tap detection
        private float   _touchStartTime;
        private Vector2 _touchStartPos;
        private bool    _isTapCandidate;

        // Pinch state
        private float _lastPinchDist;

        private void Update()
        {
            if (uiController != null && (uiController.IsCardOpen || uiController.IsInputOpen))
                return; // Don't process gestures when UI is open

            int touchCount = Input.touchCount;

            if (touchCount == 1 && !IsPointerOverUI())
                HandleSingleTouch(Input.GetTouch(0));
            else if (touchCount == 2)
                HandlePinchAndDrag(Input.GetTouch(0), Input.GetTouch(1));

            // Smooth interpolation
            _currentZoom = Mathf.Lerp(_currentZoom, _targetZoom, Time.deltaTime * zoomSmoothing);
            _currentRotY = Mathf.Lerp(_currentRotY, _targetRotY, Time.deltaTime * dragSmoothing);
            _currentPanOffset = Vector3.Lerp(_currentPanOffset, _targetPanOffset, Time.deltaTime * dragSmoothing);

            ApplyTransforms();
        }

        private void HandleSingleTouch(Touch touch)
        {
            switch (touch.phase)
            {
                case TouchPhase.Began:
                    _touchStartTime = Time.time;
                    _touchStartPos  = touch.position;
                    _isTapCandidate = true;
                    break;

                case TouchPhase.Moved:
                    if (_isTapCandidate)
                    {
                        float moved = Vector2.Distance(touch.position, _touchStartPos);
                        if (moved > tapMaxMovement)
                        {
                            _isTapCandidate = false;
                        }
                    }

                    if (!_isTapCandidate)
                    {
                        // Single-finger drag → rotate Y
                        _targetRotY += touch.deltaPosition.x * rotateSpeed;
                    }
                    break;

                case TouchPhase.Ended:
                    if (_isTapCandidate && (Time.time - _touchStartTime) < tapMaxDuration)
                    {
                        HandleTap(touch.position);
                    }
                    _isTapCandidate = false;
                    break;
            }
        }

        private void HandlePinchAndDrag(Touch t0, Touch t1)
        {
            _isTapCandidate = false;

            // Pinch zoom
            float currentDist = Vector2.Distance(t0.position, t1.position);

            if (t0.phase == TouchPhase.Began || t1.phase == TouchPhase.Began)
            {
                _lastPinchDist = currentDist;
                return;
            }

            float delta = currentDist - _lastPinchDist;
            _targetZoom = Mathf.Clamp(_targetZoom + delta * zoomSpeed, minZoom, maxZoom);
            _lastPinchDist = currentDist;

            // Two-finger pan
            Vector2 midDelta = (t0.deltaPosition + t1.deltaPosition) * 0.5f;
            if (arCamera != null)
            {
                Vector3 panDelta = arCamera.transform.right * (-midDelta.x * panSpeed)
                                 + arCamera.transform.up    * (-midDelta.y * panSpeed);
                panDelta.y = 0; // Keep pan horizontal
                _targetPanOffset += panDelta;
            }
        }

        private void HandleTap(Vector2 screenPos)
        {
            if (arCamera == null) return;

            Ray ray = arCamera.ScreenPointToRay(screenPos);

            if (Physics.Raycast(ray, out RaycastHit hit, 50f, nodeMask))
            {
                var nodeCtrl = hit.collider.GetComponentInParent<EmotionNodeController>();
                if (nodeCtrl != null && uiController != null)
                {
                    // Haptic: light impact
                    #if UNITY_IOS
                    UnityEngine.iOS.Device.SetNoBackupFlag("");
                    // Use native haptics via plugin in production
                    #endif
                    Handheld.Vibrate(); // Basic fallback

                    uiController.ShowMessageCard(nodeCtrl.Data, nodeCtrl);
                }
            }
        }

        private void ApplyTransforms()
        {
            if (worldPivot == null) return;

            // Apply zoom
            worldPivot.localScale = Vector3.one * _currentZoom;

            // Apply Y rotation
            Vector3 euler = worldPivot.localEulerAngles;
            euler.y = _currentRotY;
            worldPivot.localEulerAngles = euler;

            // Apply pan offset
            worldPivot.localPosition = _currentPanOffset;
        }

        private bool IsPointerOverUI()
        {
            if (EventSystem.current == null) return false;
            if (Input.touchCount > 0)
                return EventSystem.current.IsPointerOverGameObject(Input.GetTouch(0).fingerId);
            return EventSystem.current.IsPointerOverGameObject();
        }

        /// <summary>Reset view to default.</summary>
        public void ResetView()
        {
            _targetZoom = 1f;
            _targetRotY = 0f;
            _targetPanOffset = Vector3.zero;
        }
    }
}
