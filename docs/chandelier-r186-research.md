# three.js r186 水晶吊灯技术调研（源码实证）

> 调研基线：mrdoob/three.js r186 tag，HEAD `9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8`
> 所有属性名已对照 r186 `src/` 逐行验证。

## 1. MeshPhysicalMaterial 水晶属性（r186 验证表）

| 属性 | r186 默认值 | 源码位置（MeshPhysicalMaterial.js） |
|---|---|---|
| transmission | 0 | L361 (`this._transmission = 0`) |
| thickness | 0 | L280 |
| ior | 1.5 | L148 |
| dispersion（r163+） | 0 | L357 |
| iridescence | 0 | L358 |
| iridescenceIOR | 1.3 | L193 |
| specularIntensity | 1.0 | L320 |
| clearcoat | 0 | L356 (`this._clearcoat = 0`) |
| envMapIntensity | 1.0 | MeshStandardMaterial.js L348 |

关键链接：
- MeshPhysicalMaterial 源码: https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/src/materials/MeshPhysicalMaterial.js
- dispersion PR: https://github.com/mrdoob/three.js/pull/28051
- 官方文档: https://threejs.org/docs/pages/MeshPhysicalMaterial.html （dispersion 原话: "This property can only be used with transmissive objects"）
- GLTFLoader r186 支持 KHR_materials_dispersion / ior / transmission（GLTFLoader.js L634-638）: 下载的水晶 GLB 带这些扩展会自动生效
- F0 推导公式（lights_physical_fragment.glsl.js L45）: `specularColor = pow2((ior-1)/(ior+1)) * specularIntensity` → 高 ior 即高反射，无需 transmission

## 2. transmission 性能红线（源码实证）

WebGLRenderer.js:
- L1758-1782: 只要有 1 个 transmission > 0 的物体，每帧多一次完整不透明场景渲染到 RT
- L2012-2027: RT 全屏分辨率 + 4x MSAA + mipmap 链 + HalfFloat，按 camera 缓存一次分配
- pass 数量与 transmissive 对象个数无关（100 个水晶共享一次场景重渲）
- L297 + L2044: r186 新增 `renderer.transmissionResolutionScale`（默认 1.0），移动端设 0.5 可减半该 pass

论坛实证（discourse.threejs.org/t/60398）:
- "Clearcoat and all other highlighting props are relatively cheap, transmission and thickness are relatively expensive."
- "Transmission is an exception, since there's an additional pass required regardless of the size of the object."
- shader 复杂度成本 ∝ 屏幕占比；小物件用 PhysicalMaterial 便宜

微信浏览器结论:
- 首选无 transmission 方案（clearcoat + 高 ior + 高 envMapIntensity + alpha 混合）
- 硬要 transmission: transmissionResolutionScale=0.5、全场景仅一种水晶材质、屏幕占比小

## 3. 移动端推荐材质

### 方案 A（推荐）: 无 transmission
```js
const crystalMat = new THREE.MeshPhysicalMaterial({
  color: 0xffffff,
  metalness: 0,
  roughness: 0.02,
  ior: 1.8,                    // 抬 F0 → 水晶白高光
  clearcoat: 1.0,
  clearcoatRoughness: 0.03,
  iridescence: 0.12,           // 可选
  iridescenceIOR: 1.3,
  specularIntensity: 1.2,
  envMapIntensity: 2.2,
  transparent: true,
  opacity: 0.55,
  side: THREE.DoubleSide,
  depthWrite: false,
  flatShading: true,           // 八面体/棱柱 flat 法线 = 切割感
});
// 注意: 不要设 dispersion —— 无 transmission 时它无效
```

### 方案 B: 低端机 fallback（零额外成本）
```js
new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.05, envMapIntensity: 2.5 });
```

### 方案 C: 真折射（仅桌面端）
```js
// 在方案 A 基础上:
transmission: 1, thickness: 0.4, ior: 1.6, dispersion: 0.15,
transparent: false,   // transmission 时应设 false
depthWrite: true,
// renderer.transmissionResolutionScale = 0.5
```

## 4. Sparkle 方案（无后处理）

### A. 加色 Sprite 星光
```js
function makeStarTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  // 两条正交星芒
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    ctx.save();
    ctx.translate(32, 32);
    ctx.rotate(i * Math.PI / 2);
    const lg = ctx.createLinearGradient(-30, 0, 30, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.9)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(-30, -2.5, 60, 5);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const starTex = makeStarTexture();
const sparkles = [];
// 每 3~5 个水晶放 1 个，总 30~80 个
const mat = new THREE.SpriteMaterial({
  map: starTex, color: 0xffffff,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
});
const s = new THREE.Sprite(mat);
s.position.copy(worldPos);
s.scale.setScalar(0.05 + Math.random() * 0.08);
s.userData = { phase: Math.random() * Math.PI * 2, speed: 1.5 + Math.random() * 2.5 };
sparkles.push(s);

// 每帧
for (const sp of sparkles) {
  const tw = Math.pow(0.5 + 0.5 * Math.sin(t * sp.userData.speed + sp.userData.phase), 4);
  sp.material.opacity = tw;
  sp.material.rotation += 0.01;
}
```

### B. InstancedMesh 水晶滴
- 单 OctahedronGeometry(0.02, 0)（24 tri）× 300 实例 = 1 draw call
- instanceMatrix 静态设好（dummy Object3D + setMatrixAt），不再更新
- 闪烁: 每帧 setColorAt(i, col) 写 instanceColor（首次调用自动创建 buffer，无需 vertexColors），然后 instanceColor.needsUpdate = true
- y 拉伸 scale.set(1, 1.8, 1) 成水滴形

