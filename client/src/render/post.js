// Post-processing (jen střední a vysoká grafika): scéna se kreslí v HDR do bufferu a pak v jednom průchodu přidá
// mlhu s výškou a září slunce, sluneční paprsky (ze stínové mapy), záři světel (bloom), tónování a barevné ladění vzhledu.
// Vysoká navíc zastínění koutů (N8AO v polovičním rozlišení). Nízká grafika tohle vůbec nepoužívá (renderer kreslí rovnou).
import { N8AOPostPass } from 'n8ao';
import { BloomEffect, Effect, EffectAttribute, EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import * as THREE from 'three';
import { SHADOW_PARS_GLSL } from './light-glsl.js';
import { FX, LK } from './look.js';
import { FOG, U, camera, renderer, scene } from './renderer.js';

// ------------------------------------------------------------ mlha, záře slunce v mlze, paprsky
const ATMOS_GLSL = /* glsl */`
  uniform mat4 uInvProj, uCamWorld;
  uniform vec3 uCamPos, uFogColor, uSunDir, uSunCol;
  uniform float uDensity, uFalloff, uScatter, uSkyHaze, uUnder, uShafts, uNight;
  ${SHADOW_PARS_GLSL}
  vec3 viewPos(vec2 uv, float d) { vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }
  void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
    bool sky = depth >= 0.999999;
    vec3 vp = viewPos(uv, sky ? 0.5 : depth);
    vec3 wp = (uCamWorld * vec4(vp, 1.0)).xyz;
    vec3 rd = normalize(wp - uCamPos);
    float dist = sky ? 3.0 / max(uDensity, 1e-4) : length(wp - uCamPos);
    // hustota mlhy klesá s výškou (údolí a rybníky mají opar, kopce jsou čisté); v jeskyni je mlha všude stejná
    float dy = rd.y * dist * uFalloff;
    float hf = exp(-uFalloff * (uCamPos.y - 1.0)) * (abs(dy) > 1e-3 ? (1.0 - exp(-dy)) / dy : 1.0);
    hf = mix(clamp(hf, 0.25, 3.0), 1.0, uUnder);
    float tau = uDensity * dist;
    float fog = 1.0 - exp(-tau * tau * hf);
    if (sky) fog *= uSkyHaze * (1.0 - smoothstep(0.0, 0.35, rd.y));
    // záře slunce v mlze: úzká kolem slunce a široká do strany
    float mu = max(dot(rd, uSunDir), 0.0);
    vec3 fogCol = uFogColor + uSunCol * (pow(mu, 10.0) * 0.55 + pow(mu, 3.0) * 0.12) * uScatter * (1.0 - uUnder);
    vec3 col = mix(inputColor.rgb, fogCol, fog);
    #if SHAFTS
    // paprsky: kousky paprsku ke kameře, které nejsou ve stínu, rozptýlí sluneční světlo (12 kroků, s rozptylem šumem)
    if (uShadowP.x > 0.5 && uShafts > 0.0) {
      float L = min(dist, 55.0), lit = 0.0, j = ign(gl_FragCoord.xy);
      for (int i = 0; i < 12; i++) {
        vec3 p = uCamPos + rd * L * ((float(i) + j) / 12.0);
        vec4 sc = uShadowMatrix * vec4(p, 1.0);
        vec2 e = min(sc.xy, 1.0 - sc.xy);
        lit += (e.x < 0.0 || e.y < 0.0) ? 1.0 : shadowTap(sc.xy, sc.z - 0.001);
      }
      lit /= 12.0;
      float g = 0.76, ph = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * dot(rd, uSunDir), 1.5) * 0.035;
      col += uSunCol * lit * ph * uShafts * (1.0 - exp(-L * 0.018)) * (1.0 - uUnder);
    }
    #endif
    outputColor = vec4(col, inputColor.a);
  }
`;
class AtmosphereEffect extends Effect {
  constructor() {
    const u = (v) => new THREE.Uniform(v);
    super('AtmosphereEffect', ATMOS_GLSL, {
      attributes: EffectAttribute.DEPTH,
      defines: new Map([['SHAFTS', FX.shafts ? '1' : '0']]),
      uniforms: new Map([
        ['uInvProj', u(new THREE.Matrix4())], ['uCamWorld', u(new THREE.Matrix4())], ['uCamPos', u(new THREE.Vector3())],
        ['uFogColor', u(new THREE.Vector3())], ['uSunDir', U.sunDir], ['uSunCol', u(new THREE.Vector3())],
        ['uDensity', u(0)], ['uFalloff', u(LK.fog.falloff)], ['uScatter', u(LK.fog.scatter)], ['uSkyHaze', u(LK.fog.skyHaze)],
        ['uUnder', u(0)], ['uShafts', u(LK.shafts)], ['uNight', U.night],
        ['uShadowMap', U.shadowMap], ['uShadowMatrix', U.shadowMatrix], ['uShadowP', U.shadowP], ['uShadowStrength', U.shadowStrength],
      ]),
    });
  }
  update() {
    const g = (k) => this.uniforms.get(k).value;
    g('uInvProj').copy(camera.projectionMatrixInverse);
    g('uCamWorld').copy(camera.matrixWorld);
    g('uCamPos').setFromMatrixPosition(camera.matrixWorld);
    const t = LK.fog.tint, c = FOG.color;
    g('uFogColor').set(c.r * t[0], c.g * t[1], c.b * t[2]);
    g('uSunCol').copy(U.sunColor.value);
    this.uniforms.get('uDensity').value = FOG.density * LK.fog.density;
    this.uniforms.get('uUnder').value = post.under;
    // vzhled se dá ladit za běhu (game.LK v konzoli)
    this.uniforms.get('uFalloff').value = LK.fog.falloff;
    this.uniforms.get('uScatter').value = LK.fog.scatter;
    this.uniforms.get('uSkyHaze').value = LK.fog.skyHaze;
    this.uniforms.get('uShafts').value = LK.shafts;
  }
}

// ------------------------------------------------------------ tónování a barevné ladění vzhledu
// AgX s „lookem“ (jako Blender AgX Punchy): power = kontrast v logaritmickém prostoru, agxSat = sytost.
const AGX_GLSL = /* glsl */`
  uniform float uAgxPower, uAgxSat;
  vec3 agxLook(vec3 color) {
    const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
    const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
    color *= toneMappingExposure;
    color = inset * (LINEAR_SRGB_TO_LINEAR_REC2020 * color);
    color = clamp((log2(max(color, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
    color = agxDefaultContrastApprox(color);
    float l = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = pow(max(color, 0.0), vec3(uAgxPower));
    color = l + uAgxSat * (color - l);
    color = outset * color;
    color = pow(max(vec3(0.0), color), vec3(2.2));
    return clamp(LINEAR_REC2020_TO_LINEAR_SRGB * color, 0.0, 1.0);
  }
`;
const TONE = { agx: 'agxLook', aces: 'ACESFilmicToneMapping', neutral: 'NeutralToneMapping' }[LK.tone];
const LOOK_GLSL = /* glsl */`
  #include <tonemapping_pars_fragment>
  ${AGX_GLSL}
  uniform float uSat, uContrast, uVignette, uGrain;
  uniform vec3 uLift, uGain;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = ${TONE}(max(inputColor.rgb, 0.0));
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    c = max((c - 0.18) * uContrast + 0.18, 0.0);
    c = c * uGain + uLift * (1.0 - c);
    vec2 d = uv - 0.5;
    c *= 1.0 - uVignette * smoothstep(0.2, 0.75, dot(d, d) * 2.0);
    if (uGrain > 0.0) c += (fract(sin(dot(uv * 913.7 + fract(time * 7.3), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * uGrain * smoothstep(0.0, 0.25, l) * (1.0 - l * 0.6);
    outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
  }
`;
class LookEffect extends Effect {
  constructor() {
    const G = LK.grade;
    super('LookEffect', LOOK_GLSL, {
      uniforms: new Map([
        ['uSat', new THREE.Uniform(G.sat)], ['uContrast', new THREE.Uniform(G.contrast)], ['uVignette', new THREE.Uniform(G.vignette)],
        ['uLift', new THREE.Uniform(new THREE.Vector3(...G.lift))], ['uGain', new THREE.Uniform(new THREE.Vector3(...G.gain))],
        ['uGrain', new THREE.Uniform(LK.grain)], ['uAgxPower', new THREE.Uniform(G.power ?? 1)], ['uAgxSat', new THREE.Uniform(G.agxSat ?? 1)],
      ]),
    });
  }
  update() {
    const G = LK.grade, u = this.uniforms;
    u.get('uSat').value = G.sat; u.get('uContrast').value = G.contrast; u.get('uVignette').value = G.vignette;
    u.get('uLift').value.set(...G.lift).multiplyScalar(1 - post.under * 0.75); u.get('uGain').value.set(...G.gain); // v jeskyni bez barevného nádechu tmy
    u.get('uGrain').value = LK.grain; u.get('uAgxPower').value = G.power ?? 1; u.get('uAgxSat').value = G.agxSat ?? 1;
    const B = LK.bloom, b = post.bloom;
    b.intensity = B.intensity; b.luminanceMaterial.threshold = B.threshold; b.luminanceMaterial.smoothing = B.smoothing; b.mipmapBlurPass.radius = B.radius;
  }
}

// ------------------------------------------------------------ složení průchodů
export const post = { composer: null, under: 0, ao: null, bloom: null };
function build() {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: FX.msaa, stencilBuffer: false });
  composer.addPass(new RenderPass(scene, camera));
  if (FX.ao) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const ao = new N8AOPostPass(scene, camera, size.x, size.y);
    ao.setQualityMode('Performance');
    Object.assign(ao.configuration, { aoRadius: LK.ao.radius, distanceFalloff: 1.2, intensity: LK.ao.intensity, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, color: new THREE.Color(0, 0, 0) });
    composer.addPass(ao);
    post.ao = ao;
  }
  const B = LK.bloom;
  post.bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: B.threshold, luminanceSmoothing: B.smoothing, intensity: B.intensity, radius: B.radius, resolutionScale: 0.5 });
  composer.addPass(new EffectPass(camera, new AtmosphereEffect(), post.bloom, new LookEffect()));
  post.composer = composer;
  addEventListener('resize', () => composer.setSize(innerWidth, innerHeight));
}
// Dynamické rozlišení: když snímek trvá déle než ~18 ms (pod 55 fps), kreslí se v menším rozlišení (až 60 %),
// když je rezerva, zase se vrátí. Hra tak na slabším notebooku zůstane plynulá i s vysokou grafikou.
const dyn = { t: 0, sum: 0, n: 0, wait: 3, base: 1 };
post.scale = 1;
function dynamicResolution(dt) {
  dyn.sum += dt; dyn.n++;
  if ((dyn.t += dt) < 1.5) return;
  const avg = dyn.sum / dyn.n;
  dyn.t = dyn.sum = dyn.n = 0;
  if ((dyn.wait -= 1.5) > 0) return; // první vteřiny se hra teprve rozjíždí
  const s = avg > 0.0185 ? Math.max(0.6, post.scale - 0.1) : avg < 0.0135 ? Math.min(1, post.scale + 0.05) : post.scale;
  if (Math.abs(s - post.scale) < 1e-3) return;
  post.scale = s;
  renderer.setPixelRatio(dyn.base * s);
  post.composer.setSize(innerWidth, innerHeight);
}
/** Nakreslí snímek: s post-processingem přes composer, jinak rovnou. */
export function renderFrame(dt) {
  if (!FX.post) { renderer.render(scene, camera); return; }
  if (!post.composer) { dyn.base = renderer.getPixelRatio(); build(); }
  post.composer.render(dt);
  dynamicResolution(dt);
}
