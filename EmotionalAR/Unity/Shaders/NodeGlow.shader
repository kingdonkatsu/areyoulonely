Shader "EmotionalAR/NodeGlow"
{
    Properties
    {
        _Color        ("Color", Color)           = (1, 1, 1, 1)
        _Intensity    ("Intensity", Range(0,1))  = 0.5
        _PulseSpeed   ("Pulse Speed", Float)     = 1.0
        _FresnelPower ("Fresnel Power", Float)   = 3.0
    }

    SubShader
    {
        Tags
        {
            "RenderType"     = "Transparent"
            "Queue"          = "Transparent"
            "RenderPipeline" = "UniversalPipeline"
        }

        Blend One One  // Additive blending for soft glow overlap
        ZWrite Off
        Cull Back

        Pass
        {
            Name "NodeGlow"
            Tags { "LightMode" = "UniversalForward" }

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS   : NORMAL;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 normalWS   : TEXCOORD0;
                float3 viewDirWS  : TEXCOORD1;
                float3 positionWS : TEXCOORD2;
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _Color;
                float  _Intensity;
                float  _PulseSpeed;
                float  _FresnelPower;
            CBUFFER_END

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                VertexPositionInputs posInputs = GetVertexPositionInputs(IN.positionOS.xyz);
                VertexNormalInputs   nrmInputs = GetVertexNormalInputs(IN.normalOS);

                OUT.positionCS = posInputs.positionCS;
                OUT.positionWS = posInputs.positionWS;
                OUT.normalWS   = nrmInputs.normalWS;
                OUT.viewDirWS  = GetWorldSpaceNormalizeViewDir(posInputs.positionWS);
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                // Fresnel rim lighting — brighter at edges
                float NdotV   = saturate(dot(normalize(IN.normalWS), normalize(IN.viewDirWS)));
                float fresnel = pow(1.0 - NdotV, _FresnelPower);

                // Emission pulse (sine wave with per-object phase via position)
                float phase = dot(IN.positionWS, float3(1,1,1));
                float pulse = 1.0 + sin(_Time.y * _PulseSpeed * 6.2832 + phase) * 0.2;

                // Emission multiplier from intensity
                float emMul = _Intensity <= 0.3 ? 1.5
                            : _Intensity <= 0.7 ? 3.0
                            : 5.0;

                float emission = _Intensity * emMul * pulse;

                // Radial alpha falloff: 0.7 at center (facing camera) → 0.0 at edges
                float alpha = lerp(0.7, 0.0, fresnel);

                // Combine: base color × emission + rim glow
                half3 col = _Color.rgb * emission + _Color.rgb * fresnel * emission * 0.5;

                return half4(col, alpha);
            }
            ENDHLSL
        }
    }

    FallBack "Universal Render Pipeline/Unlit"
}