### C. 灯泡 flicker + halo
```js
// 双频正弦叠加 = 烛光感
bulbMat.emissiveIntensity = 1.5 + 0.4 * Math.sin(t * 7.3) + 0.2 * Math.sin(t * 13.7);
// halo: 灯泡位置大号加色 Sprite（径向渐变图，scale 0.2~0.4, opacity 0.15~0.25）
```

### D. 视角驱动 glint
sparkle 亮度与 (viewDir · facetNormal) 挂钩，仅正对切面时亮——真水晶 glint 核心特征。

## 5. 程序化吊灯模式（真实开源实证）

实证项目: https://github.com/Dekelelz/let-them-talk/blob/master/agent-bridge/office/assets/chandelier.js
（canopy 圆盘 → drop rod → TorusGeometry 主环 → 辐条 Cylinder → 垂线 → 球形灯罩 + emissive 灯丝 + PointLight）

1. 分层环: 极坐标 a=(i/count)*2π 分布 OctahedronGeometry 于不同半径/高度环
2. 悬垂链: 抛物线 y = startY - sag*4u(1-u) 近似悬链线（视觉等价 catenary），沿线 InstancedMesh 摆水晶滴
3. 弯曲烛臂: 3 点 CatmullRomCurve3 → TubeGeometry(curve, 12, 0.008, 6)，S 形臂 + 顶端 LatheGeometry 灯杯
4. 金属件共享 1 个 MeshStandardMaterial（metalness 1, roughness 0.25, envMapIntensity 1.5），水晶统一材质 + InstancedMesh，全灯 draw calls < 10

## 6. GLB + DRACO + 材质覆盖 + 自动缩放 + 阴影

### r186 DRACO API 变化（重要）
r186 的 setDecoderPath 同时接受字符串或 {js, wasm} 对象（DRACOLoader.js L102-116）:
- 字符串: setDecoderPath('/draco/') → 解析 /draco/draco_wasm_wrapper.js + /draco/draco_decoder.wasm
- 对象: setDecoderPath(DRACO_GLTF_CONFIG)（r186 官方示例 webgl_animation_keyframes.html 用法）
- 微信浏览器: 推荐自托管到 public/draco/（拷贝 node_modules/three/examples/jsm/libs/draco/gltf/ 下 wasm+wrapper），gstatic CDN 在微信内不稳定

### 完整管线
```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const draco = new DRACOLoader();
draco.setDecoderPath('/draco/');           // public/draco/ 自托管
draco.setDecoderConfig({ type: 'js' });    // 可选: 微信低版 fallback 用 js 解码器

const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

const TARGET_HEIGHT = 1.2; // 吊灯目标高度（世界单位）

loader.load('/models/chandelier.glb', (gltf) => {
  const model = gltf.scene;

  // 1) 材质覆盖: 玻璃/水晶替换为移动端安全材质
  const crystalMat = /* 方案 A 材质 */;
  const metalMat = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.25, envMapIntensity: 1.5 });
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    const m = obj.material;
    const isGlass = /glass|crystal|transparent/i.test(m.name || '') ||
                    (m.isMeshPhysicalMaterial && m.transmission > 0);
    obj.material = isGlass ? crystalMat : metalMat;
    // 2) 阴影: 金属框架投影，水晶不投（省阴影 pass）
    obj.castShadow = !isGlass;
    obj.receiveShadow = false;
    // 3) 合并提示: 同材质网格已被 GLTFLoader 分组，可后续 BufferGeometryUtils.mergeGeometries
  });

  // 4) 自动缩放到目标高度
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = TARGET_HEIGHT / size.y;
  model.scale.setScalar(scale);
  // 5) 底部对齐/顶部悬挂: 平移使 bbox 顶部位于挂点
  model.position.y -= box.min.y * scale;      // 底部对齐 y=0
  // 或悬挂: model.position.y = mountY - box.max.y * scale;

  scene.add(model);
});
```

要点:
- transmission GLB 检测: `m.isMeshPhysicalMaterial && m.transmission > 0` → 换成方案 A 材质（省一整个 pass）
- castShadow 只给金属框架，水晶透明网格不投阴影（阴影 pass 更便宜且避免黑色透明投影 artifact）
- 纹理过大的 GLB 用 texture.maxAnisotropy 控制或 KTX2 压缩（本期可不做）

## 7. 参考资料
- three.js r186 MeshPhysicalMaterial: https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/src/materials/MeshPhysicalMaterial.js
- transmission pass 实现: https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/src/renderers/WebGLRenderer.js (L1758, L2002-2090)
- dispersion PR #28051: https://github.com/mrdoob/three.js/pull/28051
- 官方 dispersion 示例: https://threejs.org/examples/webgl_loader_gltf_dispersion.html
- 官方 sprites 示例: https://threejs.org/examples/webgl_sprites.html
- DRACOLoader r186: https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/examples/jsm/loaders/DRACOLoader.js (L102-116)
- 官方 draco 示例: https://github.com/mrdoob/three.js/blob/9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8/examples/webgl_animation_keyframes.html
- 论坛性能帖: https://discourse.threejs.org/t/meshphysicalmaterial-can-i-measure-how-much-more-expensive-it-is/60398
- 论坛 transmission 优化帖: https://discourse.threejs.org/t/meshtransmissionmaterial-poor-performances-urgent/68566
- 开源吊灯实例: https://github.com/Dekelelz/let-them-talk/blob/master/agent-bridge/office/assets/chandelier.js
