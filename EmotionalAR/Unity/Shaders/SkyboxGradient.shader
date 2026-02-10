Shader "EmotionalAR/SkyboxGradient"
{
    Properties
    {
        _TopColor     ("Top Color", Color)     = (0.878, 0.906, 1.0, 1.0)    // #E0E7FF lavender
        _HorizonColor ("Horizon Color", Color) = (0.953, 0.957, 0.965, 1.0)  // #F3F4F6 off-white
    }

    SubShader
    {
        Tags
        {
            "RenderType" = "Background"
            "Queue"      = "Background"
            "PreviewType" = "Skybox"
        }

        Cull Off
        ZWrite Off

        Pass
        {
            Name "SkyboxGradient"

            HLSLPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            struct Attributes
            {
                float4 positionOS : POSITION;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 viewDir    : TEXCOORD0;
            };

            CBUFFER_START(UnityPerMaterial)
                float4 _TopColor;
                float4 _HorizonColor;
            CBUFFER_END

            Varyings vert(Attributes IN)
            {
                Varyings OUT;
                OUT.positionCS = TransformObjectToHClip(IN.positionOS.xyz);
                OUT.viewDir    = IN.positionOS.xyz;
                return OUT;
            }

            half4 frag(Varyings IN) : SV_Target
            {
                float3 dir = normalize(IN.viewDir);

                // Vertical angle: 0 at horizon, 1 at zenith
                // Linear transition over 90° vertical angle
                float t = saturate(dir.y);

                // Smooth gradient
                half3 color = lerp(_HorizonColor.rgb, _TopColor.rgb, t);

                return half4(color, 1.0);
            }
            ENDHLSL
        }
    }

    FallBack Off
}
