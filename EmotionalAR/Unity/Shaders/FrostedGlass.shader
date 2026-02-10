Shader "EmotionalAR/FrostedGlass"
{
    Properties
    {
        _TintColor    ("Tint Color", Color)            = (1, 1, 1, 0.15)
        _BlurAmount   ("Blur Amount", Range(0, 10))    = 10.0
        _BorderColor  ("Border Color", Color)          = (1, 1, 1, 0.3)
        _BorderWidth  ("Border Width", Range(0, 0.05)) = 0.01
    }

    SubShader
    {
        Tags
        {
            "RenderType"     = "Transparent"
            "Queue"          = "Transparent+100"
            "RenderPipeline" = "UniversalPipeline"
        }

        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Back

        // ── Pass 1: Frosted glass body ──────────────────────────────────────
        Pass
        {
            Name "FrostedGlass"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float2 uv         : TEXCOORD0;
                float3 normalOS   : NORMAL;
            };

            struct Varyings
            {
                float4 positionCS  : SV_POSITION;
                float2 uv          : TEXCOORD0;
                float4 screenPos   : TEXCOORD1;
                float3 normalWS    : TEXCOORD2;
                float3 viewDirWS   : TEXCOORD3;
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _TintColor;
                float  _BlurAmount;
                float4 _BorderColor;
                float  _BorderWidth;
            CBUFFER_END

            // Opaque texture for background sampling (URP)
            TEXTURE2D(_CameraOpaqueTexture);
            SAMPLER(sampler_CameraOpaqueTexture);

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                VertexPositionInputs posInputs = GetVertexPositionInputs(IN.positionOS.xyz);
                VertexNormalInputs   nrmInputs = GetVertexNormalInputs(IN.normalOS);

                OUT.positionCS = posInputs.positionCS;
                OUT.uv         = IN.uv;
                OUT.screenPos  = ComputeScreenPos(OUT.positionCS);
                OUT.normalWS   = nrmInputs.normalWS;
                OUT.viewDirWS  = GetWorldSpaceNormalizeViewDir(posInputs.positionWS);
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                float2 screenUV = IN.screenPos.xy / IN.screenPos.w;

                // Multi-sample blur approximation (box blur)
                float2 texelSize = float2(1.0 / _ScreenParams.x, 1.0 / _ScreenParams.y);
                float blurRadius = _BlurAmount;

                half3 blurColor = half3(0, 0, 0);
                int samples = 0;

                for (int x = -2; x <= 2; x++)
                {
                    for (int y = -2; y <= 2; y++)
                    {
                        float2 offset = float2(x, y) * texelSize * blurRadius;
                        blurColor += SAMPLE_TEXTURE2D(_CameraOpaqueTexture,
                                     sampler_CameraOpaqueTexture, screenUV + offset).rgb;
                        samples++;
                    }
                }
                blurColor /= samples;

                // Tint over blur
                half3 finalColor = lerp(blurColor, _TintColor.rgb, _TintColor.a);

                // Inner shadow for depth (darker at bottom edge)
                float innerShadow = smoothstep(0.0, 0.15, IN.uv.y);
                finalColor *= lerp(0.85, 1.0, innerShadow);

                // Border glow at edges (simple UV distance)
                float edgeDist = min(min(IN.uv.x, 1.0 - IN.uv.x),
                                     min(IN.uv.y, 1.0 - IN.uv.y));
                float borderMask = 1.0 - smoothstep(0.0, _BorderWidth, edgeDist);
                finalColor = lerp(finalColor, _BorderColor.rgb, borderMask * _BorderColor.a);

                return half4(finalColor, 0.85);
            }
            ENDHLSL
        }
    }

    FallBack "Universal Render Pipeline/Unlit"
}
