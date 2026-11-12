#include "common.hlsl"
cbuffer Cam { float4x4 mvp; };
struct VSIn { float3 pos : POSITION; };
float4 shade(float3 n) { return float4(normalize(n), helper(n)); }
float4 main(VSIn v) : SV_POSITION { return mul(mvp, float4(v.pos, 1.0)); }
