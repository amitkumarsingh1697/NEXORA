#version 330
#include "common.glsl"
uniform mat4 mvp;
struct Light { vec3 pos; };
vec3 shade(vec3 n, Light l) { return normalize(n) * helper(l.pos); }
void main() { gl_Position = mvp * vec4(shade(vec3(1.0), Light(vec3(0.0))), 1.0); }
