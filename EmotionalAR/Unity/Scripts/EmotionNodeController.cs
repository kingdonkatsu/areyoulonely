using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace EmotionalAR
{
    /// <summary>
    /// Controls a single emotion node: animation, material, response stack, presence dots.
    /// </summary>
    public class EmotionNodeController : MonoBehaviour
    {
        [Header("Animation")]
        [SerializeField] private float floatAmplitude = 0.1f;
        [SerializeField] private float floatPeriod    = 4f;
        [SerializeField] private float pulsePeriod    = 3f;
        [SerializeField] private float pulseStrength  = 0.2f;
        [SerializeField] private float rotationSpeed  = 15f;

        [Header("Sizing")]
        [SerializeField] private float baseSize         = 0.3f;
        [SerializeField] private float maxIntensitySize = 0.45f;
        [SerializeField] private float maxResponseScale = 1.5f;

        [Header("Response Stack")]
        [SerializeField] private float discThickness = 0.05f;
        [SerializeField] private float discDiameter  = 0.4f;
        [SerializeField] private float discSpacing   = 0.08f;
        [SerializeField] private int   maxVisibleResponses = 5;

        [Header("Presence")]
        [SerializeField] private float dotSize     = 0.04f;
        [SerializeField] private float orbitRadius = 0.6f;
        [SerializeField] private int   maxDots     = 10;

        public MessageData Data { get; private set; }

        private Renderer _renderer;
        private MaterialPropertyBlock _propBlock;
        private float _phaseOffset, _baseY;
        private Color _nodeColor;
        private float _currentIntensity;
        private bool  _initialized, _fadingOut;

        private readonly List<GameObject> _responseDiscs = new();
        private readonly List<PresenceDotInfo> _presenceDots = new();
        private int _presenceCount;

        private static readonly int PropColor = Shader.PropertyToID("_Color");
        private static readonly int PropIntensity = Shader.PropertyToID("_Intensity");
        private static readonly int PropEmissionColor = Shader.PropertyToID("_EmissionColor");
        private static readonly int PropFresnelPower = Shader.PropertyToID("_FresnelPower");

        public void Initialize(MessageData data)
        {
            Data = data;
            _phaseOffset = Random.Range(0f, Mathf.PI * 2f);
            _baseY = transform.position.y;
            _nodeColor = data.GetColor();
            _currentIntensity = data.intensity;
            _renderer = GetComponent<Renderer>();
            _propBlock = new MaterialPropertyBlock();
            ApplyVisuals();
            _initialized = true;
            StartCoroutine(PresenceLoop());
        }

        public void UpdateData(MessageData data)
        {
            bool newResponse = Data.responseCount != data.responseCount;
            Data = data;
            _nodeColor = data.GetColor();
            _currentIntensity = data.intensity;
            ApplyVisuals();
            if (newResponse) StartCoroutine(OnNewResponse());
        }

        private void ApplyVisuals()
        {
            if (_renderer == null) return;
            float size = Mathf.Lerp(baseSize, maxIntensitySize, _currentIntensity);
            float growth = Mathf.Min(1f + Data.responseCount * 0.1f, maxResponseScale);
            float final_ = size * growth;
            transform.localScale = new Vector3(final_, final_ * 0.9f, final_);

            _renderer.GetPropertyBlock(_propBlock);
            float em = GetEmissionMul(_currentIntensity);
            _propBlock.SetColor(PropColor, _nodeColor);
            _propBlock.SetFloat(PropIntensity, _currentIntensity);
            _propBlock.SetFloat(PropFresnelPower, 3f);
            _propBlock.SetColor(PropEmissionColor, _nodeColor * em);
            _renderer.SetPropertyBlock(_propBlock);
        }

        private float GetEmissionMul(float i) =>
            i <= 0.3f ? 1.5f : i <= 0.7f ? 3.0f : 5.0f;

        private void Update()
        {
            if (!_initialized || _fadingOut) return;
            float t = Time.time;

            // Float
            var pos = transform.position;
            pos.y = _baseY + Mathf.Sin(t / floatPeriod * Mathf.PI * 2f + _phaseOffset) * floatAmplitude;
            transform.position = pos;

            // Rotate
            transform.Rotate(Vector3.up, rotationSpeed * Time.deltaTime, Space.World);

            // Emission pulse
            if (_renderer != null)
            {
                float pulse = 1f + Mathf.Sin(t / pulsePeriod * Mathf.PI * 2f + _phaseOffset) * pulseStrength;
                _renderer.GetPropertyBlock(_propBlock);
                _propBlock.SetColor(PropEmissionColor, _nodeColor * GetEmissionMul(_currentIntensity) * pulse);
                _renderer.SetPropertyBlock(_propBlock);
            }

            // Presence dots orbit
            foreach (var d in _presenceDots)
            {
                if (d.obj == null) continue;
                d.angle += d.speed * Time.deltaTime;
                float rad = d.angle * Mathf.Deg2Rad;
                d.obj.transform.localPosition = new Vector3(
                    Mathf.Cos(rad) * orbitRadius, d.yOff, Mathf.Sin(rad) * orbitRadius);
                float breathe = 1f + Mathf.Sin(t * Mathf.PI) * 0.05f;
                d.obj.transform.localScale = Vector3.one * dotSize * breathe;
            }
        }

        #region Response Stack
        private IEnumerator OnNewResponse()
        {
            float orig = _currentIntensity;
            _currentIntensity = Mathf.Min(1f, _currentIntensity + 0.3f);
            ApplyVisuals();
            yield return new WaitForSeconds(2f);
            _currentIntensity = orig;
            ApplyVisuals();
            SpawnResponseDisc(_responseDiscs.Count);
        }

        private void SpawnResponseDisc(int idx)
        {
            if (idx >= maxVisibleResponses) return;
            float yOff = -(idx + 1) * (discThickness + discSpacing);
            Vector3 target = transform.position + Vector3.up * yOff;

            var disc = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            disc.transform.SetParent(transform);
            disc.transform.localScale = new Vector3(discDiameter, discThickness * 0.5f, discDiameter);
            disc.name = $"ResponseDisc_{idx}";

            var r = disc.GetComponent<Renderer>();
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            Color c = _nodeColor; c.a = 0.5f;
            mat.color = c;
            r.material = mat;

            StartCoroutine(AnimateDisc(disc, transform.position, target));
            _responseDiscs.Add(disc);
        }

        private IEnumerator AnimateDisc(GameObject disc, Vector3 from, Vector3 to)
        {
            disc.transform.position = from;
            float el = 0f;
            while (el < 1.2f)
            {
                el += Time.deltaTime;
                float t = Mathf.Min(el / 1.2f, 1f);
                t = 1f - Mathf.Pow(1f - t, 3f);
                disc.transform.position = Vector3.Lerp(from, to, t);
                yield return null;
            }
        }
        #endregion

        #region Presence
        private IEnumerator PresenceLoop()
        {
            while (!_fadingOut)
            {
                yield return new WaitForSeconds(15f);
                var task = FirebaseManager.Instance.GetPresenceCount(Data.id);
                yield return new WaitUntil(() => task.IsCompleted);
                if (!task.IsFaulted) SetPresenceCount(task.Result);
            }
        }

        private void SetPresenceCount(int count)
        {
            count = Mathf.Min(count, maxDots);
            while (_presenceDots.Count < count) AddPresenceDot(_presenceDots.Count);
            while (_presenceDots.Count > count) RemoveLastDot();
        }

        private void AddPresenceDot(int idx)
        {
            var obj = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            obj.transform.SetParent(transform);
            obj.transform.localScale = Vector3.one * dotSize;
            var r = obj.GetComponent<Renderer>();
            r.material = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            r.material.color = new Color(1, 1, 1, 0.8f);
            obj.name = $"Dot_{idx}";

            _presenceDots.Add(new PresenceDotInfo
            {
                obj = obj,
                angle = (float)idx / maxDots * 360f,
                speed = Random.Range(8f, 15f),
                yOff = Random.Range(-0.1f, 0.1f)
            });
        }

        private void RemoveLastDot()
        {
            if (_presenceDots.Count == 0) return;
            var d = _presenceDots[_presenceDots.Count - 1];
            _presenceDots.RemoveAt(_presenceDots.Count - 1);
            if (d.obj != null) Destroy(d.obj);
        }
        #endregion

        #region Fade Out
        public void FadeOutAndDestroy()
        {
            _fadingOut = true;
            StartCoroutine(FadeOut());
        }

        private IEnumerator FadeOut()
        {
            Vector3 start = transform.localScale;
            float el = 0f;
            while (el < 0.4f)
            {
                el += Time.deltaTime;
                transform.localScale = Vector3.Lerp(start, Vector3.zero, el / 0.4f);
                yield return null;
            }
            Destroy(gameObject);
        }
        #endregion

        private class PresenceDotInfo
        {
            public GameObject obj;
            public float angle, speed, yOff;
        }
    }
}
