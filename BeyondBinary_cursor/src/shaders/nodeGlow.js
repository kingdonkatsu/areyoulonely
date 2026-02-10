export const nodeGlowVertex = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const nodeGlowFragment = `
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uPulseSpeed;
  uniform float uFresnelPower;

  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    float NdotV = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
    float fresnel = pow(1.0 - NdotV, uFresnelPower);

    float phase = dot(vWorldPos, vec3(1.0, 1.0, 1.0));
    float pulse = 1.0 + sin(uTime * uPulseSpeed * 6.2832 + phase) * 0.2;

    float emMul = uIntensity <= 0.3 ? 1.5
                : uIntensity <= 0.7 ? 3.0
                : 5.0;

    float emission = uIntensity * emMul * pulse;

    vec3 col = uColor * emission + uColor * fresnel * emission * 0.5;

    float alpha = mix(0.85, 0.1, fresnel);

    gl_FragColor = vec4(col, alpha);
  }
`;

export function createNodeUniforms(color, intensity) {
  return {
    uColor: { value: color },
    uIntensity: { value: intensity },
    uTime: { value: 0 },
    uPulseSpeed: { value: 1.0 },
    uFresnelPower: { value: 3.0 },
  };
}

