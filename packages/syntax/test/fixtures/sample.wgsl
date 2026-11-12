struct Vertex { @location(0) pos: vec3<f32>, };
@group(0) @binding(0) var<uniform> mvp: mat4x4<f32>;
fn shade(v: Vertex, k: f32) -> vec4<f32> { return helper(v.pos) * k; }
@vertex fn main(v: Vertex) -> @builtin(position) vec4<f32> { return shade(v, 1.0); }
