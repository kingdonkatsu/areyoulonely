Shader "EmotionalAR/PlatformGradient"
{
    Properties
    {
        _CenterColor ("Center Color", Color) = (0.898, 0.906, 0.922, 1.0)  // #E5E7EB
        _EdgeColor   ("Edge Color", Color)   = (0.898, 0.906, 0.922, 0.0)
        _FadeStart   ("Fade Start", Range(0,1)) = 0.8   // Last 20% fades out
        _NoiseScale  ("Noise Scale", Float)      = 2.0
        _NoiseHeight ("Noise Height", Float)     = 0.05  // ±0.05m displacement
    }

    SubShader
    {
        Tags
        {
            "RenderType"     = "Transparent"
            "Queue"          = "Transparent-50"
            "RenderPipeline" = "UniversalPipeline"
        }

        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Off

        Pass
        {
            Name "PlatformGradient"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv         : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float2 uv         : TEXCOORD0;
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _CenterColor;
                float4 _EdgeColor;
                float  _FadeStart;
                float  _NoiseScale;
                float  _NoiseHeight;
            CBUFFER_END

            // Simple Perlin-like hash noise
            float2 hash22(float2 p)
            {
                p = float2(dot(p, float2(127.1, 311.7)),
                           dot(p, float2(269.5, 183.3)));
                return frac(sin(p) * 43758.5453);
            }

            float perlinNoise(float2 p)
            {
                float2 i = floor(p);
                float2 f = frac(p);
                f = f * f * (3.0 - 2.0 * f); // smoothstep

                float a = dot(hash22(i + float2(0,0)) - 0.5, f - float2(0,0));
                float b = dot(hash22(i + float2(1,0)) - 0.5, f - float2(1,0));
                float c = dot(hash22(i + float2(0,1)) - 0.5, f - float2(0,1));
                float d = dot(hash22(i + float2(1,1)) - 0.5, f - float2(1,1));

                return lerp(lerp(a, b, f.x), lerp(c, d, f.x), f.y) + 0.5;
            }

            Varyings vert(Attributes IN)
            {
                Varyings OUT;

                // Apply Perlin noise vertex displacement on Y
                float noise = perlinNoise(IN.positionOS.xz * _NoiseScale);
                float3 displaced = IN.positionOS.xyz;
                displaced.y += (noise - 0.5) * _NoiseHeight * 2.0;

                OUT.positionCS = TransformObjectToHClip(displaced);
                OUT.uv = IN.uv;
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                // Radial distance from center (UV 0.5, 0.5)
                float2 centered = IN.uv - 0.5;
                float dist = length(centered) * 2.0; // 0 at center, 1 at edge

                // Gradient color
                half4 color = lerp(_CenterColor, _EdgeColor, smoothstep(_FadeStart, 1.0, dist));

                // Alpha: full at center, fade at edges (last 2m of 10m radius = 20%)
                color.a = lerp(_CenterColor.a, 0.0, smoothstep(_FadeStart, 1.0, dist));

                return color;
            }
            ENDHLSL
        }
    }

    FallBack "Universal Render Pipeline/Unlit"
}
