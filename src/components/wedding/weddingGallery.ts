import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * 纯 three.js 实现的第一人称婚礼画廊。
 *
 * 设计参考：`3D婚礼画廊设计/src/gallery.ts`（Vite 原型），此处按 Next.js + 触屏
 * 双摇杆需求重写：
 * - 场景由代码程序化构建（大理石地板 / 粉色墙 / 玫瑰金石膏线 / 红毯 / 吊灯 /
 *   拱门玫瑰花环 / 多立克柱 / 山花 / CanvasTexture 标牌 / 飘落花瓣粒子）。
 * - 照片来自 site 配置（循环取模铺满左右墙各 8 张，共 16 张），每张由可见轨道射灯
 *   及其假光（emissive + 墙面光池）照亮，不用逐张实时 SpotLight。
 * - 桌面：PointerLock 鼠标视角 + WASD；移动端：左右虚拟摇杆（React 层提供），
 *   由 `setMoveInput` / `setLookInput` 注入。
 * - `dispose()` 会取消动画帧、移除监听、遍历场景释放 geometry/material/texture。
 */

export type GalleryPhoto = {
  readonly src: string;
  readonly label: string;
  readonly sub: string;
};

/** 一张照片（按 URL 共享）的纹理状态：base 常驻档，hd 走近时的高清档 */
type PhotoEntry = {
  base: THREE.Texture | null;
  hdUrl: string | null;
  hd: THREE.Texture | null;
  hdLoading: boolean;
  /** 上次仍需要高清的时间，超过 HD_KEEP_MS 就释放回常驻档 */
  hdWantedAt: number;
  /** 常驻档纹理的长边像素，用于判断照片在屏幕上是否已被放大 */
  baseLong: number;
  /** 画框比例（照片比例不同时居中裁切），0 = 不裁切 */
  cover: number;
  mats: THREE.MeshBasicMaterial[];
  waiters: (() => void)[];
  settled: boolean;
};

/**
 * 随机分布到 3D 世界的照片，w/h 为 src 的像素尺寸。
 * ktx2：常驻纹理（显存约为 JPEG 的 1/8），缺省或设备不支持时用 src；
 * hd：走近照片时按需加载的高清版，远离后释放。
 */
export type WorldPhoto = {
  readonly src: string;
  readonly small: string;
  readonly hd?: string;
  readonly ktx2?: string;
  readonly w: number;
  readonly h: number;
};

export type WeddingGalleryOptions = {
  photos: readonly GalleryPhoto[];
  /** 后墙、侧墙、草坪/沙滩画架用的照片（按编号 1..n 引用），photos 只提供侧墙铭牌文字 */
  worldPhotos?: readonly WorldPhoto[];
  /** 画框位置 → 照片编号（从 1 开始），位置名见 photoForSlot；没写的位置按编号顺延补齐 */
  photoLayout?: Readonly<Record<string, number>>;
  /** 标牌主标题，如「婚礼画廊」 */
  title: string;
  /** 新人姓名，如「徐俊杰 ♡ 鲍阳阳」 */
  namesLine: string;
  /** 日期，如「2026.11.10」 */
  dateLine: string;
  /**
   * 后墙两侧整墙高的两张竖幅照片 [左, 右]（3:4）。
   * 不传时回退到 opts.photos 的前两张。
   */
  wallPhotos?: readonly [string, string];
  /** 是否为触屏设备（触屏不锁指针，改用摇杆） */
  touch: boolean;
  /** 户外主题：草坪或沙滩，默认 "lawn" */
  outdoor?: "lawn" | "beach";
  /** 所有照片纹理加载完成（或失败）后触发一次 */
  onReady: () => void;
  /** 「是否已进入画廊」状态变化：桌面 = pointer lock 状态，触屏 = 进入/退出 */
  onActiveChange: (active: boolean) => void;
  /** 户外主题切换时通知（含键盘 T 触发），用于同步 React 层按钮文案 */
  onOutdoorChange?: (kind: "lawn" | "beach") => void;
  /** 分步构建中途失败（构造器已返回，外层 try/catch 接不到），由外层回退到 CSS 版画廊 */
  onError?: () => void;
};

/**
 * 调色板：象牙白为基调，粉与香槟金作点缀（高端婚礼审美）。
 * 命名对应：wallUpper=上半墙、wainscot=下半墙护墙板、champagne=香槟金。
 */
const C = {
  wallUpper: "#f6e7e3",
  wainscot: "#faf6f0",
  ceil: "#f8f3ec",
  ceilBeam: "#ddc9a3",
  ceilPanel: "#f0eae1",
  plasterRose: "#968478",
  archIvory: "#faf6f0",
  roseMetal: "#c9a0a8",
  champagne: "#c9a96e",
  champagneLight: "#ddc9a3",
  deepWine: "#7a2240",
  marble: "#f3ece5",
  marbleVein: "#c8bbae",
  carpet: "#b9828d",
  // 室外：雾色与背景统一到地平线的淡蓝白，保证天空球未覆盖处也不会露出酒红
  fog: "#dfeaf4",
  sky: "#dcecf8",
  // 石板路的暖米色 tint（paving 原贴图偏灰）
  pavingTint: "#efe3cf",
  // 玫瑰统一在低饱和玫瑰/象牙色系内，具体色相亮度在 makeRose 中做 HSL 微抖动
  roseColors: ["#f3d9dd", "#eec2cc", "#e8aebc", "#f7e6e6", "#d98fa3", "#f5e0e3"],
  leafColors: ["#7d9b74", "#6b8a63", "#8aa87e"],
} as const;

const clamp = THREE.MathUtils.clamp;

/**
 * 草坪共享 GLSL：地面 shader 与草叶 shader 必须注入同一份，
 * 才能保证大尺度斑块、明暗变化在两种几何上完全对齐。
 */
const LAWN_SHARED_GLSL = /* glsl */ `
float lawnHash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}
float lawnNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(lawnHash(i), lawnHash(i + vec2(1.0, 0.0)), u.x),
    mix(lawnHash(i + vec2(0.0, 1.0)), lawnHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
// 天然草地大尺度斑块：x=明度(0.82~1.16)、y=色相(-1 偏蓝绿…+1 偏黄干)、z=土壤/枯斑权重(0~1)
vec3 lawnPattern(vec2 wp) {
  float n1 = lawnNoise(wp * 0.075);
  float n2 = lawnNoise(wp * 0.021 + 7.3);
  float n3 = lawnNoise(wp * 0.34 + 3.1);
  float soil = smoothstep(0.68, 0.94, n2 * 0.72 + n3 * 0.28);
  return vec3(
    1.0 + (n1 - 0.5) * 0.18 + (n2 - 0.5) * 0.12,
    (n1 - 0.5) * 1.7 + (n2 - 0.5) * 0.8,
    soil
  );
}
// 暮色草甸混色：整体压住干草棕、保住绿相（hue 正偏黄干但幅度收敛，soil 走深绿"苔斑"而非土壤）
vec3 lawnTint(float hue, float soil) {
  vec3 fresh = clamp(vec3(1.0) + vec3(0.07, 0.07, -0.08) * hue, 0.88, 1.12);
  vec3 dry = vec3(1.08, 1.09, 0.88);
  vec3 mossy = vec3(0.66, 0.85, 0.55);
  vec3 t = mix(fresh, dry, clamp(hue * 0.5 + 0.5, 0.0, 1.0) * 0.38);
  return mix(t, mossy, soil * 0.55);
}
// 白石花拱小径：奶油石灰岩路面反照率（世界坐标排布：纵向 0.85m 一排 × 横向 0.5m 一板，隔排错缝）
vec3 lawnStoneAlbedo(vec2 wp, float archZ) {
  float curve = sin((wp.y - archZ) * 0.10) * 0.55;
  float d = wp.x - curve;
  float row = floor(wp.y / 0.85);
  float u = d + mod(row, 2.0) * 0.25;
  vec2 cellId = vec2(floor(u / 0.5), row);
  float fu = fract(u / 0.5);
  float fv = fract(wp.y / 0.85);
  // 每板随机明度/色温 + 石面细斑（两级噪声）
  float rnd = lawnHash(cellId + 7.13);
  float grain = lawnNoise(wp * 6.7) * 0.6 + lawnNoise(wp * 21.0) * 0.4;
  vec3 base = vec3(0.560, 0.520, 0.425) * (0.86 + rnd * 0.26) * (0.94 + grain * 0.12);
  // 收边石带：路缘两列更亮的长条石
  float ad = abs(d);
  float kerb = smoothstep(0.97, 1.03, ad) * (1.0 - smoothstep(1.14, 1.20, ad));
  base = mix(base, vec3(0.635, 0.605, 0.535) * (0.92 + rnd * 0.16), kerb);
  // 草缘青苔洇染（靠草地一侧略带绿）
  base *= mix(vec3(1.0), vec3(0.92, 0.97, 0.87), smoothstep(0.85, 1.40, ad) * 0.45);
  // 板缝：距板边 <3.5cm 压暗成细缝
  float ex = min(fu, 1.0 - fu) * 0.5;
  float ey = min(fv, 1.0 - fv) * 0.85;
  float joint = smoothstep(0.012, 0.036, min(ex, ey));
  return base * mix(0.40, 1.0, joint);
}
// 白石小径遮罩：z ∈ [门口, 舞台前] 的缓弯走廊（1.36m 石面 + 0.26m 草缘过渡），0=路径 1=草地（地面与草叶共用）
float lawnPathMask(vec2 wp, float archZ) {
  if (wp.y < archZ + 0.8) return 1.0;
  float curve = sin((wp.y - archZ) * 0.10) * 0.55;
  float d = abs(wp.x - curve);
  if (d > 1.62) return 1.0;
  return smoothstep(1.36, 1.62, d);
}
float lawnLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;


/** 圆形碰撞体（柱子 / 基座） */
type Circle = { x: number; z: number; r: number };


/**
 * 过道装饰中批量实例化的花艺收集桶：构建期先把每朵花/叶的变换与颜色推进数组，
 * 最后一次性生成 3 个 InstancedMesh（玫瑰 / 绣球 / 叶），避免逐朵建 Mesh 的 draw call 爆炸。
 */
type Floral = {
  roses: THREE.Matrix4[];
  roseColors: THREE.Color[];
  hydrangeas: THREE.Matrix4[];
  hydColors: THREE.Color[];
  leaves: THREE.Matrix4[];
  leafColors: THREE.Color[];
};

/** 过道装饰构建上下文：共享材质 + 花艺桶 + 烛杯/蜡烛实例变换 */
type AisleCtx = {
  floral: Floral;
  /** 花柱顶花团单列一桶，GLB 花束就绪后整组隐藏，不影响其余程序化花艺 */
  pillarFloral: Floral;
  /** 花拱花艺单列一桶，rose-parts.glb 就绪后整组隐藏，不影响其余程序化花艺 */
  archFloral: Floral;
  goldMat: THREE.Material;
  marbleMat: THREE.Material;
  glassMat: THREE.Material;
  candleMat: THREE.Material;
  cupMats: THREE.Matrix4[];
  candleMats: THREE.Matrix4[];
};

/**
 * 大理石脉络描述：color / roughness / normal 三张贴图共用同一份布局，
 * 确保反光脉络、法线起伏与颜色纹路严格对齐。
 */
type MarbleVein = {
  x0: number;
  y0: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x1: number;
  y1: number;
  width: number;
  alpha: number;
  /** 细深脉（Calacatta 的暗裂纹），false 为宽软脉 */
  fine: boolean;
};

/** 一组真实 PBR 贴图（color / normal / rough / ao），均由 loadPbrSet 登记到生命周期 */
type PbrSet = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap: THREE.Texture;
};

/** GLB 中拆分出的单个 primitive：几何已烘焙模型内世界矩阵，材质为源材质引用 */
type GlbPrimitive = {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
};

/**
 * 归一化后的 GLB 模板：原点位于包围盒水平中心、底部对齐 y=0，
 * 便于按「底心」做缩放 / 旋转 / 落地对齐。
 */
type GlbTemplate = {
  primitives: GlbPrimitive[];
  size: THREE.Vector3;
};

/** 单支长茎玫瑰的实例摆放：世界矩阵 + 花头实例色 */
type StemPlacement = {
  matrix: THREE.Matrix4;
  color: THREE.Color;
};

export class WeddingGallery {
  private readonly canvas: HTMLCanvasElement;
  private readonly opts: WeddingGalleryOptions;

  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: PointerLockControls | null = null;
  private readonly clock = new THREE.Clock();
  private readonly perfEnabled =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("galleryPerf") === "1";
  private readonly noGrassDebug =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("galleryNoGrass") === "1";
  /** 保留小径花带，默认不生成分散的草甸玫瑰；可用参数对照原场景。 */
  private readonly showMeadowRoses =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("galleryShowMeadowRoses") === "1";
  /** 手机默认压低小径花带密度；仅用于 A/B 的完整花带开关。 */
  private readonly fullLawnFlowers =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("galleryFullLawnFlowers") === "1";
  /** 默认隐藏画廊中央两盏大吊灯；设为 1 才恢复，便于手机性能对照。 */
  private readonly showChandeliers =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("galleryShowChandeliers") === "1";
  /** 三盏小吊灯不默认恢复；仅用于完整灯具的性能与观感对照。 */
  private readonly showSmallChandeliers =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("galleryShowSmallChandeliers") === "1";
  private perfPanel: HTMLPreElement | null = null;
  private perfLastFrame = 0;
  private perfLastReport = 0;
  private perfSamples: { frame: number; update: number; render: number; marker: string }[] = [];
  private perfMarker = "init";
  private perfPhoto = "-";
  private perfEvents: string[] = [];
  private perfSlowest = { frame: 0, marker: "-" };
  private perfContextLost = false;
  private perfFrameNote = "";

  private notePerfEvent(label: string) {
    if (!this.perfEnabled) return;
    const event = `${(performance.now() / 1000).toFixed(1)}s ${label}`;
    this.perfEvents.push(event);
    if (this.perfEvents.length > 4) this.perfEvents.shift();
    this.perfFrameNote = label;
  }

  // 大厅尺寸
  private readonly W = 24;
  private readonly H = 10;
  private readonly DEPTH_START = -32;
  private readonly ARCH_Z = 16;

  // 派生尺寸：所有构件一律由 W/H/DEPTH_START/ARCH_Z 推导，禁止再写死旧数值
  private readonly LEN = Math.abs(this.DEPTH_START) + this.ARCH_Z;
  private readonly CZ = (this.ARCH_Z + this.DEPTH_START) / 2;
  /** 入口拱门净宽半径 / 门洞直墙高（前墙、拱券、碰撞漏斗共用） */
  private readonly ARCH_R = 2.75;
  private readonly ARCH_PH = 4.0;

  // 吊灯布局：4 盏小吊灯对齐横梁，1 盏大吊灯位于大厅几何中心 z=-8（横梁正下方），间距均 ≥6m
  private readonly CHAND_Z = [-24, -16, 0, 8];
  private readonly GRAND_Z = -8;
  /** 门口往里第 2 盏（CHAND_Z 中的 z=0）改挂大吊灯复制品；z=0 正好是一根横梁 */
  private readonly GRAND_COPY_Z = 0;

  // ── 后墙仪式台（囍字前）：三级弧形台，亲民高度、可走上 ──
  private readonly HALL_STAGE_DECK_Y = 0.5;
  private readonly HALL_STAGE_BACK_Z = -30.4;
  private readonly HALL_STAGE_HALF_W = 5.4;
  private readonly HALL_STAGE_FRONT_Z = -25.6;
  private readonly HALL_STAGE_BULGE = 0.75;
  /** 退台每级向前延伸的进深与每级抬升 */
  private readonly HALL_STAGE_LEDGE_D = 0.55;
  private readonly HALL_STAGE_STEP_Y = 0.125;
  private readonly HALL_STAGE_TIERS = 4;
  private stageCircleCount = 0;
  /** 仪式台签字台上待实例化的真实玫瑰（模板就绪后统一生成） */
  private hallStageRoses: { m: THREE.Matrix4; color: THREE.Color }[] = [];
  private hallStageRosesBuilt = false;
  /** 签字台花瓶花束的落点（台面中后部），rose-bouquet.glb 就绪后放置 */
  private signingBouquetSpot: THREE.Vector3 | null = null;
  private signingBouquetBuilt = false;

  // 帧循环 / 输入
  private animId = 0;
  /** 页面不可见 / 画廊滚出视口时暂停整个渲染循环（省电省 CPU，恢复时立即补一帧） */
  private renderPaused = false;
  /** 至少渲染过一帧才真正暂停：首帧会编译厅内着色器，放到构建时做，别拖到滚动到达时 */
  private framesRendered = 0;
  /** 未进入漫游（深色封面层盖着画布）时降为半帧率，被遮住的变化肉眼不可见 */
  private idleMode = false;
  private idleAcc = 0;
  /** 自适应分辨率：按 rAF 实际帧间隔判断掉帧（GPU 耗时只体现在这里），逐级降低 pixelRatio */
  private prLevels: number[] = [];
  private prIdx = 0;
  private lastFrameTs = 0;
  private frameIvEma = 16.7;
  private frameJitterEma = 0;
  private slowFrames = 0;
  private fastFrames = 0;
  private lastUpgradeTs = -Infinity;
  private lastDowngradeTs = -Infinity;
  /** 降档后至少稳定这么久才尝试升档；升档后很快又掉则翻倍（上限 60s），不再永久锁死 */
  private prUpgradeHoldMs = 8000;
  /** 预热上传/编译造成的单帧尖峰不代表持续负载，跳过其后的帧间隔采样 */
  private skipFrameSamples = 0;
  /** 预热：被剔除/暂停期间提前编译着色器、上传已加载的贴图，避免首次看到时集中卡顿 */
  private lastWarmTs = 0;
  private warmCompiling = false;
  /** warmTick 的缓存扫描表：材质 → 其纹理引用。2s 重建一次，tick 内零分配 */
  private warmTable: { mat: THREE.Material; texs: THREE.Texture[] }[] = [];
  private warmTableTs = -Infinity;
  /** 已改为按实例包围球剔除的静态 InstancedMesh；矩阵版本或数量一变即视为动态并退回不剔除 */
  private culledInstances: { mesh: THREE.InstancedMesh; version: number; count: number }[] = [];
  private readonly cullChecked = new WeakSet<THREE.InstancedMesh>();
  /** 分块花头的远近 LOD 状态；lodGeos 为原网格 → 简化网格（null 表示生成中或不可简化） */
  private readonly lodTiles: { mesh: THREE.InstancedMesh; hi: THREE.BufferGeometry; center: THREE.Vector3; radius: number }[] = [];
  private readonly lodGeos = new Map<THREE.BufferGeometry, THREE.BufferGeometry | null>();
  private lastLodTick = 0;
  /**
   * 门洞 portal 剔除：室内与室外只能通过入口拱门互相看见。视锥剔除只看视野不看遮挡，
   * 厅内朝门时整片草坪、门外回看时整座大厅仍会全画。这里用「相机 + 门洞矩形」构成的四棱锥
   * 再筛一遍：包围球完全落在锥外的就在本帧渲染前隐藏、渲染后恢复。
   */
  private readonly portalPlanes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  private readonly portalHidden: THREE.Object3D[] = [];
  private readonly portalSpheres = new WeakMap<THREE.Object3D, THREE.Sphere | null>();
  private readonly indoorRoots: THREE.Object3D[] = [];
  private readonly portalClassified = new WeakSet<THREE.Object3D>();
  /**
   * 门外回看的远景材质：厅内 MeshPhysicalMaterial（吊灯水晶清漆+彩虹、双面透明要画两遍，玫瑰 sheen）
   * 在门外十几米处细节看不出，却占回看画面 GPU 的 ~40%。相机出门后换成同参数的 MeshStandardMaterial，
   * 进门换回。远景材质须先在 warmTick 里预编译（warmed），否则首次出门会集中编译卡顿。
   */
  private readonly farMats = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  private readonly farMeshes: { mesh: THREE.Mesh; hi: THREE.Material; lo: THREE.MeshStandardMaterial; warmed: boolean }[] = [];
  private readonly farChecked = new WeakSet<THREE.Object3D>();
  private farPending = false;
  private farActive = false;
  private farWarmQueue: { mesh: THREE.Mesh; hi: THREE.Material; lo: THREE.MeshStandardMaterial; warmed: boolean }[] | null = null;
  private readonly farWarmSize = new THREE.Vector2();
  /** 视野里照片占屏的最大比例（hdTick 更新），户外只在细看照片时才启用 3 倍渲染 */
  private photoFocusRatio = 0;
  private readonly portalBox = new THREE.Box3();
  private readonly portalCorners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly portalMid = new THREE.Vector3();
  private readonly keys: Record<string, boolean> = {};
  private readonly velocity = new THREE.Vector3();
  private readonly moveInput = { x: 0, y: 0 };
  private readonly lookInput = { x: 0, y: 0 };
  // 点哪走哪：可点击的照片、当前自动行走路径（xz 途经点）与到达后的朝向
  private readonly photoTargets: { mesh: THREE.Mesh; w: number; h: number; zone: "hall" | "lawn" | "beach"; key: string }[] = [];
  /** 照片纹理按 URL 共享：常驻档（KTX2 / JPEG）+ 走近时换上的高清档，见 usePhoto / hdTick */
  private readonly photoEntries = new Map<string, PhotoEntry>();
  private photoPlaceholder: THREE.DataTexture | null = null;
  private ktx2Loader: KTX2Loader | null = null;
  private lastHdTick = 0;
  private hdLoading = 0;
  private readonly hdFwd = new THREE.Vector3();
  private readonly hdVec = new THREE.Vector3();
  private readonly lightCones: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; target: THREE.Vector3; base: number }[] = [];
  /** 3 倍屏静止时临时提到的渲染像素比（0 = 不启用）；一动就回到自适应档位 */
  private boostPr = 0;
  private boosted = false;
  private stillSince = 0;
  private boostEma = 16.7;
  private boostSlow = 0;
  private boostBlockedUntil = 0;
  private boostFails = 0;
  private readonly lastCamPos = new THREE.Vector3();
  private readonly lastCamQuat = new THREE.Quaternion();
  /** 布局里没写的画框按编号顺延取照片 */
  private photoFallbackIdx = 0;
  private autoPath: THREE.Vector2[] | null = null;
  private autoFace: { yaw: number; pitch: number } | null = null;
  private autoBestD = Infinity;
  private autoStuckT = 0;
  private tapMarker: THREE.Mesh | null = null;
  private tapMarkerT = 1;
  private readonly tapRay = new THREE.Raycaster();
  private readonly touchMode: boolean;
  private active = false;
  private bobTime = 0;
  private yaw = 0;
  private pitch = 0;
  private readonly lookEuler = new THREE.Euler(0, 0, 0, "YXZ");

  // 资源追踪
  private roseBakedMat: THREE.MeshStandardMaterial | null = null;
  private floraBakedMat: THREE.MeshStandardMaterial | null = null;
  private staticFloraParts: THREE.BufferGeometry[] = [];
  private staticRoseParts: THREE.BufferGeometry[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly cleanups: (() => void)[] = [];
  private readonly disposables: { dispose: () => void }[] = [];

  // 碰撞
  private readonly circles: Circle[] = [];
  private readonly boxes: { x0: number; x1: number; z0: number; z1: number }[] = [];

  // 射灯灯具（挂载点 → 照射目标）：构建期收集，最后统一实例化
  private readonly trackLights: { mount: THREE.Vector3; target: THREE.Vector3 }[] = [];

  // 花瓣粒子（InstancedMesh 实现可旋转飘落）
  private petals: {
    mesh: THREE.InstancedMesh;
    arr: Float32Array;
    origin: Float32Array;
    phases: Float32Array;
    speeds: Float32Array;
    spins: Float32Array;
    dummy: THREE.Object3D;
    count: number;
  } | null = null;

  // 空气中漂浮的光尘
  private dust: {
    geo: THREE.BufferGeometry;
    arr: Float32Array;
    origin: Float32Array;
    phases: Float32Array;
    count: number;
  } | null = null;

  // 共用贴图（吊灯光晕 / 光尘柔点）
  private glowTex: THREE.Texture | null = null;

  // 大型水晶吊灯（程序化版本 + 可选 GLB 替换）
  private grand: {
    root: THREE.Group;
    sparkles: THREE.Group;
    bulbs: { mat: THREE.MeshStandardMaterial; phase: number; base: number }[];
    /** 16 个灯罩光晕合并成一个 billboard InstancedMesh：与闪光点同款着色器，单 draw call */
    halos: {
      mesh: THREE.InstancedMesh;
      /** 每个光晕的尺寸，GLB 替换重定位时保持原尺寸 */
      size: Float32Array;
    };
    /** 62 颗闪光点合并成一个 billboard InstancedMesh：闪烁在着色器里按实例相位/速度算，单 draw call */
    glints: {
      mesh: THREE.InstancedMesh;
      /** 每颗的尺寸，GLB 替换重定位时保持原尺寸 */
      size: Float32Array;
    };
    /** 三种水晶形状各一个 InstancedMesh，逐帧轮流刷新亮度 */
    crystals: { mesh: THREE.InstancedMesh; count: number; phase: number }[];
    color: THREE.Color;
  } | null = null;
  private grandCursor = 0;
  /** 大吊灯复制品（root + sparkles 整体克隆，共享几何与材质，灯泡/闪光动画随原件同步） */
  private grandCopies: { root: THREE.Group; sparkles: THREE.Group }[] = [];
  /** 大吊灯花艺点位（模板就绪后用真实玫瑰实例化） */
  private grandFlowerSpecs: { p: THREE.Vector3; s: number; tone: THREE.Color; up: THREE.Vector3 }[] = [];
  private grandFloralGroup: THREE.Group | null = null;
  private grandFloralReal = false;

  // 过道装饰：所有烛火的核心实例（emissive 小水滴几何）与共享的假光 Points
  private readonly aisleFlames: { x: number; y: number; z: number; phase: number; scale: number }[] = [];
  private candleFlameMesh: THREE.InstancedMesh | null = null;
  private candleGlowMat: THREE.PointsMaterial | null = null;
  private readonly isoDummy = new THREE.Object3D();
  private flameTime = 0;

  /** 花柱顶的程序化花团独立成组，GLB 花束就绪后整体隐藏 */
  private pillarFloral: THREE.Group | null = null;
  /** 花柱的香槟金花瓮，GLB 花束（自带玻璃瓶）就绪后隐藏 */
  private pillarVase: THREE.InstancedMesh | null = null;
  /** 花拱的程序化花艺独立成组，rose-parts.glb 就绪后整体隐藏 */
  private archFloral: THREE.Group | null = null;
  /** 真实玫瑰 GLB 模板（异步加载，缺失/失败时保持 null 并回退程序化） */
  private readonly roseTemplates: {
    bouquet: GlbTemplate | null;
    stem: GlbTemplate | null;
    stemLo: GlbTemplate | null;
    /** rose-parts.glb：3 款独立花头 + 1 片叶，各自以底部中心为原点 */
    head0: GlbTemplate | null;
    head6: GlbTemplate | null;
    head5: GlbTemplate | null;
    leaf: GlbTemplate | null;
  } = {
    bouquet: null,
    stem: null,
    stemLo: null,
    head0: null,
    head6: null,
    head5: null,
    leaf: null,
  };
  /** 中央花岛落地烛杯位置（角度用于在烛杯之间散布长茎玫瑰） */
  private readonly centerVotives: { x: number; z: number; a: number }[] = [];
  /** 靠过道的椅子变换（用于挂椅背花饰与纱幔） */
  private readonly pewEnds: THREE.Matrix4[] = [];

  private readyFired = false;
  private disposed = false;
  private readyTimer = 0;
  private dragMode = false;
  private dragging = false;
  private lastPX = 0;
  private lastPY = 0;

  // 复用的临时向量（避免每帧分配）
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpDesired = new THREE.Vector3();
  private readonly tmpTarget = new THREE.Vector3();

  // ── 室外 ───────────────────────────────────────────────────
  /**
   * 太阳方向/颜色/强度（随主题切换）：所有户外 shader 的 uSunDir 等都直接引用
   * 这三个对象，applyOutdoorTheme 里 copy 即可全局生效。
   * three.js r186 没有逐物体灯光遮罩，加 DirectionalLight 会穿透屋顶照亮室内，
   * 因此草坪/草叶的日照改由 onBeforeCompile 注入的假太阳实现。
   */
  private readonly SUN_DIR = new THREE.Vector3(-0.344, 0.574, 0.742).normalize();
  private readonly SUN_COLOR = new THREE.Color("#fff4e0");
  /** 所有户外 shader 共享同一个 uniform 对象，切主题时改 value 即可实时生效 */
  private readonly sunIntensityU = { value: 2.2 };
  /** 正午预设（沙滩 + 室内基准）：applyOutdoorTheme 切换时还原 */
  private readonly NOON_SUN = {
    dir: new THREE.Vector3(-0.344, 0.574, 0.742).normalize(),
    color: new THREE.Color("#fff4e0"),
    intensity: 2.2,
    hemiSky: "#fff6ee",
    hemiGround: "#e6c9c4",
    hemiIntensity: 0.55,
    ambient: "#f8eee6",
    ambientIntensity: 0.2,
  };
  /**
   * 落日预设（草坪）：方位 +36.6°、仰角 3°，与晚霞全景 sunset_*.webp 的落日光斑对齐
   * （全景已水平旋转到该方位）；暖橙低角度光让舞台逆光、草叶背光透金。
   */
  private readonly SUNSET_SUN = {
    dir: (() => {
      const az = (36.6 * Math.PI) / 180;
      const el = (3 * Math.PI) / 180;
      return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
    })(),
    color: new THREE.Color("#ffa04a"),
    intensity: 2.75,
    // 晚霞天空偏紫粉；地面反弹取草绿而非泥褐
    hemiSky: "#d6c2dc",
    hemiGround: "#5b6a3a",
    hemiIntensity: 0.42,
    ambient: "#ffd9b0",
    ambientIntensity: 0.16,
  };
  /** 主题化的室内打底光（构建期保存原始引用，切主题只改参数不换灯） */
  private hemiLight: THREE.HemisphereLight | null = null;
  private ambientLight: THREE.AmbientLight | null = null;
  /** 草叶顶点着色器共用的时间 uniform（风摆） */
  private readonly windUniform = { value: 0 };
  private outdoorTime = 0;
  /** 云的基础位置/漂移速度/缩放，逐帧重算实例矩阵实现缓慢横移 */
  private readonly clouds: { base: THREE.Vector3; speed: number; scale: number }[] = [];
  private cloudMesh: THREE.InstancedMesh | null = null;
  private readonly cloudDummy = new THREE.Object3D();

  // ── 户外主题切换 ────────────────────────────────────────────
  private outdoor: "lawn" | "beach";
  private readonly lawnGroup = new THREE.Group();
  private readonly beachGroup = new THREE.Group();
  private lawnBuilt = false;
  private beachBuilt = false;
  /** 主题专属碰撞体，与共享的 this.circles 分开维护 */
  private readonly outdoorCircles: Record<"lawn" | "beach", Circle[]> = { lawn: [], beach: [] };
  /** 主题化天空材质（三段渐变颜色 + 太阳方向） */
  private skyMat: THREE.ShaderMaterial | null = null;
  private readonly bgColor = new THREE.Color(C.sky);
  /** 外立面材质（随主题改色） */
  private exteriorMats: {
    wall: THREE.MeshStandardMaterial;
    roof: THREE.MeshStandardMaterial;
    trim: THREE.MeshStandardMaterial;
  } | null = null;
  /** 沙滩海面/浪花共用时间 uniform */
  private readonly seaUniform = { value: 0 };
  /** 浪花线所在的世界 z（海平面与沙滩主坡的交点） */
  private readonly shoreZ = 62;
  private readonly seaLevel = -1.6;
  /** 相机地面高度平滑值，避免上下台阶抖动 */
  private eyeSmoothY = 1.72;
  /** 栈道：门口 2 级上台阶 → 面板 → 靠海端 2 级下台阶 */
  private readonly bwHalfW = 1.5;
  private readonly bwStepDepth = 0.34;
  private readonly bwStepsZ0 = 16.1;
  private readonly bwStartZ = 16.1 + 0.34 * 2;
  private readonly bwEndZ = 50;
  /** 竖直运动：下落速度、落地缓冲弹簧（位移/速度）、上台阶用力时的身体前倾量 */
  private vyFall = 0;
  private landDip = 0;
  private landDipVel = 0;
  private stepLean = 0;
  private bobAmp = 0;
  private lastGroundY = 0;
  // 椰子树模板（异步加载，失败则跳过）
  private readonly palmTemplates: {
    coconut: GlbTemplate | null;
    slim: GlbTemplate | null;
  } = { coconut: null, slim: null };
  private readonly palmBuilt = { coconut: false, slim: false };
  // 沙滩仪式区动画状态
  private readonly beachFlames: { x: number; y: number; z: number; phase: number; scale: number }[] = [];
  private beachFlameMesh: THREE.InstancedMesh | null = null;
  private beachGlowMat: THREE.PointsMaterial | null = null;
  private readonly beachTorches: { x: number; y: number; z: number; phase: number }[] = [];
  private beachTorchFlameMesh: THREE.InstancedMesh | null = null;
  private beachBirdMesh: THREE.InstancedMesh | null = null;
  private readonly beachBirds: {
    cx: number;
    cz: number;
    r: number;
    a0: number;
    speed: number;
    phase: number;
    h: number;
  }[] = [];
  private readonly beachBirdDummy = new THREE.Object3D();
  /** 花艺依赖异步玫瑰模板：先兜底，模板就绪后替换 */
  private beachArchZ = 59.8;
  private beachArchHalfW = 1.6;
  private beachArchTopY = 0;
  private beachPewEnds: THREE.Matrix4[] = [];
  private beachArchFloralReal = false;
  private beachArchFloralFallback: THREE.Group | null = null;
  private beachStemsBuilt = false;

  // ── 草坪（山间草甸）主题 ────────────────────────────────────
  /** 草坪可步行半径（圆形可行区，止步于森林边缘前） */
  private readonly LAWN_WALK_R = 21.5;
  /** 草坪可步行最远 z（舞台后方留 6m 观赏带） */
  private readonly LAWN_WALK_Z = 64;
  /** 欧式凉亭舞台：圆盘中心 z 与平台半径（台阶外缘再 +1.4） */
  private readonly LAWN_STAGE_Z = 57;
  private readonly LAWN_PLATFORM_R = 4.6;
  private readonly LAWN_DECK_Y = 0.42;
  /** 凉亭立柱碰撞圈（沿平台外圈一圈） */
  private lawnColumnsBuilt = false;
  /** 通道风灯火焰实例（加色 billboard，无真实光源） */
  private readonly lawnFlames: { x: number; y: number; z: number; phase: number; scale: number }[] = [];
  private lawnFlameMesh: THREE.InstancedMesh | null = null;
  private lawnGlowMesh: THREE.InstancedMesh | null = null;
  /** 玫瑰花海：真实花头/茎/叶模板就绪前的程序化兜底组 */
  private lawnFloralReal = false;
  private lawnFloralFallback: THREE.Group | null = null;
  private lawnFlowerSpots: { x: number; y: number; z: number; color: THREE.Color; s: number }[] = [];
  /** 白石花拱小径：拱门 z 坐标（灯笼错位、草叶排除等共用） */
  private readonly lawnPathArchZs = [21, 26, 31, 36, 41];

  // 户外仪式舞台：矩形 5.6×3.2，台面比覆盖区沙面最高点高 0.45；台阶居中宽 2.4
  private readonly stageHalfW = 2.8;
  private readonly stageFrontZ = 57.3;
  private readonly stageBackZ = 60.5;
  private readonly stageRise = 0.45;
  private readonly stepHalfW = 1.2;
  private readonly stepDepth = 0.4;
  private stageDeckY = 0;
  /** 舞台/休闲区共用的小花球摆放点（统一异步升级为真实花头） */
  private readonly beachDecorFloralSpots: {
    x: number;
    y: number;
    z: number;
    r: number;
    n: number;
    s: number;
  }[] = [];
  private beachDecorFloralReal = false;
  private beachDecorFloralFallback: THREE.Group | null = null;
  /** 椰子树摆放：2~3 棵一簇，避开门口正前方与 z>58 的仪式区 */
  private readonly PALM_SPOTS: {
    kind: "coconut" | "slim";
    x: number;
    z: number;
    h: number;
    tilt: number;
    yaw: number;
  }[] = [
    { kind: "coconut", x: -7.5, z: 23, h: 10.2, tilt: 8, yaw: 0.4 },
    { kind: "coconut", x: -10.5, z: 27, h: 9.0, tilt: 12, yaw: 2.1 },
    { kind: "coconut", x: -6.8, z: 30.5, h: 8.6, tilt: 6, yaw: 4.0 },
    { kind: "coconut", x: 8.0, z: 25, h: 9.8, tilt: 10, yaw: 1.2 },
    { kind: "coconut", x: 11.0, z: 29, h: 8.4, tilt: 14, yaw: 3.3 },
    { kind: "coconut", x: -13.5, z: 43, h: 9.4, tilt: 11, yaw: 5.0 },
    { kind: "coconut", x: 14.5, z: 45, h: 8.8, tilt: 9, yaw: 0.9 },
    { kind: "slim", x: -12.0, z: 39, h: 7.2, tilt: 12, yaw: 2.6 },
    { kind: "slim", x: -8.5, z: 48, h: 6.6, tilt: 8, yaw: 1.5 },
    { kind: "slim", x: 12.5, z: 41, h: 7.4, tilt: 13, yaw: 4.2 },
    { kind: "slim", x: 16.5, z: 47, h: 6.8, tilt: 10, yaw: 0.2 },
    { kind: "slim", x: -17.0, z: 53, h: 7.0, tilt: 15, yaw: 3.8 },
    { kind: "slim", x: 18.0, z: 54, h: 6.4, tilt: 11, yaw: 2.2 },
    { kind: "slim", x: -5.5, z: 55, h: 6.9, tilt: 7, yaw: 5.6 },
  ];

  constructor(canvas: HTMLCanvasElement, opts: WeddingGalleryOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.touchMode = opts.touch;
    this.outdoor = opts.outdoor ?? "lawn";

    // 构造失败（WebGL 不可用）由调用方 try/catch 回退到 GalleryFallback
    // 手机 GPU 是分块渲染，4x MSAA 在片上完成、代价很小，画框/栏杆边缘不再锯齿
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    const dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.boostPr = dpr > 2.2 ? Math.min(dpr, 3) : 0;
    // 降档设下限：高分屏最低 1.5，再低在手机上肉眼明显发糊（1 档在 3 倍屏上只剩 1/3 清晰度）
    const prTop = this.renderer.getPixelRatio();
    const prFloor = Math.min(prTop, 1.5);
    this.prLevels = [...new Set([prTop, 1.75, 1.5])]
      .filter((v) => v <= prTop && v >= prFloor)
      .sort((a, b) => b - a);
    this.idleMode = true;
    this.renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = this.bgColor;
    // 雾只在室外可见距离内生效：室内最长视线约 55m < near 70，室内不会被雾影响
    this.scene.fog = new THREE.Fog(C.fog, 70, 320);

    // 环境反射：用 three 自带 RoomEnvironment 生成 PMREM，给金属/大理石提供柔和 IBL
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = 0.42;
    this.disposables.push(envRT);
    // 源场景仅用于烘焙，随后立即释放其几何体与材质
    roomEnv.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m.dispose();
      }
    });
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(
      70,
      (canvas.clientWidth || 1) / (canvas.clientHeight || 1),
      0.1,
      1000,
    );
    // 出生在入口拱门内 4m（z=ARCH_Z-4），面朝 -Z，一眼看到远处主灯与后墙
    this.camera.position.set(0, 1.72, this.ARCH_Z - 4);

    if (this.perfEnabled) {
      const panel = document.createElement("pre");
      panel.style.cssText =
        "position:fixed;z-index:2147483647;left:6px;top:6px;margin:0;padding:6px 8px;max-width:calc(100vw - 12px);pointer-events:none;color:#fff;background:rgba(0,0,0,.78);font:11px/1.35 ui-monospace,monospace;white-space:pre-wrap";
      panel.textContent = "galleryPerf: waiting";
      document.body.appendChild(panel);
      this.perfPanel = panel;
      this.cleanups.push(() => panel.remove());
      const lost = (event: Event) => {
        event.preventDefault();
        this.perfContextLost = true;
        this.notePerfEvent("context-lost");
      };
      const restored = () => {
        this.perfContextLost = false;
        this.notePerfEvent("context-restored");
      };
      canvas.addEventListener("webglcontextlost", lost);
      canvas.addEventListener("webglcontextrestored", restored);
      this.cleanups.push(() => canvas.removeEventListener("webglcontextlost", lost));
      this.cleanups.push(() => canvas.removeEventListener("webglcontextrestored", restored));
    }

    // 桌面：指针锁定视角；触屏：不用它，改由摇杆写入 yaw/pitch
    if (!this.touchMode) {
      const controls = new PointerLockControls(this.camera, canvas);
      controls.addEventListener("lock", () => {
        this.opts.onActiveChange(true);
      });
      controls.addEventListener("unlock", () => {
        this.velocity.set(0, 0, 0);
        this.opts.onActiveChange(false);
      });
      this.controls = controls;
      this.disposables.push(controls);

      // 浏览器拒绝指针锁定（iframe/安全策略/频繁 Esc）时降级为「按住拖拽转向」
      const onLockError = () => this.enableDragMode();
      document.addEventListener("pointerlockerror", onLockError);
      this.cleanups.push(() => document.removeEventListener("pointerlockerror", onLockError));
    }

    this.buildAsync().catch((err) => {
      console.error("[WeddingGallery] 场景构建失败", err);
      this.opts.onError?.();
    });
  }

  /**
   * 分步构建：一次性同步构建在中端手机上会阻塞主线程 1.3s（首屏空闲时后台构建会卡住封面），
   * 所以每步之后若本轮已占用主线程超过 30ms 就让出一次；首帧前再用 compileAsync 预编译着色器。
   */
  private async buildAsync() {
    const yieldToMain = () => new Promise<void>((r) => window.setTimeout(r, 0));
    let sliceStart = performance.now();
    for (const step of this.sceneBuildSteps()) {
      if (this.disposed) return;
      step();
      if (performance.now() - sliceStart > 30) {
        await yieldToMain();
        sliceStart = performance.now();
      }
    }
    if (this.disposed) return;
    await this.renderer.compileAsync(this.scene, this.camera).catch(() => undefined);
    if (this.disposed) return;
    // 首帧会把全部贴图一次性上传 GPU（实测阻塞 1.4s），改为提前逐张上传、按时间片让出
    sliceStart = performance.now();
    for (const tex of this.collectSceneTextures()) {
      if (this.disposed) return;
      this.renderer.initTexture(tex);
      if (performance.now() - sliceStart > 30) {
        await yieldToMain();
        sliceStart = performance.now();
      }
    }
    if (this.disposed) return;
    this.setupInput();
    this.animate();

    // 照片加载兜底：即使纹理尚未就绪也允许进入（纹理到达后自然显示）
    this.readyTimer = window.setTimeout(() => this.fireReady(), 3500);
  }

  // ── 场景组装 ───────────────────────────────────────────────
  /** 场景构建步骤（顺序即原 buildScene 的执行顺序），由 buildAsync 逐步执行 */
  private sceneBuildSteps(): (() => void)[] {
    const hall = [
      () => this.buildFloor(),
      () => this.buildCeiling(),
      () => this.buildWalls(),
      () => this.buildFrontWall(),
      () => this.buildWainscotAll(),
      () => this.buildMolding(),
      () => this.buildBackEmblem(),
      () => this.buildArch(),
      () => this.buildRoseGarland(),
      () => this.buildCarpet(),
      () => this.buildFloorRing(),
      () => this.buildHallStage(),
      () => this.buildPedestals(),
      () => this.buildAisleDecor(),
      () => this.buildCeremonyChairs(),
      () => this.loadRoseModels(),
      () => this.buildPetals(),
      () => this.buildLightDust(),
      () => { if (this.showChandeliers) this.buildGrandChandelier(); },
      () => this.buildWallWash(),
      () => this.finalizeFlora(),
    ];
    // 室外共享部分：天空 / 云 / 门口花瓮 / 建筑外壳
    const exterior = [
      () => this.buildSky(),
      () => this.buildClouds(),
      () => this.buildUrns(),
      () => this.buildExteriorShell(),
    ];
    // 默认草坪主题拆成多步构建（整片草坪是最重的一段）；先标记已构建，activateOutdoor 不会重复构建
    const lawn =
      this.outdoor === "lawn"
        ? [
            () => {
              this.lawnBuilt = true;
              this.buildGround();
            },
            () => this.buildGrassCards(),
            () => {
              if (this.showMeadowRoses) this.buildLawnFlowers();
            },
            () => this.buildLawnRotunda(),
            () => this.buildLawnAisle(),
            () => this.buildLawnTrees(),
            () => this.buildMeadowStemRoses(),
          ]
        : [];
    return [
      () => {
        // 环境光压低，主要亮度交给 envMap + HemisphereLight 打底，避免生硬直射
        this.ambientLight = new THREE.AmbientLight("#f8eee6", 0.2);
        this.scene.add(this.ambientLight);

        this.hemiLight = new THREE.HemisphereLight("#fff6ee", "#e6c9c4", 0.55);
        this.scene.add(this.hemiLight);

        // 小吊灯 4 盏（桌面仅第 1 盏投影，触屏全部不投影）
        this.CHAND_Z.forEach((z, i) => {
          const pt = new THREE.PointLight("#ffe3d2", 1.15, 26, 1.7);
          pt.position.set(0, z === this.GRAND_COPY_Z ? this.H - 0.7 : this.H - 0.6, z);
          pt.castShadow = !this.touchMode && i === 0;
          pt.shadow.mapSize.set(512, 512);
          pt.shadow.bias = -0.0015;
          this.scene.add(pt);
          // 门口往里第 2 盏换成大吊灯的复制品（buildGrandChandelier 之后由 syncGrandCopies 生成）
          if (this.showChandeliers && this.showSmallChandeliers && z !== this.GRAND_COPY_Z) {
            this.scene.add(this.makeChandelier(0, this.H - 0.5, z));
          }
        });

        const grandLight = new THREE.PointLight("#ffe9e4", 2.2, 40, 1.7);
        grandLight.position.set(0, this.H - 0.7, this.GRAND_Z);
        grandLight.castShadow = !this.touchMode;
        grandLight.shadow.mapSize.set(512, 512);
        grandLight.shadow.bias = -0.0015;
        this.scene.add(grandLight);
      },
      ...hall,
      ...exterior,
      () => {
        // 主题内容各自懒构建，切换只切 visible
        this.lawnGroup.visible = false;
        this.beachGroup.visible = false;
        this.scene.add(this.lawnGroup, this.beachGroup);
      },
      ...lawn,
      () => this.activateOutdoor(this.outdoor, false),
      // 铭牌画布材质逐张预生成（每张要逐像素处理），loadPhotos 里直接命中缓存，不再一口气生成 6 张
      ...this.opts.photos.map((ph) => () => {
        const key = `${ph.label}|${ph.sub}`;
        if (!this.plaqueCache.has(key)) this.plaqueCache.set(key, this.makePlaqueFaceMaterial(ph.label, ph.sub));
      }),
      () => this.loadPhotos(),
      () => this.buildTrackLightFixtures(),
    ];
  }

  private buildFloor() {
    const size = 1024;
    const veins = this.marbleVeinLayout(size);
    // 贴图一格含 2×2 块石板，取 3m/块 → 每 6m 重复一次
    // 地板严格等于室内占地 [DEPTH_START, ARCH_Z]：前后都不得伸到室外
    // （门外与墙外的草甸在墙根处高度恰为 0，重叠即 z-fighting 闪烁）
    const floorLen = this.LEN;
    const rep = (n: number) => n / 6;
    const colorTex = this.reg(
      this.marbleTexture(C.marble, C.marbleVein, size, rep(this.W), rep(floorLen), veins),
    );
    const roughTex = this.reg(this.marbleRoughnessTexture(size, rep(this.W), rep(floorLen), veins));
    const normTex = this.reg(this.marbleNormalTexture(size, rep(this.W), rep(floorLen), veins));
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(this.W, floorLen),
      new THREE.MeshStandardMaterial({
        map: colorTex,
        roughnessMap: roughTex,
        normalMap: normTex,
        normalScale: new THREE.Vector2(0.15, 0.15),
        roughness: 1,
        metalness: 0.06,
        envMapIntensity: 1.3,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, this.CZ);
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private buildCeiling() {
    const len = this.LEN;
    const cx = this.CZ;
    // 横梁每 4m 一根，覆盖 z∈[DEPTH_START, ARCH_Z]
    const beamGap = 4;
    const beamZ: number[] = [];
    for (let z = this.DEPTH_START; z <= this.ARCH_Z + 1e-6; z += beamGap) beamZ.push(z);
    const dummy = new THREE.Object3D();

    const backing = new THREE.Mesh(
      new THREE.PlaneGeometry(this.W, len),
      new THREE.MeshStandardMaterial({ color: C.ceil, roughness: 0.9, side: THREE.DoubleSide }),
    );
    backing.rotation.x = Math.PI / 2;
    backing.position.set(0, this.H + 0.36, cx);
    this.scene.add(backing);

    // 嵌板：Poly Haven「white_stucco」石膏 PBR（真实尺寸 2m×2m）
    const gap = beamGap - 0.4;
    const panelZ = beamZ.slice(0, -1).map((z) => z + beamGap / 2);
    const panelMat = new THREE.MeshStandardMaterial({
      color: "#fbf4ea",
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide,
      normalScale: new THREE.Vector2(0.6, 0.6),
      aoMapIntensity: 0.8,
    });
    this.loadPbrSet("/textures/ceiling/stucco", this.W / 2, gap / 2, (s) => {
      if (this.disposed) return;
      panelMat.map = s.map;
      panelMat.normalMap = s.normalMap;
      panelMat.roughnessMap = s.roughnessMap;
      panelMat.aoMap = s.aoMap;
      panelMat.needsUpdate = true;
    });
    const panels = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(this.W, gap),
      panelMat,
      panelZ.length,
    );
    panelZ.forEach((z, i) => {
      dummy.position.set(0, this.H - 0.12, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      panels.setMatrixAt(i, dummy.matrix);
    });
    panels.instanceMatrix.needsUpdate = true;
    this.scene.add(panels);

    // 横梁：ambientCG「Travertine009」洞石 PBR（真实尺寸 1.2m×1.2m），按各面真实尺寸重写 UV
    const beamMat = new THREE.MeshStandardMaterial({
      color: "#efe4d4",
      roughness: 0.82,
      metalness: 0.05,
      normalScale: new THREE.Vector2(0.5, 0.5),
      aoMapIntensity: 0.7,
    });
    this.loadPbrSet("/textures/ceiling/trav", 1, 1, (s) => {
      if (this.disposed) return;
      beamMat.map = s.map;
      beamMat.normalMap = s.normalMap;
      beamMat.roughnessMap = s.roughnessMap;
      beamMat.aoMap = s.aoMap;
      beamMat.needsUpdate = true;
    });
    const beamGeo = new THREE.BoxGeometry(this.W, 0.35, 0.4);
    this.boxWorldUv(beamGeo, 1.2, [
      [0.4, 0.35],
      [0.4, 0.35],
      [this.W, 0.4],
      [this.W, 0.4],
      [this.W, 0.35],
      [this.W, 0.35],
    ]);
    const beams = new THREE.InstancedMesh(beamGeo, beamMat, beamZ.length);
    beamZ.forEach((z, i) => {
      dummy.position.set(0, this.H - 0.175, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      beams.setMatrixAt(i, dummy.matrix);
    });
    beams.instanceMatrix.needsUpdate = true;
    this.scene.add(beams);

    // 梁底香槟金细线脚，增加梁的层次
    const trim = new THREE.InstancedMesh(
      new THREE.BoxGeometry(this.W, 0.03, 0.05),
      new THREE.MeshStandardMaterial({ color: C.champagneLight, metalness: 0.8, roughness: 0.3 }),
      beamZ.length,
    );
    beamZ.forEach((z, i) => {
      dummy.position.set(0, this.H - 0.365, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      trim.setMatrixAt(i, dummy.matrix);
    });
    trim.instanceMatrix.needsUpdate = true;
    this.scene.add(trim);

    // 格心四周内凹线脚框：沿 x 长条 + 沿 z 短条，形成藻井层次与阴影
    const frameMat = new THREE.MeshStandardMaterial({
      color: "#efe6d9",
      roughness: 0.9,
      metalness: 0,
      normalScale: new THREE.Vector2(0.4, 0.4),
    });
    this.loadPbrSet("/textures/ceiling/stucco", 1, 1, (s) => {
      if (this.disposed) return;
      frameMat.map = s.map;
      frameMat.normalMap = s.normalMap;
      frameMat.roughnessMap = s.roughnessMap;
      frameMat.aoMap = s.aoMap;
      frameMat.needsUpdate = true;
    });
    const longGeo = new THREE.BoxGeometry(this.W, 0.08, 0.08);
    this.boxWorldUv(longGeo, 2, [
      [0.08, 0.08],
      [0.08, 0.08],
      [this.W, 0.08],
      [this.W, 0.08],
      [this.W, 0.08],
      [this.W, 0.08],
    ]);
    const shortGeo = new THREE.BoxGeometry(0.08, 0.08, gap);
    this.boxWorldUv(shortGeo, 2, [
      [gap, 0.08],
      [gap, 0.08],
      [0.08, gap],
      [0.08, gap],
      [0.08, 0.08],
      [0.08, 0.08],
    ]);
    const frameY = this.H - 0.16;
    const longBars = new THREE.InstancedMesh(longGeo, frameMat, panelZ.length * 2);
    const shortBars = new THREE.InstancedMesh(shortGeo, frameMat, panelZ.length * 2);
    let li = 0;
    let si = 0;
    panelZ.forEach((z) => {
      for (const s of [1, -1]) {
        dummy.position.set(0, frameY, z + s * (gap / 2 - 0.06));
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        longBars.setMatrixAt(li++, dummy.matrix);

        dummy.position.set(s * (this.W / 2 - 0.06), frameY, z);
        dummy.updateMatrix();
        shortBars.setMatrixAt(si++, dummy.matrix);
      }
    });
    longBars.instanceMatrix.needsUpdate = true;
    shortBars.instanceMatrix.needsUpdate = true;
    this.scene.add(longBars, shortBars);

    // 玫瑰浮雕：真实贴图打底后只留浅浅一层，避免显假
    const roseTex = this.reg(this.makeRoseReliefTexture(512));
    const roseMat = new THREE.MeshStandardMaterial({
      map: roseTex,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const roses = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      roseMat,
      panelZ.length,
    );
    panelZ.forEach((z, i) => {
      dummy.position.set(0, this.H - 0.145, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      roses.setMatrixAt(i, dummy.matrix);
    });
    roses.instanceMatrix.needsUpdate = true;
    this.scene.add(roses);

    const discMat = new THREE.MeshStandardMaterial({
      map: roseTex,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.CHAND_Z.forEach((z) => {
      if (z !== this.GRAND_COPY_Z) this.addCeilingMedallion(z, this.H - 0.36, 0.9, 0.95, discMat);
    });
    // 主灯正对横梁：圆盘压在梁底（y=H-0.35）以下，避免穿进梁里
    this.addCeilingMedallion(this.GRAND_Z, this.H - 0.5, 1.5, 1.55, discMat);
    this.addCeilingMedallion(this.GRAND_COPY_Z, this.H - 0.5, 1.5, 1.55, discMat);
  }

  /** 吊顶石膏圆盘：三层金属环 + 中央玫瑰浮雕，外径按 outer 等比缩放 */
  /**
   * 天花板装饰盘。金属同心圆环（roseMetal / champagne / champagneLight 三层）
   * 悬在天顶下方、外形是一个空心圆环，视觉上很抢眼，故默认不生成；需要时改回 true。
   */
  private readonly CEILING_MEDALLION_RINGS = false;

  private addCeilingMedallion(
    z: number,
    y: number,
    outer: number,
    reliefSize: number,
    reliefMat: THREE.Material,
  ) {
    if (this.CEILING_MEDALLION_RINGS) {
      const rings: [number, number, string, number, number][] = [
        [outer, outer * 0.067, C.roseMetal, 0.4, 0.45],
        [outer * 0.69, outer * 0.056, C.champagne, 0.5, 0.35],
        [outer * 0.4, outer * 0.039, C.champagneLight, 0.45, 0.38],
      ];
      rings.forEach(([rad, tube, color, metalness, roughness]) => {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(rad, tube, 8, 36),
          new THREE.MeshStandardMaterial({ color, metalness, roughness }),
        );
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, y, z);
        this.scene.add(ring);
      });
    }
    const relief = new THREE.Mesh(new THREE.PlaneGeometry(reliefSize, reliefSize), reliefMat);
    relief.rotation.x = Math.PI / 2;
    relief.position.set(0, y + 0.006, z);
    this.scene.add(relief);
  }

  private buildWalls() {
    const len = this.LEN;
    const cx = this.CZ;
    const upperMat = new THREE.MeshStandardMaterial({ color: C.wallUpper, roughness: 0.9 });

    const left = new THREE.Mesh(new THREE.PlaneGeometry(len, this.H), upperMat);
    left.rotation.y = Math.PI / 2;
    left.position.set(-this.W / 2, this.H / 2, cx);
    left.receiveShadow = true;
    this.scene.add(left);

    const right = new THREE.Mesh(new THREE.PlaneGeometry(len, this.H), upperMat);
    right.rotation.y = -Math.PI / 2;
    right.position.set(this.W / 2, this.H / 2, cx);
    right.receiveShadow = true;
    this.scene.add(right);

    const back = new THREE.Mesh(new THREE.PlaneGeometry(this.W, this.H), upperMat);
    back.position.set(0, this.H / 2, this.DEPTH_START);
    back.receiveShadow = true;
    this.scene.add(back);
  }

  /** 法式护墙板：左右两面墙下半段铺嵌板 + 内框线条（后墙让位给整面囍字背景） */
  private buildWainscotAll() {
    const len = this.LEN;
    const cx = this.CZ;
    this.buildWainscotWall("left", len, cx);
    this.buildWainscotWall("right", len, cx);
  }

  /**
   * 在某面墙的局部坐标系里生成护墙板。
   * 局部约定：+x 沿墙长、+y 向上、+z 指向室内（即嵌板凸起方向）。
   */
  private buildWainscotWall(orient: "left" | "right", len: number, cx: number) {
    const g = new THREE.Group();
    if (orient === "left") {
      g.position.set(-this.W / 2, 0, cx);
      g.rotation.y = Math.PI / 2;
    } else {
      g.position.set(this.W / 2, 0, cx);
      g.rotation.y = -Math.PI / 2;
    }

    const wh = 1.55;
    const panelH = 1.15;
    const panelW = 2.1;
    const gap = 0.62;
    const yC = wh / 2;

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(len, wh, 0.1),
      new THREE.MeshStandardMaterial({ color: C.wainscot, roughness: 0.92 }),
    );
    slab.position.set(0, wh / 2, 0.05);
    slab.receiveShadow = true;
    g.add(slab);

    // 均分嵌板
    const margin = 0.45;
    const start = -len / 2 + margin + panelW / 2;
    const end = len / 2 - margin - panelW / 2;
    const step = panelW + gap;
    const n = Math.max(1, Math.floor((end - start) / step) + 1);
    const off = (start + end) / 2 - ((n - 1) * step) / 2;
    const centers: number[] = [];
    for (let i = 0; i < n; i++) {
      centers.push(off + i * step);
    }
    if (centers.length === 0) return;

    const ivoryMat = new THREE.MeshStandardMaterial({ color: C.wainscot, roughness: 0.88 });
    const lineMat = new THREE.MeshStandardMaterial({
      color: C.champagneLight,
      metalness: 0.45,
      roughness: 0.42,
    });

    const frame = new THREE.InstancedMesh(
      new THREE.BoxGeometry(panelW + 0.2, panelH + 0.2, 0.1),
      ivoryMat,
      centers.length,
    );
    const inset = new THREE.InstancedMesh(
      new THREE.BoxGeometry(panelW - 0.04, panelH - 0.04, 0.08),
      ivoryMat,
      centers.length,
    );
    const hBar = new THREE.InstancedMesh(
      new THREE.BoxGeometry(panelW - 0.16, 0.045, 0.03),
      lineMat,
      centers.length * 2,
    );
    const vBar = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.045, panelH - 0.16, 0.03),
      lineMat,
      centers.length * 2,
    );

    const dummy = new THREE.Object3D();
    let hi = 0;
    let vi = 0;
    centers.forEach((u, idx) => {
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);

      dummy.position.set(u, yC, 0.1);
      dummy.updateMatrix();
      frame.setMatrixAt(idx, dummy.matrix);

      // 嵌板后退 0.02，与外框形成凹槽阴影
      dummy.position.set(u, yC, 0.08);
      dummy.updateMatrix();
      inset.setMatrixAt(idx, dummy.matrix);

      for (const s of [1, -1]) {
        dummy.position.set(u, yC + (s * (panelH - 0.12)) / 2, 0.14);
        dummy.updateMatrix();
        hBar.setMatrixAt(hi++, dummy.matrix);

        dummy.position.set(u + (s * (panelW - 0.12)) / 2, yC, 0.14);
        dummy.updateMatrix();
        vBar.setMatrixAt(vi++, dummy.matrix);
      }
    });
    frame.instanceMatrix.needsUpdate = true;
    inset.instanceMatrix.needsUpdate = true;
    hBar.instanceMatrix.needsUpdate = true;
    vBar.instanceMatrix.needsUpdate = true;

    g.add(frame, inset, hBar, vBar);
    this.scene.add(g);
  }

  /** 前墙（相机起点外侧那面）——中央拱形门洞 */
  private buildFrontWall() {
    const shape = new THREE.Shape();
    shape.moveTo(-this.W / 2, 0);
    shape.lineTo(this.W / 2, 0);
    shape.lineTo(this.W / 2, this.H);
    shape.lineTo(-this.W / 2, this.H);
    shape.lineTo(-this.W / 2, 0);

    const ar = this.ARCH_R;
    const ph = this.ARCH_PH;
    const hole = new THREE.Path();
    hole.moveTo(-ar, 0);
    hole.lineTo(ar, 0);
    hole.lineTo(ar, ph);
    hole.absarc(0, ph, ar, 0, Math.PI, false);
    hole.lineTo(-ar, 0);
    shape.holes.push(hole);

    const wall = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({
        color: C.wallUpper,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    wall.position.set(0, 0, this.ARCH_Z);
    this.scene.add(wall);
  }

  /**
   * 后墙整面西式婚礼背景：
   * 粉色缎面渐变墙（CanvasTexture，低透明度蕾丝暗纹 + 柔焦光斑 + 香槟金细边框）
   * + 花环中央上下两行放大姓名（无日期）+ 两侧各一张占满墙高的 3:4 竖幅照片。
   * 背景板略离墙（z=DEPTH_START+0.05），底部让开踢脚线、顶部让开檐口。
   */
  private buildBackEmblem() {
    const { namesLine } = this.opts;
    const WALL_W = this.W - 0.2;
    const WALL_H = this.H - 0.65;
    const EY = 0.25 + WALL_H / 2;
    const EZ = this.DEPTH_START + 0.05;

    // ── 粉色缎面背景 ──
    const bgTex = this.reg(
      this.makeCanvasTexture((ctx, w, h) => {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, "#fbeef0");
        grad.addColorStop(0.52, "#f6d9df");
        grad.addColorStop(1, "#eec5cf");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // 对称卷草蕾丝暗纹，10×4 平铺
        ctx.save();
        ctx.globalAlpha = 0.08;
        ctx.strokeStyle = "#c9a06a";
        ctx.fillStyle = "#c9a06a";
        const tile = w / 10;
        for (let tx = 0; tx < 10; tx++) {
          for (let ty = 0; ty < 4; ty++) {
            this.drawLaceMotif(ctx, (tx + 0.5) * tile, (ty + 0.5) * (h / 4), tile * 0.42);
          }
        }
        ctx.restore();

        // 柔焦光斑
        for (let i = 0; i < 26; i++) {
          const bx = Math.random() * w;
          const by = Math.random() * h;
          const br = 20 + Math.random() * 90;
          const rg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          rg.addColorStop(
            0,
            Math.random() > 0.5 ? "rgba(255,248,238,0.22)" : "rgba(255,236,240,0.2)",
          );
          rg.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fill();
        }

        // 香槟金双线边框 + 四角小卷草
        ctx.strokeStyle = "#c9a96e";
        ctx.lineWidth = 6;
        ctx.strokeRect(26, 26, w - 52, h - 52);
        ctx.lineWidth = 2;
        ctx.strokeRect(48, 48, w - 96, h - 96);
        this.drawCornerVolute(ctx, 66, 66, 1, 1);
        this.drawCornerVolute(ctx, w - 66, 66, -1, 1);
        this.drawCornerVolute(ctx, 66, h - 66, 1, -1);
        this.drawCornerVolute(ctx, w - 66, h - 66, -1, -1);
      }, 2048, 800),
    );
    bgTex.colorSpace = THREE.SRGBColorSpace;

    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(WALL_W, WALL_H),
      new THREE.MeshStandardMaterial({
        map: bgTex,
        roughness: 0.8,
        metalness: 0,
        envMapIntensity: 0.6,
      }),
    );
    bg.position.set(0, EY, EZ);
    this.scene.add(bg);

    // ── 花环中央：两人姓名上下两行（字高约 1.2m），中间一颗粉色小心 ──
    const NAME_SIZE = 5.6;
    const NAME_CY = 5.3;
    const nameTex = this.reg(
      this.makeCanvasTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const sep = "♡";
        const parts = namesLine.includes(sep)
          ? namesLine.split(sep).map((c) => c.trim()).filter(Boolean)
          : [namesLine.trim()];
        const fs = Math.round((1.2 / NAME_SIZE) * h);
        const lineGap = (1.15 / NAME_SIZE) * h;
        const tracking = fs * 0.14;
        const drawName = (text: string, cy: number) => {
          const gold = ctx.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2);
          gold.addColorStop(0, "#f0c8b2");
          gold.addColorStop(0.5, "#cf8f78");
          gold.addColorStop(1, "#a3634f");
          ctx.font = `bold ${fs}px "STKaiti","Kaiti SC","KaiTi","Songti SC","STSong","Noto Serif SC",serif`;
          const chars = [...text];
          const widths = chars.map((c) => ctx.measureText(c).width);
          const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
          let x = w / 2 - total / 2;
          chars.forEach((c, i) => {
            const cx = x + widths[i] / 2;
            ctx.lineJoin = "round";
            ctx.lineWidth = fs * 0.05;
            ctx.strokeStyle = "#a8735f";
            ctx.strokeText(c, cx, cy);
            ctx.fillStyle = gold;
            ctx.fillText(c, cx, cy);
            ctx.lineWidth = fs * 0.012;
            ctx.strokeStyle = "#fff0e6";
            ctx.strokeText(c, cx, cy);
            x += widths[i] + tracking;
          });
        };
        if (parts.length >= 2) {
          drawName(parts[0], h / 2 - lineGap);
          drawName(parts[1], h / 2 + lineGap);
          ctx.font = `${Math.round(fs * 0.42)}px "PingFang SC",sans-serif`;
          ctx.fillStyle = "#e58fa6";
          ctx.fillText(sep, w / 2, h / 2);
        } else {
          drawName(parts[0] ?? "", h / 2);
        }
      }, 1024, 1024),
    );
    nameTex.colorSpace = THREE.SRGBColorSpace;
    const nameLayer = new THREE.Mesh(
      new THREE.PlaneGeometry(NAME_SIZE, NAME_SIZE),
      // 不受光：墙面射灯 + 色调映射会把玫瑰金冲成白色，按贴图原色显示才读得出金属渐变
      new THREE.MeshBasicMaterial({
        map: nameTex,
        transparent: true,
        alphaTest: 0.05,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    nameLayer.position.set(0, NAME_CY, EZ + 0.012);
    this.scene.add(nameLayer);

    // ── 姓名外围椭圆玫瑰花环（底部开口的拱形）──
    const wreathCY = 5.0;
    const wreathRX = 3.1;
    const wreathRY = 4.2;
    const wreathSteps = 48;
    const gapHalf = 0.34;
    for (let i = 0; i < wreathSteps; i++) {
      const theta =
        -Math.PI / 2 + gapHalf + (i / (wreathSteps - 1)) * (Math.PI * 2 - gapHalf * 2);
      const x = Math.cos(theta) * wreathRX;
      const y = wreathCY + Math.sin(theta) * wreathRY;
      const z = EZ + 0.18 + Math.random() * 0.08;
      if (i % 3 === 0) {
        const leaf = this.makeLeaf();
        leaf.position.set(x, y, z - 0.03);
        leaf.rotation.z = theta + Math.PI / 2;
        leaf.rotation.x = -0.3;
        this.collectFlora(leaf);
      } else {
        const rose = this.makeRose();
        rose.position.set(x, y, z);
        rose.rotation.set(
          (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 0.5,
          theta + Math.PI / 2 + (Math.random() - 0.5) * 0.4,
        );
        rose.scale.setScalar(0.95 + Math.random() * 0.35);
        this.collectRose(rose);
      }
    }

    // ── 两侧整墙高照片（3:4 竖幅，香槟金细框 + 白色卡纸边），外缘离侧墙 0.3m ──
    const photoH = this.H - 1.6;
    const photoW = photoH * 0.75;
    const photoY = 0.65 + photoH / 2;
    const photoCX = this.W / 2 - 0.3 - photoW / 2;
    const frameMat = new THREE.MeshStandardMaterial({
      color: C.champagne,
      metalness: 0.8,
      roughness: 0.3,
      envMapIntensity: 1.4,
    });
    const matMat = new THREE.MeshStandardMaterial({ color: "#fbf7f2", roughness: 0.95 });
    const fallback: [string, string] = [
      this.opts.photos[0]?.src ?? "",
      this.opts.photos[1]?.src ?? "",
    ];
    const w0 = this.photoForSlot("后墙左");
    const w1 = this.photoForSlot("后墙右");
    const wps = [w0, w1];
    const srcs = w0 && w1 ? [w0.src, w1.src] : (this.opts.wallPhotos ?? fallback);
    [-1, 1].forEach((sign, idx) => {
      const cx = sign * photoCX;

      const mat = new THREE.Mesh(new THREE.PlaneGeometry(photoW + 0.16, photoH + 0.16), matMat);
      mat.position.set(cx, photoY, EZ + 0.03);
      this.scene.add(mat);

      const src = srcs[idx];
      this.slotTag(idx === 0 ? "后墙左" : "后墙右", new THREE.Vector3(cx, photoY + photoH / 2 + 0.4, EZ + 0.3), this.scene);
      if (src) {
        const photoMat = this.makePhotoMaterial();
        const key = this.usePhoto(photoMat, w0 && w1 ? wps[idx] : null, src, photoW / photoH);
        const photo = new THREE.Mesh(new THREE.PlaneGeometry(photoW, photoH), photoMat);
        photo.position.set(cx, photoY, EZ + 0.05);
        this.scene.add(photo);
        this.photoTargets.push({ mesh: photo, w: photoW, h: photoH, zone: "hall", key });
      }

      const hw = photoW / 2 + 0.11;
      const hh = photoH / 2 + 0.11;
      const t = 0.12;
      const bars: [number, number, number, number][] = [
        [hw * 2 + t, t, cx, photoY + hh],
        [hw * 2 + t, t, cx, photoY - hh],
        [t, hh * 2 - t, cx - hw + t / 2, photoY],
        [t, hh * 2 - t, cx + hw - t / 2, photoY],
      ];
      bars.forEach(([bw, bh, bx, by]) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.07), frameMat);
        bar.position.set(bx, by, EZ + 0.075);
        this.scene.add(bar);
      });
    });

    // 单盏宽角射灯洗整面墙，覆盖全宽全高（不投影）
    const spot = new THREE.SpotLight("#fff0ee", 2.0, 40, 1.2, 0.6, 1.4);
    spot.position.set(0, this.H - 0.8, this.DEPTH_START + 10);
    spot.target.position.set(0, 5.2, this.DEPTH_START);
    this.scene.add(spot, spot.target);

    // 后墙两张大照片 + 中央姓名各配一盏可见射灯
    const mountY = this.H - 0.42;
    const mountZ = this.DEPTH_START + 2.2;
    [-1, 1].forEach((sign) => {
      this.addTrackLight(sign * photoCX, mountY, mountZ, sign * photoCX, photoY, EZ + 0.05);
    });
    this.addTrackLight(0, mountY, mountZ, 0, NAME_CY, EZ + 0.01);
  }

  /** 后墙背景的对称卷草蕾丝单元（透明度由调用方设置） */
  private drawLaceMotif(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
    ctx.lineWidth = Math.max(1, r * 0.05);
    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((k / 4) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(r * 0.35, -r * 0.15, r * 0.75, -r * 0.5, r * 0.55, -r);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.5, -r * 0.55, r * 0.16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 西式细线边框四角的小卷草 */
  private drawCornerVolute(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    sx: number,
    sy: number,
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.beginPath();
    ctx.moveTo(0, 42);
    ctx.bezierCurveTo(0, 14, 14, 0, 42, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14, 14, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /** 红毯尽头的椭圆形地面花环 */
  /** 红毯尽头的椭圆形玫瑰花环：随仪式台抬到台面上，环绕签字台 */
  private buildFloorRing() {
    const rx = 1.3;
    const rz = 0.62;
    const cz = this.DEPTH_START + 1.5;
    const y = this.HALL_STAGE_DECK_Y + 0.05;
    const steps = 34;
    const palette = ["#fdf8f3", "#f4c9d4", "#ef8fae", "#f6b48f"];
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = Math.cos(a) * rx;
      const z = cz + Math.sin(a) * rz;
      if (i % 2 === 0) {
        this.hallStageRoses.push({
          m: new THREE.Matrix4().compose(
            new THREE.Vector3(x, y + Math.random() * 0.03, z),
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5),
            ),
            new THREE.Vector3(0.62, 0.62, 0.62),
          ),
          color: new THREE.Color(palette[i % palette.length]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.1),
        });
      } else {
        const leaf = this.makeLeaf();
        leaf.position.set(x, y - 0.05, z);
        leaf.rotation.x = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        leaf.rotation.z = -a;
        this.collectFlora(leaf);
      }
    }
  }

  /** 在光源与照射目标之间放一个半透明光锥，模拟射灯光柱 */
  private addLightCone(from: THREE.Vector3, to: THREE.Vector3, radius: number, opacity: number) {
    const dir = new THREE.Vector3().subVectors(from, to);
    const dist = dir.length();
    if (dist < 1e-4) return;
    dir.normalize();
    const coneMat = new THREE.MeshBasicMaterial({
      color: "#ffe9cf",
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, dist, 20, 1, true), coneMat);
    cone.position.copy(from).addScaledVector(dir, -dist / 2);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(cone);
    this.lightCones.push({ mesh: cone, mat: coneMat, target: to.clone(), base: opacity });
  }

  /** 记录一盏射灯的挂载点与照射目标，供 buildTrackLightFixtures 统一实例化 */
  private addTrackLight(
    mx: number,
    my: number,
    mz: number,
    tx: number,
    ty: number,
    tz: number,
  ) {
    this.trackLights.push({
      mount: new THREE.Vector3(mx, my, mz),
      target: new THREE.Vector3(tx, ty, tz),
    });
  }

  /**
   * 侧墙洗墙射灯：每侧 2 盏大角度、无阴影的 SpotLight，从天花板斜照墙上半部，
   * 与主灯 1 + 小吊灯 4 + 后墙 1 合计 10 盏实时灯光（不超 12 的预算）。
   */
  private buildWallWash() {
    [-1, 1].forEach((sign) => {
      for (let i = 1; i <= 2; i++) {
        const z = this.DEPTH_START + (this.LEN * i) / 3;
        const spot = new THREE.SpotLight("#fff0ea", 1.7, 56, 1.05, 0.75, 1.5);
        spot.position.set(sign * (this.W / 2 - 5), this.H - 0.6, z);
        spot.target.position.set(sign * (this.W / 2), 4.6, z);
        spot.castShadow = false;
        this.scene.add(spot, spot.target);
      }
    });
  }

  /**
   * 天花板轨道射灯：每张照片的光锥起点都有一个可见灯具。
   * 底座/连杆/灯头/遮光环/透镜各一个 InstancedMesh；灯头朝向照片中心，
   * 透镜即光锥起点，另加一个加色光晕 Sprite。
   */
  private buildTrackLightFixtures() {
    const lights = this.trackLights;
    if (lights.length === 0) return;
    const n = lights.length;

    const goldMat = new THREE.MeshStandardMaterial({
      color: C.champagne,
      metalness: 0.85,
      roughness: 0.3,
      envMapIntensity: 1.5,
    });
    const blackMat = new THREE.MeshStandardMaterial({
      color: "#151210",
      metalness: 0.2,
      roughness: 0.6,
    });
    const lensMat = new THREE.MeshBasicMaterial({ color: "#fff3e0" });

    const baseGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16);
    const armGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.26, 8);
    const headGeo = new THREE.CylinderGeometry(0.14, 0.11, 0.34, 18, 1, true);
    const ringGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 18, 1, true);
    const lensGeo = new THREE.CircleGeometry(0.1, 20);

    const baseMesh = new THREE.InstancedMesh(baseGeo, goldMat, n);
    const armMesh = new THREE.InstancedMesh(armGeo, goldMat, n);
    const headMesh = new THREE.InstancedMesh(headGeo, goldMat, n);
    const ringMesh = new THREE.InstancedMesh(ringGeo, blackMat, n);
    const lensMesh = new THREE.InstancedMesh(lensGeo, lensMat, n);

    const glowMat = new THREE.SpriteMaterial({
      map: this.getGlowTexture(),
      color: "#fff3e0",
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const neck = 0.26;
    const headLen = 0.34;
    const dummy = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const faceZ = new THREE.Vector3(0, 0, 1);
    const dir = new THREE.Vector3();

    lights.forEach((L, i) => {
      dir.subVectors(L.target, L.mount);
      if (dir.lengthSq() < 1e-8) dir.set(0, -1, 0);
      dir.normalize();

      dummy.position.copy(L.mount);
      dummy.quaternion.identity();
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      baseMesh.setMatrixAt(i, dummy.matrix);

      const aim = new THREE.Quaternion().setFromUnitVectors(up, dir);

      dummy.position.copy(L.mount).addScaledVector(dir, neck / 2);
      dummy.quaternion.copy(aim);
      dummy.updateMatrix();
      armMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.copy(L.mount).addScaledVector(dir, neck + headLen / 2);
      dummy.updateMatrix();
      headMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.copy(L.mount).addScaledVector(dir, neck + headLen - 0.04);
      dummy.updateMatrix();
      ringMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.copy(L.mount).addScaledVector(dir, neck + headLen - 0.01);
      dummy.quaternion.setFromUnitVectors(faceZ, dir);
      dummy.updateMatrix();
      lensMesh.setMatrixAt(i, dummy.matrix);

      const lensPos = L.mount.clone().addScaledVector(dir, neck + headLen + 0.01);
      const glow = new THREE.Sprite(glowMat);
      glow.position.copy(lensPos);
      glow.scale.set(0.5, 0.5, 1);
      this.scene.add(glow);

      this.addLightCone(lensPos, L.target, 0.9, 0.05);
    });

    baseMesh.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    lensMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(baseMesh, armMesh, headMesh, ringMesh, lensMesh);
  }

  private buildArch() {
    const goldMat = new THREE.MeshStandardMaterial({
      color: C.champagne,
      metalness: 0.6,
      roughness: 0.3,
    });
    const ivoryMat = new THREE.MeshStandardMaterial({ color: C.archIvory, roughness: 0.75 });
    const roseGoldMat = new THREE.MeshStandardMaterial({
      color: C.roseMetal,
      metalness: 0.5,
      roughness: 0.38,
    });

    const ar = this.ARCH_R;
    const ph = this.ARCH_PH;
    const az = this.ARCH_Z;

    const innerArch = new THREE.Mesh(
      new THREE.TorusGeometry(ar, 0.1, 12, 72, Math.PI),
      goldMat,
    );
    innerArch.position.set(0, ph, az);
    this.scene.add(innerArch);

    [-ar, ar].forEach((x) => {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.12, ph, 0.12), goldMat);
      strip.position.set(x, ph / 2, az);
      this.scene.add(strip);
      this.circles.push({ x, z: az, r: 0.35 });
    });

    [-ar - 0.9, ar + 0.9].forEach((x) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 6.5, 20), ivoryMat);
      col.position.set(x, 3.25, az + 0.5);
      this.scene.add(col);

      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.32, 0.38, 20), goldMat);
      cap.position.set(x, 6.69, az + 0.5);
      this.scene.add(cap);
      const capTop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.9), goldMat);
      capTop.position.set(x, 6.95, az + 0.5);
      this.scene.add(capTop);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.22, 20), goldMat);
      base.position.set(x, 0.11, az + 0.5);
      this.scene.add(base);

      this.circles.push({ x, z: az + 0.5, r: 0.6 });
    });

    const outerArch = new THREE.Mesh(
      new THREE.TorusGeometry(ar + 0.9, 0.13, 12, 72, Math.PI),
      roseGoldMat,
    );
    outerArch.position.set(0, 6.95, az + 0.5);
    this.scene.add(outerArch);

    const pedimentShape = new THREE.Shape();
    pedimentShape.moveTo(-(ar + 1.5), 0);
    pedimentShape.lineTo(ar + 1.5, 0);
    pedimentShape.lineTo(0, 1.4);
    pedimentShape.lineTo(-(ar + 1.5), 0);
    const ped = new THREE.Mesh(
      new THREE.ShapeGeometry(pedimentShape),
      new THREE.MeshStandardMaterial({
        color: C.wallUpper,
        roughness: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    ped.position.set(0, 7.08, az + 0.5);
    this.scene.add(ped);
    const pedEdge = new THREE.Mesh(new THREE.BoxGeometry((ar + 1.5) * 2, 0.1, 0.1), roseGoldMat);
    pedEdge.position.set(0, 7.08, az + 0.55);
    this.scene.add(pedEdge);

    const { title, namesLine, dateLine } = this.opts;
    const signTex = this.reg(
      this.makeCanvasTexture((ctx, w, h) => {
        ctx.fillStyle = "rgba(30,10,18,0.9)";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = C.champagne;
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.strokeStyle = C.roseMetal;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(13, 13, w - 26, h - 26);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#f5dce4";
        ctx.font = 'italic 60px Georgia, "Songti SC", serif';
        ctx.fillText(title, w / 2, h * 0.36);

        ctx.fillStyle = C.roseMetal;
        ctx.font = '26px Georgia, "Songti SC", serif';
        ctx.fillText(`${namesLine}  ·  ${dateLine}`, w / 2, h * 0.7);
      }, 640, 150),
    );
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 1.17),
      new THREE.MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.9 }),
    );
    sign.position.set(0, this.H + 0.2, az + 0.52);
    this.scene.add(sign);
  }

  // ── 玫瑰花环 ───────────────────────────────────────────────
  private buildRoseGarland() {
    const ar = this.ARCH_R;
    const ph = this.ARCH_PH;
    const az = this.ARCH_Z;

    const steps = 36;
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI;
      const gr = ar + 0.22;
      const x = gr * Math.cos(theta);
      const y = ph + gr * Math.sin(theta);
      const z = az + 0.18;
      if (i % 4 === 0) {
        const rose = this.makeRose();
        rose.position.set(x, y, z);
        rose.rotation.set(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.3,
          -theta + Math.PI / 2 + (Math.random() - 0.5) * 0.3,
        );
        this.collectRose(rose);
      } else {
        const leaf = this.makeLeaf();
        leaf.position.set(x, y, z - 0.02);
        leaf.rotation.z = -theta + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
        this.collectFlora(leaf);
      }
    }

    const vineSteps = 40;
    for (let i = 0; i <= vineSteps; i++) {
      const t = i / vineSteps;
      const theta = t * Math.PI;
      const gr = ar + 0.2;
      const x = gr * Math.cos(theta) + (Math.random() - 0.5) * 0.12;
      const y = ph + gr * Math.sin(theta) + (Math.random() - 0.5) * 0.12;
      const bud = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 + Math.random() * 0.03, 5, 5),
        new THREE.MeshStandardMaterial({ color: C.leafColors[i % 3], roughness: 0.85 }),
      );
      bud.position.set(x, y, az + 0.12 + Math.random() * 0.06);
      this.collectFlora(bud);
    }

    this.garlandPillar(-ar, ph, az);
    this.garlandPillar(ar, ph, az);
    this.archFlowerCluster(-ar - 0.9, 7.1, az + 0.5);
    this.archFlowerCluster(ar + 0.9, 7.1, az + 0.5);
    this.archFlowerCluster(0, ph + ar + 0.22, az + 0.18);
  }

  private garlandPillar(px: number, ph: number, az: number) {
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const y = (i / steps) * ph;
      const z = az + 0.16;
      if (i % 4 === 0) {
        const rose = this.makeRose();
        rose.position.set(px, y, z);
        rose.rotation.set(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.3,
          (Math.random() - 0.5) * 0.3,
        );
        this.collectRose(rose);
      } else {
        const leaf = this.makeLeaf();
        leaf.position.set(px, y, z - 0.02);
        leaf.rotation.z = (Math.random() - 0.5) * 1.2;
        this.collectFlora(leaf);
      }
    }
  }

  private archFlowerCluster(x: number, y: number, z: number) {
    for (let i = 0; i < 5; i++) {
      const rose = this.makeRose();
      rose.position.set(
        x + (Math.random() - 0.5) * 0.3,
        y + (Math.random() - 0.5) * 0.3,
        z + Math.random() * 0.1,
      );
      rose.rotation.set(Math.random() * 0.5, Math.random() * 0.5, Math.random() * Math.PI * 2);
      this.collectRose(rose);
    }
    for (let i = 0; i < 6; i++) {
      const leaf = this.makeLeaf();
      leaf.position.set(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.4, z);
      leaf.rotation.z = Math.random() * Math.PI * 2;
      this.collectFlora(leaf);
    }
  }

  private makeRose(): THREE.Mesh {
    // 花瓣逐朵烘焙进带顶点色的合并几何（每朵 1 个 draw call 而非 ~20 个），视觉与逐瓣 mesh 完全一致
    const base = new THREE.Color(C.roseColors[Math.floor(Math.random() * C.roseColors.length)]);
    // 同色系内 HSL 微抖动：色相 ±0.02、亮度 ±0.08
    const tone = base.clone().offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.16);
    const budColor = new THREE.Color("#8a2040");

    const parts: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const bake = (geo: THREE.BufferGeometry, color: THREE.Color) => {
      const g = geo.applyMatrix4(m);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = color.r;
        arr[i * 3 + 1] = color.g;
        arr[i * 3 + 2] = color.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
      parts.push(g);
    };

    for (let layer = 0; layer < 3; layer++) {
      const count = 5 + layer * 2;
      const r = 0.1 - layer * 0.025;
      const spread = 0.09 - layer * 0.02;
      const heightOffset = layer * 0.035;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + layer * 0.4;
        p.set(Math.cos(angle) * spread, heightOffset, Math.sin(angle) * spread);
        // 三轴随机扰动，破除球体的“几何感”
        s.set(
          0.85 + Math.random() * 0.35,
          0.5 + Math.random() * 0.25,
          0.9 + Math.random() * 0.4,
        );
        q.setFromEuler(
          new THREE.Euler(
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.5,
            (Math.random() - 0.5) * 0.6,
          ),
        );
        m.compose(p, q, s);
        bake(new THREE.SphereGeometry(r, 5, 4), tone);
      }
    }

    const bud = new THREE.SphereGeometry(0.055, 6, 6);
    bud.scale(1, 0.7, 1);
    m.identity().setPosition(0, 0.08, 0);
    bake(bud, budColor);

    if (!this.roseBakedMat) {
      this.roseBakedMat = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        vertexColors: true,
        roughness: 0.7,
        metalness: 0.01,
      });
    }
    const mesh = new THREE.Mesh(this.mergeParts(parts, "rose"), this.roseBakedMat);
    mesh.scale.setScalar(0.85 + Math.random() * 0.45);
    return mesh;
  }

  private makeLeaf(): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.14, 0.06, 0, 0.26);
    shape.quadraticCurveTo(-0.14, 0.06, 0, 0);
    const geo = new THREE.ShapeGeometry(shape, 6);
    const color = C.leafColors[Math.floor(Math.random() * C.leafColors.length)];
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.82 }),
    );
    mesh.scale.setScalar(0.7 + Math.random() * 0.6);
    return mesh;
  }

  /** 静态叶子/花苞不逐个成 mesh，先收集变换与颜色，最终由 finalizeFlora 合并成单个 draw call */
  private collectFlora(mesh: THREE.Mesh) {
    mesh.updateMatrix();
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    const color = (mesh.material as THREE.MeshStandardMaterial).color;
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = color.r;
      arr[i * 3 + 1] = color.g;
      arr[i * 3 + 2] = color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    this.staticFloraParts.push(g);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  /** 厅内静态程序化玫瑰：按世界变换烘焙进同一份几何，finalizeFlora 时合成 1 个 draw call（原先每朵 1 个，共 85 个） */
  private collectRose(rose: THREE.Mesh) {
    rose.updateMatrix();
    this.staticRoseParts.push(rose.geometry.applyMatrix4(rose.matrix));
  }

  private finalizeFlora() {
    if (this.staticRoseParts.length > 0 && this.roseBakedMat) {
      this.scene.add(new THREE.Mesh(this.mergeParts(this.staticRoseParts, "static roses"), this.roseBakedMat));
      this.staticRoseParts = [];
    }
    if (this.staticFloraParts.length === 0) return;
    if (!this.floraBakedMat) {
      this.floraBakedMat = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.82,
      });
    }
    this.scene.add(new THREE.Mesh(this.mergeParts(this.staticFloraParts, "flora"), this.floraBakedMat));
    this.staticFloraParts = [];
  }

  // ── 内部细节 ───────────────────────────────────────────────
  private buildCarpet() {
    const carpetLen = this.LEN - 1;
    const cz = this.CZ;
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, carpetLen),
      new THREE.MeshStandardMaterial({ color: C.carpet, roughness: 0.92 }),
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.002, cz);
    this.scene.add(carpet);

    const borderMat = new THREE.MeshStandardMaterial({
      color: C.champagne,
      roughness: 0.7,
      metalness: 0.15,
    });
    [-1.3, 1.3].forEach((x) => {
      const border = new THREE.Mesh(new THREE.PlaneGeometry(0.08, carpetLen), borderMat);
      border.rotation.x = -Math.PI / 2;
      border.position.set(x, 0.003, cz);
      this.scene.add(border);
    });
  }

  private buildMolding() {
    const roseMat = new THREE.MeshStandardMaterial({
      color: C.roseMetal,
      metalness: 0.32,
      roughness: 0.55,
    });
    const champMat = new THREE.MeshStandardMaterial({
      color: C.champagne,
      metalness: 0.5,
      roughness: 0.4,
    });
    const lightMat = new THREE.MeshStandardMaterial({
      color: C.champagneLight,
      metalness: 0.5,
      roughness: 0.42,
    });

    const len = this.LEN;
    const cx = this.CZ;
    const walls: { orient: "left" | "right" | "back"; wl: number; wcx: number }[] = [
      { orient: "left", wl: len, wcx: cx },
      { orient: "right", wl: len, wcx: cx },
      { orient: "back", wl: this.W, wcx: this.DEPTH_START },
    ];

    walls.forEach(({ orient, wl, wcx }) => {
      const g = new THREE.Group();
      if (orient === "left") {
        g.position.set(-this.W / 2, 0, wcx);
        g.rotation.y = Math.PI / 2;
      } else if (orient === "right") {
        g.position.set(this.W / 2, 0, wcx);
        g.rotation.y = -Math.PI / 2;
      } else {
        g.position.set(0, 0, wcx);
      }

      const base = new THREE.Mesh(new THREE.BoxGeometry(wl, 0.22, 0.13), roseMat);
      base.position.set(0, 0.11, 0.065);
      g.add(base);

      // 后墙已去掉护墙板，同步去掉腰线；踢脚线与檐口保留在囍字背景外框之外
      if (orient !== "back") {
        const chair = new THREE.Mesh(new THREE.BoxGeometry(wl, 0.1, 0.16), roseMat);
        chair.position.set(0, 1.55, 0.08);
        g.add(chair);
        const chairLine = new THREE.Mesh(new THREE.BoxGeometry(wl, 0.045, 0.2), lightMat);
        chairLine.position.set(0, 1.63, 0.09);
        g.add(chairLine);
      }

      // 檐口线：四段不同进深的 box 叠出层次感（避免单根方条）
      const crownSegs: [number, number, number, THREE.Material][] = [
        [this.H - 0.06, 0.12, 0.2, champMat],
        [this.H - 0.17, 0.1, 0.15, lightMat],
        [this.H - 0.27, 0.09, 0.1, champMat],
        [this.H - 0.36, 0.06, 0.06, lightMat],
      ];
      crownSegs.forEach(([y, h, d, mat]) => {
        const seg = new THREE.Mesh(new THREE.BoxGeometry(wl, h, d), mat);
        seg.position.set(0, y, d / 2 - 0.02);
        g.add(seg);
      });

      this.scene.add(g);
    });
  }

  private buildPedestals() {
    const pz = this.LEN * 0.23;
    const positions = [
      { x: -this.W / 2 + 1.2, z: this.CZ + pz },
      { x: this.W / 2 - 1.2, z: this.CZ + pz },
      { x: -this.W / 2 + 1.2, z: this.CZ - pz },
      { x: this.W / 2 - 1.2, z: this.CZ - pz },
    ];

    positions.forEach(({ x, z }) => {
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 1.1, 16),
        new THREE.MeshStandardMaterial({ color: "#f8f2ea", roughness: 0.65, metalness: 0.08 }),
      );
      ped.position.set(x, 0.55, z);
      this.scene.add(ped);

      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.22, 0.1, 16),
        new THREE.MeshStandardMaterial({ color: C.champagne, metalness: 0.5, roughness: 0.35 }),
      );
      top.position.set(x, 1.15, z);
      this.scene.add(top);

      const vase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.07, 0.35, 12),
        new THREE.MeshStandardMaterial({ color: "#efe4da", roughness: 0.4, metalness: 0.2 }),
      );
      vase.position.set(x, 1.375, z);
      this.scene.add(vase);

      for (let i = 0; i < 5; i++) {
        const r = this.makeRose();
        r.position.set(
          x + (Math.random() - 0.5) * 0.2,
          1.6 + Math.random() * 0.15,
          z + (Math.random() - 0.5) * 0.2,
        );
        r.rotation.set((Math.random() - 0.5) * 0.8, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.5);
        this.collectRose(r);
      }
      for (let i = 0; i < 4; i++) {
        const l = this.makeLeaf();
        l.position.set(
          x + (Math.random() - 0.5) * 0.3,
          1.55 + Math.random() * 0.1,
          z + (Math.random() - 0.5) * 0.3,
        );
        l.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
        this.collectFlora(l);
      }

      this.circles.push({ x, z, r: 0.5 });
    });
  }

  // ── 过道装饰（阶段 2）──────────────────────────────────────
  /** 把若干已烘焙变换的几何合并为一个；合并后立即释放零件几何 */
  private mergeParts(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (!merged) throw new Error(`${label} geometry merge failed`);
    return merged;
  }

  /**
   * 简化玫瑰头：3 层共 18 片压扁低模花瓣 + 花心，合并后约 380 三角形。
   * 所有新装饰的玫瑰共用此单一几何，靠实例色与逐实例随机旋转制造差异。
   */
  private makeRoseHeadGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    for (let layer = 0; layer < 3; layer++) {
      const count = 7 - layer;
      const r = 0.1 - layer * 0.025;
      const spread = 0.085 - layer * 0.018;
      const y = layer * 0.032;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + layer * 0.5;
        const petal = new THREE.SphereGeometry(r, 5, 2);
        petal.scale(0.95, 0.55, 1.05);
        petal.rotateZ((Math.random() - 0.5) * 0.6);
        petal.rotateX((Math.random() - 0.5) * 0.5);
        petal.translate(Math.cos(a) * spread, y, Math.sin(a) * spread);
        parts.push(petal);
      }
    }
    const bud = new THREE.SphereGeometry(0.05, 4, 3);
    bud.scale(1, 0.8, 1);
    bud.translate(0, 0.075, 0);
    parts.push(bud);
    return this.mergeParts(parts, "rose head");
  }

  /** 绣球团：6 个小球围绕中心球，合并约 250 三角形 */
  private makeHydrangeaGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const core = new THREE.SphereGeometry(0.062, 5, 4);
    core.translate(0, 0.03, 0);
    parts.push(core);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const s = new THREE.SphereGeometry(0.07, 5, 3);
      s.translate(Math.cos(a) * 0.075, 0.03 + (Math.random() - 0.5) * 0.05, Math.sin(a) * 0.075);
      parts.push(s);
    }
    return this.mergeParts(parts, "hydrangea");
  }

  private makeLeafGeometry(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.13, 0.06, 0, 0.24);
    shape.quadraticCurveTo(-0.13, 0.06, 0, 0);
    return new THREE.ShapeGeometry(shape, 4);
  }

  /** 过道花拱金属框：两根立柱 + 柱脚盘 + 半圆拱 + 拱顶球饰，一次合并（3 座共用） */
  private makeArchFrameGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const X = 1.9;
    const H = 1.7;
    [-X, X].forEach((px) => {
      const post = new THREE.CylinderGeometry(0.05, 0.06, H, 10);
      post.translate(px, H / 2, 0);
      parts.push(post);
      const foot = new THREE.CylinderGeometry(0.11, 0.13, 0.08, 12);
      foot.translate(px, 0.04, 0);
      parts.push(foot);
    });
    const arc = new THREE.TorusGeometry(X, 0.05, 8, 40, Math.PI);
    arc.translate(0, H, 0);
    parts.push(arc);
    const orb = new THREE.SphereGeometry(0.09, 10, 8);
    orb.translate(0, H + X + 0.02, 0);
    parts.push(orb);
    return this.mergeParts(parts, "arch frame");
  }

  private makePillarBaseGeometry(): THREE.BufferGeometry {
    const body = new THREE.CylinderGeometry(0.24, 0.32, 0.9, 18);
    body.translate(0, 0.45, 0);
    const cap = new THREE.CylinderGeometry(0.3, 0.26, 0.09, 18);
    cap.translate(0, 0.94, 0);
    return this.mergeParts([body, cap], "pillar base");
  }

  private makePillarVaseGeometry(): THREE.BufferGeometry {
    const profile = [
      new THREE.Vector2(0.03, 0),
      new THREE.Vector2(0.15, 0),
      new THREE.Vector2(0.16, 0.03),
      new THREE.Vector2(0.07, 0.08),
      new THREE.Vector2(0.055, 0.2),
      new THREE.Vector2(0.075, 0.3),
      new THREE.Vector2(0.17, 0.42),
      new THREE.Vector2(0.185, 0.5),
      new THREE.Vector2(0.155, 0.53),
    ];
    const vase = new THREE.LatheGeometry(profile, 18);
    vase.translate(0, 0.95, 0);
    return vase;
  }

  /** 玫瑰球形花树的金属杆 + 花盆 + 顶端球饰 */
  private makeTopiaryFrameGeometry(): THREE.BufferGeometry {
    const pot = new THREE.CylinderGeometry(0.16, 0.22, 0.3, 14);
    pot.translate(0, 0.15, 0);
    const pole = new THREE.CylinderGeometry(0.035, 0.045, 1.35, 10);
    pole.translate(0, 0.97, 0);
    const finial = new THREE.SphereGeometry(0.06, 8, 6);
    finial.translate(0, 1.66, 0);
    return this.mergeParts([pot, pole, finial], "topiary");
  }

  /** 多臂烛台金属骨架：底盘 + 中杆 + 5 条上弯臂 + 臂端托盘，一次合并（7 座共用） */
  private makeCandelabraFrameGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const base = new THREE.CylinderGeometry(0.16, 0.24, 0.1, 16);
    base.translate(0, 0.05, 0);
    parts.push(base);
    const stem = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.02, 0),
        new THREE.Vector2(0.09, 0.02),
        new THREE.Vector2(0.05, 0.12),
        new THREE.Vector2(0.035, 0.55),
        new THREE.Vector2(0.045, 0.95),
        new THREE.Vector2(0.02, 1.02),
        new THREE.Vector2(0.07, 1.07),
      ],
      14,
    );
    stem.translate(0, 0.1, 0);
    parts.push(stem);
    const arms = 5;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0, 1.05, 0),
        new THREE.Vector3(0.27, 1.07, 0),
        new THREE.Vector3(0.3, 1.34, 0),
      );
      const arm = new THREE.TubeGeometry(curve, 10, 0.016, 6, false);
      const tray = new THREE.CylinderGeometry(0.052, 0.036, 0.03, 10);
      tray.translate(0.3, 1.36, 0);
      arm.rotateY(-a);
      tray.rotateY(-a);
      parts.push(arm, tray);
    }
    return this.mergeParts(parts, "candelabra");
  }

  /**
   * 三脚画架（本地单位，+z 为正面）：两条前腿上窄下宽成 A 字，并与画框同样后仰 0.1rad；
   * 后支腿从前腿顶部横档铰接处斜向后方落地，三脚着地。
   */
  private makeEaselGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const bar = (a: THREE.Vector3, b: THREE.Vector3, t = 0.028) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const g = new THREE.BoxGeometry(t, dir.length(), t);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      parts.push(g);
    };
    const TOP = 1.15;
    const lean = Math.tan(0.1);
    const legZ = (y: number) => 0.06 - y * lean;
    const legX = (y: number) => 0.3 - (y / TOP) * 0.1;
    [-1, 1].forEach((s) => bar(new THREE.Vector3(s * legX(0), 0, legZ(0)), new THREE.Vector3(s * legX(TOP), TOP, legZ(TOP))));
    const hingeY = TOP - 0.05;
    bar(new THREE.Vector3(0, hingeY, legZ(hingeY) - 0.03), new THREE.Vector3(0, 0, -0.5));

    const ledge = new THREE.BoxGeometry(0.68, 0.035, 0.1);
    ledge.translate(0, 0.6, 0.04);
    parts.push(ledge);
    const cross = new THREE.BoxGeometry(legX(0.99) * 2 + 0.06, 0.03, 0.03);
    cross.translate(0, 0.99, legZ(0.99) - 0.01);
    parts.push(cross);
    const topBar = new THREE.BoxGeometry(legX(hingeY) * 2 + 0.06, 0.03, 0.03);
    topBar.translate(0, hingeY, legZ(hingeY) - 0.01);
    parts.push(topBar);
    return this.mergeParts(parts, "easel");
  }

  private makeColumn(x: number, y: number, z: number, ry: number, s = 1): THREE.Matrix4 {
    return new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(s, s, s),
    );
  }

  private roseTone(): THREE.Color {
    const base =
      Math.random() < 0.28
        ? new THREE.Color("#fdf8f3")
        : new THREE.Color(C.roseColors[Math.floor(Math.random() * C.roseColors.length)]);
    return base.offsetHSL((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.14);
  }

  private hydroTone(): THREE.Color {
    const palette = ["#fbf7f3", "#f2ece9", "#eef2ee", "#f7eaef"];
    return new THREE.Color(palette[Math.floor(Math.random() * palette.length)]).offsetHSL(
      0,
      0,
      (Math.random() - 0.5) * 0.05,
    );
  }

  private leafTone(): THREE.Color {
    const base = new THREE.Color(C.leafColors[Math.floor(Math.random() * C.leafColors.length)]);
    return base.offsetHSL((Math.random() - 0.5) * 0.03, 0, (Math.random() - 0.5) * 0.12);
  }

  private randomQuat(): THREE.Quaternion {
    return new THREE.Quaternion().setFromEuler(
      new THREE.Euler(
        (Math.random() - 0.5) * Math.PI,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * Math.PI,
      ),
    );
  }

  private pushRose(b: Floral, x: number, y: number, z: number, s: number) {
    b.roses.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        this.randomQuat(),
        new THREE.Vector3(s, s, s),
      ),
    );
    b.roseColors.push(this.roseTone());
  }

  /** 指定色玫瑰实例（小径花境等需要锁定白/绯色系的场景） */
  private pushRoseAt(b: Floral, x: number, y: number, z: number, s: number, color: THREE.Color) {
    b.roses.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        this.randomQuat(),
        new THREE.Vector3(s, s, s),
      ),
    );
    b.roseColors.push(color);
  }

  /** 指定缩放绣球实例（小径花境用，色调走 hydroTone 白色系） */
  private pushHydrangeaAt(b: Floral, x: number, y: number, z: number, s: number) {
    b.hydrangeas.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        this.randomQuat(),
        new THREE.Vector3(s, s, s),
      ),
    );
    b.hydColors.push(this.hydroTone());
  }

  private pushHydrangea(b: Floral, x: number, y: number, z: number, s: number) {
    b.hydrangeas.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        this.randomQuat(),
        new THREE.Vector3(s, s, s),
      ),
    );
    b.hydColors.push(this.hydroTone());
  }

  private pushLeaf(
    b: Floral,
    x: number,
    y: number,
    z: number,
    s: number,
    rx: number,
    ry: number,
    rz: number,
  ) {
    b.leaves.push(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(s, s, s),
      ),
    );
    b.leafColors.push(this.leafTone());
  }

  /** 在一个扁球范围内随机散布玫瑰/绣球（用作花团、花篱、花柱顶） */
  private scatterFloral(
    b: Floral,
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    count: number,
    scale: number,
  ) {
    for (let i = 0; i < count; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      const r = radius * (0.45 + 0.55 * Math.cbrt(Math.random()));
      const x = cx + Math.sin(ph) * Math.cos(th) * r;
      const y = cy + Math.cos(ph) * r * 0.65;
      const z = cz + Math.sin(ph) * Math.sin(th) * r;
      if (Math.random() < 0.7) {
        this.pushRose(b, x, y, z, (0.72 + Math.random() * 0.45) * scale);
      } else {
        this.pushHydrangea(b, x, y, z, (0.78 + Math.random() * 0.45) * scale);
      }
    }
  }

  private finalizeFloral(b: Floral): THREE.Group {
    const group = new THREE.Group();
    const addInstanced = (
      geo: THREE.BufferGeometry,
      mats: THREE.Matrix4[],
      colors: THREE.Color[],
    ) => {
      if (mats.length === 0) return;
      const mat = new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.72,
        metalness: 0.02,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      mesh.frustumCulled = false;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      colors.forEach((c, i) => mesh.setColorAt(i, c));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    };
    addInstanced(this.makeRoseHeadGeometry(), b.roses, b.roseColors);
    addInstanced(this.makeHydrangeaGeometry(), b.hydrangeas, b.hydColors);
    const leafMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      side: THREE.DoubleSide,
      roughness: 0.82,
    });
    if (b.leaves.length > 0) {
      const mesh = new THREE.InstancedMesh(this.makeLeafGeometry(), leafMat, b.leaves.length);
      mesh.frustumCulled = false;
      b.leaves.forEach((m, i) => mesh.setMatrixAt(i, m));
      b.leafColors.forEach((c, i) => mesh.setColorAt(i, c));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    }
    this.scene.add(group);
    return group;
  }

  /** 三座跨红毯花拱：拱脚 x=±1.9（碰撞内缘 1.62，保证过道 x∈[-1.6,1.6] 无阻断） */
  private buildAisleArches(ctx: AisleCtx) {
    const ZS = [8, -1, -15];
    const X = 1.9;
    const H = 1.7;
    const frame = new THREE.InstancedMesh(this.makeArchFrameGeometry(), ctx.goldMat, ZS.length);
    frame.frustumCulled = false;
    const m = new THREE.Matrix4();
    ZS.forEach((z, i) => {
      m.makeTranslation(0, 0, z);
      frame.setMatrixAt(i, m);
      [-X, X].forEach((x) => {
        this.scatterFloral(ctx.archFloral, x, 0.16, z, 0.28, 7, 1);
        this.pushLeaf(ctx.archFloral, x + 0.1, 0.08, z + 0.1, 1, -Math.PI / 2, Math.random() * Math.PI * 2, 0);
      });
      const steps = 30;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI;
        const px = X * Math.cos(theta);
        const py = H + X * Math.sin(theta);
        const pz = z + (Math.random() - 0.5) * 0.16;
        const nearApex = Math.abs(theta - Math.PI / 2) < 0.35;
        const density = nearApex ? 3 : 1;
        for (let k = 0; k < density; k++) {
          const jx = (Math.random() - 0.5) * 0.16;
          const jy = (Math.random() - 0.5) * 0.16;
          if (Math.random() < 0.6) {
            this.pushRose(ctx.archFloral, px + jx, py + jy, pz, 0.6 + Math.random() * 0.35);
          } else {
            this.pushHydrangea(ctx.archFloral, px + jx, py + jy, pz, 0.75 + Math.random() * 0.4);
          }
        }
        if (s % 3 === 0) {
          const drop = 0.3 + Math.random() * 0.3;
          for (let k = 1; k <= 3; k++) {
            this.pushLeaf(
              ctx.archFloral,
              px + (Math.random() - 0.5) * 0.08,
              py - (k * drop) / 3,
              pz + (Math.random() - 0.5) * 0.08,
              0.9,
              Math.PI * (0.35 + Math.random() * 0.3),
              Math.random() * Math.PI * 2,
              0,
            );
          }
        }
      }
      this.circles.push({ x: -X, z, r: 0.28 });
      this.circles.push({ x: X, z, r: 0.28 });
    });
    frame.instanceMatrix.needsUpdate = true;
    this.scene.add(frame);
  }

  /** 沿红毯两侧成对花柱：大理石基座 + 香槟金花瓮 + 顶部饱满半球花艺 */
  private buildAislePillars(ctx: AisleCtx) {
    const ZS = [12, 6.5, 1.5, -4.5, -12.5, -20];
    const XS = [-2.6, 2.6];
    const n = ZS.length * XS.length;
    const base = new THREE.InstancedMesh(this.makePillarBaseGeometry(), ctx.marbleMat, n);
    const vase = new THREE.InstancedMesh(this.makePillarVaseGeometry(), ctx.goldMat, n);
    base.frustumCulled = false;
    vase.frustumCulled = false;
    const m = new THREE.Matrix4();
    let i = 0;
    ZS.forEach((z) => {
      XS.forEach((x) => {
        m.makeTranslation(x, 0, z);
        base.setMatrixAt(i, m);
        vase.setMatrixAt(i, m);
        i++;
        this.scatterFloral(ctx.pillarFloral, x, 1.62, z, 0.4, 22, 1.05);
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * Math.PI * 2;
          this.pushLeaf(
            ctx.pillarFloral,
            x + Math.cos(a) * 0.32,
            1.42 - Math.random() * 0.2,
            z + Math.sin(a) * 0.32,
            1.05,
            Math.PI * (0.4 + Math.random() * 0.3),
            Math.random() * Math.PI * 2,
            0,
          );
        }
        this.circles.push({ x, z, r: 0.45 });
      });
    });
    base.instanceMatrix.needsUpdate = true;
    vase.instanceMatrix.needsUpdate = true;
    this.pillarVase = vase;
    this.scene.add(base, vase);
  }

  /** 花柱之间交替布置的 5 臂水晶烛台，每臂 + 中心各一烛（仪式台前那座已挪到后区，与 (-3.15, 4) 成对） */
  private buildAisleCandelabras(ctx: AisleCtx) {
    const POS: [number, number][] = [
      [3.15, 4.0],
      [3.15, -16.25],
      [-3.15, -13.5],
      [3.15, -1.5],
      [-3.15, 4.0],
      [3.15, 9.25],
      [-3.15, 13.5],
    ];
    const arms = 5;
    const armR = 0.3;
    const cupY = 1.38;
    const frame = new THREE.InstancedMesh(
      this.makeCandelabraFrameGeometry(),
      ctx.goldMat,
      POS.length,
    );
    frame.frustumCulled = false;
    POS.forEach(([x, z], i) => {
      const ry = i * 0.72;
      frame.setMatrixAt(i, this.makeColumn(x, 0, z, ry));
      const cos = Math.cos(ry);
      const sin = Math.sin(ry);
      const local: [number, number][] = [];
      for (let a = 0; a < arms; a++) {
        const ang = (a / arms) * Math.PI * 2;
        local.push([Math.cos(ang) * armR, Math.sin(ang) * armR]);
      }
      local.push([0, 0]);
      local.forEach(([lx, lz], k) => {
        const wx = x + lx * cos + lz * sin;
        const wz = z - lx * sin + lz * cos;
        const cy = k === arms ? 1.16 : cupY;
        ctx.cupMats.push(this.makeColumn(wx, cy, wz, 0));
        ctx.candleMats.push(this.makeColumn(wx, cy + 0.06, wz, 0));
        this.aisleFlames.push({
          x: wx,
          y: cy + 0.17,
          z: wz,
          phase: Math.random() * Math.PI * 2,
          scale: 1,
        });
      });
      this.circles.push({ x, z, r: 0.35 });
    });
    frame.instanceMatrix.needsUpdate = true;
    this.scene.add(frame);
  }

  /**
   * 主灯下的中央花岛：半径 3.2 的矮花篱（沿 ±X 两段圆弧，正对过道的 ±Z 两处留 4.1m 开口）+
   * 四座玫瑰球形花树 + 一圈落地玻璃烛杯。花篱/花树/烛杯外缘均不超 x=±3.5，保证侧边人行区畅通。
   */
  private buildCenterFlowerIsland(ctx: AisleCtx) {
    const cz = this.GRAND_Z;
    const hedgeR = 3.2;
    const arcs: [number, number][] = [
      [-Math.PI * (50 / 180), Math.PI * (50 / 180)],
      [Math.PI * (130 / 180), Math.PI * (230 / 180)],
    ];
    arcs.forEach(([a0, a1]) => {
      const steps = Math.max(2, Math.round(((a1 - a0) * hedgeR) / 0.8));
      for (let s = 0; s <= steps; s++) {
        const a = a0 + (a1 - a0) * (s / steps);
        const x = Math.cos(a) * hedgeR;
        const z = cz + Math.sin(a) * hedgeR;
        this.scatterFloral(ctx.floral, x, 0.34, z, 0.34, 9, 0.95);
        this.pushLeaf(
          ctx.floral,
          x,
          0.08,
          z,
          1.1,
          -Math.PI / 2 + (Math.random() - 0.5) * 0.4,
          a,
          0,
        );
        this.circles.push({ x, z, r: 0.3 });
      }
    });

    const topAngles = [Math.PI / 4, (Math.PI * 3) / 4, (Math.PI * 5) / 4, (Math.PI * 7) / 4];
    const topiary = new THREE.InstancedMesh(
      this.makeTopiaryFrameGeometry(),
      ctx.goldMat,
      topAngles.length,
    );
    topiary.frustumCulled = false;
    topAngles.forEach((a, i) => {
      const x = Math.cos(a) * 2.9;
      const z = cz + Math.sin(a) * 2.9;
      topiary.setMatrixAt(i, this.makeColumn(x, 0, z, 0));
      const R = 0.45;
      for (let k = 0; k < 40; k++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const rr = R * (0.82 + 0.18 * Math.random());
        const px = x + Math.sin(ph) * Math.cos(th) * rr;
        const py = 1.78 + Math.cos(ph) * rr;
        const pz = z + Math.sin(ph) * Math.sin(th) * rr;
        if (Math.random() < 0.78) {
          this.pushRose(ctx.floral, px, py, pz, 0.72 + Math.random() * 0.4);
        } else {
          this.pushHydrangea(ctx.floral, px, py, pz, 0.7 + Math.random() * 0.35);
        }
      }
      this.circles.push({ x, z, r: 0.4 });
    });
    topiary.instanceMatrix.needsUpdate = true;
    this.scene.add(topiary);

    const votiveCount = 16;
    for (let i = 0; i < votiveCount; i++) {
      const half = i < 8 ? 0 : 1;
      const t = (i % 8) / 7;
      const a =
        half === 0
          ? arcs[0][0] + t * (arcs[0][1] - arcs[0][0])
          : arcs[1][0] + t * (arcs[1][1] - arcs[1][0]);
      const x = Math.cos(a) * 3.4;
      const z = cz + Math.sin(a) * 3.4;
      const hy = 0.06 + (i % 3) * 0.045;
      const s = 0.85 + (i % 2) * 0.3;
      ctx.cupMats.push(this.makeColumn(x, hy, z, 0, s));
      ctx.candleMats.push(this.makeColumn(x, hy + 0.05, z, 0, s));
      this.centerVotives.push({ x, z, a });
      this.aisleFlames.push({
        x,
        y: hy + 0.14,
        z,
        phase: Math.random() * Math.PI * 2,
        scale: 0.8 * s,
      });
    }
  }

  private welcomeSignTexture(): THREE.Texture {
    const { namesLine } = this.opts;
    const tex = this.reg(
      this.makeCanvasTexture(
        (ctx, w, h) => {
          ctx.fillStyle = "#fdf8f3";
          ctx.fillRect(0, 0, w, h);
          ctx.strokeStyle = C.champagne;
          ctx.lineWidth = 6;
          ctx.strokeRect(8, 8, w - 16, h - 16);
          ctx.strokeStyle = C.roseMetal;
          ctx.lineWidth = 2;
          ctx.strokeRect(16, 16, w - 32, h - 32);
          ctx.textAlign = "center";
          ctx.fillStyle = "#8a6b4a";
          ctx.font = 'italic 40px Georgia, "Songti SC", serif';
          ctx.fillText("Welcome", w / 2, h * 0.3);
          ctx.font = 'italic 34px Georgia, serif';
          ctx.fillText("to our Wedding", w / 2, h * 0.52);
          ctx.fillStyle = C.roseMetal;
          ctx.font = "22px Georgia, serif";
          ctx.fillText(namesLine, w / 2, h * 0.78);
        },
        256,
        190,
      ),
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** 入口两侧的欢迎花牌架（不遮挡门洞） */
  private buildWelcomeSigns(ctx: AisleCtx) {
    const POS: [number, number][] = [
      [-4.6, 13.6],
      [4.6, 13.6],
    ];
    const easel = new THREE.InstancedMesh(this.makeEaselGeometry(), ctx.goldMat, POS.length);
    easel.frustumCulled = false;
    const cardMat = new THREE.MeshStandardMaterial({
      map: this.welcomeSignTexture(),
      transparent: true,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const card = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.62, 0.46), cardMat, POS.length);
    card.frustumCulled = false;
    POS.forEach(([x, z], i) => {
      const ry = i === 0 ? 0.22 : -0.22;
      easel.setMatrixAt(i, this.makeColumn(x, 0, z, ry));
      card.setMatrixAt(
        i,
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, 0.84, z + 0.06),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, ry, 0)),
          new THREE.Vector3(1, 1, 1),
        ),
      );
      this.circles.push({ x, z, r: 0.35 });
    });
    easel.instanceMatrix.needsUpdate = true;
    card.instanceMatrix.needsUpdate = true;
    this.scene.add(easel, card);
  }

  /** 红毯两侧静态花瓣（InstancedMesh，贴地） */
  private buildAislePetals() {
    const count = this.touchMode ? 360 : 520;
    const mat = new THREE.MeshStandardMaterial({
      map: this.reg(this.petalTexture()),
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.07), mat, count);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const z0 = this.DEPTH_START + 1.2;
    const zSpan = this.ARCH_Z - 1.5 - z0;
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      dummy.position.set(
        side * (1.02 + Math.random() * 0.5),
        0.006 + Math.random() * 0.006,
        z0 + Math.random() * zSpan,
      );
      dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      dummy.scale.setScalar(0.7 + Math.random() * 0.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(Math.random() > 0.45 ? "#f6dde2" : "#fdf6f2");
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  /** 汇总所有烛杯/蜡烛实例，并用「emissive 水滴 + 加色光晕 Points」伪造烛光（不新增 Light） */
  private buildCandleHardware(ctx: AisleCtx) {
    const n = ctx.cupMats.length;
    if (n > 0) {
      const cup = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.05, 0.038, 0.15, 12),
        ctx.glassMat,
        n,
      );
      cup.frustumCulled = false;
      const candle = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10),
        ctx.candleMat,
        n,
      );
      candle.frustumCulled = false;
      ctx.cupMats.forEach((m, i) => cup.setMatrixAt(i, m));
      ctx.candleMats.forEach((m, i) => candle.setMatrixAt(i, m));
      cup.instanceMatrix.needsUpdate = true;
      candle.instanceMatrix.needsUpdate = true;
      this.scene.add(cup, candle);
    }

    const fn = this.aisleFlames.length;
    if (fn === 0) return;
    const flameGeo = new THREE.SphereGeometry(0.022, 6, 5);
    flameGeo.scale(1, 1.9, 1);
    const flame = new THREE.InstancedMesh(
      flameGeo,
      new THREE.MeshBasicMaterial({ color: "#ffd9a2" }),
      fn,
    );
    flame.frustumCulled = false;
    this.candleFlameMesh = flame;

    const pos = new Float32Array(fn * 3);
    this.aisleFlames.forEach((f, i) => {
      pos[i * 3] = f.x;
      pos[i * 3 + 1] = f.y;
      pos[i * 3 + 2] = f.z;
    });
    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const glowMat = new THREE.PointsMaterial({
      map: this.getGlowTexture(),
      color: "#ffd7a0",
      size: 0.16,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.candleGlowMat = glowMat;
    const glow = new THREE.Points(glowGeo, glowMat);
    glow.frustumCulled = false;
    this.scene.add(flame, glow);
    this.updateFlames(0);
  }

  private buildAisleDecor() {
    const ctx: AisleCtx = {
      floral: {
        roses: [],
        roseColors: [],
        hydrangeas: [],
        hydColors: [],
        leaves: [],
        leafColors: [],
      },
      pillarFloral: {
        roses: [],
        roseColors: [],
        hydrangeas: [],
        hydColors: [],
        leaves: [],
        leafColors: [],
      },
      archFloral: {
        roses: [],
        roseColors: [],
        hydrangeas: [],
        hydColors: [],
        leaves: [],
        leafColors: [],
      },
      goldMat: new THREE.MeshStandardMaterial({
        color: C.champagne,
        metalness: 0.82,
        roughness: 0.32,
        envMapIntensity: 1.5,
      }),
      marbleMat: new THREE.MeshStandardMaterial({
        color: "#f8f3ec",
        roughness: 0.55,
        metalness: 0.06,
        envMapIntensity: 1.1,
      }),
      glassMat: this.crystalMaterial(),
      candleMat: new THREE.MeshStandardMaterial({
        color: "#fbf3ea",
        roughness: 0.6,
        metalness: 0,
      }),
      cupMats: [],
      candleMats: [],
    };

    this.buildAisleArches(ctx);
    this.buildAislePillars(ctx);
    this.buildAisleCandelabras(ctx);
    this.buildCenterFlowerIsland(ctx);
    this.buildWelcomeSigns(ctx);
    this.finalizeFloral(ctx.floral);
    this.pillarFloral = this.finalizeFloral(ctx.pillarFloral);
    this.archFloral = this.finalizeFloral(ctx.archFloral);
    this.buildCandleHardware(ctx);
    this.buildAislePetals();
  }

  private tickAisleDecor(dt: number) {
    this.flameTime += dt;
    this.updateFlames(this.flameTime);
  }

  private updateFlames(t: number) {
    const mesh = this.candleFlameMesh;
    if (mesh) {
      const d = this.isoDummy;
      const n = this.aisleFlames.length;
      for (let i = 0; i < n; i++) {
        const f = this.aisleFlames[i];
        const s =
          f.scale *
          (1 +
            0.12 * Math.sin(t * 11.3 + f.phase) +
            0.06 * Math.sin(t * 6.1 + f.phase * 1.7));
        d.position.set(f.x, f.y, f.z);
        d.rotation.set(0, f.phase + t * 0.8, 0);
        d.scale.set(f.scale, s, f.scale);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.candleGlowMat) {
      const flick = 1 + 0.14 * Math.sin(t * 9.7) + 0.07 * Math.sin(t * 15.3);
      this.candleGlowMat.size = 0.16 * flick;
      this.candleGlowMat.opacity = 0.5 * flick;
    }
  }

  // ── 飘落花瓣粒子 ───────────────────────────────────────────
  private buildPetals() {
    const count = this.touchMode ? 200 : 340;
    const len = this.LEN;
    const arr = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const spins = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const b = i * 3;
      arr[b] = (Math.random() - 0.5) * this.W * 0.85;
      arr[b + 1] = Math.random() * this.H;
      arr[b + 2] = Math.random() * len + this.DEPTH_START;
      phases[i] = Math.random() * Math.PI * 2;
      speeds[i] = 0.25 + Math.random() * 0.5;
      spins[i] = (Math.random() - 0.5) * 2.6;
    }

    const origin = arr.slice();
    const geo = new THREE.PlaneGeometry(0.11, 0.075);
    const mat = new THREE.MeshStandardMaterial({
      map: this.reg(this.petalTexture()),
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const color = new THREE.Color();
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const b = i * 3;
      // 粉白两色随机
      color.set(Math.random() > 0.45 ? "#f6dde2" : "#fdf6f2");
      mesh.setColorAt(i, color);
      dummy.position.set(arr[b], arr[b + 1], arr[b + 2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);

    this.petals = { mesh, arr, origin, phases, speeds, spins, dummy, count };
  }

  private tickPetals(dt: number) {
    const p = this.petals;
    if (!p) return;
    const { mesh, arr, origin, phases, speeds, spins, dummy, count } = p;
    const t = this.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const b = i * 3;
      let y = arr[b + 1] - speeds[i] * dt;
      if (y < 0) y += this.H;
      arr[b + 1] = y;
      arr[b] = origin[b] + Math.sin(t * 0.5 + phases[i]) * 0.7;

      // 边落边旋转，比直落更真实
      dummy.position.set(arr[b], arr[b + 1], arr[b + 2]);
      dummy.rotation.set(
        t * spins[i] * 0.7 + phases[i],
        t * spins[i] + phases[i],
        t * spins[i] * 1.3,
      );
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ── 空气光尘 ───────────────────────────────────────────────
  private buildLightDust() {
    const per = 50;
    const count = this.CHAND_Z.length * per;
    const arr = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    let k = 0;
    this.CHAND_Z.forEach((z) => {
      for (let i = 0; i < per; i++) {
        const b = k * 3;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 1.3;
        arr[b] = Math.cos(a) * r;
        arr[b + 1] = this.H - 1.2 - Math.random() * 3.2;
        arr[b + 2] = z + Math.sin(a) * r;
        phases[k] = Math.random() * Math.PI * 2;
        k++;
      }
    });
    const origin = arr.slice();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      map: this.getGlowTexture(),
      color: "#ffe6c4",
      size: 0.025,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);

    this.dust = { geo, arr, origin, phases, count };
  }

  private tickDust() {
    const d = this.dust;
    if (!d) return;
    const { arr, origin, phases, count } = d;
    const t = this.clock.elapsedTime;
    for (let i = 0; i < count; i++) {
      const b = i * 3;
      arr[b] = origin[b] + Math.sin(t * 0.18 + phases[i]) * 0.25;
      arr[b + 1] = origin[b + 1] + Math.sin(t * 0.24 + phases[i] * 1.3) * 0.4;
      arr[b + 2] = origin[b + 2] + Math.cos(t * 0.15 + phases[i]) * 0.25;
    }
    d.geo.attributes.position.needsUpdate = true;
  }

  // ── 照片画框 ───────────────────────────────────────────────
  /**
   * 按位置名取照片（固定布局）。位置名：
   * 后墙左 / 后墙右；舞台左 / 舞台右（台前红毯两侧金花瓮后的画架）；左墙1~8、右墙1~8（从门口往里数，左右以进门面朝仪式台为准）；
   * 草坪1~10 小径画架（从门口往外、每对先左后右），草坪11~14 舞台前（左前、左后、右前、右后）；
   * 沙滩1~10 木栈道画架、沙滩11~14 舞台两侧，规则同草坪（左右以出门面朝大海为准）。
   */
  private photoForSlot(id: string): WorldPhoto | null {
    const all = this.opts.worldPhotos ?? [];
    if (all.length === 0) return null;
    const n = this.opts.photoLayout?.[id];
    if (n !== undefined && n >= 1 && n <= all.length) return all[n - 1];
    return all[this.photoFallbackIdx++ % all.length];
  }

  /** 户外画架的位置名：前 4 个是舞台画架，其后每两个一对（小径/栈道从门口往外） */
  private easelSlotId(prefix: string, spots: { x: number; z: number }[], i: number): string {
    const sp = spots[i];
    // 出门面朝 +z 时 +x 在左手边
    if (i < 4) {
      const stage = spots.slice(0, 4);
      const minZ = Math.min(...stage.map((e) => e.z));
      return `${prefix}${11 + (sp.x > 0 ? 0 : 2) + (sp.z > minZ + 0.5 ? 1 : 0)}`;
    }
    const k = Math.floor((i - 4) / 2);
    const partner = spots[i % 2 === 0 ? i + 1 : i - 1];
    const left = partner ? sp.x > partner.x : sp.x > 0;
    return `${prefix}${1 + k * 2 + (left ? 0 : 1)}`;
  }

  /**
   * 户外画架画框随照片横竖变形：长边固定 0.94（横图放宽不压缩），画框每边比照片宽 0.1；
   * 没有精修照片时退回竖版 0.7×0.94 并裁切铺满。
   */
  private easelFrameSize(wp: WorldPhoto | null) {
    const LONG = 0.94;
    const aspect = wp ? wp.w / wp.h : 0.7 / LONG;
    const pw = aspect >= 1 ? LONG : LONG * aspect;
    const ph = aspect >= 1 ? LONG / aspect : LONG;
    return { pw, ph, fw: pw + 0.2, fh: ph + 0.22 };
  }

  /** 地址栏带 ?slots 时在每个画框上方显示位置名，方便对照布局表 */
  private slotTag(id: string, pos: THREE.Vector3, parent: THREE.Object3D) {
    if (typeof window === "undefined" || !new URLSearchParams(window.location.search).has("slots")) return;
    const tex = this.reg(
      this.makeCanvasTexture((ctx, w, h) => {
        ctx.fillStyle = "rgba(122,34,64,0.88)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff";
        ctx.font = '700 72px "PingFang SC", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(id, w / 2, h / 2 + 4);
      }, 320, 110),
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.scale.set(0.9, 0.31, 1);
    sp.position.copy(pos);
    sp.renderOrder = 10;
    parent.add(sp);
  }

  /** 纹理按画框比例居中裁切铺满（object-fit: cover） */
  private coverTexture(t: THREE.Texture, planeAspect: number) {
    const img = t.image as { width?: number; height?: number } | undefined;
    if (!img?.width || !img?.height) return;
    const imgAspect = img.width / img.height;
    if (imgAspect > planeAspect) {
      t.repeat.set(planeAspect / imgAspect, 1);
      t.offset.set((1 - t.repeat.x) / 2, 0);
    } else {
      t.repeat.set(1, imgAspect / planeAspect);
      t.offset.set(0, (1 - t.repeat.y) / 2);
    }
    t.needsUpdate = true;
  }

  private photoAniso() {
    return Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
  }

  /**
   * 照片材质：不受光、不参与色调映射，按原图色彩显示（受光 + ACES 会把暗部抬灰、压低对比）。
   * 先挂 1×1 占位纹理，真图到达后只换纹理引用，不触发着色器重编译。
   */
  private makePhotoMaterial() {
    if (!this.photoPlaceholder) {
      const t = new THREE.DataTexture(new Uint8Array([236, 230, 222, 255]), 1, 1);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      this.photoPlaceholder = this.reg(t);
    }
    return new THREE.MeshBasicMaterial({ map: this.photoPlaceholder, toneMapped: false });
  }

  private getKtx2Loader() {
    if (!this.ktx2Loader) {
      this.ktx2Loader = new KTX2Loader().setTranscoderPath("/basis/").detectSupport(this.renderer);
      this.disposables.push(this.ktx2Loader);
    }
    return this.ktx2Loader;
  }

  /**
   * 给材质挂上照片（同一 URL、同一裁切比例全场共用一份纹理），返回共享键。
   * 精修照片优先加载 KTX2，失败退回 src JPEG；没有精修照片时用 fallbackSrc。
   * 照片比例与画框（coverAspect）不同时居中裁切铺满，高清档同样裁切。
   * onSettled 在纹理到达或加载失败后调用一次。
   */
  private usePhoto(
    mat: THREE.MeshBasicMaterial,
    wp: WorldPhoto | null,
    fallbackSrc: string,
    coverAspect: number,
    onSettled?: () => void,
  ): string {
    const src = wp?.src ?? fallbackSrc;
    const crop = !wp || Math.abs(wp.w / wp.h - coverAspect) > 0.01;
    const key = crop ? `${src}|${coverAspect.toFixed(3)}` : src;
    let e = this.photoEntries.get(key);
    if (!e) {
      const entry: PhotoEntry = {
        base: null,
        hdUrl: wp?.hd ?? null,
        hd: null,
        hdLoading: false,
        hdWantedAt: 0,
        baseLong: wp ? Math.max(wp.w, wp.h) : 1600,
        cover: crop ? coverAspect : 0,
        mats: [],
        waiters: [],
        settled: false,
      };
      e = entry;
      this.photoEntries.set(key, entry);
      const settle = (tex: THREE.Texture | null) => {
        if (tex) {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = this.photoAniso();
          if (entry.cover) this.coverTexture(tex, entry.cover);
          entry.base = this.reg(tex);
          const img = tex.image as { width?: number; height?: number } | undefined;
          if (img?.width && img.height) entry.baseLong = Math.max(img.width, img.height);
          for (const m of entry.mats) if (!entry.hd) m.map = tex;
        }
        entry.settled = true;
        entry.waiters.splice(0).forEach((fn) => fn());
      };
      const loadJpeg = (url: string) => {
        if (!url) return settle(null);
        new THREE.TextureLoader().load(url, settle, undefined, () => settle(null));
      };
      if (wp?.ktx2) {
        this.getKtx2Loader().load(wp.ktx2, settle, undefined, () => loadJpeg(wp.src));
      } else {
        loadJpeg(src);
      }
    }
    e.mats.push(mat);
    const tex = e.hd ?? e.base;
    if (tex) mat.map = tex;
    if (onSettled) {
      if (e.settled) onSettled();
      else e.waiters.push(onSettled);
    }
    return key;
  }

  /**
   * 高清档调度（约 5 次/秒）：视野内照片在屏幕上的像素高度超过常驻纹理的 HD_TRIGGER 倍，
   * 就加载长边 2048 的高清图替换；最多同时保留 HD_MAX 张，离开 HD_KEEP_MS 后释放回常驻档。
   *
   * 户外画架（lawn/beach）例外：画架长边只有 0.94m，在正常观赏距离（walkToPhoto 停距下限 1.4m）
   * 处按「放大倍数」评估远达不到按室内 4.4m 大画定的 HD_TRIGGER，高清永远触发不了；
   * 即使由 walkToPhoto 预载，hdWantedAt 也不会续期，4s 后看着看着就被释放回常驻档。
   * 因此户外改按「占屏比例」HD_FOCUS_TRIGGER 触发并持续续期——占屏比例等价于「走近了细看」，
   * 与画框物理尺寸无关，室内策略不受影响。
   */
  private hdTick(now: number) {
    if (now - this.lastHdTick < 200) return;
    this.lastHdTick = now;
    const HD_TRIGGER = 0.85;
    // 户外画架：照片占屏超过此比例即视为「走近细看」，触发高清并保持到走开，避免远处整排画架抢占高清名额
    const HD_FOCUS_TRIGGER = 0.35;
    const HD_KEEP_MS = 4000;
    const HD_MAX = 2;
    const cam = this.camera.position;
    const fwd = this.hdFwd;
    this.camera.getWorldDirection(fwd);
    const pxPerRad = this.renderer.domElement.height / THREE.MathUtils.degToRad(this.camera.fov);
    const center = this.hdVec;
    const screenH = this.renderer.domElement.height;
    let focus = 0;
    let bestIndoor: PhotoEntry | null = null;
    let bestIndoorMag = HD_TRIGGER;
    let bestOutdoor: PhotoEntry | null = null;
    let bestOutdoorFocus = HD_FOCUS_TRIGGER;
    for (const t of this.photoTargets) {
      if (t.zone === "lawn" && !this.lawnGroup.visible) continue;
      if (t.zone === "beach" && !this.beachGroup.visible) continue;
      const e = this.photoEntries.get(t.key);
      if (!e?.base) continue;
      center.setFromMatrixPosition(t.mesh.matrixWorld).sub(cam);
      const d = center.length();
      if (d < 0.1 || center.dot(fwd) < d * 0.55) continue;
      const px = (Math.max(t.w, t.h) / d) * pxPerRad;
      const focusRatio = px / screenH;
      focus = Math.max(focus, focusRatio);
      if (!e.hdUrl) continue;
      // 室内按「屏幕像素 ÷ 常驻纹理长边」的放大倍数判定；户外画架按占屏比例判定，
      // 两者单位不同，各自组内选优，不跨组比较
      if (t.zone === "hall") {
        const mag = px / e.baseLong;
        if (mag > bestIndoorMag) {
          bestIndoorMag = mag;
          bestIndoor = e;
        }
      } else if (focusRatio > bestOutdoorFocus) {
        bestOutdoorFocus = focusRatio;
        bestOutdoor = e;
      }
    }
    this.photoFocusRatio = focus;
    // 室内大画是硬需求（近距离放大倍数大），同帧命中时优先于户外画架
    const outdoors = cam.z > this.ARCH_Z + 0.5;
    const best = outdoors ? bestOutdoor ?? bestIndoor : bestIndoor ?? bestOutdoor;
    if (this.perfEnabled) {
      const zone = bestOutdoor ? "outdoor" : bestIndoor ? "hall" : "none";
      this.perfPhoto = `${zone} focus ${(focus * 100).toFixed(0)}% ${best?.hd ? "HD" : best?.hdLoading ? "loading" : "base"}`;
    }
    if (best) {
      best.hdWantedAt = Math.max(best.hdWantedAt, now);
      if (!best.hd && !best.hdLoading && this.hdLoading < 1) this.loadHd(best);
    }
    // 先释放久未需要的；仍超出上限就按「最近被需要」从旧到新淘汰
    const live: PhotoEntry[] = [];
    for (const e of this.photoEntries.values()) {
      if (!e.hd) continue;
      if (now - e.hdWantedAt > HD_KEEP_MS) this.dropHd(e);
      else live.push(e);
    }
    if (live.length > HD_MAX) {
      live.sort((a, b) => a.hdWantedAt - b.hdWantedAt);
      for (const e of live.slice(0, live.length - HD_MAX)) this.dropHd(e);
    }
  }

  private loadHd(e: PhotoEntry) {
    if (!e.hdUrl) return;
    e.hdLoading = true;
    this.hdLoading++;
    new THREE.TextureLoader().load(
      e.hdUrl,
      (t) => {
        e.hdLoading = false;
        this.hdLoading--;
        if (this.disposed || performance.now() - e.hdWantedAt > 4000) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = this.photoAniso();
        if (e.cover) this.coverTexture(t, e.cover);
        // 先单独上传再换上：避免与渲染同帧解码上传；这一帧的耗时不计入自适应分辨率
        this.renderer.initTexture(t);
        this.skipFrameSamples = 3;
        e.hd = t;
        for (const m of e.mats) m.map = t;
      },
      undefined,
      () => {
        e.hdLoading = false;
        this.hdLoading--;
        e.hdUrl = null;
      },
    );
  }

  private dropHd(e: PhotoEntry) {
    const t = e.hd;
    if (!t) return;
    e.hd = null;
    for (const m of e.mats) m.map = e.base ?? this.photoPlaceholder;
    t.dispose();
    // warmTick 的缓存表里还引用着它，立即重建，避免把已释放的纹理重新上传
    this.warmTableTs = -Infinity;
  }

  /** 走近照片时淡出挡在它前面的假光锥（加色半透明，正对照片看会蒙一层雾） */
  private fadeLightCones() {
    const cam = this.camera.position;
    for (const c of this.lightCones) {
      const d = cam.distanceTo(c.target);
      const k = THREE.MathUtils.smoothstep(d, 5, 10);
      const o = c.base * k;
      if (Math.abs(c.mat.opacity - o) > 0.002) c.mat.opacity = o;
      c.mesh.visible = o > 0.002;
    }
  }

  private loadPhotos() {
    const photos = this.opts.photos;
    const worldCount = this.opts.worldPhotos?.length ?? 0;
    if (photos.length === 0 && worldCount === 0) {
      this.fireReady();
      return;
    }

    const wallX = this.W / 2;
    const fw = 2.3;
    const fh = 3.3;
    // 实际画框：竖幅高 4.4m、横幅宽 4.6m。护墙板腰线顶在 1.66m，铭牌中心放 2.1m 露在腰线之上，
    // 照片底边统一抬到 2.8m，给铭牌让位
    const bigH = 4.4;
    const bigW = 4.6;
    const photoBottom = 2.8;
    const plaqueY = 2.1;
    const fr = fh / 2.75;
    const perWall = 8;
    const total = perWall * 2;

    // 左右墙各 8 张：z 在 [DEPTH_START+4, ARCH_Z-5] 内均匀分布，左右同 z 对齐
    const zStart = this.DEPTH_START + 4;
    const zEnd = this.ARCH_Z - 5;
    const zStep = (zEnd - zStart) / (perWall - 1);
    const zPos = Array.from({ length: perWall }, (_, k) => zStart + k * zStep);

    const outerMat = new THREE.MeshStandardMaterial({
      color: C.champagne,
      metalness: 0.55,
      roughness: 0.3,
    });
    const innerMat = new THREE.MeshStandardMaterial({
      color: C.roseMetal,
      metalness: 0.5,
      roughness: 0.35,
    });
    const matMat = new THREE.MeshStandardMaterial({ color: "#faf6f0", roughness: 0.95 });

    // 每个画框先定好照片：有精修照片就随机抽，画框按照片比例定尺寸
    // i < 8 为左墙（x < 0，进门面朝仪式台的左手边），zPos 从里往外，编号从门口往里数
    const slotName = (i: number) => `${i < perWall ? "左墙" : "右墙"}${perWall - (i % perWall)}`;
    const slots = Array.from({ length: total }, (_, i) => {
      const wp = this.photoForSlot(slotName(i));
      const meta = photos.length > 0 ? photos[i % photos.length] : null;
      const src = wp?.src ?? meta?.src ?? "";
      const a = wp ? wp.w / wp.h : fw / fh;
      const w = a >= 1 ? bigW : bigH * a;
      const h = a >= 1 ? bigW / a : bigH;
      return { wp, src, w, h, label: meta?.label ?? "", sub: meta?.sub ?? "" };
    });

    // 全部画框的纹理到达（或失败）后才算就绪
    let pending = total;
    const onOne = () => {
      pending -= 1;
      if (pending === 0) this.fireReady();
    };

    for (let i = 0; i < total; i++) {
      const isLeft = i < perWall;
      const photo = slots[i];
      const pw = photo.w;
      const ph = photo.h;
      const fy = photoBottom + ph / 2;
      const z = zPos[i % perWall];
      const sign = isLeft ? -1 : 1;
      const rotY = isLeft ? Math.PI / 2 : -Math.PI / 2;
      const wallFace = sign * wallX;
      const xOuter = wallFace - sign * 0.05;
      const xInner = wallFace - sign * 0.1;
      const xMat = wallFace - sign * 0.14;
      const xPhoto = wallFace - sign * 0.16;

      const outer = new THREE.Mesh(
        new THREE.BoxGeometry(pw + 0.38 * fr, ph + 0.38 * fr, 0.09),
        outerMat,
      );
      outer.position.set(xOuter, fy, z);
      outer.rotation.y = rotY;
      this.scene.add(outer);

      const inner = new THREE.Mesh(
        new THREE.BoxGeometry(pw + 0.18 * fr, ph + 0.18 * fr, 0.06),
        innerMat,
      );
      inner.position.set(xInner, fy, z);
      inner.rotation.y = rotY;
      this.scene.add(inner);

      const mat = new THREE.Mesh(
        new THREE.BoxGeometry(pw + 0.04 * fr, ph + 0.04 * fr, 0.03),
        matMat,
      );
      mat.position.set(xMat, fy, z);
      mat.rotation.y = rotY;
      this.scene.add(mat);

      const photoMat = this.makePhotoMaterial();
      const key = this.usePhoto(photoMat, photo.wp, photo.src, pw / ph, onOne);
      const photoMesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), photoMat);
      photoMesh.position.set(xPhoto, fy, z);
      photoMesh.rotation.y = rotY;
      this.scene.add(photoMesh);
      this.slotTag(slotName(i), new THREE.Vector3(xPhoto - sign * 0.3, fy + ph / 2 + 0.55, z), this.scene);
      this.photoTargets.push({ mesh: photoMesh, w: pw, h: ph, zone: "hall", key });
      if (!photo.label) {
        this.addTrackLight(sign * (wallX - 2.2), this.H - 0.42, z, xPhoto, fy, z);
        continue;
      }

      const plaque = this.makePhotoPlaque(photo.label, photo.sub);
      plaque.position.set(wallFace - sign * 0.04, plaqueY, z);
      plaque.rotation.y = rotY;
      this.scene.add(plaque);

      this.addTrackLight(sign * (wallX - 2.2), this.H - 0.42, z, xPhoto, fy, z);
    }

    // 射灯打在照片上方墙面的柔光池（加色混合，共享纹理/材质，实例化）
    const poolMat = new THREE.MeshBasicMaterial({
      map: this.getGlowTexture(),
      color: "#fff2e2",
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(fw * 2.6, fh), poolMat, total);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < total; i++) {
      const isLeft = i < perWall;
      dummy.position.set((isLeft ? -1 : 1) * (wallX - 0.01), photoBottom + slots[i].h + 0.45, zPos[i % perWall]);
      dummy.rotation.set(0, isLeft ? Math.PI / 2 : -Math.PI / 2, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pools.setMatrixAt(i, dummy.matrix);
    }
    pools.instanceMatrix.needsUpdate = true;
    this.scene.add(pools);
  }

  private readonly plaqueCache = new Map<string, THREE.MeshStandardMaterial>();
  private plaqueFrame: { geo: THREE.BufferGeometry; face: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial } | null = null;

  /**
   * 照片铭牌：金色倒角底座 + 象牙白面板，标题香槟金、副标题酒红，都做成浮雕。
   * 文字轮廓模糊后当高度图，Sobel 求出法线贴图，射灯照上去才有真实的高光和阴影；
   * 金字另给金属度/粗糙度贴图（G = 粗糙度，B = 金属度），与面板的哑光区分开。
   */
  private makePhotoPlaque(title: string, sub: string): THREE.Group {
    const PW = 1.9;
    const PH = 0.5;
    if (!this.plaqueFrame) {
      const r = 0.05;
      const w = PW + 0.1;
      const h = PH + 0.1;
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + r, -h / 2);
      shape.lineTo(w / 2 - r, -h / 2);
      shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      shape.lineTo(w / 2, h / 2 - r);
      shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      shape.lineTo(-w / 2 + r, h / 2);
      shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      shape.lineTo(-w / 2, -h / 2 + r);
      shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.025,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.014,
        bevelSegments: 3,
        curveSegments: 6,
      });
      const mat = new THREE.MeshStandardMaterial({
        color: "#d9b878",
        metalness: 0.9,
        roughness: 0.28,
        envMapIntensity: 1.6,
      });
      this.plaqueFrame = { geo, face: new THREE.PlaneGeometry(PW, PH), mat };
    }
    const key = `${title}|${sub}`;
    let faceMat = this.plaqueCache.get(key);
    if (!faceMat) {
      faceMat = this.makePlaqueFaceMaterial(title, sub);
      this.plaqueCache.set(key, faceMat);
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(this.plaqueFrame.geo, this.plaqueFrame.mat));
    const face = new THREE.Mesh(this.plaqueFrame.face, faceMat);
    face.position.z = 0.025 + 0.012 + 0.002;
    g.add(face);
    return g;
  }

  private makePlaqueFaceMaterial(title: string, sub: string): THREE.MeshStandardMaterial {
    const W = 1024;
    const H = 270;
    const mk = () => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("2D context unavailable");
      return { c, ctx };
    };
    const titleFont = 'italic 600 104px Georgia, "Songti SC", "STSong", serif';
    const subFont = '500 46px "Songti SC", "STSong", Georgia, serif';
    const titleY = H * 0.4;
    const subY = H * 0.8;
    // 装饰线：标题下方左右两段细线 + 中间菱形
    const ornament = (ctx: CanvasRenderingContext2D) => {
      const y = H * 0.625;
      ctx.fillRect(W * 0.2, y - 2, W * 0.25, 4);
      ctx.fillRect(W * 0.55, y - 2, W * 0.25, 4);
      ctx.beginPath();
      ctx.moveTo(W / 2, y - 11);
      ctx.lineTo(W / 2 + 11, y);
      ctx.lineTo(W / 2, y + 11);
      ctx.lineTo(W / 2 - 11, y);
      ctx.closePath();
      ctx.fill();
    };
    const drawText = (ctx: CanvasRenderingContext2D, titleStyle: string | CanvasGradient, subStyle: string, lineStyle: string) => {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = titleFont;
      ctx.fillStyle = titleStyle;
      ctx.fillText(title, W / 2, titleY);
      ctx.font = subFont;
      ctx.fillStyle = subStyle;
      ctx.fillText(sub, W / 2, subY);
      ctx.fillStyle = lineStyle;
      ornament(ctx);
      // 面板内缘一圈细金线
      ctx.strokeStyle = lineStyle;
      ctx.lineWidth = 4;
      ctx.strokeRect(18, 18, W - 36, H - 36);
    };

    // 颜色
    const col = mk();
    const bg = col.ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#fffaf2");
    bg.addColorStop(1, "#efe4d3");
    col.ctx.fillStyle = bg;
    col.ctx.fillRect(0, 0, W, H);
    const goldGrad = col.ctx.createLinearGradient(0, titleY - 55, 0, titleY + 55);
    goldGrad.addColorStop(0, "#f3dca0");
    goldGrad.addColorStop(0.5, "#c89a4e");
    goldGrad.addColorStop(1, "#a87a36");
    drawText(col.ctx, goldGrad, "#7a2240", "#c9a15e");

    // 高度：文字/线条为 1，背景为 0，模糊后形成圆润的斜面
    const hm = mk();
    hm.ctx.fillStyle = "#000";
    hm.ctx.fillRect(0, 0, W, H);
    drawText(hm.ctx, "#fff", "#fff", "#fff");
    const src = hm.ctx.getImageData(0, 0, W, H).data;
    let hgt = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) hgt[i] = src[i * 4] / 255;
    const blur = (a: Float32Array, rad: number) => {
      const tmp = new Float32Array(W * H);
      const out = new Float32Array(W * H);
      const n = rad * 2 + 1;
      for (let y = 0; y < H; y++) {
        let acc = 0;
        for (let x = -rad; x <= rad; x++) acc += a[y * W + clamp(x, 0, W - 1)];
        for (let x = 0; x < W; x++) {
          tmp[y * W + x] = acc / n;
          acc += a[y * W + Math.min(x + rad + 1, W - 1)] - a[y * W + Math.max(x - rad, 0)];
        }
      }
      for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let y = -rad; y <= rad; y++) acc += tmp[clamp(y, 0, H - 1) * W + x];
        for (let y = 0; y < H; y++) {
          out[y * W + x] = acc / n;
          acc += tmp[Math.min(y + rad + 1, H - 1) * W + x] - tmp[Math.max(y - rad, 0) * W + x];
        }
      }
      return out;
    };
    hgt = blur(blur(hgt, 2), 2);

    // 法线：n = normalize(-dh/du, -dh/dv, 1)；画布 y 向下而纹理 v 向上，所以 v 方向差分取反
    const nm = mk();
    const nImg = nm.ctx.createImageData(W, H);
    const STRENGTH = 6;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const hx = hgt[y * W + Math.min(x + 1, W - 1)] - hgt[y * W + Math.max(x - 1, 0)];
        const hy = hgt[Math.min(y + 1, H - 1) * W + x] - hgt[Math.max(y - 1, 0) * W + x];
        let nx = -hx * STRENGTH;
        let ny = hy * STRENGTH;
        let nz = 1;
        const l = Math.hypot(nx, ny, nz);
        nx /= l;
        ny /= l;
        nz /= l;
        const o = (y * W + x) * 4;
        nImg.data[o] = (nx * 0.5 + 0.5) * 255;
        nImg.data[o + 1] = (ny * 0.5 + 0.5) * 255;
        nImg.data[o + 2] = (nz * 0.5 + 0.5) * 255;
        nImg.data[o + 3] = 255;
      }
    }
    nm.ctx.putImageData(nImg, 0, 0);

    // 粗糙度（G）/ 金属度（B）：金字、金线金属亮面，酒红副标题半哑光，面板哑光
    const rm = mk();
    rm.ctx.fillStyle = "rgb(0,190,0)";
    rm.ctx.fillRect(0, 0, W, H);
    drawText(rm.ctx, "rgb(0,70,255)", "rgb(0,120,0)", "rgb(0,80,255)");

    const tex = (c: HTMLCanvasElement, srgb: boolean) => {
      const t = this.reg(new THREE.CanvasTexture(c));
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      return t;
    };
    const orm = tex(rm.c, false);
    return new THREE.MeshStandardMaterial({
      map: tex(col.c, true),
      normalMap: tex(nm.c, false),
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap: orm,
      metalnessMap: orm,
      roughness: 1,
      metalness: 1,
      envMapIntensity: 1.8,
    });
  }

  // ── 吊灯 ───────────────────────────────────────────────────
  private makeChandelier(x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group();
    const goldMat = new THREE.MeshStandardMaterial({
      color: C.champagne,
      metalness: 0.72,
      roughness: 0.22,
    });
    const crystalMat = new THREE.MeshStandardMaterial({
      color: "#fce8f0",
      emissive: "#ffc8d8",
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.82,
      roughness: 0.1,
      metalness: 0.1,
    });

    // 静态金件与水晶坠分别烘焙成单个合并网格（33 个子 mesh → 6 个 draw call），外观不变
    const goldParts: THREE.BufferGeometry[] = [];
    const crystalParts: THREE.BufferGeometry[] = [];
    const rod = new THREE.CylinderGeometry(0.022, 0.022, 0.62);
    rod.translate(x, y + 0.31, z);
    goldParts.push(rod);

    const crown = new THREE.TorusGeometry(0.1, 0.02, 8, 20);
    crown.rotateX(Math.PI / 2);
    crown.translate(x, y + 0.02, z);
    goldParts.push(crown);

    const RING_R = 0.44;
    const ring = new THREE.TorusGeometry(RING_R, 0.032, 10, 40);
    ring.rotateX(Math.PI / 2);
    ring.translate(x, y, z);
    goldParts.push(ring);

    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const chain = new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6);
      chain.translate(x + Math.cos(a) * 0.24, y - 0.1, z + Math.sin(a) * 0.24);
      goldParts.push(chain);
    }

    const bobeche = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.05, 0),
        new THREE.Vector2(0.2, 0.02),
        new THREE.Vector2(0.3, 0.05),
        new THREE.Vector2(0.31, 0.075),
        new THREE.Vector2(0.26, 0.07),
        new THREE.Vector2(0.12, 0.04),
      ],
      26,
    );
    bobeche.translate(x, y - 0.44, z);
    goldParts.push(bobeche);
    g.add(new THREE.Mesh(this.mergeParts(goldParts, "chandelier gold"), goldMat));

    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const outer = i % 2 === 0;
      const rr = outer ? 0.28 : 0.2;
      const len = outer ? 0.2 : 0.13;
      const crystal = new THREE.ConeGeometry(outer ? 0.022 : 0.017, len, 5);
      crystal.rotateX(Math.PI);
      crystal.translate(
        x + Math.cos(angle) * rr,
        y - 0.5 - len * 0.5,
        z + Math.sin(angle) * rr,
      );
      crystalParts.push(crystal);
    }
    g.add(new THREE.Mesh(this.mergeParts(crystalParts, "chandelier crystals"), crystalMat));

    // 奶白灯罩：上窄下宽的钟形，内壁自发光
    const shadeMat = new THREE.MeshStandardMaterial({
      color: "#fff6ef",
      roughness: 0.45,
      metalness: 0,
      emissive: new THREE.Color("#ffd6ae"),
      emissiveIntensity: 1.35,
      side: THREE.DoubleSide,
    });
    const shade = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.1, 0),
          new THREE.Vector2(0.18, 0.05),
          new THREE.Vector2(0.26, 0.12),
          new THREE.Vector2(0.315, 0.2),
          new THREE.Vector2(0.34, 0.27),
        ],
        24,
      ),
      shadeMat,
    );
    shade.position.set(x, y - 0.42, z);
    g.add(shade);

    // 灯芯：罩内的发光球，尺寸撑得住结构
    const globeMat = new THREE.MeshStandardMaterial({
      color: "#fffaf2",
      emissive: new THREE.Color("#ffc98d"),
      emissiveIntensity: 3.2,
      roughness: 0.4,
    });
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), globeMat);
    globe.position.set(x, y - 0.28, z);
    g.add(globe);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 18, 16),
      new THREE.MeshBasicMaterial({
        color: "#ffdcb8",
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.position.copy(globe.position);
    g.add(halo);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.getGlowTexture(),
        color: "#ffdcb8",
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    sprite.position.copy(globe.position);
    sprite.scale.set(2.1, 2.1, 1);
    g.add(sprite);

    return g;
  }

  // ── 大型水晶吊灯 ───────────────────────────────────────────
  private crystalMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color: "#fff6f8",
      metalness: 0,
      roughness: 0.06,
      ior: 1.8,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      iridescence: 0.25,
      iridescenceIOR: 1.3,
      specularIntensity: 1.2,
      envMapIntensity: 2.4,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      flatShading: true,
      side: THREE.DoubleSide,
    });
  }

  /** 大吊灯专用的亮水晶时间，室内每帧推进（windUniform 只在室外走） */
  private readonly crystalTimeU = { value: 0 };
  /** 大吊灯闪光的共享时间 uniform：62 颗的相位/速度在 GPU 里算，每帧只写一次 */
  private readonly sparkleTimeU = { value: 0 };

  /**
   * 吊灯水晶：在 crystalMaterial 基础上加「被灯芯照亮的内发光 + 随视角跳动的切面火彩」。
   * 室内环境反射很弱（environmentIntensity 0.42），纯靠 envMap 的水晶珠会发灰，所以要自带亮度。
   */
  private litCrystalMaterial(glow: number): THREE.MeshPhysicalMaterial {
    const m = this.crystalMaterial();
    m.emissive.set("#ffe3c0");
    m.emissiveIntensity = glow;
    m.opacity = 0.86;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uCrystalTime = this.crystalTimeU;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uCrystalTime;")
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            // 平面着色下每个切面法线恒定：用法线+时间做哈希，让不同切面在不同视角/时刻单独闪亮
            vec3 fn = normalize(normal);
            float nv = abs(dot(fn, normalize(vViewPosition)));
            float h = fract(sin(dot(floor(fn * 7.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            float tw = pow(max(0.0, sin(uCrystalTime * (1.3 + h * 2.2) + h * 40.0 + nv * 9.0)), 16.0);
            float rim = pow(1.0 - nv, 2.0);
            vec3 fire = 0.5 + 0.5 * cos(6.2831 * (h + vec3(0.0, 0.33, 0.67)));
            totalEmissiveRadiance += mix(vec3(1.0, 0.95, 0.88), fire, 0.35) * (tw * 2.6 + rim * 0.9);
          }`,
        );
    };
    m.customProgramCacheKey = () => "litCrystal";
    return m;
  }

  /** 八棱切面水晶珠（上下两个八棱锥 + 腰带），半径 1，按实例缩放 */
  private makeCutBeadGeometry(): THREE.BufferGeometry {
    const geo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -1),
        new THREE.Vector2(0.62, -0.42),
        new THREE.Vector2(0.92, -0.08),
        new THREE.Vector2(0.92, 0.08),
        new THREE.Vector2(0.62, 0.42),
        new THREE.Vector2(0, 1),
      ],
      8,
    );
    return geo.toNonIndexed();
  }

  /** 四芒星闪光贴图，供大吊灯 glint sprite 使用 */
  private makeSparkleTexture(): THREE.Texture {
    const tex = this.reg(
      this.makeCanvasTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const cx = w / 2;
        const cy = h / 2;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
        g.addColorStop(0, "rgba(255,255,255,1)");
        g.addColorStop(0.22, "rgba(255,246,224,0.5)");
        g.addColorStop(1, "rgba(255,246,224,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "rgba(255,252,244,0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx, 3);
        ctx.lineTo(cx, h - 3);
        ctx.moveTo(3, cy);
        ctx.lineTo(w - 3, cy);
        ctx.moveTo(cx - w * 0.2, cy - h * 0.2);
        ctx.lineTo(cx + w * 0.2, cy + h * 0.2);
        ctx.moveTo(cx + w * 0.2, cy - h * 0.2);
        ctx.lineTo(cx - w * 0.2, cy + h * 0.2);
        ctx.stroke();
      }, 64, 64),
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 闪光/光晕批次：N 个加色 billboard 合并成一个 InstancedMesh（N 次 draw call → 1 次）。
   * 位置/尺寸由 place 回调烘焙进 instanceMatrix，相位/速度写成实例属性交给着色器，逐帧只更新一个
   * 时间 uniform，闪烁完全在 GPU 完成，观感与逐 sprite 版本一致。
   * alpha 用 pow(0.5+0.5*sin(t*speed+phase), 6) 乘进 diffuseColor.a，等价于原 Sprite 的
   * material.opacity = pow(v,6)（初始 0.5 每帧都会被改写，故此处基值取 1 即可）。
   */
  private makeSparkleBatch(
    tex: THREE.Texture,
    count: number,
    color: string,
    cacheKey: string,
    speedMin: number,
    speedMax: number,
    place: (i: number, dummy: THREE.Object3D) => number,
  ): { mesh: THREE.InstancedMesh; size: Float32Array } {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const phase = new Float32Array(count);
    const speed = new Float32Array(count);
    const size = new Float32Array(count);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      size[i] = place(i, dummy);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      phase[i] = Math.random() * Math.PI * 2;
      speed[i] = speedMin + Math.random() * (speedMax - speedMin);
    }
    mesh.instanceMatrix.needsUpdate = true;
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(speed, 1));
    // 顶点着色器重写位置做屏幕对齐 billboard，包围球不可信；批次只有 1 次 draw call，无需剔除
    mesh.frustumCulled = false;
    mesh.userData.noAutoCull = true;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSparkleTime = this.sparkleTimeU;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float aPhase;\nattribute float aSpeed;\nuniform float uSparkleTime;\nvarying float vSparkleAlpha;",
        )
        .replace(
          "#include <project_vertex>",
          `
          vec4 sparkleCenter = modelMatrix * (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0));
          vec4 mvPosition = viewMatrix * sparkleCenter;
          mvPosition.xy += position.xy * vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          gl_Position = projectionMatrix * mvPosition;
          float sparklePulse = 0.5 + 0.5 * sin(uSparkleTime * aSpeed + aPhase);
          vSparkleAlpha = pow(sparklePulse, 6.0);
          `,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vSparkleAlpha;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vSparkleAlpha;");
    };
    mat.customProgramCacheKey = () => cacheKey;
    return { mesh, size };
  }

  /** 大吊灯 62 颗闪光点：位置带 ±0.07 抖动、尺寸 0.1~0.24，闪烁速度 1.6~4.8Hz */
  private makeGrandGlints(tex: THREE.Texture, beads: readonly { p: THREE.Vector3 }[]) {
    const COUNT = 62;
    return this.makeSparkleBatch(tex, COUNT, "#fff2dd", "grandGlints", 1.6, 4.8, (i, dummy) => {
      const b = beads[(i * 7) % beads.length];
      dummy.position.set(
        b.p.x + (Math.random() - 0.5) * 0.14,
        b.p.y + (Math.random() - 0.5) * 0.14,
        b.p.z + (Math.random() - 0.5) * 0.14,
      );
      const s = 0.1 + Math.random() * 0.14;
      dummy.scale.set(s, s, 1);
      return s;
    });
  }

  /**
   * 大吊灯 16 个灯罩光晕：烘焙灯罩位置 +0.2 与 0.95*灯罩尺寸，颜色 #ffcf9a、共享 glowTex、
   * 加色混合与逐 Sprite 版一致，闪烁速度 0.7~1.5Hz。
   */
  private makeGrandHalos(tex: THREE.Texture, shades: readonly { p: THREE.Vector3; s: THREE.Vector3 }[]) {
    return this.makeSparkleBatch(tex, shades.length, "#ffcf9a", "grandHalos", 0.7, 1.5, (i, dummy) => {
      const part = shades[i];
      dummy.position.set(part.p.x, part.p.y + 0.2, part.p.z);
      const hs = 0.95 * (part.s.x || 1);
      dummy.scale.set(hs, hs, 1);
      return hs;
    });
  }

  /**
   * 中央主吊灯：西式婚礼「花冠水晶吊灯」（加大精装版）。
   * 位于 GRAND_Z（z=-8），顶盖挂在横梁底 y=H-0.35≈9.65；
   * 直径约 4.6m、总高约 3.8m（最低点 y≈5.85，离地 >3m）。
   * 结构：香槟金顶盖碗 + 圆珠花冠 + 上下双层灯臂（12 主臂 + 8 副臂）与磨砂玻璃郁金香灯罩 +
   *       灯罩下香槟金灯盘与迷你珠环 + 金色卷草花饰 + 珠链缠臂 +
   *       5 层交错悬链珠帘 + 5 圈水晶花篮 + 短流苏 + 金球/水晶交替中轴 +
   *       底部大水晶球与梨形坠 + 主/上/中/顶四圈玫瑰花环。
   * 水晶与珠子按几何分别实例化，实例总数 < 2000；灯罩/灯盘/灯芯同样实例化。
   */
  private buildGrandChandelier() {
    const TOP = this.H - 0.35;
    const g = new THREE.Group();
    g.position.set(0, TOP, this.GRAND_Z);
    const sparkles = new THREE.Group();
    sparkles.position.set(0, TOP, this.GRAND_Z);

    const goldMat = new THREE.MeshStandardMaterial({
      color: C.champagne,
      metalness: 0.85,
      roughness: 0.28,
      envMapIntensity: 1.6,
    });
    const goldLightMat = new THREE.MeshStandardMaterial({
      color: C.champagneLight,
      metalness: 0.78,
      roughness: 0.3,
      envMapIntensity: 1.5,
    });
    const crystalMat = this.litCrystalMaterial(0.55);
    const smallMat = this.litCrystalMaterial(0.7);
    smallMat.envMapIntensity = 2.6;
    const pearMat = this.litCrystalMaterial(0.8);
    pearMat.color.set("#ffffff");
    pearMat.opacity = 0.8;
    pearMat.iridescence = 0.35;
    pearMat.envMapIntensity = 2.8;

    // 灯罩：奶白实体壳（内壁带自发光，远看是亮的），不再半透明以免和灯芯糊成一团
    const shadeMat = new THREE.MeshStandardMaterial({
      color: "#fff6ef",
      roughness: 0.42,
      metalness: 0,
      emissive: new THREE.Color("#ffd0a2"),
      emissiveIntensity: 1.5,
      side: THREE.DoubleSide,
    });
    // 灯芯：灯罩内部的发光球，明显更亮
    const coreMat = new THREE.MeshStandardMaterial({
      color: "#fffaf2",
      emissive: new THREE.Color("#ffbe78"),
      emissiveIntensity: 3.4,
      roughness: 0.4,
    });
    // 灯口托盘也带一点自发光，让光"溢"出来
    const bobecheMat = new THREE.MeshStandardMaterial({
      color: "#f6e3c4",
      emissive: new THREE.Color("#ffc98d"),
      emissiveIntensity: 1.1,
      metalness: 0.5,
      roughness: 0.32,
    });
    const bulbs: { mat: THREE.MeshStandardMaterial; phase: number; base: number }[] = [
      { mat: shadeMat, phase: 0, base: 1.5 },
      { mat: coreMat, phase: 1.7, base: 3.4 },
      { mat: bobecheMat, phase: 0.9, base: 1.1 },
    ];

    // 短吊杆 + 香槟金顶盖碗（顶沿贴梁底）
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 16), goldMat);
    rod.position.set(0, -0.225, 0);
    g.add(rod);

    const canopy = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.08, -0.3),
          new THREE.Vector2(0.36, -0.34),
          new THREE.Vector2(0.62, -0.44),
          new THREE.Vector2(0.76, -0.58),
          new THREE.Vector2(0.78, -0.72),
          new THREE.Vector2(0.68, -0.84),
          new THREE.Vector2(0.46, -0.88),
          new THREE.Vector2(0.24, -0.82),
          new THREE.Vector2(0.08, -0.74),
          new THREE.Vector2(0.03, -0.7),
        ],
        48,
      ),
      goldMat,
    );
    g.add(canopy);

    const R_UPPER = 1.5;
    const Y_UPPER = -1.35;
    const R_MAIN = 2.1;
    const Y_MAIN = -2.25;
    const R_ARM = 2.1;
    const Y_ARM = -1.95;
    const R_ARM2 = 1.35;
    const Y_ARM2 = -1.45;

    const upperRing = new THREE.Mesh(new THREE.TorusGeometry(R_UPPER, 0.05, 12, 96), goldLightMat);
    upperRing.rotation.x = Math.PI / 2;
    upperRing.position.set(0, Y_UPPER, 0);
    g.add(upperRing);

    const mainRing = new THREE.Mesh(new THREE.TorusGeometry(R_MAIN, 0.065, 12, 128), goldMat);
    mainRing.rotation.x = Math.PI / 2;
    mainRing.position.set(0, Y_MAIN, 0);
    g.add(mainRing);

    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), goldMat);
    hub.position.set(0, -0.98, 0);
    g.add(hub);

    const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.5, 12), goldMat);
    spine.position.set(0, -2.25, 0);
    g.add(spine);

    // 灯罩 / 灯盘 / 灯芯几何（同类形状实例化，不逐只建 Mesh）
    const shadeGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.05, 0),
        new THREE.Vector2(0.09, 0.03),
        new THREE.Vector2(0.155, 0.1),
        new THREE.Vector2(0.215, 0.2),
        new THREE.Vector2(0.262, 0.31),
        new THREE.Vector2(0.288, 0.39),
        new THREE.Vector2(0.3, 0.42),
      ],
      24,
    );
    const bobecheGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.03, 0),
        new THREE.Vector2(0.09, 0.008),
        new THREE.Vector2(0.145, 0.03),
        new THREE.Vector2(0.158, 0.052),
        new THREE.Vector2(0.13, 0.05),
        new THREE.Vector2(0.06, 0.03),
        new THREE.Vector2(0.03, 0.02),
      ],
      20,
    );

    type Part = { p: THREE.Vector3; s: THREE.Vector3; q: THREE.Quaternion };
    const beadParts: Part[] = [];
    const smallParts: Part[] = [];
    const pearParts: Part[] = [];
    const goldParts: Part[] = [];
    const shadeParts: Part[] = [];
    const bobecheParts: Part[] = [];
    const coreParts: Part[] = [];
    const voluteParts: Part[] = [];
    const leafDecoParts: Part[] = [];

    const qId = () => new THREE.Quaternion();
    const qRand = () =>
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI),
      );
    const qYaw = () =>
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));
    const push = (
      arr: Part[],
      x: number,
      y: number,
      z: number,
      s: number,
      q: THREE.Quaternion = qId(),
    ) => {
      arr.push({ p: new THREE.Vector3(x, y, z), s: new THREE.Vector3(s, s, s), q });
    };

    // 灯盘迷你珠环：环绕灯罩底座一圈小圆珠
    const miniRing = (cx: number, cy: number, cz: number, a0: number, radius: number, count: number, bs: number) => {
      for (let k = 0; k < count; k++) {
        const ba = a0 + (k / count) * Math.PI * 2;
        push(smallParts, cx + Math.cos(ba) * radius, cy, cz + Math.sin(ba) * radius, bs, qYaw());
      }
    };

    // 主臂 12 条 + 副臂 8 条：S 形灯臂、珠链缠臂、末端灯罩/灯盘/灯芯/迷你珠环
    // 灯臂 tube 几何先累积，两个循环结束后按材质合并为 2 个 mesh（省 ~14 draw calls/盏）
    const mainArmGeos: THREE.BufferGeometry[] = [];
    const secArmGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(cos * 0.18, -0.98, sin * 0.18),
        new THREE.Vector3(cos * 0.85, -1.6, sin * 0.85),
        new THREE.Vector3(cos * 1.7, -2.1, sin * 1.7),
        new THREE.Vector3(cos * R_ARM, Y_ARM, sin * R_ARM),
      ]);
      mainArmGeos.push(new THREE.TubeGeometry(curve, 26, 0.03, 8, false));

      for (let k = 0; k < 7; k++) {
        const p = curve.getPointAt(0.24 + (k / 6) * 0.66);
        const out = new THREE.Vector3(p.x, 0, p.z).normalize().multiplyScalar(0.06);
        push(beadParts, p.x + out.x, p.y + 0.02, p.z + out.z, 0.034, qRand());
      }

      push(shadeParts, cos * R_ARM, Y_ARM, sin * R_ARM, 1, qId());
      push(bobecheParts, cos * R_ARM, Y_ARM - 0.02, sin * R_ARM, 1.3, qId());
      push(coreParts, cos * R_ARM, Y_ARM + 0.17, sin * R_ARM, 1.5, qId());
      miniRing(cos * R_ARM, Y_ARM - 0.005, sin * R_ARM, a, 0.12, 18, 0.026);

      const mp = curve.getPointAt(0.5);
      leafDecoParts.push({
        p: new THREE.Vector3(mp.x, mp.y - 0.02, mp.z),
        s: new THREE.Vector3(0.06, 0.03, 0.06),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.7, a, 0)),
      });
    }

    for (let i = 0; i < 4; i++) {
      const a = ((i + 0.5) / 4) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(cos * 0.12, -0.82, sin * 0.12),
        new THREE.Vector3(cos * 0.55, -1.18, sin * 0.55),
        new THREE.Vector3(cos * 1.05, -1.55, sin * 1.05),
        new THREE.Vector3(cos * R_ARM2, Y_ARM2, sin * R_ARM2),
      ]);
      secArmGeos.push(new THREE.TubeGeometry(curve, 20, 0.024, 8, false));

      push(shadeParts, cos * R_ARM2, Y_ARM2, sin * R_ARM2, 0.85, qId());
      push(bobecheParts, cos * R_ARM2, Y_ARM2 - 0.015, sin * R_ARM2, 1.1, qId());
      push(coreParts, cos * R_ARM2, Y_ARM2 + 0.15, sin * R_ARM2, 1.25, qId());
      miniRing(cos * R_ARM2, Y_ARM2 - 0.005, sin * R_ARM2, a, 0.1, 16, 0.025);

      leafDecoParts.push({
        p: new THREE.Vector3(cos * 0.62, -1.28, sin * 0.62),
        s: new THREE.Vector3(0.05, 0.026, 0.05),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.7, a, 0)),
      });
    }

    // 12 条主臂合并为 1 个 goldMat mesh、4 条副臂合并为 1 个 goldLightMat mesh
    g.add(new THREE.Mesh(this.mergeParts(mainArmGeos, "grand main arms"), goldMat));
    g.add(new THREE.Mesh(this.mergeParts(secArmGeos, "grand secondary arms"), goldLightMat));

    // 金色卷草花饰：主环 12 + 上环 8，末端一颗小金球
    const voluteGeo = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.16, 0.05, 0),
        new THREE.Vector3(0.28, 0.17, 0),
        new THREE.Vector3(0.24, 0.32, 0),
        new THREE.Vector3(0.1, 0.36, 0),
      ]),
      20,
      0.02,
      6,
      false,
    );
    const addVolute = (a: number, R: number, Y: number, scale: number) => {
      const cx = Math.cos(a) * R;
      const cz = Math.sin(a) * R;
      voluteParts.push({
        p: new THREE.Vector3(cx, Y, cz),
        s: new THREE.Vector3(scale, scale, scale),
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)),
      });
      push(
        goldParts,
        cx + Math.cos(a) * 0.1 * scale,
        Y + 0.36 * scale,
        cz + Math.sin(a) * 0.1 * scale,
        0.9 * scale,
        qId(),
      );
    };
    for (let i = 0; i < 12; i++) addVolute((i / 12) * Math.PI * 2, R_MAIN, Y_MAIN, 1);
    for (let i = 0; i < 8; i++) addVolute(((i + 0.5) / 8) * Math.PI * 2, R_UPPER, Y_UPPER, 0.82);

    // 顶盖碗外缘圆珠花冠（圆润，无尖角）
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      push(beadParts, Math.cos(a) * 0.72, -0.52, Math.sin(a) * 0.72, 0.05, qRand());
      if (i % 2 === 0) push(goldParts, Math.cos(a) * 0.72, -0.6, Math.sin(a) * 0.72, 1, qId());
    }

    // 中轴：金色球节与水晶圆珠交替
    for (let i = 0; i < 8; i++) {
      const y = -1.24 - i * 0.32;
      push(goldParts, 0, y, 0, 1, qId());
      push(beadParts, 0, y - 0.16, 0, 0.055, qRand());
    }

    type Bead = { x: number; y: number; z: number; s: number };
    const R_BEAD = 0.033;

    const addSwag = (p0: THREE.Vector3, p1: THREE.Vector3, sag: number, tassel: boolean) => {
      const n = Math.max(4, Math.round(p0.distanceTo(p1) / (R_BEAD * 2 * 1.05)));
      const lowest = p0.clone();
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = p0.x + (p1.x - p0.x) * t;
        const y = p0.y + (p1.y - p0.y) * t - sag * 4 * t * (1 - t);
        const z = p0.z + (p1.z - p0.z) * t;
        const s = R_BEAD * (0.94 + Math.random() * 0.16);
        push(beadParts, x, y, z, s, qRand());
        if (y < lowest.y) lowest.set(x, y, z);
      }
      if (tassel) {
        push(beadParts, lowest.x, lowest.y - 0.06, lowest.z, 0.034, qRand());
        push(beadParts, lowest.x, lowest.y - 0.12, lowest.z, 0.028, qRand());
        push(pearParts, lowest.x, lowest.y - 0.22, lowest.z, 1.1, qId());
      }
    };

    const swagRing = (R: number, Y: number, n: number, sag: number, offset: number, tassel: boolean) => {
      for (let j = 0; j < n; j++) {
        const a0 = ((j + offset) / n) * Math.PI * 2;
        const a1 = ((j + 1 + offset) / n) * Math.PI * 2;
        addSwag(
          new THREE.Vector3(Math.cos(a0) * R, Y, Math.sin(a0) * R),
          new THREE.Vector3(Math.cos(a1) * R, Y, Math.sin(a1) * R),
          sag,
          tassel,
        );
      }
    };

    // 5 层交错悬链珠帘：上层小、中层最宽、下层再收拢，相邻层错开半个分格
    swagRing(R_UPPER, Y_UPPER, 12, 0.2, 0.5, false);
    swagRing(1.72, -1.7, 12, 0.24, 0, false);
    swagRing(1.95, -2.0, 12, 0.28, 0.5, true);
    swagRing(2.15, -2.32, 12, 0.3, 0, true);
    swagRing(1.95, -2.68, 12, 0.28, 0.5, true);

    // 底部水晶花篮：5 圈逐级收拢，形成圆润碗底
    const basket: [number, number, number, number][] = [
      [1.7, -2.9, 20, 0.22],
      [1.38, -3.12, 16, 0.18],
      [1.05, -3.3, 13, 0.15],
      [0.72, -3.45, 10, 0.12],
      [0.4, -3.55, 8, 0.1],
    ];
    basket.forEach(([R, Y, n, sag]) => swagRing(R, Y, n, sag, 0.5, false));

    const pearGeo = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0.06),
        new THREE.Vector2(0.014, 0.045),
        new THREE.Vector2(0.03, 0.02),
        new THREE.Vector2(0.041, -0.012),
        new THREE.Vector2(0.038, -0.038),
        new THREE.Vector2(0.025, -0.054),
        new THREE.Vector2(0, -0.062),
      ],
      8,
    );

    const buildMesh = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      parts: Part[],
      colored: boolean,
    ) => {
      const mesh = new THREE.InstancedMesh(geo, mat, parts.length);
      const dummy = new THREE.Object3D();
      const white = new THREE.Color(1, 1, 1);
      parts.forEach((pt, i) => {
        dummy.position.copy(pt.p);
        dummy.quaternion.copy(pt.q);
        dummy.scale.copy(pt.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (colored) mesh.setColorAt(i, white);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      g.add(mesh);
      return mesh;
    };

    const beadMesh = buildMesh(this.makeCutBeadGeometry(), crystalMat, beadParts, true);
    const smallBeadMesh = buildMesh(this.makeCutBeadGeometry(), smallMat, smallParts, true);
    const pearMesh = buildMesh(pearGeo, pearMat, pearParts, true);
    buildMesh(new THREE.SphereGeometry(0.075, 12, 10), goldLightMat, goldParts, false);
    buildMesh(shadeGeo, shadeMat, shadeParts, false);
    buildMesh(bobecheGeo, bobecheMat, bobecheParts, false);
    buildMesh(new THREE.SphereGeometry(0.06, 12, 10), coreMat, coreParts, false);
    buildMesh(voluteGeo, goldMat, voluteParts, false);
    buildMesh(new THREE.SphereGeometry(0.05, 8, 6), goldMat, leafDecoParts, false);

    // 底部大水晶球 + 大梨形坠收尾，最低点约 y=-3.8
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), crystalMat);
    ball.position.set(0, -3.5, 0);
    g.add(ball);
    const bigPear = new THREE.Mesh(pearGeo, pearMat);
    bigPear.scale.setScalar(2);
    bigPear.position.set(0, -3.68, 0);
    g.add(bigPear);

    // ── 花艺：真实玫瑰（rose-parts.glb）成簇布置，替换原有程序化假花 ──
    // 记录花位供模板就绪后实例化；模板未就绪时用程序化花头兜底
    const clusters: { p: THREE.Vector3; s: number; tone: THREE.Color; up: THREE.Vector3 }[] = [];
    const palette = ["#fdf8f3", "#fdf8f3", "#f4c9d4", "#f4c9d4", "#f3e3c1", "#f6b48f", "#ef8fae", "#c8102e"];
    const pickTone = () => {
      const hex = palette[Math.floor(Math.random() * palette.length)];
      return new THREE.Color(hex).offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.09);
    };
    // 花簇：中心一朵大花 + 周围 5~8 朵小花，带随机朝向与半径抖动
    const clusterAt = (center: THREE.Vector3, scale: number, spread: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = spread * Math.sqrt(Math.random());
        const p = new THREE.Vector3(
          center.x + Math.cos(a) * r,
          center.y + (Math.random() - 0.5) * spread * 0.85,
          center.z + Math.sin(a) * r,
        );
        const out = new THREE.Vector3(p.x - center.x, p.y - center.y + 0.25, p.z - center.z).normalize();
        clusters.push({
          p,
          s: scale * (i === 0 ? 1.0 + Math.random() * 0.3 : 0.6 + Math.random() * 0.5),
          tone: pickTone(),
          up: out,
        });
      }
    };

    // 主环：沿环分 16 簇，每簇 7~10 朵
    const RING_MAIN_N = 22;
    for (let i = 0; i < RING_MAIN_N; i++) {
      const a = (i / RING_MAIN_N) * Math.PI * 2;
      clusterAt(
        new THREE.Vector3(Math.cos(a) * R_MAIN, Y_MAIN + 0.04, Math.sin(a) * R_MAIN),
        1.15, 0.3, 7 + Math.floor(Math.random() * 4),
      );
    }
    // 上环：16 簇，稍微小一点
    for (let i = 0; i < 16; i++) {
      const a = ((i + 0.5) / 16) * Math.PI * 2;
      clusterAt(
        new THREE.Vector3(Math.cos(a) * R_UPPER, Y_UPPER + 0.05, Math.sin(a) * R_UPPER),
        0.9, 0.26, 6 + Math.floor(Math.random() * 3),
      );
    }
    // 顶盖碗外沿一圈小花：收口处不空
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      clusterAt(
        new THREE.Vector3(Math.cos(a) * 0.66, -0.78, Math.sin(a) * 0.66),
        0.72, 0.2, 4,
      );
    }
    // 中柱与底球：上收下方，把中轴也铺满
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      clusterAt(new THREE.Vector3(Math.cos(a) * 0.5, -0.45, Math.sin(a) * 0.5), 0.7, 0.22, 4);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      clusterAt(new THREE.Vector3(Math.cos(a) * 0.56, -2.95, Math.sin(a) * 0.56), 0.78, 0.24, 5);
    }
    // 垂花串：从主环向下垂 12 条，每条 4~6 朵，长度不一形成瀑布
    for (let i = 0; i < 16; i++) {
      const a = ((i + 0.35) / 16) * Math.PI * 2;
      const r = R_MAIN - 0.12;
      const len = 0.5 + Math.random() * 1.15;
      const seg = 4 + Math.floor(Math.random() * 3);
      for (let k = 0; k < seg; k++) {
        const t = k / seg;
        const drop = t * len;
        const rr = r - t * 0.16;
        clusterAt(
          new THREE.Vector3(Math.cos(a) * rr, Y_MAIN - 0.12 - drop, Math.sin(a) * rr),
          0.66 - t * 0.2, 0.17, 3,
        );
      }
    }
    // 灯臂末端花团：每个灯位旁一小簇
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      clusterAt(
        new THREE.Vector3(Math.cos(a) * (R_ARM + 0.2), Y_ARM + 0.28, Math.sin(a) * (R_ARM + 0.2)),
        0.62, 0.16, 3,
      );
    }

    this.grandFlowerSpecs = clusters;
    // 兜底：模板未就绪时先用程序化花头铺满（模板到位后由 retryGrandFloral 替换）
    this.buildGrandFloralFallback(clusters);

    // 主环下方的水晶垂坠：24 条长短不一的串珠，与垂花串交错
    for (let i = 0; i < 24; i++) {
      const a = ((i + 0.5) / 24) * Math.PI * 2;
      const len = 0.45 + Math.random() * 0.95;
      const n = 3 + Math.floor(len * 4);
      const r = R_MAIN - 0.16;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const drop = t * len;
        const jitter = (Math.random() - 0.5) * 0.03;
        push(
          smallParts,
          Math.cos(a) * r + jitter,
          Y_MAIN - 0.16 - drop,
          Math.sin(a) * r + jitter,
          k === n - 1 ? 0.03 : 0.022,
          qYaw(),
        );
      }
    }

    const sparkleTex = this.makeSparkleTexture();
    // 62 颗闪光合并为一个 billboard 批次（62 次 draw call → 1 次）
    const glints = this.makeGrandGlints(sparkleTex, beadParts);
    sparkles.add(glints.mesh);

    // 灯泡光晕：16 个灯位各一片加色光晕，合并为一个 billboard 批次（16 次 draw call → 1 次）
    const glowTex = this.getGlowTexture();
    const halos = this.makeGrandHalos(glowTex, shadeParts);
    sparkles.add(halos.mesh);

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.getGlowTexture(),
        color: "#ffe8ec",
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.position.set(0, -2.2, 0);
    glow.scale.set(7, 7, 1);
    sparkles.add(glow);

    this.scene.add(g, sparkles);
    this.grand = {
      root: g,
      sparkles,
      bulbs,
      halos,
      glints,
      crystals: [
        { mesh: beadMesh, count: beadParts.length, phase: 0 },
        { mesh: smallBeadMesh, count: smallParts.length, phase: 1.1 },
        { mesh: pearMesh, count: pearParts.length, phase: 2.2 },
      ],
      color: new THREE.Color(1, 1, 1),
    };
    this.syncGrandCopies();

    this.loadGrandGlb();
  }

  /** 按大吊灯当前状态重建复制品；花艺换成真实玫瑰后需再调用一次 */
  private syncGrandCopies() {
    const gr = this.grand;
    if (!gr) return;
    this.grandCopies.forEach((c) => this.scene.remove(c.root, c.sparkles));
    const dz = this.GRAND_COPY_Z - this.GRAND_Z;
    const root = gr.root.clone();
    const sparkles = gr.sparkles.clone();
    root.position.z += dz;
    sparkles.position.z += dz;
    // InstancedMesh.clone 会复制 instanceColor，改回共享才能跟原件一起闪烁
    const srcMeshes: THREE.InstancedMesh[] = [];
    gr.root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) srcMeshes.push(o);
    });
    let k = 0;
    root.traverse((o) => {
      if (!(o instanceof THREE.InstancedMesh)) return;
      const src = srcMeshes[k++];
      if (src?.instanceColor) o.instanceColor = src.instanceColor;
    });
    this.scene.add(root, sparkles);
    this.grandCopies = [{ root, sparkles }];
  }

  /** 大吊灯花艺兜底：程序化花头（模板就绪后整体替换） */
  private buildGrandFloralFallback(specs: { p: THREE.Vector3; s: number; tone: THREE.Color; up: THREE.Vector3 }[]) {
    const group = new THREE.Group();
    const headGeo = this.makeRoseHeadGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.62, metalness: 0 });
    const mesh = new THREE.InstancedMesh(headGeo, mat, specs.length);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    specs.forEach((sp, i) => {
      dummy.position.copy(sp.p);
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sp.up);
      dummy.scale.setScalar(sp.s * 1.0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, sp.tone);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    // 叶片点缀
    const leafGeo = this.makeLeafGeometry();
    const leafMat = new THREE.MeshStandardMaterial({
      color: "#4e6b3c",
      roughness: 0.68,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, specs.length);
    leaves.frustumCulled = false;
    specs.forEach((sp, i) => {
      dummy.position.set(sp.p.x * 1.03, sp.p.y + 0.04, sp.p.z * 1.03);
      dummy.quaternion.setFromEuler(
        new THREE.Euler(Math.random() * Math.PI * 0.5 - 0.25, Math.random() * Math.PI * 2, Math.random() * 0.8 - 0.4),
      );
      dummy.scale.setScalar(0.62 + Math.random() * 0.3);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    });
    leaves.instanceMatrix.needsUpdate = true;
    group.add(leaves);
    const root = this.grand?.root;
    if (!root) return;
    root.add(group);
    this.grandFloralGroup = group;
  }

  /** 模板就绪后把大吊灯花艺换成真实玫瑰（3 种花头 + 真实叶片） */
  private retryGrandFloral() {
    if (this.grandFloralReal || !this.grand || this.grandFlowerSpecs.length === 0) return;
    const heads = [this.roseTemplates.head0, this.roseTemplates.head6, this.roseTemplates.head5];
    const leafTpl = this.roseTemplates.leaf;
    if (!heads[0] || !heads[1] || !heads[2] || !leafTpl) return;
    this.grandFloralReal = true;
    if (this.grandFloralGroup) {
      this.grand.root.remove(this.grandFloralGroup);
      this.disposeObject(this.grandFloralGroup);
      this.grandFloralGroup = null;
    }
    const specs = this.grandFlowerSpecs;
    const group = new THREE.Group();
    const mats: THREE.Matrix4[][] = [[], [], []];
    const cols: THREE.Color[][] = [[], [], []];
    const leafMats: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    specs.forEach((sp, i) => {
      const hi = i % 3;
      q.setFromUnitVectors(up, sp.up);
      scl.setScalar(sp.s * 2.1);
      mats[hi].push(new THREE.Matrix4().compose(sp.p, q, scl));
      cols[hi].push(sp.tone);
      if (i % 2 === 0) {
        const lp = sp.p.clone().multiplyScalar(1.06);
        lp.y += 0.06;
        leafMats.push(
          new THREE.Matrix4().compose(
            lp,
            new THREE.Quaternion().setFromEuler(
              new THREE.Euler(Math.random() * 0.7 - 0.2, Math.random() * Math.PI * 2, Math.random() * 0.9 - 0.45),
            ),
            new THREE.Vector3(2.6, 2.6, 2.6),
          ),
        );
      }
    });
    heads.forEach((maybe, i) => {
      if (!maybe || mats[i].length === 0) return;
      const tpl: GlbTemplate = maybe;
      const mat = this.archHeadMaterial(tpl.primitives[0].material);
      const mesh = new THREE.InstancedMesh(tpl.primitives[0].geometry, mat, mats[i].length);
      mesh.frustumCulled = false;
      mats[i].forEach((m, k) => {
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, cols[i][k]);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      group.add(mesh);
    });
    if (leafMats.length > 0) {
      const leafMat = this.archLeafMaterial(leafTpl.primitives[0].material);
      const leafMesh = new THREE.InstancedMesh(leafTpl.primitives[0].geometry, leafMat, leafMats.length);
      leafMesh.frustumCulled = false;
      leafMats.forEach((m, k) => leafMesh.setMatrixAt(k, m));
      leafMesh.instanceMatrix.needsUpdate = true;
      group.add(leafMesh);
    }
    this.grand.root.add(group);
    this.grandFloralGroup = group;
    this.syncGrandCopies();
  }

  private isGlassMaterial(m: THREE.Material): boolean {
    const n = m.name.toLowerCase();
    if (n.includes("glass") || n.includes("crystal") || n.includes("gem") || n.includes("diamond")) {
      return true;
    }
    if (m instanceof THREE.MeshPhysicalMaterial && m.transmission > 0) return true;
    return m.transparent && m.opacity < 0.95;
  }

  private regMaterialTextures(m: THREE.Material) {
    const values: unknown[] = Object.values(m);
    for (const v of values) {
      if (v instanceof THREE.Texture && !this.textures.includes(v)) this.reg(v);
    }
  }

  private disposeObject(obj: THREE.Object3D) {
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        const values: unknown[] = Object.values(m);
        for (const v of values) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      });
    });
  }

  /**
   * 可选 GLB 管线：若 /models/crystal-chandelier.glb 存在则替换程序化版本。
   * 缺失或解析失败时静默保留程序化版本，仅打印一行 info，不影响 onReady。
   */
  private loadGrandGlb() {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    loader.setDRACOLoader(draco);
    loader.load(
      "/models/crystal-chandelier.glb",
      (gltf) => {
        draco.dispose();
        if (this.disposed || !this.grand) {
          this.disposeObject(gltf.scene);
          return;
        }
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        if (size.y <= 0.0001) {
          this.disposeObject(gltf.scene);
          return;
        }
        const scale = 3.8 / size.y;
        const center = box.getCenter(new THREE.Vector3());

        const holder = new THREE.Group();
        holder.position.set(0, this.H - 0.35, this.GRAND_Z);
        holder.scale.setScalar(scale);
        gltf.scene.position.set(-center.x, -box.max.y, -center.z);
        holder.add(gltf.scene);

        const crystalMat = this.crystalMaterial();
        gltf.scene.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return;
          o.castShadow = false;
          o.receiveShadow = false;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const next = mats.map((m) => {
            if (this.isGlassMaterial(m)) return crystalMat;
            if (m instanceof THREE.MeshStandardMaterial) {
              m.envMapIntensity = Math.max(m.envMapIntensity, 1.2);
            }
            return m;
          });
          o.material = Array.isArray(o.material) ? next : next[0];
          next.forEach((m) => this.regMaterialTextures(m));
        });

        this.scene.add(holder);
        this.grand.root.visible = false;

        // 闪光挂到 GLB 包围盒内随机点继续工作
        const halfW = Math.max(size.x * scale, 1.2) * 0.8;
        const halfD = Math.max(size.z * scale, 1.2) * 0.8;
        const randomSpot = (obj: THREE.Object3D) => {
          obj.position.set(
            (Math.random() - 0.5) * halfW,
            -0.2 - Math.random() * 3.4,
            (Math.random() - 0.5) * halfD,
          );
        };
        const gl = this.grand.glints;
        const dummy = new THREE.Object3D();
        for (let i = 0; i < gl.size.length; i++) {
          randomSpot(dummy);
          dummy.scale.set(gl.size[i], gl.size[i], 1);
          dummy.updateMatrix();
          gl.mesh.setMatrixAt(i, dummy.matrix);
        }
        gl.mesh.instanceMatrix.needsUpdate = true;
        const gh = this.grand.halos;
        for (let i = 0; i < gh.size.length; i++) {
          randomSpot(dummy);
          dummy.scale.set(gh.size[i], gh.size[i], 1);
          dummy.updateMatrix();
          gh.mesh.setMatrixAt(i, dummy.matrix);
        }
        gh.mesh.instanceMatrix.needsUpdate = true;
        console.info("[WeddingGallery] 已切换 GLB 水晶吊灯 /models/crystal-chandelier.glb");
      },
      undefined,
      () => {
        draco.dispose();
        console.info("[WeddingGallery] 无 GLB 吊灯文件，使用程序化水晶吊灯");
      },
    );
  }

  // ── 真实玫瑰（GLB）────────────────────────────────────────
  /**
   * 一次性加载花束 + 长茎玫瑰高/低模 + 花头/叶片部件四个 GLB（共享 GLTFLoader 与 DRACOLoader）。
   * 任一失败仅打印一行 info 并保留对应程序化花艺，不影响 onReady。
   */
  private loadRoseModels() {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    loader.setDRACOLoader(draco);

    let pending = 4;
    const settle = () => {
      pending -= 1;
      if (pending > 0) return;
      draco.dispose();
      if (!this.disposed) this.buildRoseDecor();
    };

    const loadOne = (url: string, key: "bouquet" | "stem" | "stemLo") => {
      loader.load(
        url,
        (gltf) => {
          if (this.disposed) {
            this.disposeObject(gltf.scene);
            settle();
            return;
          }
          this.roseTemplates[key] = this.makeGlbTemplate(gltf.scene);
          this.releaseGltfSource(gltf.scene);
          settle();
        },
        undefined,
        () => {
          console.info(`[WeddingGallery] 玫瑰模型 ${url} 加载失败，保留程序化花艺`);
          settle();
        },
      );
    };

    loadOne("/models/rose-bouquet.glb", "bouquet");
    loadOne("/models/stem-rose.glb", "stem");
    loadOne("/models/stem-rose-lo.glb", "stemLo");

    loader.load(
      "/models/rose-parts.glb",
      (gltf) => {
        if (this.disposed) {
          this.disposeObject(gltf.scene);
          settle();
          return;
        }
        this.makePartTemplates(gltf.scene);
        this.releaseGltfSource(gltf.scene);
        settle();
      },
      undefined,
      () => {
        console.info("[WeddingGallery] 玫瑰模型 /models/rose-parts.glb 加载失败，花拱保留程序化花艺");
        settle();
      },
    );
  }

  /** 释放 GLTF 原始场景的几何与材质；贴图仍被模板材质引用，故不释放贴图 */
  private releaseGltfSource(scene: THREE.Object3D) {
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    });
  }

  /**
   * rose-parts.glb 的 4 个 mesh 各自独立且原点已在自身底部中心，
   * 必须逐个取模板，绝不能整场景归一化（否则会破坏各自原点）。
   */
  private makePartTemplates(scene: THREE.Object3D): void {
    scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o);
    });
    const wanted: [string, "head0" | "head6" | "head5" | "leaf"][] = [
      ["rose_head_0", "head0"],
      ["rose_head_6", "head6"],
      ["rose_head_5", "head5"],
      ["rose_leaf_single", "leaf"],
    ];
    wanted.forEach(([meshName, key]) => {
      const mesh = meshes.find((m) => m.name === meshName);
      if (mesh) this.roseTemplates[key] = this.templateFromMesh(mesh);
    });
  }

  /** 单个 mesh → 底心模板：几何烘焙世界矩阵，原点归一到自身包围盒底心 */
  private templateFromMesh(mesh: THREE.Mesh): GlbTemplate {
    const srcMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox ?? new THREE.Box3();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    geometry.translate(-center.x, -box.min.y, -center.z);
    return {
      primitives: [{ name: srcMat.name || mesh.name, geometry, material: srcMat }],
      size,
    };
  }

  /** 把 GLB 场景拆成 primitive 模板：烘焙世界矩阵后把原点归一到包围盒底心 */
  private makeGlbTemplate(scene: THREE.Object3D): GlbTemplate {
    scene.updateMatrixWorld(true);
    const primitives: GlbPrimitive[] = [];
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const srcMat = Array.isArray(o.material) ? o.material[0] : o.material;
      if (!srcMat) return;
      const geometry = o.geometry.clone();
      geometry.applyMatrix4(o.matrixWorld);
      primitives.push({ name: srcMat.name || o.name, geometry, material: srcMat });
    });

    const box = new THREE.Box3();
    primitives.forEach((p) => {
      p.geometry.computeBoundingBox();
      if (p.geometry.boundingBox) box.union(p.geometry.boundingBox);
    });
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    primitives.forEach((p) => p.geometry.translate(-center.x, -box.min.y, -center.z));
    return { primitives, size };
  }

  private buildRoseDecor() {
    const bouquet = this.roseTemplates.bouquet;
    if (bouquet) this.buildBouquetInstances(bouquet);
    const mass = this.roseTemplates.stemLo ?? this.roseTemplates.stem;
    const near = this.roseTemplates.stem ?? this.roseTemplates.stemLo;
    if (mass && near) this.buildStemRoseInstances(mass, near);
    this.buildArchRoseInstances();
    this.buildHallStageRoseInstances();
    this.buildSigningBouquet();
    this.retryGrandFloral();
    this.retryBeachFloral();
    this.retryLawnFloral();
  }

  /** 玫瑰模板就绪后，把沙滩花拱的程序化兜底替换为真实花艺，并补上长茎玫瑰 */
  private retryBeachFloral() {
    if (!this.beachBuilt) return;
    const h0 = this.roseTemplates.head0;
    const h6 = this.roseTemplates.head6;
    const h5 = this.roseTemplates.head5;
    const leafTpl = this.roseTemplates.leaf;
    if (!h0 || !h6 || !h5 || !leafTpl) return;
    if (this.beachArchFloralFallback) {
      this.beachGroup.remove(this.beachArchFloralFallback);
      this.disposeObject(this.beachArchFloralFallback);
      this.beachArchFloralFallback = null;
    }
    if (!this.beachArchFloralReal) {
      this.buildBeachArchFloral(this.beachArchZ, this.beachArchHalfW, this.beachArchTopY);
    }
    if (!this.beachStemsBuilt && this.beachPewEnds.length > 0) {
      this.buildBeachStemRoses(this.beachArchZ, this.beachArchHalfW, this.beachPewEnds);
    }
    if (this.beachDecorFloralFallback) {
      this.beachGroup.remove(this.beachDecorFloralFallback);
      this.disposeObject(this.beachDecorFloralFallback);
      this.beachDecorFloralFallback = null;
    }
    this.buildBeachDecorFloral();
  }

  /** 草坪花艺延迟重试：真实玫瑰模板就绪后重画花冠（近景花海保持低模以保证性能预算） */
  private retryLawnFloral() {
    if (!this.lawnBuilt) return;
    this.retryLawnCrown();
    this.buildMeadowStemRoses();
  }

  /** 草坪撒点确定性随机：与 allPalmSpots 的 mulberry32 变体同源，布局每次加载一致 */
  private lawnRand(i: number, k: number): number {
    let h = Math.imul(i + 1, 374761393) ^ Math.imul(k + 11, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  /** 台沿前缘弧线的曲率半径：由半宽与前凸量按矢高公式求得（台体与碰撞共用） */
  private hallStageArcR(): number {
    const w = this.HALL_STAGE_HALF_W;
    const sag = Math.max(this.HALL_STAGE_BULGE, 0.02);
    return (w * w + sag * sag) / (2 * sag);
  }

  /** 各层前缘 z：层号越大越往外展开；后缘统一贴在 HALL_STAGE_BACK_Z */
  private hallStageTierFrontZ(tier: number): number {
    return this.HALL_STAGE_FRONT_Z + tier * this.HALL_STAGE_LEDGE_D;
  }

  /** 各层台面高度：台面层最高，越往外越低 */
  private hallStageTierTopY(tier: number): number {
    return this.HALL_STAGE_DECK_Y - tier * this.HALL_STAGE_STEP_Y;
  }

  /**
   * 该层在给定 z 处的水平半宽：直边段（后墙→fz）为全宽，fz 往前的凸出段按
   * hallStageShape 的二次曲线收窄（前沿 z = fz + bulge·(1 − (x/halfW)²)）。
   */
  private hallStageHalfWidth(z: number, tier: number, margin = 0): number {
    const fz = this.hallStageTierFrontZ(tier);
    if (z <= fz) return this.HALL_STAGE_HALF_W - margin;
    const u2 = 1 - (z - fz) / Math.max(this.HALL_STAGE_BULGE, 1e-4);
    return Math.max(this.HALL_STAGE_HALF_W * Math.sqrt(Math.max(u2, 0)) - margin, 0);
  }

  /**
   * 台体某层的轮廓（世界 XY 平面）：后缘直边贴墙、前缘为向观众凸出的二次曲线。
   * 注意 extrudeShape 的 rotateX(-90°) 会把形状 +Y 映射到世界 −Z，故这里对 z 取负。
   */
  private hallStageShape(halfW: number, backZ: number, frontZ: number, bulge: number): THREE.Shape {
    const sh = new THREE.Shape();
    sh.moveTo(-halfW, -backZ);
    sh.lineTo(halfW, -backZ);
    sh.lineTo(halfW, -frontZ);
    sh.quadraticCurveTo(0, -(frontZ + 2 * bulge), -halfW, -frontZ);
    sh.closePath();
    return sh;
  }

  /** 轮廓竖直挤出到 [y0, y1]（ExtrudeGeometry 沿 +Z 挤出，经 rotateX 后变成 +Y） */
  private hallStageSlab(shape: THREE.Shape, y0: number, y1: number): THREE.BufferGeometry {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(y1 - y0, 0.001), bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, (y0 + y1) / 2, 0);
    return geo;
  }

  /**
   * 后墙仪式台：三级弧形台（弧口朝观礼席），台面 6.0×2.2m、高 0.43m，每级 0.143m 可迈步走上。
   * 台体、台阶高度、碰撞共用 hallStageHalfWidth / hallStageTierFrontZ，保证外形一致。
   */
  private buildHallStage() {
    const marble = new THREE.MeshStandardMaterial({
      color: "#efe9df",
      roughness: 0.34,
      metalness: 0.06,
      envMapIntensity: 1.05,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: "#d9bc84",
      roughness: 0.26,
      metalness: 0.82,
      envMapIntensity: 1.15,
    });
    const glow = new THREE.MeshBasicMaterial({ color: "#ffe6bd" });

    const bodyParts: THREE.BufferGeometry[] = [];
    const glowParts: THREE.BufferGeometry[] = [];
    for (let tier = this.HALL_STAGE_TIERS - 1; tier >= 0; tier--) {
      const fz = this.hallStageTierFrontZ(tier);
      const yTop = this.hallStageTierTopY(tier);
      bodyParts.push(
        this.hallStageSlab(
          this.hallStageShape(this.HALL_STAGE_HALF_W, this.HALL_STAGE_BACK_Z, fz, this.HALL_STAGE_BULGE),
          0.01,
          yTop,
        ),
      );
      if (tier > 0) {
        glowParts.push(
          this.hallStageSlab(
            this.hallStageShape(
              this.HALL_STAGE_HALF_W - 0.015,
              this.HALL_STAGE_BACK_Z + 0.02,
              fz - 0.03,
              this.HALL_STAGE_BULGE,
            ),
            yTop - 0.028,
            yTop,
          ),
        );
      }
      this.registerHallStageCollider(tier);
    }
    this.scene.add(new THREE.Mesh(this.mergeParts(bodyParts, "hall stage body"), marble));
    this.scene.add(new THREE.Mesh(this.mergeParts(glowParts, "hall stage led"), glow));

    const deckShape = this.hallStageShape(
      this.HALL_STAGE_HALF_W - 0.06,
      this.HALL_STAGE_BACK_Z + 0.06,
      this.HALL_STAGE_FRONT_Z + 0.06,
      this.HALL_STAGE_BULGE,
    );
    this.scene.add(
      new THREE.Mesh(
        this.hallStageSlab(deckShape, this.HALL_STAGE_DECK_Y + 0.002, this.HALL_STAGE_DECK_Y + 0.018),
        marble,
      ),
    );
    this.scene.add(
      new THREE.Mesh(
        this.hallStageSlab(
          this.hallStageShape(this.HALL_STAGE_HALF_W, this.HALL_STAGE_BACK_Z, this.HALL_STAGE_FRONT_Z, this.HALL_STAGE_BULGE),
          this.HALL_STAGE_DECK_Y,
          this.HALL_STAGE_DECK_Y + 0.006,
        ),
        gold,
      ),
    );

    this.buildSigningTable();
    this.buildHallStageEasels();
    this.buildHallStageFlorals();
  }

  /**
   * 仪式台前红毯两侧各一座照片画架（与户外画架同款，略放大）：立在最靠台的一对金花瓮（x=±2.6, z=-20）后方 2.6m，
   * 后支腿刚好落在最低一级台阶前沿（x=±2.9 处约 z=-23.4）之外；略往外偏 0.3m，免得从红毯看过去被花瓮挡住照片；微偏向红毯。位置名：舞台左 / 舞台右（进门面朝仪式台为准，左 = x < 0）。
   * 须在 buildCeremonyChairs 之前调用，座椅会避让画架碰撞圆。
   */
  private buildHallStageEasels() {
    const spots = [-1, 1].map((side) => ({ side, x: side * 2.9, z: -22.6 }));
    const S = 1.5;
    const FW = 1.0;
    const FH = 1.3;
    const PW = 0.8;
    const PH = 1.08;
    const easelMat = new THREE.MeshStandardMaterial({
      color: "#e3c995",
      metalness: 0.65,
      roughness: 0.33,
      envMapIntensity: 1.1,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: "#cfae72",
      metalness: 0.75,
      roughness: 0.3,
      envMapIntensity: 1.2,
    });
    const boardMat = new THREE.MeshStandardMaterial({ color: "#f3ede4", roughness: 0.9 });
    const easel = new THREE.InstancedMesh(this.makeEaselGeometry(), easelMat, spots.length);
    const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(FW, FH, 0.05), frameMat, spots.length);
    const board = new THREE.InstancedMesh(new THREE.PlaneGeometry(FW - 0.08, FH - 0.08), boardMat, spots.length);
    const planeAspect = PW / PH;
    const ledgeTop = (0.6 + 0.0175) * S;
    const local = new THREE.Matrix4();
    const tilt = new THREE.Matrix4().makeRotationX(-0.1);
    const world = new THREE.Matrix4();

    spots.forEach((sp, i) => {
      const y = this.hallStageGroundY(sp.x, sp.z);
      const ry = Math.atan2(-sp.side * 0.3, 0.95);
      easel.setMatrixAt(i, this.makeColumn(sp.x, y, sp.z, ry, S));
      const rootM = this.makeColumn(sp.x, y, sp.z, ry, 1);
      const at = (lx: number, ly: number, lz: number) =>
        world.copy(rootM).multiply(local.makeTranslation(lx, ly, lz)).multiply(tilt);
      frame.setMatrixAt(i, at(0, ledgeTop + FH / 2, 0.06));
      board.setMatrixAt(i, at(0, ledgeTop + FH / 2, 0.087));

      const slotId = sp.side < 0 ? "舞台左" : "舞台右";
      const wp = this.photoForSlot(slotId);
      const fallback = this.opts.photos[i % Math.max(this.opts.photos.length, 1)]?.src ?? "";
      const src = wp?.src ?? fallback;
      const wa = wp ? wp.w / wp.h : planeAspect;
      const pw = wa > planeAspect ? PW : PH * wa;
      const ph = wa > planeAspect ? PW / wa : PH;
      const photoMat = this.makePhotoMaterial();
      const key = src ? this.usePhoto(photoMat, wp, src, wp ? pw / ph : planeAspect) : "";
      const photo = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), photoMat);
      photo.matrixAutoUpdate = false;
      photo.matrix.copy(at(0, ledgeTop + FH / 2, 0.09));
      this.scene.add(photo);
      this.photoTargets.push({ mesh: photo, w: pw, h: ph, zone: "hall", key });
      this.slotTag(slotId, new THREE.Vector3().setFromMatrixPosition(at(0, ledgeTop + FH + 0.35, 0.1)), this.scene);
      this.circles.push({ x: sp.x, z: sp.z, r: 0.5 });
    });
    for (const mesh of [easel, frame, board]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    }
  }

  /** 台体分层碰撞：两侧直边与后沿各一块矩形（台阶正面留着给人走上去） */
  private registerHallStageCollider(tier: number) {
    const fz = this.hallStageTierFrontZ(tier);
    const w = this.HALL_STAGE_HALF_W;
    const back = this.HALL_STAGE_BACK_Z;
    this.boxes.push({ x0: -w - 0.3, x1: -w + 0.3, z0: back, z1: fz });
    this.boxes.push({ x0: w - 0.3, x1: w + 0.3, z0: back, z1: fz });
    if (tier === 0) this.boxes.push({ x0: -w, x1: w, z0: back - 0.3, z1: back + 0.3 });
  }

  /**
   * 婚书贴图：纯白厚纸 + 黑字竖排中式婚书 + 朱红印章。
   * 白纸黑字、字号大、与纸面高对比，保证站在台前能直接读到。
   */
  private marriageContractTexture(): THREE.Texture {
    const { namesLine } = this.opts;
    const tex = this.reg(
      this.makeCanvasTexture((ctx, w, h) => {
        // 纯白厚纸：仅极淡的渐变，不压暗黑字
        const paper = ctx.createLinearGradient(0, 0, 0, h);
        paper.addColorStop(0, "#ffffff");
        paper.addColorStop(0.55, "#fdfcf8");
        paper.addColorStop(1, "#f7f5ee");
        ctx.fillStyle = paper;
        ctx.fillRect(0, 0, w, h);

        // 极淡纸纹
        ctx.save();
        ctx.globalAlpha = 0.03;
        ctx.strokeStyle = "#8a7c63";
        for (let y = 0; y < h; y += 11) {
          ctx.beginPath();
          ctx.moveTo(0, y + Math.random() * 3);
          ctx.lineTo(w, y + Math.random() * 3);
          ctx.stroke();
        }
        ctx.restore();

        // 黑色双线边框（内细外粗），四角小卷草
        ctx.strokeStyle = "#1c1a17";
        ctx.lineWidth = 9;
        ctx.strokeRect(30, 30, w - 60, h - 60);
        ctx.lineWidth = 3;
        ctx.strokeRect(54, 54, w - 108, h - 108);

        // 竖排黑字：右侧标题，中部正文两列，左侧落款
        // 每列限定在 [top, bottom] 内：字多就自动缩小行距和字号，保证不出内框（内框在 y = 54 ~ h-54）
        const col = (text: string, cx: number, top: number, bottom: number, maxSize: number, color: string, weight = "700") => {
          const chars = [...text];
          const lh = Math.min(maxSize * 1.18, (bottom - top) / chars.length);
          const size = Math.min(maxSize, lh * 0.86);
          ctx.fillStyle = color;
          ctx.font = `${weight} ${size}px "Songti SC", "STSong", "SimSun", serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          chars.forEach((ch, i) => ctx.fillText(ch, cx, top + i * lh + (lh - size) / 2));
        };
        const bottom = h - 110;
        col("婚　书", w * 0.86, h * 0.13, h * 0.62, 132, "#141210");
        col("两姓联姻一堂缔约", w * 0.7, 120, bottom, 104, "#141210");
        col("良缘永结匹配同称", w * 0.55, 120, bottom, 104, "#141210");
        col(namesLine.replace("♡", "·").replace(/\s+/g, ""), w * 0.4, 150, bottom - 20, 92, "#8c1c2a");
        col("谨订此约白首同心", w * 0.26, h * 0.34, bottom - 20, 72, "#2a2622");

        // 朱红印章（左下）
        const sx = w * 0.17;
        const sy = h * 0.75;
        const sr = 108;
        ctx.fillStyle = "rgba(178,32,42,0.9)";
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff8ef";
        ctx.font = `700 ${sr * 1.05}px "Songti SC", "STSong", serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("囍", sx, sy + 6);
      }, 2048, 1024),
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  private buildSigningTable() {
    const deckY = this.HALL_STAGE_DECK_Y;
    const cz = this.HALL_STAGE_BACK_Z + 1.85;
    const TW = 1.35;
    const TD = 0.5;
    const TH = deckY + 1.15;
    const marble = new THREE.MeshStandardMaterial({
      color: "#f7f2e9",
      roughness: 0.24,
      metalness: 0.06,
      envMapIntensity: 1.15,
    });
    const gold = new THREE.MeshStandardMaterial({
      color: "#d7b87e",
      roughness: 0.22,
      metalness: 0.88,
      envMapIntensity: 1.25,
    });
    const walnut = new THREE.MeshStandardMaterial({
      color: "#6d4630",
      roughness: 0.42,
      metalness: 0.04,
      envMapIntensity: 0.6,
    });
    const ivory = new THREE.MeshStandardMaterial({ color: "#fbf6ec", roughness: 0.5, metalness: 0.03 });

    // 桌面：厚板 + 上层台面 + 前沿裙板（分层才有分量）
    const parts: THREE.BufferGeometry[] = [];
    const slab = new THREE.BoxGeometry(TW * 2 + 0.14, 0.075, TD * 2 + 0.14);
    slab.translate(0, TH, cz);
    parts.push(slab);
    const upper = new THREE.BoxGeometry(TW * 2 + 0.02, 0.045, TD * 2 + 0.02);
    upper.translate(0, TH + 0.055, cz);
    parts.push(upper);
    const skirt = new THREE.BoxGeometry(TW * 2 - 0.02, 0.17, TD * 2 - 0.02);
    skirt.translate(0, TH - 0.115, cz);
    parts.push(skirt);

    // 桌腿：方形收分柱 + 柱头托块 + 落地柱脚，腿间有横撑
    const legAt = (x: number, z: number) => {
      const legH = TH - 0.19 - deckY;
      const leg = new THREE.BoxGeometry(0.13, legH, 0.13);
      leg.translate(x, deckY + 0.055 + legH / 2, z);
      parts.push(leg);
      const capBlock = new THREE.BoxGeometry(0.16, 0.05, 0.16);
      capBlock.translate(x, deckY + 0.055 + legH + 0.025, z);
      parts.push(capBlock);
      const foot = new THREE.CylinderGeometry(0.085, 0.1, 0.055, 4);
      foot.rotateY(Math.PI / 4);
      foot.translate(x, deckY + 0.028, z);
      parts.push(foot);
    };
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => legAt(sx * (TW - 0.13), cz + sz * (TD - 0.1))));
    [-1, 1].forEach((sz) => {
      const rail = new THREE.BoxGeometry(TW * 2 - 0.5, 0.035, 0.05);
      rail.translate(0, deckY + 0.3, cz + sz * (TD - 0.1));
      parts.push(rail);
    });
    this.scene.add(new THREE.Mesh(this.mergeParts(parts, "signing table"), marble));
    // 桌子碰撞用整块矩形：多个小圆拼接会在贴边行走时交替横推，视角左右抖
    this.boxes.push({ x0: -TW - 0.07, x1: TW + 0.07, z0: cz - TD - 0.07, z1: cz + TD + 0.07 });

    const topY = TH + 0.078;
    const rimParts: THREE.BufferGeometry[] = [];
    const rim = new THREE.BoxGeometry(TW * 2 + 0.17, 0.016, TD * 2 + 0.17);
    rim.translate(0, TH - 0.037, cz);
    rimParts.push(rim);
    // 金边包住上层台面侧面，顶面低于台面，不能盖住婚书
    const rim2 = new THREE.BoxGeometry(TW * 2 + 0.05, 0.03, TD * 2 + 0.05);
    rim2.translate(0, TH + 0.052, cz);
    rimParts.push(rim2);
    this.scene.add(new THREE.Mesh(this.mergeParts(rimParts, "signing table trim"), gold));

    // ── 婚书平放桌面正中靠前：白纸黑字、朝上摊开，用压纸条固定 ──
    const contractW = 1.0;
    const contractD = 0.5;
    const contractCx = 0;
    const contractCz = cz + 0.17;
    const paperBack = new THREE.Mesh(
      new THREE.PlaneGeometry(contractW + 0.05, contractD + 0.05),
      new THREE.MeshStandardMaterial({ color: "#fdfbf6", roughness: 0.92, metalness: 0 }),
    );
    paperBack.rotation.x = -Math.PI / 2;
    paperBack.position.set(contractCx, topY + 0.006, contractCz);
    this.scene.add(paperBack);
    const contract = new THREE.Mesh(
      new THREE.PlaneGeometry(contractW, contractD),
      new THREE.MeshStandardMaterial({
        map: this.marriageContractTexture(),
        roughness: 0.62,
        metalness: 0.02,
        side: THREE.FrontSide,
      }),
    );
    contract.rotation.x = -Math.PI / 2;
    contract.position.set(contractCx, topY + 0.011, contractCz);
    this.scene.add(contract);
    const clipParts: THREE.BufferGeometry[] = [];
    const clipAt = (lx: number, lz: number, rot: number) => {
      const bar = new THREE.BoxGeometry(0.14, 0.014, 0.038);
      bar.rotateY(rot);
      bar.translate(contractCx + lx, topY + 0.019, contractCz + lz);
      clipParts.push(bar);
    };
    clipAt(-contractW / 2 + 0.06, -contractD / 2 + 0.035, 0.3);
    clipAt(contractW / 2 - 0.06, -contractD / 2 + 0.035, -0.3);
    this.scene.add(new THREE.Mesh(this.mergeParts(clipParts, "contract clips"), gold));

    // ── 签字笔：玫瑰金笔身 + 奶白笔握，搁在婚书右侧的笔架上 ──
    const penX = 0.82;
    const penZ = cz + 0.2;
    const penParts: THREE.BufferGeometry[] = [];
    const barrel = new THREE.CylinderGeometry(0.009, 0.009, 0.2, 14);
    barrel.rotateZ(Math.PI / 2);
    penParts.push(barrel);
    const grip = new THREE.CylinderGeometry(0.0082, 0.004, 0.065, 14);
    grip.rotateZ(Math.PI / 2);
    grip.translate(0.132, 0, 0);
    penParts.push(grip);
    const tip = new THREE.ConeGeometry(0.004, 0.022, 10);
    tip.rotateZ(-Math.PI / 2);
    tip.translate(0.175, 0, 0);
    penParts.push(tip);
    const pen = new THREE.Mesh(this.mergeParts(penParts, "signing pen"), gold);
    pen.position.set(penX, topY + 0.115, penZ);
    pen.rotation.set(0, 0.35, 0.06);
    this.scene.add(pen);
    const penCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0098, 0.0098, 0.06, 14).rotateZ(Math.PI / 2),
      ivory,
    );
    penCap.position.set(-0.12, 0, 0);
    pen.add(penCap);
    const penClip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.008), gold);
    penClip.position.set(-0.12, 0.011, 0);
    pen.add(penClip);
    const penRestParts: THREE.BufferGeometry[] = [];
    const base = new THREE.BoxGeometry(0.26, 0.028, 0.1);
    base.translate(0, topY + 0.014, 0);
    penRestParts.push(base);
    [-1, 1].forEach((sx) => {
      const horn = new THREE.CylinderGeometry(0.022, 0.026, 0.075, 10);
      horn.translate(sx * 0.075, topY + 0.052, 0);
      penRestParts.push(horn);
    });
    const penRest = new THREE.Mesh(this.mergeParts(penRestParts, "pen rest"), gold);
    penRest.position.set(penX, 0, penZ);
    penRest.rotation.y = 0.35;
    this.scene.add(penRest);

    // 印章镇纸：方柱 + 圆钮（婚书左侧）
    const sealParts: THREE.BufferGeometry[] = [];
    const sealBody = new THREE.BoxGeometry(0.115, 0.09, 0.115);
    sealBody.translate(0, 0.045, 0);
    sealParts.push(sealBody);
    const sealKnob = new THREE.SphereGeometry(0.026, 14, 10);
    sealKnob.translate(0, 0.104, 0);
    sealParts.push(sealKnob);
    const sealMesh = new THREE.Mesh(this.mergeParts(sealParts, "seal weight"), gold);
    sealMesh.position.set(-0.78, topY, cz + 0.22);
    sealMesh.rotation.y = 0.3;
    this.scene.add(sealMesh);

    this.buildSigningTableDecor(topY, TD, cz);
  }

  /** 签字台台面布置：婚书后方一瓶真实玫瑰花束、桌旗，均以台面 topY 为基准（不再从地板起算） */
  private buildSigningTableDecor(topY: number, TD: number, cz: number) {
    // 花：婚书后方一瓶真实玫瑰花束（rose-bouquet.glb，模型就绪后放置）
    this.signingBouquetSpot = new THREE.Vector3(0, topY + 0.004, cz - 0.25);
    this.buildSigningBouquet();

    // 桌旗（香槟金窄带）与散落花瓣
    const runner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, TD * 2 + 0.1),
      new THREE.MeshStandardMaterial({ color: "#e8d9bd", roughness: 0.72, metalness: 0.1 }),
    );
    runner.rotation.x = -Math.PI / 2;
    runner.position.set(0, topY + 0.002, cz);
    this.scene.add(runner);
  }

  /** 签字台花瓶花束：复用 rose-bouquet.glb（自带玻璃花瓶与水），缩放到约 0.6m 高 */
  private buildSigningBouquet() {
    const tpl = this.roseTemplates.bouquet;
    const spot = this.signingBouquetSpot;
    if (this.signingBouquetBuilt || !tpl || !spot || tpl.primitives.length === 0) return;
    this.signingBouquetBuilt = true;
    const s = Math.min(0.6 / Math.max(tpl.size.y, 1e-4), 0.42 / Math.max(tpl.size.x, tpl.size.z, 1e-4));
    const root = new THREE.Group();
    root.position.copy(spot);
    root.rotation.y = 0.4;
    root.scale.setScalar(s);
    const vaseMat = this.vaseGlassMaterial("#f3f8fa", 0.3);
    const waterMat = this.vaseGlassMaterial("#e6f2f6", 0.16);
    tpl.primitives.forEach((p) => {
      const isGlass = /vray|glass/i.test(p.name) || p.name.startsWith("04");
      const isWater = /water/i.test(p.name) || p.name === "Material #7";
      const mat = isGlass ? vaseMat : isWater ? waterMat : this.bouquetMaterial(p.name, p.material);
      const mesh = new THREE.Mesh(p.geometry, mat);
      mesh.renderOrder = isWater ? 3 : isGlass ? 2 : 1;
      root.add(mesh);
    });
    this.scene.add(root);
  }

  /** 仪式台与签字台周边花艺：台沿垂花、台面两侧爬藤、台阶两端花团、前缘花瓣毯、两侧花柱 */
  private buildHallStageFlorals() {
    const deckY = this.HALL_STAGE_DECK_Y;
    const backZ = this.HALL_STAGE_BACK_Z;
    const frontZ = this.HALL_STAGE_FRONT_Z;
    const rose = (x: number, y: number, z: number, s: number, color: THREE.Color) => {
      this.hallStageRoses.push({
        m: new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler((Math.random() - 0.5) * 0.6, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.6),
          ),
          new THREE.Vector3(s, s, s),
        ),
        color,
      });
    };
    const palette = ["#fdf8f3", "#f4c9d4", "#ef8fae", "#f6b48f", "#f3e3c1", "#e75480"];
    const tone = (bias = 0) => {
      const r = Math.random();
      if (r < bias) return new THREE.Color("#c8102e");
      return new THREE.Color(palette[Math.floor(Math.random() * palette.length)]).offsetHSL(
        0,
        0,
        (Math.random() - 0.5) * 0.1,
      );
    };
    const scatter = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, n: number, bias = 0) => {
      for (let i = 0; i < n; i++) {
        rose(
          cx + (Math.random() - 0.5) * rx * 2,
          cy + (Math.random() - 0.5) * ry * 2,
          cz + (Math.random() - 0.5) * rz * 2,
          0.5 + Math.random() * 0.5,
          tone(bias),
        );
      }
    };

    // 台沿垂花：沿台面弧形前沿每 0.24m 一丛，从台面往下垂
    const R = this.hallStageArcR();
    for (let x = -this.HALL_STAGE_HALF_W + 0.15; x <= this.HALL_STAGE_HALF_W - 0.15; x += 0.24) {
      const dz = Math.sqrt(Math.max(R * R - x * x, 0));
      const z = this.HALL_STAGE_FRONT_Z + this.HALL_STAGE_BULGE - R + dz;
      scatter(x, deckY - 0.07 - Math.random() * 0.15, z + 0.07, 0.08, 0.13, 0.1, 5, 0.06);
    }
    // 台面两侧爬藤：沿弧形边缘向内 0.5m 铺一层
    for (let i = 0; i < 90; i++) {
      const x = (Math.random() < 0.5 ? -1 : 1) * (this.HALL_STAGE_HALF_W - Math.random() * 0.55);
      const z = backZ + Math.random() * (frontZ - backZ) * 0.5;
      scatter(x, deckY + 0.07 + Math.random() * 0.06, z, 0.08, 0.05, 0.1, 3, 0.04);
    }
    // 台阶两端花团（三级各一团，越靠下越大）
    for (let tier = 0; tier < this.HALL_STAGE_TIERS; tier++) {
      const fz = this.hallStageTierFrontZ(tier);
      const y = this.hallStageTierTopY(tier);
      [-1, 1].forEach((side) => {
        scatter(side * (this.HALL_STAGE_HALF_W - 0.3), y + 0.1, fz + 0.16, 0.3, 0.13, 0.2, 16, 0.05);
      });
    }
    // 台面后沿两侧：两根矮圆柱 + 柱顶花团（不挡囍字）
    const pillarParts: THREE.BufferGeometry[] = [];
    [-1, 1].forEach((side) => {
      const x = side * (this.HALL_STAGE_HALF_W - 0.42);
      const z = backZ + 0.42;
      const shaft = new THREE.CylinderGeometry(0.085, 0.11, 1.18, 14);
      shaft.translate(x, deckY + 0.59, z);
      pillarParts.push(shaft);
      const cap = new THREE.CylinderGeometry(0.13, 0.1, 0.07, 14);
      cap.translate(x, deckY + 1.21, z);
      pillarParts.push(cap);
      const base = new THREE.CylinderGeometry(0.14, 0.16, 0.06, 14);
      base.translate(x, deckY + 0.03, z);
      pillarParts.push(base);
      scatter(x, deckY + 1.34, z, 0.24, 0.12, 0.22, 22, 0.05);
      this.circles.push({ x, z, r: 0.24 });
    });
    this.scene.add(
      new THREE.Mesh(
        this.mergeParts(pillarParts, "hall stage pillars"),
        new THREE.MeshStandardMaterial({ color: "#f1ebdf", roughness: 0.5, metalness: 0.04, envMapIntensity: 0.7 }),
      ),
    );

    // 两侧花柱（台旁 1.8m 高，柱顶大花团）
    const columnParts: THREE.BufferGeometry[] = [];
    [-1, 1].forEach((side) => {
      const x = side * (this.HALL_STAGE_HALF_W + 0.85);
      const z = frontZ - 0.35;
      const base = new THREE.CylinderGeometry(0.19, 0.23, 0.13, 16);
      base.translate(x, 0.065, z);
      columnParts.push(base);
      const shaft = new THREE.CylinderGeometry(0.1, 0.13, 1.5, 16);
      shaft.translate(x, 0.88, z);
      columnParts.push(shaft);
      const cap = new THREE.CylinderGeometry(0.2, 0.14, 0.1, 16);
      cap.translate(x, 1.68, z);
      columnParts.push(cap);
      scatter(x, 1.92, z, 0.36, 0.16, 0.34, 30, 0.05);
      this.circles.push({ x, z, r: 0.3 });
    });
    this.scene.add(
      new THREE.Mesh(
        this.mergeParts(columnParts, "hall stage floral columns"),
        new THREE.MeshStandardMaterial({ color: "#efe8db", roughness: 0.52, metalness: 0.04, envMapIntensity: 0.7 }),
      ),
    );

    this.buildHallStagePetals();
  }

  /** 台前花瓣毯：从台前沿向观礼席方向散开的花瓣（中间密、边缘疏） */
  private buildHallStagePetals() {
    const count = this.touchMode ? 700 : 1600;
    const mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.11, 0.075),
      new THREE.MeshStandardMaterial({
        map: this.reg(this.petalTexture()),
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0,
      }),
      count,
    );
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const c = new THREE.Color();
    let p = 0;
    let guard = 0;
    while (p < count && guard++ < count * 5) {
      const z = this.HALL_STAGE_FRONT_Z + Math.random() * 3.6;
      const spread = 2.2 + (z - this.HALL_STAGE_FRONT_Z) * 0.5;
      const off = (Math.random() + Math.random() - 1) * spread;
      if (Math.abs(off) > spread) continue;
      dummy.position.set(off, 0.014 + Math.random() * 0.006, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      dummy.scale.setScalar(0.75 + Math.random() * 0.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(p, dummy.matrix);
      c.set(this.redMixPetalTone());
      mesh.setColorAt(p, c);
      p += 1;
    }
    mesh.count = p;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  /** 台面玫瑰待模板就绪后实例化（由 buildRoseDecor → retryHallStageRoses 调用） */
  private buildHallStageRoseInstances() {
    if (this.hallStageRosesBuilt) return;
    const head = this.roseTemplates.head0;
    if (!head) return;
    this.hallStageRosesBuilt = true;
    const headMat = this.archHeadMaterial(head.primitives[0].material);
    if (headMat instanceof THREE.MeshStandardMaterial) this.applyFakeSun(headMat);
    const mesh = new THREE.InstancedMesh(head.primitives[0].geometry, headMat, this.hallStageRoses.length);
    mesh.frustumCulled = false;
    this.hallStageRoses.forEach((r, i) => {
      mesh.setMatrixAt(i, r.m);
      mesh.setColorAt(i, r.color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
  }

  /** 后墙仪式台脚下的地面高度：在台体轮廓内返回台面/踏面高度，否则 0 */
  private hallStageGroundY(x: number, z: number): number {
    const outerFront = this.hallStageTierFrontZ(this.HALL_STAGE_TIERS - 1) + this.HALL_STAGE_BULGE;
    if (z > outerFront || z < this.HALL_STAGE_BACK_Z - 0.2) return 0;
    // 由最高层往外找：落在哪一层的轮廓内就取该层台面高度
    for (let tier = 0; tier < this.HALL_STAGE_TIERS; tier++) {
      const hw = this.hallStageHalfWidth(z, tier, 0.02);
      if (hw <= 0 || Math.abs(x) > hw) continue;
      return this.hallStageTierTopY(tier);
    }
    return 0;
  }

  /** 山间草甸高度场：门口与舞台区回 0，远端缓丘起伏，远端收敛避免与天空相接处开缝 */
  private lawnHeight(x: number, z: number): number {
    if (z < this.ARCH_Z) return 0;
    const stageD = Math.hypot(x, z - this.LAWN_STAGE_Z);
    const flat = Math.min(
      THREE.MathUtils.smoothstep(stageD, this.LAWN_PLATFORM_R + 6, this.LAWN_PLATFORM_R + 15),
      0.85,
    );
    const walk = Math.min(
      THREE.MathUtils.smoothstep(Math.hypot(x / this.LAWN_WALK_R, (z - this.ARCH_Z) / (this.LAWN_WALK_Z - this.ARCH_Z)), 1.05, 2.1),
      1,
    );
    const amp = 0.55 * Math.min(flat, walk);
    const n = (f: number, sx: number, sz: number) =>
      this.beachNoise(x * f + sx, z * f + sz);
    const undulate =
      (n(0.024, 3.7, 11.2) - 0.5) * 2 +
      (n(0.061, 8.1, 1.9) - 0.5) * 0.8 +
      (n(0.15, 0.4, 6.3) - 0.5) * 0.22;
    let h = undulate * amp;
    if (z > this.LAWN_WALK_Z + 6) h += (z - this.LAWN_WALK_Z - 6) * 0.12;
    const far = THREE.MathUtils.smoothstep(Math.hypot(x, z - 120), 130, 200);
    return h * (1 - far);
  }

  /**
   * 画廊两侧与后方的草甸高度（仅用于地面网格/树落点，玩家到不了）：
   * 起伏幅度按「以门口为镜面」的同一椭圆计算，保证 z=ARCH_Z 接缝处与 lawnHeight 完全相等；
   * 另乘建筑净空系数，外墙 2m 内压平、12m 外恢复起伏；后墙 6m 外起缓坡形成围合感。
   */
  private lawnTerrainY(x: number, z: number): number {
    if (z >= this.ARCH_Z) return this.lawnHeight(x, z);
    const zm = 2 * this.ARCH_Z - z;
    const walk = Math.min(
      THREE.MathUtils.smoothstep(Math.hypot(x / this.LAWN_WALK_R, (zm - this.ARCH_Z) / (this.LAWN_WALK_Z - this.ARCH_Z)), 1.05, 2.1),
      1,
    );
    const dx = Math.max(Math.abs(x) - this.W / 2, 0);
    const dz = Math.max(this.DEPTH_START - z, 0);
    const clear = THREE.MathUtils.smoothstep(Math.hypot(dx, dz), 2, 12);
    const amp = 0.55 * Math.min(0.85, walk, clear);
    const n = (f: number, sx: number, sz: number) => this.beachNoise(x * f + sx, z * f + sz);
    const undulate =
      (n(0.024, 3.7, 11.2) - 0.5) * 2 +
      (n(0.061, 8.1, 1.9) - 0.5) * 0.8 +
      (n(0.15, 0.4, 6.3) - 0.5) * 0.22;
    let h = undulate * amp;
    if (zm > this.LAWN_WALK_Z + 6) h += (zm - this.LAWN_WALK_Z - 6) * 0.12 * clear;
    const far = THREE.MathUtils.smoothstep(Math.hypot(x, zm - 120), 130, 200);
    return h * (1 - far);
  }

  /** 玩家脚下地面高度：草坪主题 z≥门口 跟随草甸地形与凉亭平台，室内保持 0 */
  private lawnGroundY(x: number, z: number): number {
    if (z < this.ARCH_Z) return 0;
    const stageD = Math.hypot(x, z - this.LAWN_STAGE_Z);
    const r = this.LAWN_PLATFORM_R;
    if (stageD <= r) return this.LAWN_DECK_Y;
    if (stageD <= r + 0.8 && Math.abs(x) <= 1.3 && z < this.LAWN_STAGE_Z) {
      // 两级台阶（每级 0.21m < MAX_STEP 0.5）：靠近平台一级更高
      const t = (r + 0.8 - stageD) / 0.8;
      return this.LAWN_DECK_Y * t;
    }
    return this.lawnHeight(x, z);
  }

  /** 草甸玫瑰配色：全色系玫瑰 + 每支 ±5% 明度抖动，构成「开满花」的天然色斑 */
  private lawnRoseTone(): THREE.Color {
    const palette = [
      "#d61f3c", "#8f1030", "#ef5d8f", "#f4a7bc", "#fbf6ef",
      "#f3e3c1", "#e8783c", "#f2c14e", "#b07fd8", "#f7d9e2",
    ];
    const hex = palette[Math.floor(this.lawnRandSafe() * palette.length)];
    return new THREE.Color(hex).multiplyScalar(0.94 + this.lawnRandSafe() * 0.12);
  }

  /** 花海撒点专用随机（避开与布局 hash 抢序号，独立 LCG 流） */
  private flowerSeed = 987654321;
  private lawnRandSafe(): number {
    this.flowerSeed = (Math.imul(this.flowerSeed, 1664525) + 1013904223) | 0;
    return ((this.flowerSeed >>> 0) % 100000) / 100000;
  }

  /** 玫瑰花海 + 野花：程序化低模花头先行兜底铺满草甸，rose-parts 模板就绪后近景升级真实花头 */
  private buildLawnFlowers() {
    // A. 玫瑰花丛锚点：8 处天然色斑群（避开小径/舞台/座区），每处 24~40 株
    const clusters: { x: number; z: number; r: number; n: number }[] = [
      { x: -6.5, z: 26, r: 2.6, n: 34 },
      { x: 7.5, z: 28, r: 3.0, n: 38 },
      { x: -11, z: 36, r: 3.0, n: 40 },
      { x: 12.5, z: 37.5, r: 2.8, n: 34 },
      { x: -6.5, z: 49.5, r: 1.6, n: 18 },
      { x: 7, z: 50, r: 1.6, n: 18 },
      { x: -15, z: 30, r: 2.6, n: 30 },
      { x: 16, z: 31, r: 2.6, n: 30 },
    ];
    const clusterMul = this.touchMode ? 0.8 : 1.7;
    const soloCount = this.touchMode ? 90 : 270;

    const pathCurve = (z: number) => Math.sin((z - this.ARCH_Z) * 0.1) * 0.55;
    const clearOfWalkways = (x: number, z: number, pad: number) => {
      if (Math.abs(x - pathCurve(z)) < 1.62 + pad) return false;
      if (Math.hypot(x, z - this.LAWN_STAGE_Z) < this.LAWN_PLATFORM_R + 2.2 + pad) return false;
      if (Math.abs(x) < 6.5 + pad && z > 43 && z < 52) return false;
      if (Math.abs(x - 4.7) < 1 && Math.abs(z - (this.ARCH_Z + 2.2)) < 1.4) return false;
      if (Math.abs(x + 4.7) < 1 && Math.abs(z - (this.ARCH_Z + 2.2)) < 1.4) return false;
      return true;
    };

    this.lawnFlowerSpots = [];
    const addBush = (x: number, z: number, n: number, spread: number) => {
      const tone = this.lawnRoseTone();
      for (let i = 0; i < n; i++) {
        const a = this.lawnRandSafe() * Math.PI * 2;
        const rr = Math.sqrt(this.lawnRandSafe()) * spread;
        const fx = x + Math.cos(a) * rr;
        const fz = z + Math.sin(a) * rr;
        if (Math.abs(fx - pathCurve(fz)) < 1.62) continue;
        const s = 0.75 + this.lawnRandSafe() * 0.6;
        // 同丛基色 ±10% 明度抖动 + 12% 机会跳异色，天然杂交感
        const col =
          this.lawnRandSafe() < 0.12
            ? this.lawnRoseTone()
            : tone.clone().multiplyScalar(0.9 + this.lawnRandSafe() * 0.2);
        this.lawnFlowerSpots.push({ x: fx, y: this.lawnHeight(fx, fz), z: fz, color: col, s });
      }
    };
    clusters.forEach((c) => {
      if (!clearOfWalkways(c.x, c.z, c.r)) return;
      addBush(c.x, c.z, Math.round(c.n * clusterMul), c.r * 1.3);
    });
    for (let i = 0; i < soloCount; i++) {
      const a = this.lawnRandSafe() * Math.PI * 2;
      const rr = 5.5 + Math.sqrt(this.lawnRandSafe()) * 16;
      const x = Math.cos(a) * rr;
      const z = this.ARCH_Z + 4 + this.lawnRandSafe() * (this.LAWN_WALK_Z - this.ARCH_Z - 8);
      if (!clearOfWalkways(x, z, 0.4)) continue;
      addBush(x, z, 6 + Math.floor(this.lawnRandSafe() * 7), 1.05);
    }

    // B. 真实长茎玫瑰（stem-rose.glb）：在 activateOutdoor 建完全部草坪构件后统一生成（含小径花境）
  }

  /** 草甸花丛：lawnFlowerSpots 逐点种一支真实长茎玫瑰（小径 4m 内用高模，其余低模） */
  private lawnMeadowRosesBuilt = false;
  /** 小径花带摆点（buildLawnAisle 生成，模板就绪后与草甸花丛一起实例化） */
  private lawnPathBankSpots: { x: number; y: number; z: number; color: THREE.Color; len: number }[] = [];
  private buildMeadowStemRoses() {
    if (!this.lawnBuilt || this.lawnMeadowRosesBuilt) return;
    const lo = this.roseTemplates.stemLo ?? this.roseTemplates.stem;
    const hi = this.roseTemplates.stem ?? this.roseTemplates.stemLo;
    if (!lo || !hi) return;
    this.lawnMeadowRosesBuilt = true;
    const pathCurve = (z: number) => Math.sin((z - this.ARCH_Z) * 0.1) * 0.55;
    const nearPl: StemPlacement[] = [];
    const massPl: StemPlacement[] = [];
    this.lawnFlowerSpots.forEach((sp) => {
      const near = Math.abs(sp.x - pathCurve(sp.z)) < 3;
      const tpl = near ? hi : lo;
      const th = this.lawnRandSafe() * Math.PI * 2;
      const lean = 0.05 + this.lawnRandSafe() * 0.22;
      const dir = new THREE.Vector3(Math.sin(th) * lean, 1, Math.cos(th) * lean).normalize();
      const len = 0.42 * sp.s + this.lawnRandSafe() * 0.12;
      (near ? nearPl : massPl).push({
        matrix: this.stemMatrix(tpl, sp.x, sp.z, dir, len / tpl.size.y, sp.y - 0.03),
        color: sp.color,
      });
    });
    this.lawnPathBankSpots.forEach((sp) => {
      const th = this.lawnRandSafe() * Math.PI * 2;
      const lean = 0.04 + this.lawnRandSafe() * 0.16;
      const dir = new THREE.Vector3(Math.sin(th) * lean, 1, Math.cos(th) * lean).normalize();
      massPl.push({ matrix: this.stemMatrix(lo, sp.x, sp.z, dir, sp.len / lo.size.y, sp.y - 0.03), color: sp.color });
    });
    this.addStemInstances(lo, massPl, this.lawnGroup, true);
    this.addStemInstances(hi, nearPl, this.lawnGroup, true);
  }

  /**
   * 欧式园林凉亭：白色大理石圆台（2 级圆台阶 + 主平台）+ 8 根修长罗马柱 +
   * 环形檐口/齿饰 + 镂空铁艺穹顶 + 穹顶花冠；台沿一圈烛杯、四点垂纱、
   * 后侧白纱幕布。与沙滩「木台 + 矩形拱框」完全异构。
   */
  private buildLawnRotunda() {
    const R = this.LAWN_PLATFORM_R;
    const deckY = this.LAWN_DECK_Y;
    const zc = this.LAWN_STAGE_Z;
    const whiteMat = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.55, metalness: 0.02, envMapIntensity: 0.6 });
    const marbleMat = new THREE.MeshStandardMaterial({ color: "#e9e4d8", roughness: 0.4, metalness: 0.05, envMapIntensity: 0.8 });
    const goldMat = new THREE.MeshStandardMaterial({ color: "#d9bc84", roughness: 0.3, metalness: 0.75, envMapIntensity: 1.1 });
    const ironMat = new THREE.MeshStandardMaterial({ color: "#4a4438", roughness: 0.5, metalness: 0.6, envMapIntensity: 0.9 });
    [whiteMat, marbleMat, goldMat, ironMat].forEach((m) => this.applyFakeSun(m));

    // A. 圆盘平台：下级台阶(0.14) + 上级台阶(0.14) + 主平台(0.14)，总高 LAWN_DECK_Y
    const step1 = new THREE.CylinderGeometry(R + 0.8, R + 0.85, 0.14, 56);
    step1.translate(0, 0.07, zc);
    const step2 = new THREE.CylinderGeometry(R + 0.4, R + 0.45, 0.14, 56);
    step2.translate(0, 0.21, zc);
    const deck = new THREE.CylinderGeometry(R, R, 0.14, 56);
    deck.translate(0, 0.35, zc);
    const discParts: THREE.BufferGeometry[] = [step1, step2, deck];
    // 平台面一圈金色收边条
    const rim = new THREE.TorusGeometry(R - 0.06, 0.035, 8, 56);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, deckY + 0.005, zc);
    discParts.push(rim);
    this.lawnGroup.add(new THREE.Mesh(this.mergeParts(discParts, "rotunda disc"), marbleMat));
    // 台阶外沿一周矮碰撞：台阶区可走（|x|<=1.3 前侧入口），其余圆环挡人
    for (let a = 0; a < Math.PI * 2 - 1e-4; a += (Math.PI * 2) / 44) {
      const x = Math.cos(a) * (R + 0.85);
      const z = zc + Math.sin(a) * (R + 0.85);
      const frontGap = Math.abs(x) < 1.7 && z < zc;
      if (!frontGap) this.outdoorCircles.lawn.push({ x, z, r: 0.36 });
    }

    // B. 8 根罗马柱：柱础 + 带凹槽柱身（Lathe 收分）+ 柱头，沿半径 R-0.75 圆周
    const colR = R - 0.75;
    const colH = 3.4;
    const shaft = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.19, 0),
        new THREE.Vector2(0.21, 0.06),
        new THREE.Vector2(0.17, 0.18),
        new THREE.Vector2(0.155, 0.5),
        new THREE.Vector2(0.135, colH * 0.6),
        new THREE.Vector2(0.145, colH * 0.88),
        new THREE.Vector2(0.19, colH - 0.12),
      ],
      18,
    );
    const capGeo = this.mergeParts(
      [
        new THREE.CylinderGeometry(0.24, 0.19, 0.1, 16),
        new THREE.TorusGeometry(0.215, 0.045, 6, 18),
        new THREE.BoxGeometry(0.5, 0.08, 0.5),
      ].map((g, i) => {
        if (i === 1) g.translate(0, colH - 0.14, 0);
        else g.translate(0, colH - (i === 0 ? 0.1 : 0.02), 0);
        return g;
      }),
      "rotunda capital",
    );
    const baseGeo = new THREE.BoxGeometry(0.52, 0.1, 0.52);
    baseGeo.translate(0, 0.05, 0);
    const shaftInst = new THREE.InstancedMesh(shaft, whiteMat, 8);
    const capInst = new THREE.InstancedMesh(capGeo, whiteMat, 8);
    const baseInst = new THREE.InstancedMesh(baseGeo, marbleMat, 8);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * colR;
      const z = zc + Math.sin(a) * colR;
      dummy.position.set(x, deckY, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      shaftInst.setMatrixAt(i, dummy.matrix);
      capInst.setMatrixAt(i, dummy.matrix);
      baseInst.setMatrixAt(i, dummy.matrix);
      this.outdoorCircles.lawn.push({ x, z, r: 0.34 });
    }
    [shaftInst, capInst, baseInst].forEach((m) => {
      m.frustumCulled = false;
      m.instanceMatrix.needsUpdate = true;
      this.lawnGroup.add(m);
    });

    // C. 檐部：环形额枋 + 齿饰排 + 檐口盘
    const entH = 0.4;
    const entR = colR + 0.18;
    const entablature = new THREE.CylinderGeometry(entR, entR, entH, 48, 1, true);
    entablature.translate(0, deckY + colH + entH / 2, zc);
    const dentils = new THREE.CylinderGeometry(entR + 0.06, entR + 0.06, 0.14, 48, 1, true);
    dentils.translate(0, deckY + colH + entH + 0.07, zc);
    const cornice = new THREE.CylinderGeometry(entR + 0.16, entR + 0.1, 0.1, 48);
    cornice.translate(0, deckY + colH + entH + 0.19, zc);
    this.lawnGroup.add(
      new THREE.Mesh(this.mergeParts([entablature, dentils, cornice], "rotunda entablature"), whiteMat),
    );

    // D. 铁艺镂空穹顶：经向弧肋 + 纬向环 + 顶尖饰
    const domeR = entR - 0.02;
    const domeY = deckY + colH + entH + 0.24;
    const domeParts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ribPts: THREE.Vector3[] = [];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6;
        const el = (t * Math.PI) / 2;
        ribPts.push(new THREE.Vector3(Math.cos(a) * domeR * Math.cos(el), domeY + domeR * Math.sin(el), zc + Math.sin(a) * domeR * Math.cos(el)));
      }
      domeParts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ribPts), 10, 0.025, 5, false));
    }
    for (let k = 1; k <= 3; k++) {
      const el = (k / 4) * (Math.PI / 2);
      const ring = new THREE.TorusGeometry(domeR * Math.cos(el), 0.016, 5, 40);
      ring.rotateX(Math.PI / 2);
      ring.translate(0, domeY + domeR * Math.sin(el), zc);
      domeParts.push(ring);
    }
    const finial = new THREE.SphereGeometry(0.09, 10, 8);
    finial.translate(0, domeY + domeR + 0.05, zc);
    domeParts.push(finial);
    const finialSpike = new THREE.ConeGeometry(0.05, 0.16, 8);
    finialSpike.translate(0, domeY + domeR + 0.2, zc);
    domeParts.push(finialSpike);
    this.lawnGroup.add(new THREE.Mesh(this.mergeParts(domeParts, "rotunda dome"), ironMat));

    // E. 穹顶尖端花冠：一圈真实玫瑰模板花头（模板未就绪时用低模花头兜底）
    const crownSpots: THREE.Vector3[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      crownSpots.push(new THREE.Vector3(Math.cos(a) * 0.42, domeY + domeR + 0.1, zc + Math.sin(a) * 0.42));
    }
    crownSpots.push(new THREE.Vector3(0, domeY + domeR + 0.32, zc));

    // F. 台沿玻璃烛杯 12 只 + 假火焰（并入统一闪烁实例，无真实光源）
    const votiveGeo = new THREE.CylinderGeometry(0.05, 0.042, 0.1, 10, 1, true);
    votiveGeo.translate(0, 0.05, 0);
    const votives = new THREE.InstancedMesh(votiveGeo, this.vaseGlassMaterial("#f4fbfb", 0.28), 12);
    votives.frustumCulled = false;
    votives.renderOrder = 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = Math.cos(a) * (R - 0.28);
      const z = zc + Math.sin(a) * (R - 0.28);
      dummy.position.set(x, deckY, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      votives.setMatrixAt(i, dummy.matrix);
      this.lawnFlames.push({ x, y: deckY + 0.07, z, phase: Math.random() * Math.PI * 2, scale: 0.6 });
    }
    votives.instanceMatrix.needsUpdate = true;
    this.lawnGroup.add(votives);

    // G. 背景白纱：凉亭后方 5 幅前后错层的雪纺垂纱，微风持续朝观礼席方向吹拂
    const veilPanels = [
      { x: -2.25, z: 0.12, w: 1.5 },
      { x: -1.15, z: 0.0, w: 1.4 },
      { x: 0, z: -0.06, w: 2.6 },
      { x: 1.15, z: 0.0, w: 1.4 },
      { x: 2.25, z: 0.12, w: 1.5 },
    ];
    const veil = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1, 28, 40),
      this.chiffonMaterial({ opacity: 0.46, windDir: new THREE.Vector3(0.35, 0, -1), windStrength: 0.34, hangM: 2.7 }),
      veilPanels.length,
    );
    veil.frustumCulled = false;
    const vd = new THREE.Object3D();
    veilPanels.forEach((p, i) => {
      vd.position.set(p.x, domeY - 1.35, zc + 2.9 + p.z);
      vd.rotation.set(0, 0, 0);
      vd.scale.set(p.w, 2.7, 1);
      vd.updateMatrix();
      veil.setMatrixAt(i, vd.matrix);
    });
    veil.instanceMatrix.needsUpdate = true;
    this.lawnGroup.add(veil);

    // H. 平台地面花边：台沿内侧一圈程序化小花簇（贴近观礼视线）
    const edge = 16;
    const b: Floral = { roses: [], roseColors: [], hydrangeas: [], hydColors: [], leaves: [], leafColors: [] };
    for (let i = 0; i < edge; i++) {
      const a = (i / edge) * Math.PI * 2;
      const x = Math.cos(a) * (R - 0.5);
      const z = zc + Math.sin(a) * (R - 0.5);
      this.scatterFloral(b, x, deckY + 0.06, z, 0.3, 7, 0.85);
    }
    const edgeGroup = this.finalizeFloral(b);
    this.scene.remove(edgeGroup);
    this.lawnGroup.add(edgeGroup);

    // I. 花冠实例：优先真实玫瑰头，缺模板则程序化花头（挂到穹顶尖端下）
    this.lawnCrownSpots = crownSpots;
    this.buildLawnCrown(crownSpots);
  }

  /** 穹顶花冠：模板就绪用真实花头 + 叶片，否则程序化低模头（沿用实例色管线） */
  private buildLawnCrown(spots: THREE.Vector3[]) {
    const h0 = this.roseTemplates.head0;
    const h6 = this.roseTemplates.head6;
    const h5 = this.roseTemplates.head5;
    const leafTpl = this.roseTemplates.leaf;
    const up = new THREE.Vector3(0, 1, 0);
    const headMats: THREE.Matrix4[][] = [[], [], []];
    const headCols: THREE.Color[][] = [[], [], []];
    const leafMats: THREE.Matrix4[] = [];
    spots.forEach((c) => {
      for (let i = 0; i < 5; i++) {
        const p = c.clone().add(
          new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.24, (Math.random() - 0.5) * 0.3),
        );
        const dir = p.clone().sub(c).add(new THREE.Vector3(0, 0.4, 0));
        const r = Math.random();
        const hi = r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
        headMats[hi].push(
          new THREE.Matrix4().compose(
            p,
            this.floralDirQuat(dir, 0.5),
            new THREE.Vector3(1.3, 1.3, 1.3),
          ),
        );
        headCols[hi].push(this.lawnRoseTone());
      }
      const q = this.floralDirQuat(new THREE.Vector3(0.5, -1, 0.2), 0.7);
      leafMats.push(new THREE.Matrix4().compose(c.clone().add(new THREE.Vector3(0, -0.18, 0)), q, new THREE.Vector3(2.2, 2.2, 2.2)));
    });

    const addInst = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], cols?: THREE.Color[]) => {
      if (mats.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      mesh.frustumCulled = false;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      if (cols) {
        cols.forEach((c, i) => mesh.setColorAt(i, c));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.lawnGroup.add(mesh);
    };

    if (h0 && h6 && h5 && leafTpl) {
      const headMat = this.archHeadMaterial(h0.primitives[0].material);
      const leafMat = this.archLeafMaterial(leafTpl.primitives[0].material);
      if (headMat instanceof THREE.MeshStandardMaterial) this.applyFakeSun(headMat);
      if (leafMat instanceof THREE.MeshStandardMaterial) this.applyFakeSun(leafMat);
      [h0, h6, h5].forEach((tpl, i) => addInst(tpl.primitives[0].geometry, headMat, headMats[i], headCols[i]));
      addInst(leafTpl.primitives[0].geometry, leafMat, leafMats);
      return;
    }
    const b: Floral = { roses: [], roseColors: [], hydrangeas: [], hydColors: [], leaves: [], leafColors: [] };
    spots.forEach((c) => this.scatterFloral(b, c.x, c.y, c.z, 0.2, 6, 0.75));
    const g = this.finalizeFloral(b);
    this.scene.remove(g);
    this.lawnGroup.add(g);
  }

  /** 穹顶花冠延迟重试：真实模板异步就绪后替换程序化兜底（由 buildRoseDecor → retryLawnFloral 调用） */
  private lawnCrownSpots: THREE.Vector3[] | null = null;
  private lawnCrownReal = false;
  private retryLawnCrown() {
    if (!this.lawnBuilt || !this.lawnCrownSpots || this.lawnCrownReal) return;
    const h0 = this.roseTemplates.head0;
    if (!h0 || !this.roseTemplates.head6 || !this.roseTemplates.head5 || !this.roseTemplates.leaf) return;
    this.lawnCrownReal = true;
    this.buildLawnCrown(this.lawnCrownSpots);
  }

  /**
   * 草坪仪式走道：红毯花瓣地毯（z 44→52.6）+ 两侧白色 Chiavari 椅 5 排 +
   * 通道口 4 根花艺门柱 + 石板路两侧白玫瑰缘带 + 风灯 + 4 座照片画架。
   * 座椅几何与沙滩共用（主题中立），但全部实例与碰撞归 lawnGroup / lawn。
   */
  private buildLawnAisle() {
    const pathCurve = (z: number) => Math.sin((z - this.ARCH_Z) * 0.1) * 0.55;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    // A. 花瓣地毯：3 段过渡红毯，沿缓弯路撒双层花瓣
    // 不走透明排序：alphaToCoverage 借 MSAA 把镂空边缘抗锯齿，远处小花瓣不再闪烁
    const petalMat = new THREE.MeshStandardMaterial({
      map: this.reg(this.petalTexture()),
      alphaTest: 0.35,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
      roughness: 0.7,
      metalness: 0,
    });
    this.applyFakeSun(petalMat);
    const petalGeo = this.makeCuppedPetalGeometry();
    const petalCount = this.touchMode ? 700 : 1200;
    const petals = new THREE.InstancedMesh(petalGeo, petalMat, petalCount);
    petals.frustumCulled = false;
    let pp = 0;
    let guard = 0;
    while (pp < petalCount && guard++ < petalCount * 5) {
      const z = 45 + Math.random() * 7.6;
      const curve = pathCurve(z);
      const spread = 0.55 + Math.random() * 0.55;
      const x = curve + (Math.random() * 2 - 1) * spread;
      if (Math.abs(x - curve) > 1.15) continue;
      const y = this.lawnHeight(x, z) + 0.012;
      dummy.position.set(x, y, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      dummy.scale.setScalar(0.75 + Math.random() * 0.65);
      dummy.updateMatrix();
      petals.setMatrixAt(pp, dummy.matrix);
      color.set(this.redMixPetalTone());
      petals.setColorAt(pp, color);
      pp++;
    }
    petals.count = pp;
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
    petals.instanceMatrix.needsUpdate = true;
    this.lawnGroup.add(petals);

    // B. 白色座椅：5 排 × 每排 6 把，面朝舞台（+Z），沿弯路两侧布置
    const pewEnds: THREE.Matrix4[] = [];
    const frameMats: THREE.Matrix4[] = [];
    const cushionMats: THREE.Matrix4[] = [];
    const rows = [44.4, 45.5, 46.6, 47.7, 48.8];
    const X0 = 1.95;
    const DX = 0.58;
    rows.forEach((zBase) => {
      [1, -1].forEach((side) => {
        for (let i = 0; i < 6; i++) {
          const z = zBase;
          const x = side * (X0 + i * DX) + pathCurve(z) * (0.4 + 0.1 * (5 - i) / 5);
          const y = this.lawnHeight(x, z) - 0.03;
          // 椅子模型正面朝 -Z（室内舞台方向），草坪舞台在 +Z，需转 180°
          const m = this.makeColumn(x, y, z, Math.PI);
          frameMats.push(m);
          cushionMats.push(m);
          this.outdoorCircles.lawn.push({ x, z, r: 0.26 });
          if (i === 0) pewEnds.push(m);
        }
      });
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: "#f3ede0",
      metalness: 0.25,
      roughness: 0.45,
      envMapIntensity: 0.9,
    });
    this.applyFakeSun(frameMat);
    const cushionMat = new THREE.MeshStandardMaterial({ color: "#fbf8f3", roughness: 0.85, metalness: 0 });
    this.applyFakeSun(cushionMat);
    const frame = new THREE.InstancedMesh(this.makeChairFrameGeometry(), frameMat, frameMats.length);
    const cushion = new THREE.InstancedMesh(this.makeChairCushionGeometry(), cushionMat, cushionMats.length);
    frame.frustumCulled = false;
    cushion.frustumCulled = false;
    frameMats.forEach((m, i) => frame.setMatrixAt(i, m));
    cushionMats.forEach((m, i) => cushion.setMatrixAt(i, m));
    frame.instanceMatrix.needsUpdate = true;
    cushion.instanceMatrix.needsUpdate = true;
    this.lawnGroup.add(frame, cushion);

    // C. 椅背花饰（复用沙滩椅背管线：蝴蝶结 + 绿叶 + 飘纱）+ 花瓣过道延伸
    this.buildLawnPewDecor(pewEnds);

    // D. 通道口花艺门柱：两根白柱顶花团，z=43.6 分列弯路两侧
    const pillarMat = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.55, metalness: 0.02, envMapIntensity: 0.6 });
    this.applyFakeSun(pillarMat);
    const pillarParts: THREE.BufferGeometry[] = [];
    const pillarTops: { x: number; z: number }[] = [];
    [-1, 1].forEach((s) => {
      const x = s * 1.9 + pathCurve(43.6);
      const z = 43.6;
      const base = new THREE.CylinderGeometry(0.26, 0.3, 0.18, 14);
      base.translate(x, 0.09, z);
      pillarParts.push(base);
      const shaft = new THREE.CylinderGeometry(0.14, 0.16, 1.7, 14);
      shaft.translate(x, 1.03, z);
      pillarParts.push(shaft);
      const cap = new THREE.BoxGeometry(0.38, 0.1, 0.38);
      cap.translate(x, 1.93, z);
      pillarParts.push(cap);
      pillarTops.push({ x, z });
      this.outdoorCircles.lawn.push({ x, z, r: 0.32 });
    });
    this.lawnGroup.add(new THREE.Mesh(this.mergeParts(pillarParts, "lawn aisle pillars"), pillarMat));
    const floral: Floral = { roses: [], roseColors: [], hydrangeas: [], hydColors: [], leaves: [], leafColors: [] };
    pillarTops.forEach((t) => {
      this.scatterFloral(floral, t.x, 2.06, t.z, 0.3, 14, 0.95);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.pushLeaf(floral, t.x + Math.cos(a) * 0.18, 1.94, t.z + Math.sin(a) * 0.18, 1.1, Math.PI * 0.4, a, 0);
      }
    });
    const pillarFloralGroup = this.finalizeFloral(floral);
    this.scene.remove(pillarFloralGroup);
    this.lawnGroup.add(pillarFloralGroup);

    // E. 一路生花：门口 → 座椅区，小径两侧连续三层真实玫瑰花带（前矮后高，按段成片换色）
    this.lawnPathBankSpots = [];
    const bankPalette = ["#fdf8f3", "#f4c9d4", "#ef8fae", "#c8102e", "#f6b48f", "#f3e3c1", "#e75480", "#fbe3ea"];
    const lanternXZ: { x: number; z: number }[] = [];
    for (let z = 19.5; z <= 40.5; z += 3.0) {
      if (this.lawnPathArchZs.some((az) => Math.abs(az - z) < 2.0)) continue;
      const s = Math.round(z / 3) % 2 === 0 ? 1 : -1;
      lanternXZ.push({ x: s * 1.52 + pathCurve(z), z });
    }
    const bankRows = this.touchMode && !this.fullLawnFlowers
      ? [{ d: 1.52, hMin: 0.34, hMax: 0.46 }]
      : this.touchMode
        ? [{ d: 1.52, hMin: 0.32, hMax: 0.42 }, { d: 1.86, hMin: 0.48, hMax: 0.62 }]
      : [{ d: 1.5, hMin: 0.3, hMax: 0.4 }, { d: 1.8, hMin: 0.44, hMax: 0.58 }, { d: 2.1, hMin: 0.6, hMax: 0.78 }];
    const bankStep = this.touchMode && !this.fullLawnFlowers ? 0.52 : this.touchMode ? 0.36 : 0.22;
    [-1, 1].forEach((side) => {
      bankRows.forEach((row, ri) => {
        for (let z = this.ARCH_Z + 1.0 + ri * bankStep * 0.5; z <= 43.6; z += bankStep) {
          const jz = z + (Math.random() - 0.5) * bankStep * 0.6;
          const d = row.d + (Math.random() - 0.5) * 0.16;
          const x = side * d + pathCurve(jz);
          if (this.lawnPathArchZs.some((az) => Math.abs(jz - az) < 0.42 && d < 1.8)) continue;
          if (lanternXZ.some((l) => Math.hypot(l.x - x, l.z - jz) < 0.32)) continue;
          // 色块：每 ~1.6m 一段同色，两侧错开；10% 跳色增加自然感
          const band = Math.floor((jz + side * 3.7) / 1.6);
          const baseHex = bankPalette[(((band * 7919) % bankPalette.length) + bankPalette.length) % bankPalette.length];
          const hex = Math.random() < 0.1 ? bankPalette[Math.floor(Math.random() * bankPalette.length)] : baseHex;
          const color = new THREE.Color(hex).offsetHSL((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.08);
          this.lawnPathBankSpots.push({
            x,
            y: this.lawnHeight(x, jz),
            z: jz,
            color,
            len: row.hMin + Math.random() * (row.hMax - row.hMin),
          });
        }
      });
    });

    // E1. 石板路花瓣：门口一路撒到座椅区，与花瓣地毯相接（中间密两侧疏）
    const pathPetalCount = this.touchMode ? 900 : 2200;
    const pathPetals = new THREE.InstancedMesh(petalGeo, petalMat, pathPetalCount);
    pathPetals.frustumCulled = false;
    let qp = 0;
    let qGuard = 0;
    while (qp < pathPetalCount && qGuard++ < pathPetalCount * 5) {
      const z = this.ARCH_Z + 0.8 + Math.random() * (45 - this.ARCH_Z - 0.8);
      const curve = pathCurve(z);
      const off = (Math.random() + Math.random() - 1) * 1.2;
      const x = curve + off;
      if (Math.abs(off) > 1.25) continue;
      dummy.position.set(x, this.lawnHeight(x, z) + 0.012, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      dummy.scale.setScalar(0.75 + Math.random() * 0.65);
      dummy.updateMatrix();
      pathPetals.setMatrixAt(qp, dummy.matrix);
      color.set(this.redMixPetalTone());
      pathPetals.setColorAt(qp, color);
      qp++;
    }
    pathPetals.count = qp;
    if (pathPetals.instanceColor) pathPetals.instanceColor.needsUpdate = true;
    pathPetals.instanceMatrix.needsUpdate = true;
    this.lawnGroup.add(pathPetals);

    // E2. 白石花拱小径：5 座白玫瑰花拱门（z 21→41 均布）+ 石缘小灯交替 + 拱脚花瓣
    this.buildLawnPathArches(pathCurve);

    // F. 风灯：花瓣毯两侧 + 门口一对（火焰并入 lawnFlames 统一闪烁）
    const lanternSpots: { x: number; z: number }[] = [];
    [45.2, 46.4, 47.6, 48.8, 50.0].forEach((z) => {
      [-1, 1].forEach((s) => lanternSpots.push({ x: s * 1.62 + pathCurve(z), z }));
    });
    lanternSpots.push({ x: -2.1, z: 41 }, { x: 2.1, z: 41 });
    // 小径段（z 19~41）石缘灯：与拱门错开、左右交替
    for (let z = 19.5; z <= 40.5; z += 3.0) {
      if (this.lawnPathArchZs.some((az) => Math.abs(az - z) < 2.0)) continue;
      const s = Math.round(z / 3) % 2 === 0 ? 1 : -1;
      lanternSpots.push({ x: s * 1.52 + pathCurve(z), z });
    }
    const bodyParts: THREE.BufferGeometry[] = [];
    const post = (dx: number, dz: number) => {
      const g = new THREE.BoxGeometry(0.025, 0.42, 0.025);
      g.translate(dx, 0.21, dz);
      return g;
    };
    [
      [-0.1, -0.1],
      [0.1, -0.1],
      [-0.1, 0.1],
      [0.1, 0.1],
    ].forEach(([dx, dz]) => bodyParts.push(post(dx, dz)));
    [-1, 1].forEach((s) => {
      const top = new THREE.BoxGeometry(0.24, 0.025, 0.025);
      top.translate(0, 0.42, s * 0.1);
      bodyParts.push(top);
      const bottom = new THREE.BoxGeometry(0.24, 0.025, 0.025);
      bottom.translate(0, 0.02, s * 0.1);
      bodyParts.push(bottom);
      const side = new THREE.BoxGeometry(0.025, 0.025, 0.24);
      side.translate(s * 0.1, 0.42, 0);
      bodyParts.push(side);
      const sbottom = new THREE.BoxGeometry(0.025, 0.025, 0.24);
      sbottom.translate(s * 0.1, 0.02, 0);
      bodyParts.push(sbottom);
    });
    const candle = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10);
    candle.translate(0, 0.08, 0);
    bodyParts.push(candle);
    const bodyMat = new THREE.MeshStandardMaterial({ color: "#efe6d2", roughness: 0.7, metalness: 0.03 });
    this.applyFakeSun(bodyMat);
    const body = new THREE.InstancedMesh(this.mergeParts(bodyParts, "lawn lantern"), bodyMat, lanternSpots.length);
    body.frustumCulled = false;
    const glassGeo = new THREE.BoxGeometry(0.19, 0.36, 0.19);
    glassGeo.translate(0, 0.22, 0);
    const glass = new THREE.InstancedMesh(glassGeo, this.vaseGlassMaterial("#f4fbfb", 0.26), lanternSpots.length);
    glass.frustumCulled = false;
    glass.renderOrder = 2;
    lanternSpots.forEach((s, i) => {
      const y = this.lawnHeight(s.x, s.z);
      dummy.position.set(s.x, y, s.z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      glass.setMatrixAt(i, dummy.matrix);
      this.outdoorCircles.lawn.push({ x: s.x, z: s.z, r: 0.2 });
      this.lawnFlames.push({ x: s.x, y: y + 0.2, z: s.z, phase: Math.random() * Math.PI * 2, scale: 0.9 });
    });
    body.instanceMatrix.needsUpdate = true;
    glass.instanceMatrix.needsUpdate = true;
    this.lawnGroup.add(body, glass);

    // G. 火焰与光晕：均为加色 billboard（InstancedMesh），无任何真实光源
    const flamePos = new Float32Array(this.lawnFlames.length * 3);
    this.lawnFlames.forEach((f, i) => {
      flamePos[i * 3] = f.x;
      flamePos[i * 3 + 1] = f.y;
      flamePos[i * 3 + 2] = f.z;
    });
    const flameGeo = new THREE.SphereGeometry(0.02, 6, 5);
    flameGeo.scale(1, 1.9, 1);
    const flame = new THREE.InstancedMesh(
      flameGeo,
      new THREE.MeshBasicMaterial({ color: "#ffd9a2", toneMapped: false }),
      this.lawnFlames.length,
    );
    flame.frustumCulled = false;
    this.lawnFlameMesh = flame;

    const glowTex = this.getGlowTexture();
    const glowMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
      uniforms: { uMap: { value: glowTex } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 center = (modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec2 sz = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          gl_Position = projectionMatrix * vec4(center + vec3(position.xy * sz, 0.0), 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec2 vUv;
        void main() {
          float a = texture2D(uMap, vUv).a * 0.55;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0, 0.84, 0.63), a);
        }
      `,
    });
    const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glowMat, this.lawnFlames.length);
    glow.frustumCulled = false;
    glow.renderOrder = 3;
    this.lawnFlames.forEach((f, i) => {
      const gm = new THREE.Matrix4().compose(
        new THREE.Vector3(f.x, f.y, f.z),
        new THREE.Quaternion(),
        new THREE.Vector3(0.34, 0.34, 1),
      );
      glow.setMatrixAt(i, gm);
    });
    glow.instanceMatrix.needsUpdate = true;
    this.lawnGlowMesh = glow;
    this.lawnGroup.add(flame, glow);

    // H. 照片画架：舞台前两侧草地上各两座，朝向观礼席（复用 placeBeachEasels 的 instancing 模式）
    const stageSpots = [
      { x: -4.4, z: 51.5, dx: 0.4, dz: -0.9 },
      { x: -5.1, z: 53, dx: 0.4, dz: -0.9 },
      { x: 4.4, z: 51.5, dx: -0.4, dz: -0.9 },
      { x: 5.1, z: 53, dx: -0.4, dz: -0.9 },
    ];
    this.lawnPathEaselSpots = [];
    [18.6, 23.5, 28.5, 33.5, 38.5].forEach((z) => {
      [-1, 1].forEach((side) => {
        const x = side * 2.75 + pathCurve(z);
        const face = new THREE.Vector3(-side * 0.85, 0, -0.5).normalize();
        this.lawnPathEaselSpots.push({ x, z, dx: face.x, dz: face.z });
      });
    });
    this.placeLawnEasels([...stageSpots, ...this.lawnPathEaselSpots]);
  }

  /**
   * 白石花拱小径：5 座白玫瑰花拱门跨在缓弯小径上（z 21→41，净空高 2.35m/宽 2.5m），
   * 白色金属框 + 满覆白/绯玫瑰与垂绿，拱脚白石墩；拱下石面撒白/绯花瓣。
   * 拱门框体合并为单 InstancedMesh（1 draw call），花艺走 finalizeFloral 管线。
   */
  private buildLawnPathArches(pathCurve: (z: number) => number) {
    const archMat = new THREE.MeshStandardMaterial({
      color: "#f2ede2",
      roughness: 0.45,
      metalness: 0.3,
      envMapIntensity: 0.95,
    });
    this.applyFakeSun(archMat);
    const frame = new THREE.InstancedMesh(this.makeLawnArchGeometry(), archMat, this.lawnPathArchZs.length);
    frame.frustumCulled = false;

    const floral: Floral = { roses: [], roseColors: [], hydrangeas: [], hydColors: [], leaves: [], leafColors: [] };
    const dummy = new THREE.Object3D();
    const white = new THREE.Color("#fdf9f2");
    const blush = new THREE.Color("#f2c3ce");
    this.lawnPathArchZs.forEach((z0, i) => {
      const cx = pathCurve(z0);
      dummy.position.set(cx, this.lawnHeight(cx, z0) - 0.02, z0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      frame.setMatrixAt(i, dummy.matrix);
      // 拱脚白玫瑰簇 + 碰撞
      [-1.32, 1.32].forEach((px) => {
        const x = cx + px;
        const y = this.lawnHeight(x, z0);
        for (let k = 0; k < 9; k++) {
          const a = Math.random() * Math.PI * 2;
          const rr = Math.random() * 0.3;
          const jx = x + Math.cos(a) * rr;
          const jz = z0 + Math.sin(a) * rr;
          const c = Math.random() < 0.75 ? white : blush;
          this.pushRoseAt(floral, jx, y + 0.22 + Math.random() * 0.3, jz, 0.6 + Math.random() * 0.45, c.clone());
        }
        for (let k = 0; k < 4; k++) {
          this.pushLeaf(floral, x + (Math.random() - 0.5) * 0.5, y + 0.2, z0 + (Math.random() - 0.5) * 0.5, 1.0, Math.PI * (0.35 + Math.random() * 0.3), Math.random() * Math.PI * 2, 0);
        }
        this.outdoorCircles.lawn.push({ x, z: z0, r: 0.3 });
      });
      // 沿拱圈密布玫瑰（半圆 θ 0→π）：拱脚密、顶部稍疏但补垂绿
      const X = 1.32;
      const H = 2.23;
      const steps = 22;
      for (let s = 0; s <= steps; s++) {
        const theta = (s / steps) * Math.PI;
        const px = X * Math.cos(theta);
        const py = H + X * Math.sin(theta);
        const pz = z0 + (Math.random() - 0.5) * 0.14;
        const density = Math.abs(theta - Math.PI / 2) < 0.5 ? 2 : 3;
        for (let k = 0; k < density; k++) {
          const jx = (Math.random() - 0.5) * 0.15;
          const jy = (Math.random() - 0.5) * 0.15;
          if (Math.random() < 0.68) {
            const c = Math.random() < 0.7 ? white : blush;
            this.pushRoseAt(floral, cx + px + jx, py + jy, pz, 0.55 + Math.random() * 0.35, c.clone());
          } else {
            this.pushHydrangeaAt(floral, cx + px + jx, py + jy, pz, 0.62 + Math.random() * 0.35);
          }
        }
        // 垂绿：每隔一档在拱圈下挂 2~3 片叶
        if (s % 2 === 0) {
          const drop = 0.26 + Math.random() * 0.26;
          for (let k = 1; k <= 3; k++) {
            this.pushLeaf(floral, cx + px + (Math.random() - 0.5) * 0.07, py - (k * drop) / 3, pz + (Math.random() - 0.5) * 0.07, 0.85, Math.PI * (0.35 + Math.random() * 0.3), Math.random() * Math.PI * 2, 0);
          }
        }
      }
      // 拱下石面白/绯花瓣（进入拱门处的仪式感）
      const petalY = this.lawnHeight(cx, z0) + 0.012;
      const petalMat = new THREE.MeshStandardMaterial({
        map: this.reg(this.petalTexture()),
        transparent: true,
        alphaTest: 0.1,
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0,
      });
      this.applyFakeSun(petalMat);
      const pc = 14;
      const pm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.075), petalMat, pc);
      pm.frustumCulled = false;
      const color = new THREE.Color();
      for (let k = 0; k < pc; k++) {
        const x = cx + (Math.random() * 2 - 1) * 1.1;
        const z = z0 + (Math.random() * 2 - 1) * 1.1;
        dummy.position.set(x, this.lawnHeight(x, z) + 0.012, z);
        dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
        dummy.scale.setScalar(0.7 + Math.random() * 0.6);
        dummy.updateMatrix();
        pm.setMatrixAt(k, dummy.matrix);
        color.set(Math.random() < 0.6 ? "#fdf6f0" : "#f4dbe2");
        pm.setColorAt(k, color);
      }
      if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
      pm.instanceMatrix.needsUpdate = true;
      this.lawnGroup.add(pm);
    });
    frame.instanceMatrix.needsUpdate = true;
    this.lawnGroup.add(frame);
    const floralGroup = this.finalizeFloral(floral);
    this.scene.remove(floralGroup);
    this.lawnGroup.add(floralGroup);
  }

  /** 白玫瑰花拱门框：双柱 + 双层半圆拱圈（外 0.06/内 0.035 钢管），底部石墩，合并单几何（5 座共用） */
  private makeLawnArchGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const X = 1.32;
    const H = 2.23;
    [-X, X].forEach((px) => {
      const pier = new THREE.CylinderGeometry(0.13, 0.17, 0.3, 12);
      pier.translate(px, 0.15, 0);
      parts.push(pier);
      const post = new THREE.CylinderGeometry(0.045, 0.055, H - 0.28, 10);
      post.translate(px, 0.3 + (H - 0.28) / 2, 0);
      parts.push(post);
    });
    const arcOuter = new THREE.TorusGeometry(X, 0.055, 8, 44, Math.PI);
    arcOuter.translate(0, H, 0);
    parts.push(arcOuter);
    const arcInner = new THREE.TorusGeometry(X - 0.09, 0.034, 8, 40, Math.PI);
    arcInner.translate(0, H, 0);
    parts.push(arcInner);
    // 顶部装饰球
    const orb = new THREE.SphereGeometry(0.08, 10, 8);
    orb.translate(0, H + X + 0.02, 0);
    parts.push(orb);
    return this.mergeParts(parts, "lawn path arch");
  }

  /** 草坪椅背花饰：与沙滩版 buildBeachPewDecor 同款（蝴蝶结/绿叶/飘纱），仅目标组不同 */
  private buildLawnPewDecor(pewEnds: THREE.Matrix4[]) {
    if (pewEnds.length === 0) return;
    const bowMats: THREE.Matrix4[] = [];
    const leafMats: THREE.Matrix4[] = [];
    const veilMats: THREE.Matrix4[] = [];
    const local = (x: number, y: number, z: number, rx: number, ry: number, rz: number) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(1, 1, 1),
      );
    pewEnds.forEach((base) => {
      const aisle = base.elements[12] > 0 ? 1 : -1;
      bowMats.push(new THREE.Matrix4().multiplyMatrices(base, local(aisle * 0.19, 0.72, 0.25, 0, 0, 0)));
      veilMats.push(new THREE.Matrix4().multiplyMatrices(base, local(aisle * 0.1, 0.84, 0.235, 0.05, 0, 0)));
      for (let k = 0; k < 2; k++) {
        leafMats.push(
          new THREE.Matrix4().multiplyMatrices(
            base,
            local(aisle * 0.19 + (k === 0 ? -0.05 : 0.05), 0.7, 0.245, 0.3, 0, k === 0 ? 1.1 : -1.1),
          ),
        );
      }
    });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[]) => {
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      mesh.frustumCulled = false;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      this.lawnGroup.add(mesh);
    };
    const bowMat = new THREE.MeshStandardMaterial({
      color: "#f6efe2",
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.applyFakeSun(bowMat);
    const leafMat = new THREE.MeshStandardMaterial({
      color: "#7fa06e",
      roughness: 0.55,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.applyFakeSun(leafMat);
    add(this.makeChairBowGeometry(), bowMat, bowMats);
    add(this.makeChairLeafGeometry(), leafMat, leafMats);
    add(this.makeChairVeilGeometry(), this.veilWindMaterial(0.72), veilMats);
  }

  /** 草坪照片画架：与 placeBeachEasels 同构，落地 y 取草甸高度、实例归 lawnGroup */
  private placeLawnEasels(spots: { x: number; z: number; dx: number; dz: number }[]) {
    const photos = this.opts.photos;
    const S = 1.45;
    const easelMat = new THREE.MeshStandardMaterial({
      color: "#e3c995",
      metalness: 0.65,
      roughness: 0.33,
      envMapIntensity: 1.1,
    });
    this.applyFakeSun(easelMat);
    const frameMat = new THREE.MeshStandardMaterial({
      color: "#cfae72",
      metalness: 0.75,
      roughness: 0.3,
      envMapIntensity: 1.2,
    });
    this.applyFakeSun(frameMat);
    const boardMat = new THREE.MeshBasicMaterial({ color: "#ebe5dc" });

    const easel = new THREE.InstancedMesh(this.makeEaselGeometry(), easelMat, spots.length);
    const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.05), frameMat, spots.length);
    const board = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), boardMat, spots.length);

    const ledgeTop = (0.6 + 0.0175) * S;
    const local = new THREE.Matrix4();
    const tilt = new THREE.Matrix4().makeRotationX(-0.1);
    const world = new THREE.Matrix4();
    const scaled = new THREE.Matrix4();
    const sz = new THREE.Matrix4();
    const p = new THREE.Vector3();

    spots.forEach((sp, i) => {
      const y = this.lawnHeight(sp.x, sp.z) - 0.02;
      const ry = Math.atan2(sp.dx, sp.dz);
      const baseM = this.makeColumn(sp.x, y, sp.z, ry, S);
      easel.setMatrixAt(i, baseM);
      const rootM = this.makeColumn(sp.x, y, sp.z, ry, 1);

      const at = (lx: number, ly: number, lz: number) =>
        world.copy(rootM).multiply(local.makeTranslation(lx, ly, lz)).multiply(tilt);
      const slotId = this.easelSlotId("草坪", spots, i);
      const wp = this.photoForSlot(slotId);
      const { pw, ph, fw, fh } = this.easelFrameSize(wp);
      const cy = ledgeTop + fh / 2;
      frame.setMatrixAt(i, scaled.copy(at(0, cy, 0.06)).multiply(sz.makeScale(fw, fh, 1)));
      board.setMatrixAt(i, scaled.copy(at(0, cy, 0.087)).multiply(sz.makeScale(fw - 0.08, fh - 0.08, 1)));

      const photoMat = this.makePhotoMaterial();
      // 精修照片按原比例、画框跟着横竖变形；没有时回退到配置照片并裁切铺满
      const src = wp?.src ?? (photos.length > 0 ? photos[i % photos.length].src : "");
      const key = src ? this.usePhoto(photoMat, wp, src, pw / ph) : "";
      const photo = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), photoMat);
      photo.matrixAutoUpdate = false;
      photo.matrix.copy(at(0, cy, 0.09));
      this.lawnGroup.add(photo);
      this.photoTargets.push({ mesh: photo, w: pw, h: ph, zone: "lawn", key });
      this.slotTag(slotId, new THREE.Vector3().setFromMatrixPosition(at(0, ledgeTop + fh + 0.35, 0.1)), this.lawnGroup);

      const footTones = ["#fdf8f3", "#f4c9d4", "#ef8fae"];
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.random() * 0.5;
        const r = 0.12 + Math.random() * 0.2;
        p.set(Math.cos(a) * r * 1.3, 0, 0.42 + Math.sin(a) * r * 0.7).applyMatrix4(rootM);
        this.lawnPathBankSpots.push({
          x: p.x,
          y: this.lawnHeight(p.x, p.z),
          z: p.z,
          color: new THREE.Color(footTones[k % footTones.length]).offsetHSL(0, 0, (Math.random() - 0.5) * 0.08),
          len: 0.34 + Math.random() * 0.2,
        });
      }
      this.outdoorCircles.lawn.push({ x: sp.x, z: sp.z, r: 0.55 });
    });
    for (const mesh of [easel, frame, board]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      this.lawnGroup.add(mesh);
    }
  }

  // ── 草坪：森林树环（baked impostor）──────────────────────────
  /**
   * 树 = 全模烘焙的 8 方位 impostor atlas：每物种 1 个 InstancedMesh × 2 tri，
   * 顶点着色器做圆柱 billboard（绕 Y 面向相机），fragment 按视线方位混合相邻两帧，
   * 加假太阳（法线近似=上/外混合）+ 落日逆光 + 顶部风摆。树成本 ≈ 2 tri/棵。
   */
  private readonly TREE_SPECIES: {
    key: string;
    atlas: string;
    /** 渲染时的树高（米），atlas 帧 = 全树正交投影 */
    h: number;
    /** 帧宽/树高比（渲染正交框 META，帧内像素 → 米换算用） */
    aspect: number;
    /**
     * 逐帧树根高度：树根像素行距帧底的占比（帧 0..7，按 atlas alpha 实测）。
     * 烘焙图底部留有透明边（i02/jac 达 1~1.6m），不补偿树会悬在半空。
     */
    baseV: number[];
    /** 逐帧树干水平中心（帧宽占比，按帧底树干 alpha 实测）；各方位帧树干位置不同，单值会导致绕行时漂移 */
    trunkU: number[];
    weight: number;
  }[] = [
    {
      key: "i01", atlas: "/textures/lawn/tree_i01.webp", h: 11.0, aspect: 1.08, weight: 0.2,
      baseV: [0.0312, 0.0286, 0.0365, 0.0365, 0.0339, 0.0365, 0.0286, 0.0339],
      trunkU: [0.5273, 0.5208, 0.4909, 0.5234, 0.4688, 0.4766, 0.5052, 0.474],
    },
    {
      key: "i02", atlas: "/textures/lawn/tree_i02.webp", h: 10.5, aspect: 1.334, weight: 0.18,
      baseV: [0.1198, 0.1354, 0.0964, 0.1042, 0.1198, 0.1042, 0.1432, 0.138],
      trunkU: [0.3034, 0.3398, 0.5169, 0.3633, 0.6927, 0.6576, 0.4805, 0.6341],
    },
    {
      key: "jac", atlas: "/textures/lawn/tree_jac.webp", h: 12.0, aspect: 1.355, weight: 0.14,
      baseV: [0.1328, 0.1328, 0.1276, 0.1302, 0.125, 0.1302, 0.1302, 0.1276],
      trunkU: [0.4987, 0.5104, 0.4688, 0.4805, 0.4987, 0.487, 0.5286, 0.5169],
    },
    {
      key: "ts02", atlas: "/textures/lawn/tree_ts02.webp", h: 9.0, aspect: 1.08, weight: 0.14,
      baseV: [0.0365, 0.0495, 0.0208, 0.0234, 0.0417, 0.0286, 0.0573, 0.0547],
      trunkU: [0.3424, 0.3659, 0.5286, 0.4089, 0.6549, 0.6289, 0.4688, 0.5885],
    },
    {
      key: "alnus01", atlas: "/textures/lawn/maxtree/tree_alnus_01.webp", h: 10.596, aspect: 1.0, weight: 0.17,
      baseV: [0, 0, 0, 0, 0, 0, 0, 0],
      trunkU: [0.5107, 0.5137, 0.5059, 0.498, 0.4873, 0.4844, 0.4922, 0.5],
    },
    {
      key: "alnus02", atlas: "/textures/lawn/maxtree/tree_alnus_02.webp", h: 15.295, aspect: 1.0, weight: 0.17,
      baseV: [0, 0, 0, 0, 0, 0, 0, 0],
      trunkU: [0.5078, 0.5098, 0.5039, 0.4961, 0.4902, 0.4893, 0.4941, 0.502],
    },
  ];
  private treesReady = false;
  private fallbackTreeGroup: THREE.Group | null = null;
  private readonly imposterTextures = new Map<string, THREE.Texture>();

  /** Maxtree 灌木 impostor（同树的 8 帧 2×4 atlas）；plantH = 帧内植株实高（米），用于按目标株高缩放 */
  private readonly SHRUB_SPECIES: {
    key: string;
    atlas: string;
    h: number;
    aspect: number;
    plantH: number;
    baseV: number[];
    trunkU: number[];
  }[] = [
    {
      key: "abelia", atlas: "/textures/lawn/maxtree/shrub_abelia_01.webp", h: 2.461, aspect: 1.0, plantH: 1.69,
      baseV: [0, 0, 0, 0, 0, 0, 0, 0],
      trunkU: [0.501, 0.4893, 0.4922, 0.4961, 0.4971, 0.5078, 0.5059, 0.502],
    },
    {
      key: "cistus", atlas: "/textures/lawn/maxtree/shrub_cistus_01.webp", h: 1.797, aspect: 1.0, plantH: 1.36,
      baseV: [0, 0, 0, 0, 0, 0, 0, 0],
      trunkU: [0.4883, 0.4883, 0.4922, 0.502, 0.5098, 0.5098, 0.5059, 0.4961],
    },
  ];
  private shrubSpots: { species: number; x: number; z: number; plantH: number }[] = [];
  /** 小径两侧画架位置（灌木绿篱需避让） */
  private lawnPathEaselSpots: { x: number; z: number; dx: number; dz: number }[] = [];

  /** 灌木摆点：小径外侧六道木绿篱 + 花拱两侧岩蔷薇棒棒糖 + 草甸边缘灌丛 + 凉亭背后绿屏 */
  private collectShrubSpots(): { species: number; x: number; z: number; plantH: number }[] {
    let seed = 20260926;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      return ((seed >>> 0) % 100000) / 100000;
    };
    const ABELIA = 0;
    const CISTUS = 1;
    const pathCurve = (z: number) => Math.sin((z - this.ARCH_Z) * 0.1) * 0.55;
    const spots: { species: number; x: number; z: number; plantH: number }[] = [];
    const clear = (x: number, z: number) => {
      if (z < this.ARCH_Z + 3) return false;
      if (Math.hypot(x, z - this.LAWN_STAGE_Z) < this.LAWN_PLATFORM_R + 1.6) return false;
      if (Math.abs(x) < 7 && z > 42.5 && z < 54.5) return false;
      if (Math.abs(Math.abs(x) - 4.7) < 1.4 && z < this.ARCH_Z + 4) return false;
      if (this.lawnPathEaselSpots.some((e) => Math.hypot(e.x - x, e.z - z) < 1.4)) return false;
      return !spots.some((s) => Math.hypot(s.x - x, s.z - z) < 1.1);
    };
    const add = (species: number, x: number, z: number, plantH: number) => {
      if (clear(x, z)) spots.push({ species, x, z, plantH });
    };

    for (let z = this.ARCH_Z + 4; z <= 41.5; z += 2.6) {
      [-1, 1].forEach((side) => {
        const jz = z + (rnd() - 0.5) * 0.8;
        add(ABELIA, side * (3.0 + rnd() * 0.4) + pathCurve(jz), jz, 0.95 + rnd() * 0.35);
      });
    }
    this.lawnPathArchZs.forEach((az) => {
      [-1, 1].forEach((side) => add(CISTUS, side * 2.6 + pathCurve(az), az, 1.25 + rnd() * 0.2));
    });

    const edgeClusters = this.touchMode ? 16 : 30;
    for (let i = 0; i < edgeClusters; i++) {
      const a = (i / edgeClusters) * Math.PI + (rnd() - 0.5) * 0.08;
      const d = 0.8 + rnd() * 0.14;
      const cx = Math.cos(a) * this.LAWN_WALK_R * d;
      const cz = this.ARCH_Z + Math.sin(a) * (this.LAWN_WALK_Z - this.ARCH_Z) * d;
      if (Math.abs(cx - pathCurve(cz)) < 5) continue;
      const n = 2 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        add(ABELIA, cx + (rnd() - 0.5) * 2.4, cz + (rnd() - 0.5) * 2.4, 1.0 + rnd() * 0.6);
      }
    }

    const backR = this.LAWN_PLATFORM_R + 2.4;
    for (let deg = 18; deg <= 162; deg += 16) {
      const a = (deg * Math.PI) / 180;
      spots.push({
        species: ABELIA,
        x: Math.cos(a) * backR,
        z: this.LAWN_STAGE_Z + Math.sin(a) * backR,
        plantH: 1.35 + rnd() * 0.3,
      });
    }
    return spots;
  }

  private buildImpostorShrubs() {
    this.SHRUB_SPECIES.forEach((sp, si) => {
      const list = this.shrubSpots.filter((s) => s.species === si);
      const tex = this.imposterTextures.get(sp.key);
      if (list.length === 0 || !tex) return;
      const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.makeImpostorMaterial(tex, sp), list.length);
      mesh.frustumCulled = false;
      mesh.userData.noAutoCull = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      const c = new THREE.Color();
      list.forEach((s, i) => {
        const k = s.plantH / sp.plantH;
        pos.set(s.x, this.treeRootY(s.x, s.z, 0.05 * k, 0.3), s.z);
        scl.setScalar(k);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        c.setScalar(0.9 + ((i * 37) % 17) / 100);
        mesh.setColorAt(i, c);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.lawnGroup.add(mesh);
    });
  }

  private buildLawnTrees() {
    const spots = this.collectTreeSpots();
    // 碰撞圈只登记一次（impostor 与 fallback 共用同一列表；重建不重推）
    spots.forEach((s) => this.outdoorCircles.lawn.push({ x: s.x, z: s.z, r: 0.55 }));
    this.shrubSpots = this.collectShrubSpots();
    this.shrubSpots.forEach((s) => this.outdoorCircles.lawn.push({ x: s.x, z: s.z, r: s.species === 0 ? 0.5 : 0.25 }));
    this.buildContactShadows([
      ...spots.map((s) => ({ x: s.x, z: s.z, r: 1.1 + s.h * 0.1 })),
      ...this.shrubSpots.map((s) => ({ x: s.x, z: s.z, r: s.species === 0 ? 0.75 * s.plantH : 0.55 })),
    ]);

    if (this.treesReady) {
      this.buildImpostorTrees(spots);
      this.buildImpostorShrubs();
      return;
    }
    // 加载期兜底：低模程序化树（atlas 就绪后整体替换），避免空窗期裸地
    const fallback = new THREE.Group();
    this.fallbackTreeGroup = fallback;
    const canopyTex = this.reg(this.makeCanopyTexture());
    const canopyGeoPine = this.makePineCanopyGeometry();
    const canopyGeoBroad = this.makeBroadCanopyGeometry();
    const trunkGeoPine = this.makeTrunkGeometry(0.16, 0.1);
    const trunkGeoBroad = this.makeTrunkGeometry(0.24, 0.16);
    const canopyMat = () => {
      const mat = new THREE.MeshStandardMaterial({
        map: canopyTex,
        color: "#ffffff",
        alphaTest: 0.42,
        side: THREE.DoubleSide,
        roughness: 0.92,
        metalness: 0,
      });
      this.applyFakeSun(mat);
      const fakeSunHook = mat.onBeforeCompile as ((shader: THREE.WebGLProgramParametersWithUniforms) => void) | null;
      mat.onBeforeCompile = (shader) => {
        fakeSunHook?.(shader);
        shader.uniforms.uTime = this.windUniform;
        shader.uniforms.uTreeH = { value: 4.2 };
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
            uniform float uTime;
            uniform float uTreeH;`,
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            {
              float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
              float up = clamp(position.y / uTreeH, 0.0, 1.0);
              float gust = sin(uTime * 0.75 + ph * 6.2831) * 0.6 + sin(uTime * 1.6 + ph * 4.1) * 0.4;
              transformed.x += gust * up * up * 0.24;
              transformed.z += gust * up * up * 0.14;
            }`,
          );
      };
      return mat;
    };
    const pineMat = canopyMat();
    const broadMat = canopyMat();
    const trunkMat = new THREE.MeshStandardMaterial({ color: "#5d4a38", roughness: 0.95, metalness: 0 });
    this.applyFakeSun(trunkMat);
    const treeRand = (() => {
      let seed = 20261110;
      return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return ((seed >>> 0) % 100000) / 100000;
      };
    })();
    const pineTones = ["#2f4d33", "#38593a", "#42603c", "#2c4630"];
    const broadTones = ["#4a6b35", "#57783b", "#647f45", "#3e5c33", "#6d8a4d"];
    const buildInst = (kind: "pine" | "broad" | "trunkPine" | "trunkBroad") => {
      const list = spots.filter((s) =>
        kind === "trunkPine" ? s.kind === "pine" : kind === "trunkBroad" ? s.kind === "broad" : true,
      );
      const useGeo =
        kind === "pine" ? canopyGeoPine : kind === "broad" ? canopyGeoBroad : kind === "trunkPine" ? trunkGeoPine : trunkGeoBroad;
      const useMat = kind === "pine" ? pineMat : kind === "broad" ? broadMat : trunkMat;
      const mesh = new THREE.InstancedMesh(useGeo, useMat, list.length);
      mesh.frustumCulled = false;
      const d = new THREE.Object3D();
      const c = new THREE.Color();
      list.forEach((s, i) => {
        const baseY = this.lawnTerrainY(s.x, s.z) - 0.15;
        d.position.set(s.x, baseY, s.z);
        d.rotation.set(0, treeRand() * Math.PI * 2, (treeRand() - 0.5) * 0.05);
        const sc = s.h / 6.4;
        d.scale.set(sc, sc, sc);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        if (kind === "pine" || kind === "broad") {
          const tones = kind === "pine" ? pineTones : broadTones;
          c.set(tones[Math.floor(treeRand() * tones.length)]);
          c.offsetHSL((treeRand() - 0.5) * 0.02, 0, (treeRand() - 0.5) * 0.06);
          mesh.setColorAt(i, c);
        }
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      fallback.add(mesh);
    };
    buildInst("pine");
    buildInst("broad");
    buildInst("trunkPine");
    buildInst("trunkBroad");
    this.lawnGroup.add(fallback);
    // atlas 纹理并行加载：全部就绪后无缝替换兜底
    this.loadImpostorAtlases();
  }

  /** 4 张物种 atlas 并行加载；就绪后重建为 impostor 实例（dispose-safe） */
  private loadImpostorAtlases() {
    const loader = new THREE.TextureLoader();
    const atlases = [...this.TREE_SPECIES, ...this.SHRUB_SPECIES];
    let pending = atlases.length;
    const done = () => {
      pending -= 1;
      if (pending === 0 && !this.disposed) {
        this.treesReady = true;
        if (this.fallbackTreeGroup) {
          this.lawnGroup.remove(this.fallbackTreeGroup);
          this.disposeObject(this.fallbackTreeGroup);
          this.fallbackTreeGroup = null;
        }
        this.buildImpostorTrees(this.collectTreeSpots());
        this.buildImpostorShrubs();
      }
    };
    atlases.forEach((sp) => {
      loader.load(
        sp.atlas,
        (tex) => {
          if (this.disposed) {
            tex.dispose();
            done();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
          this.reg(tex);
          this.imposterTextures.set(sp.key, tex);
          done();
        },
        undefined,
        () => {
          console.info(`[WeddingGallery] 树 atlas ${sp.atlas} 加载失败，保留程序化树`);
          done();
        },
      );
    });
  }

  /** impostor 材质：圆柱 billboard + 逐帧树干/树根锚点对齐 + 双帧混合 + 假太阳（树与灌木共用） */
  private makeImpostorMaterial(
    tex: THREE.Texture,
    sp: { h: number; aspect: number; baseV: number[]; trunkU: number[] },
  ): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      transparent: false,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.4,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniform;
      shader.uniforms.uSunDir = { value: this.SUN_DIR };
      shader.uniforms.uSunColor = { value: this.SUN_COLOR };
      shader.uniforms.uSunIntensity = this.sunIntensityU;
      shader.uniforms.uAtlasH = { value: sp.h };
      shader.uniforms.uAspect = { value: sp.aspect };
      shader.uniforms.uBaseV = { value: sp.baseV };
      shader.uniforms.uTrunkU = { value: sp.trunkU };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          uniform vec3 uSunDir;
          uniform float uAtlasH;
          uniform float uAspect;
          uniform float uBaseV[8];
          uniform float uTrunkU[8];
          varying vec2 vImpUv;
          varying float vFrameIdx;
          varying float vFrameMix;
          varying vec4 vAnchor;
          varying float vBacklit;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            // 圆柱 billboard：把 quad 顶点绕实例 Y 轴旋到面向相机的水平方位角
            vec3 base = instanceMatrix[3].xyz;
            vec2 toCam = cameraPosition.xz - base.xz;
            float az = atan(toCam.x, toCam.y);
            float ca = cos(az);
            float sa = sin(az);
            // 双帧：视线方位 → 8 帧序号；vertex 传绝对帧号 + 帧内插值系数
            float frameF = fract((az + 3.14159265) / 6.2831853) * 8.0;
              float frameIdx = floor(frameF);
              vFrameIdx = frameIdx;
              vFrameMix = frameF - frameIdx;
              int fA = int(frameIdx);
              int fB = int(mod(frameIdx + 1.0, 8.0));
            // 逐帧锚点（树干列 u、树根行 v）：两帧都以「树干轴 + 树根」对齐到实例原点
            vAnchor = vec4(uTrunkU[fA], uBaseV[fA], uTrunkU[fB], uBaseV[fB]);
            // quad 覆盖两帧对齐后的并集：px 相对树干轴（米），py 相对树根（米）
            float frameW = uAtlasH * uAspect;
            float pxMin = -max(vAnchor.x, vAnchor.z) * frameW;
            float pxMax = (1.0 - min(vAnchor.x, vAnchor.z)) * frameW;
            float px = mix(pxMin, pxMax, uv.x);
            float py = uv.y * (1.0 - min(vAnchor.y, vAnchor.w)) * uAtlasH;
            float hN = py / uAtlasH;
            // 风摆：顶部位移叠加在 billboard 横向上（树根不动）
            float ph = fract(sin(dot(base.xz, vec2(12.9898, 78.233))) * 43758.5453);
            float gust = sin(uTime * 0.7 + ph * 6.2831) * 0.6 + sin(uTime * 1.5 + ph * 4.1) * 0.4;
            float sway = gust * hN * hN * uAtlasH * 0.012;
            vImpUv = vec2(px, py);
            vec3 local;
            local.x = px * ca - sway * sa;
            local.z = -px * sa - sway * ca;
            local.y = py;
            transformed = local;
            // 逆光量：视线与落日反向程度
            vec3 viewDir = normalize(cameraPosition - base);
            vBacklit = pow(clamp(dot(viewDir, -normalize(uSunDir)), 0.0, 1.0), 3.0);
          }`,
        )
        .replace(
          "#include <project_vertex>",
          `vec4 mvPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
          #endif
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec2 vImpUv;
          varying float vFrameIdx;
          varying float vFrameMix;
          varying vec4 vAnchor;
          varying float vBacklit;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunIntensity;
          uniform float uAtlasH;
          uniform float uAspect;
          // atlas 帧采样：双列 × 4 行，frameIdx 0..7，inFrame 为帧内 [0,1]²；帧外返回全透明（防串到邻帧）
          vec4 sampleFrame(sampler2D t, float frameIdx, vec2 inFrame) {
            if (inFrame.x < 0.002 || inFrame.x > 0.998 || inFrame.y < 0.0 || inFrame.y > 0.998) return vec4(0.0);
            vec2 uv = vec2(
              inFrame.x * 0.5 + mod(frameIdx, 2.0) * 0.5,
              inFrame.y * 0.25 + floor(frameIdx / 2.0) * 0.25
            );
            return texture2D(t, uv);
          }`,
        )
        .replace(
          "#include <map_fragment>",
          `{
            // 米 → 各帧帧内坐标：以该帧自己的树干列/树根行为原点
            vec2 metres = vImpUv / vec2(uAtlasH * uAspect, uAtlasH);
            float f1 = mod(vFrameIdx + 1.0, 8.0);
            vec4 cA = sampleFrame(map, vFrameIdx, metres + vAnchor.xy);
            vec4 cB = sampleFrame(map, f1, metres + vAnchor.zw);
            diffuseColor = mix(cA, cB, vFrameMix);
          }`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          {
            // 实例亮度抖动（instanceColor 白色 ±10%）
            #ifdef USE_INSTANCING_COLOR
              diffuseColor.rgb *= instanceColor;
            #endif
          }`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            // 假太阳：法线用「朝向相机略偏上」的伪法线 + wrap 漫反射（避免 quad 死黑）
            vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            vec3 fakeN = normalize(normal + vec3(0.0, 0.6, 0.0));
            float wrap = clamp((dot(fakeN, sunView) + 0.4) / 1.4, 0.0, 1.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * (0.35 + 0.65 * wrap);
            // 落日逆光：看向太阳一侧时树冠透金
            reflectedLight.directDiffuse += diffuseColor.rgb * vec3(1.0, 0.62, 0.2) * vBacklit * 0.55;
          }`,
        );
    };
    return mat;
  }

  /** impostor 实例化：每物种 1 个 InstancedMesh（quad），顶点圆柱 billboard + 双帧混合 */
  private buildImpostorTrees(spots: { x: number; z: number; kind: "pine" | "broad"; h: number }[]) {
    const treeRand = (() => {
      let seed = 20261110;
      return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return ((seed >>> 0) % 100000) / 100000;
      };
    })();
    // 确定性物种分派（按 weight 加权轮转）
    const bag: number[] = [];
    this.TREE_SPECIES.forEach((sp, si) => {
      for (let k = 0; k < Math.round(sp.weight * 100); k++) bag.push(si);
    });
    const buckets = this.TREE_SPECIES.map(() => [] as { x: number; z: number; h: number; yaw: number; tint: number }[]);
    spots.forEach((s) => {
      const si = bag[Math.floor(treeRand() * bag.length)];
      buckets[si].push({ x: s.x, z: s.z, h: s.h, yaw: treeRand() * Math.PI * 2, tint: 0.9 + treeRand() * 0.18 });
    });

    this.TREE_SPECIES.forEach((sp, si) => {
      const list = buckets[si];
      if (list.length === 0) return;
      // atlas 纹理由 loadImpostorAtlases 统一加载并 reg；这里从 textures 池取回（按 uuid 匹配省去重复请求）
      const tex = this.imposterTextures.get(sp.key);
      if (!tex) return;
      const mat = this.makeImpostorMaterial(tex, sp);
      const quad = new THREE.PlaneGeometry(1, 1);
      quad.translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(quad, mat, list.length);
      mesh.frustumCulled = false;
      mesh.userData.noAutoCull = true;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      const c = new THREE.Color();
      list.forEach((s, i) => {
        q.identity();
        pos.set(s.x, this.treeRootY(s.x, s.z, 0.3 * (s.h / sp.h)), s.z);
        // shader 已按物种渲染尺寸（米）铺 quad，实例只做等比缩放到本棵树高
        scl.setScalar(s.h / sp.h);
        m.compose(pos, q, scl);
        mesh.setMatrixAt(i, m);
        c.setScalar(s.tint);
        mesh.setColorAt(i, c);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.lawnGroup.add(mesh);
    });
  }

  /** 树根落点：取树干周边最低地面再按缩放下沉，坡地上树根不会在低侧露空 */
  private treeRootY(x: number, z: number, sink = 0.25, R = 0.45): number {
    return (
      Math.min(
        this.lawnTerrainY(x, z),
        this.lawnTerrainY(x + R, z),
        this.lawnTerrainY(x - R, z),
        this.lawnTerrainY(x, z + R),
        this.lawnTerrainY(x, z - R),
      ) - sink
    );
  }

  /** 树/灌木根部接触阴影：贴地法线对齐的径向暗斑（无实时阴影时最关键的「落地」线索） */
  private buildContactShadows(spots: { x: number; z: number; r: number }[]) {
    const tex = this.reg(
      this.makeCanvasTexture((ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grd.addColorStop(0, "rgba(0,0,0,0.62)");
        grd.addColorStop(0.3, "rgba(0,0,0,0.4)");
        grd.addColorStop(0.7, "rgba(0,0,0,0.12)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }, 64, 64),
    );
    const mat = new THREE.MeshBasicMaterial({
      color: "#1a2410",
      alphaMap: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const disc = new THREE.CircleGeometry(1, 20);
    disc.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(disc, mat, spots.length);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const E = 0.5;
    spots.forEach((s, i) => {
      n.set(
        this.lawnTerrainY(s.x - E, s.z) - this.lawnTerrainY(s.x + E, s.z),
        2 * E,
        this.lawnTerrainY(s.x, s.z - E) - this.lawnTerrainY(s.x, s.z + E),
      ).normalize();
      q.setFromUnitVectors(up, n);
      pos.set(s.x, this.lawnTerrainY(s.x, s.z) + 0.03, s.z);
      scl.set(s.r, 1, s.r);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.lawnGroup.add(mesh);
  }

  /** 确定性树摆点：环形 4 圈 + 近景特征树，按「离门口/凉亭距离」截断到上限（impostor 成本低可铺满） */
  private collectTreeSpots(): { x: number; z: number; kind: "pine" | "broad"; h: number }[] {
    const CAP = this.touchMode ? 60 : 130;
    const treeRand = (() => {
      let seed = 20261110;
      return () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        return ((seed >>> 0) % 100000) / 100000;
      };
    })();
    const spots: { x: number; z: number; kind: "pine" | "broad"; h: number }[] = [];
    const pathCurve = (z: number) => Math.sin((z - this.ARCH_Z) * 0.1) * 0.55;
    const tryPush = (x: number, z: number, kind: "pine" | "broad") => {
      if (Math.abs(x - pathCurve(z)) < 4.6) return;
      if (Math.hypot(x, z - this.LAWN_STAGE_Z) < 9.5) return;
      if (Math.abs(x - 4.7) < 2.4 && z < this.ARCH_Z + 5) return;
      if (Math.abs(x + 4.7) < 2.4 && z < this.ARCH_Z + 5) return;
      spots.push({ x, z, kind, h: kind === "pine" ? 9 + treeRand() * 4.5 : 7.5 + treeRand() * 4 });
    };
    const RINGS = [
      { r: 20, n: 24 },
      { r: 25, n: 28 },
      { r: 30.5, n: 32 },
      { r: 36.5, n: 36 },
      { r: 43, n: 40 },
    ];
    RINGS.forEach(({ r, n }) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + treeRand() * 0.12;
        const rr = r + (treeRand() - 0.5) * 3.5;
        const x = Math.cos(a) * rr;
        const z = this.ARCH_Z + 7 + Math.sin(a) * rr;
        if (z < this.ARCH_Z + 5) continue;
        tryPush(x, z, treeRand() < 0.4 ? "pine" : "broad");
      }
    });
    const featured: { x: number; z: number; kind: "pine" | "broad"; h: number }[] = [];
    [
      { x: -13.5, z: 30, k: "broad" as const },
      { x: 13.8, z: 32, k: "pine" as const },
      { x: -12, z: 44, k: "broad" as const },
      { x: 12.5, z: 45.5, k: "broad" as const },
      { x: -8.5, z: 56.5, k: "pine" as const },
      { x: 9, z: 57.5, k: "pine" as const },
    ].forEach((s) => {
      if (Math.abs(s.x - pathCurve(s.z)) < 4.6) return;
      featured.push({ x: s.x, z: s.z, kind: s.k, h: s.k === "pine" ? 9 + treeRand() * 4.5 : 7.5 + treeRand() * 4 });
    });
    const score = (s: { x: number; z: number }) => {
      const door = Math.hypot(s.x / 2.2, (s.z - this.ARCH_Z) / 3.2);
      const stage = Math.hypot(s.x, s.z - this.LAWN_STAGE_Z) / 1.4;
      return Math.min(door, stage);
    };
    featured.sort((a, b) => score(a) - score(b));
    const rest = spots
      .filter((s) => !featured.some((f) => f.x === s.x && f.z === s.z))
      .sort((a, b) => score(a) - score(b));
    return [...[...featured, ...rest].slice(0, CAP), ...this.collectBackdropTreeSpots(treeRand)];
  }

  /**
   * 远景林带（独立上限，不与近景树抢名额）：
   * ① 舞台后方 z 68→125 的纵深森林，越远越密越高，填满凉亭背景；
   * ② 画廊两侧与后方一圈树，让画廊坐落在林间空地里。
   */
  private collectBackdropTreeSpots(rand: () => number): { x: number; z: number; kind: "pine" | "broad"; h: number }[] {
    const out: { x: number; z: number; kind: "pine" | "broad"; h: number }[] = [];
    const cell = this.touchMode ? 9.5 : 6.5;
    const push = (x: number, z: number, hBase: number) => {
      const kind = rand() < 0.4 ? "pine" : "broad";
      out.push({ x, z, kind, h: hBase + rand() * 4 });
    };
    for (let z = 68; z <= 125; z += cell) {
      const halfW = 30 + (z - 68) * 0.7;
      for (let x = -halfW; x <= halfW; x += cell) {
        const jx = x + (rand() - 0.5) * cell * 0.8;
        const jz = z + (rand() - 0.5) * cell * 0.8;
        if (rand() < 0.12) continue;
        push(jx, jz, 9.5 + (jz - 68) * 0.04);
      }
    }
    const wallX = this.W / 2;
    for (let z = this.ARCH_Z - 2; z >= this.DEPTH_START - 38; z -= cell) {
      for (let x = -60; x <= 60; x += cell) {
        const jx = x + (rand() - 0.5) * cell * 0.8;
        const jz = z + (rand() - 0.5) * cell * 0.8;
        const dx = Math.max(Math.abs(jx) - wallX, 0);
        const dz = Math.max(this.DEPTH_START - jz, 0);
        const d = Math.hypot(dx, dz);
        if (d < 7 || d > 40) continue;
        if (jz > this.ARCH_Z - 4 && Math.abs(jx) < 26) continue;
        if (rand() < 0.15) continue;
        push(jx, jz, 9 + rand() * 1.5);
      }
    }
    return out;
  }


  /** 树冠叶簇 alpha 贴图：画 40 个大小不一的叶团，边缘透明碎裂成「叶感」而非实心球 */
  private makeCanopyTexture(): THREE.Texture {
    const tex = this.makeCanvasTexture(
      (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const blob = (cx: number, cy: number, r: number, tone: string, alpha: number) => {
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, tone);
          g.addColorStop(0.7, tone.replace("1)", "0.85)"));
          g.addColorStop(1, tone.replace("1)", "0)"));
          ctx.globalAlpha = alpha;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        };
        let s = 777;
        const rnd = () => {
          s = (Math.imul(s, 1664525) + 1013904223) | 0;
          return ((s >>> 0) % 100000) / 100000;
        };
        for (let i = 0; i < 46; i++) {
          const a = rnd() * Math.PI * 2;
          const rr = Math.pow(rnd(), 0.6) * w * 0.42;
          const cx = w / 2 + Math.cos(a) * rr;
          const cy = h / 2 + Math.sin(a) * rr * 0.92;
          const r = w * (0.05 + rnd() * 0.085);
          const l = 0.24 + rnd() * 0.4;
          blob(cx, cy, r, `rgba(${Math.round(70 + l * 60)},${Math.round(110 + l * 60)},${Math.round(50 + l * 30)},1)`, 0.9);
        }
        // 中心补浓
        blob(w / 2, h / 2, w * 0.3, "rgba(52,92,44,1)", 0.95);
        ctx.globalAlpha = 1;
      },
      256,
      256,
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** 针叶树冠：3 层锥台叶壳（上小下大），底部收敛到树干，高度归一 6.4 */
  private makePineCanopyGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const layers = [
      { y: 1.5, r: 2.5, h: 1.9 },
      { y: 3.1, r: 1.95, h: 1.7 },
      { y: 4.6, r: 1.35, h: 1.5 },
      { y: 5.75, r: 0.7, h: 1.1 },
    ];
    layers.forEach((L) => {
      const cone = new THREE.ConeGeometry(L.r, L.h, 9, 2);
      cone.translate(0, L.y + L.h / 2, 0);
      parts.push(cone);
    });
    return this.mergeParts(parts, "pine canopy");
  }

  /** 阔叶树冠：3 球叠放的不规则叶团壳（半径抖动去正球感），高度归一 6.4 */
  private makeBroadCanopyGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const blobs = [
      { y: 4.7, r: 2.05, seg: 9 },
      { y: 3.6, r: 1.55, seg: 8 },
      { y: 5.5, r: 1.3, seg: 8 },
    ];
    blobs.forEach((B, bi) => {
      const s = new THREE.SphereGeometry(B.r, B.seg, 6);
      const pos = s.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const k = 1 + Math.sin(i * 12.9898 + bi * 7.7) * 0.14;
        pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * (1.04 + Math.sin(i * 4.1) * 0.1), pos.getZ(i) * k);
      }
      pos.needsUpdate = true;
      s.computeVertexNormals();
      s.translate(0, B.y, 0);
      parts.push(s);
    });
    return this.mergeParts(parts, "broad canopy");
  }

  /** 树干：锥形收分圆柱 + 2 根斜枝，高度归一 6.4（与树冠匹配） */
  private makeTrunkGeometry(rTop: number, rBot: number): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const trunk = new THREE.CylinderGeometry(rTop, rBot, 5.4, 8);
    trunk.translate(0, 2.7, 0);
    parts.push(trunk);
    const branch = new THREE.CylinderGeometry(rTop * 0.5, rTop * 0.7, 1.6, 6);
    branch.rotateZ(0.7);
    branch.translate(0.5, 4.3, 0);
    parts.push(branch);
    return this.mergeParts(parts, "tree trunk");
  }

  /**
   * 12 根花柱：真实花束（含自带玻璃瓶）放到大理石基座顶面，
   * 每个 primitive 一个 InstancedMesh；成功后隐藏程序化花团与香槟金花瓮。
   */
  private buildBouquetInstances(tpl: GlbTemplate) {
    if (tpl.primitives.length === 0) return;

    const ZS = [12, 6.5, 1.5, -4.5, -12.5, -20];
    const XS = [-2.6, 2.6];
    const BASE_TOP = 0.985; // makePillarBaseGeometry 顶面
    const BASE_Y = BASE_TOP + 0.005;
    const heightScale = 1.05 / Math.max(tpl.size.y, 1e-4);
    const widthScale = 0.8 / Math.max(tpl.size.x, tpl.size.z, 1e-4);
    const baseScale = Math.min(heightScale, widthScale);
    const matrices: THREE.Matrix4[] = [];
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    ZS.forEach((z) => {
      XS.forEach((x) => {
        const s = baseScale * (0.92 + Math.random() * 0.16);
        quat.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));
        pos.set(x, BASE_Y, z);
        scl.set(s, s, s);
        matrices.push(new THREE.Matrix4().compose(pos, quat, scl));
      });
    });

    const vaseMat = this.vaseGlassMaterial("#f3f8fa", 0.3);
    const waterMat = this.vaseGlassMaterial("#e6f2f6", 0.16);
    tpl.primitives.forEach((p) => {
      const isGlass = /vray|glass/i.test(p.name) || p.name.startsWith("04");
      const isWater = /water/i.test(p.name) || p.name === "Material #7";
      const mat = isGlass
        ? vaseMat
        : isWater
          ? waterMat
          : this.bouquetMaterial(p.name, p.material);
      const mesh = new THREE.InstancedMesh(p.geometry, mat, matrices.length);
      mesh.frustumCulled = false;
      mesh.renderOrder = isWater ? 3 : isGlass ? 2 : 1;
      matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    });

    if (this.pillarFloral) this.pillarFloral.visible = false;
    if (this.pillarVase) this.pillarVase.visible = false;
  }

  /** 花束材质微调：白玫瑰花头叠淡腮红 tint，叶片保留贴图并压低粗糙度 */
  private bouquetMaterial(name: string, src: THREE.Material): THREE.Material {
    const mat = src.clone();
    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
      mat.metalness = Math.min(mat.metalness, 0.05);
      if (name === "rose") {
        mat.color.set("#fff1f2");
        mat.roughness = 0.55;
        mat.envMapIntensity = 0.8;
      } else if (name === "leaf_01") {
        mat.roughness = 0.5;
      }
    }
    this.regMaterialTextures(mat);
    return mat;
  }

  /** 花束自带玻璃容器/水的材质：不用 transmission，靠半透明 + 环境反射表现 */
  private vaseGlassMaterial(color: string, opacity: number): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.04,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      ior: 1.5,
      specularIntensity: 1,
      envMapIntensity: 1.8,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /**
   * 长茎玫瑰点缀：地面 30 支（红/腮红/象牙各 1/3，用低模）+ 椅背红玫瑰（低模）+
   * 欢迎花牌 6 支近景（高模）。花头用 instanceColor 区分颜色。
   */
  private buildStemRoseInstances(massTpl: GlbTemplate, nearTpl: GlbTemplate) {
    const blush = new THREE.Color("#f4c6cf");
    const ivory = new THREE.Color("#fbf3ea");
    const red = new THREE.Color("#a3182f");
    const groundPalette = [red, blush, ivory];
    const massPl: StemPlacement[] = [];
    const nearPl: StemPlacement[] = [];
    let gi = 0;

    // 1) 花岛外圈：16 支平躺在落地烛杯之间，花头径向朝外
    const half0 = this.centerVotives.slice(0, 8);
    const half1 = this.centerVotives.slice(8);
    [half0, half1].forEach((half) => {
      if (half.length < 2) return;
      const a0 = Math.min(...half.map((v) => v.a));
      const a1 = Math.max(...half.map((v) => v.a));
      for (let j = 0; j < 8; j++) {
        const a = a0 + ((j + 0.5) / 8) * (a1 - a0);
        const dir = new THREE.Vector3(
          Math.cos(a),
          Math.tan(0.06 + Math.random() * 0.16),
          Math.sin(a),
        ).normalize();
        massPl.push({
          matrix: this.stemMatrix(
            massTpl,
            Math.cos(a) * 3.0 + (Math.random() - 0.5) * 0.15,
            this.GRAND_Z + Math.sin(a) * 3.0 + (Math.random() - 0.5) * 0.15,
            dir,
            0.9 + Math.random() * 0.2,
            0.02,
          ),
          color: groundPalette[gi++ % 3],
        });
      }
    });

    // 2) 后墙地面花环前方：散放 8 支
    const ringZ = this.DEPTH_START + 1.5;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(
        Math.cos(a),
        Math.tan(0.05 + Math.random() * 0.12),
        Math.sin(a),
      ).normalize();
      massPl.push({
        matrix: this.stemMatrix(
          massTpl,
          (Math.random() - 0.5) * 3.4,
          ringZ + 0.35 + Math.random() * 0.9,
          dir,
          0.9 + Math.random() * 0.2,
          0.02,
        ),
        color: groundPalette[gi++ % 3],
      });
    }

    // 3) 椅背花饰：每排靠过道椅子挂 2 支红玫瑰，斜插交叉（低模）
    this.pewEnds.forEach((base) => {
      const aisle = base.elements[12] > 0 ? -1 : 1;
      for (let k = 0; k < 2; k++) {
        const s = 0.4 * (0.95 + Math.random() * 0.1);
        const local = new THREE.Matrix4().compose(
          new THREE.Vector3(aisle * 0.19 + (k === 0 ? -0.03 : 0.03), 0.66, 0.245),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0.3, 0, aisle * (k === 0 ? 0.55 : -0.55)),
          ),
          new THREE.Vector3(s, s, s),
        );
        massPl.push({ matrix: new THREE.Matrix4().multiplyMatrices(base, local), color: red });
      }
    });

    // 4) 入口欢迎花牌前：各 3 支近景（高模，腮红/象牙）
    const signs: [number, number][] = [
      [-4.6, 13.6],
      [4.6, 13.6],
    ];
    signs.forEach(([sx, sz], si) => {
      const out = si === 0 ? -1 : 1;
      for (let k = 0; k < 3; k++) {
        const tilt = 0.12 + k * 0.05;
        const yaw = Math.PI / 2 + out * (0.15 + (k - 1) * 0.42);
        const dir = new THREE.Vector3(
          Math.sin(tilt) * Math.cos(yaw),
          Math.cos(tilt),
          Math.sin(tilt) * Math.sin(yaw),
        ).normalize();
        nearPl.push({
          matrix: this.stemMatrix(
            nearTpl,
            sx + (k - 1) * 0.12 + (Math.random() - 0.5) * 0.05,
            sz + 0.28 + (Math.random() - 0.5) * 0.08,
            dir,
            0.9 + Math.random() * 0.2,
            0.02,
          ),
          color: k % 2 === 0 ? blush : ivory,
        });
      }
    });

    this.addStemInstances(massTpl, massPl);
    this.addStemInstances(nearTpl, nearPl);
  }

  /**
   * 大片实例按 xz 网格分块（目标约 16 块、边长不小于 8m），配合实例包围球视锥剔除，
   * 身后与视野两侧的花不再提交 GPU；少量实例不分块，避免无谓增加 draw call。
   */
  private tilePlacements(placements: StemPlacement[]): StemPlacement[][] {
    if (placements.length <= 120) return [placements];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const pl of placements) {
      const e = pl.matrix.elements;
      x0 = Math.min(x0, e[12]);
      x1 = Math.max(x1, e[12]);
      z0 = Math.min(z0, e[14]);
      z1 = Math.max(z1, e[14]);
    }
    const cell = Math.max(8, Math.sqrt(((x1 - x0) * (z1 - z0)) / 16));
    const tiles = new Map<string, StemPlacement[]>();
    for (const pl of placements) {
      const e = pl.matrix.elements;
      const key = `${Math.floor((e[12] - x0) / cell)},${Math.floor((e[14] - z0) / cell)}`;
      const list = tiles.get(key);
      if (list) list.push(pl);
      else tiles.set(key, [pl]);
    }
    return [...tiles.values()];
  }

  /** 为一个玫瑰模板生成花头/茎/叶 InstancedMesh（花头支持逐实例颜色），大片实例按空间分块 */
  private addStemInstances(
    tpl: GlbTemplate,
    placements: StemPlacement[],
    target: THREE.Object3D = this.scene,
    lit = false,
  ) {
    if (placements.length === 0) return;
    const byName = new Map<string, GlbPrimitive>();
    tpl.primitives.forEach((p) => byName.set(p.name, p));
    const head = byName.get("rose_head");
    if (!head) return;
    const stem = byName.get("rose_stem");
    const leaf = byName.get("rose_leaf");

    const tiles = this.tilePlacements(placements);
    const add = (p: GlbPrimitive | undefined, mat: THREE.Material, tinted: boolean, lod = false) => {
      if (!p) return;
      if (lit && mat instanceof THREE.MeshStandardMaterial) this.applyFakeSun(mat);
      for (const tile of tiles) {
        const mesh = new THREE.InstancedMesh(p.geometry, mat, tile.length);
        mesh.frustumCulled = false;
        tile.forEach((pl, i) => mesh.setMatrixAt(i, pl.matrix));
        mesh.instanceMatrix.needsUpdate = true;
        if (tinted) {
          tile.forEach((pl, i) => mesh.setColorAt(i, pl.color));
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
        target.add(mesh);
        if (lod && tiles.length > 1) this.registerLodTile(mesh, p.geometry);
      }
    };
    add(
      head,
      new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        roughness: 0.5,
        metalness: 0,
        sheen: 0.4,
        sheenColor: new THREE.Color("#ff8fa3"),
      }),
      true,
      true,
    );
    // 远处茎叶与花头一样只占很少像素；复用同一套分块 LOD，避免上千支远处玫瑰仍提交高清茎叶。
    add(stem, new THREE.MeshStandardMaterial({ color: "#5f7f4d", roughness: 0.55, metalness: 0 }), false, target === this.lawnGroup);
    add(leaf, new THREE.MeshStandardMaterial({ color: "#6f9460", roughness: 0.55, metalness: 0 }), false, target === this.lawnGroup);
  }

  /**
   * 远处花头 LOD：分块花头离相机超过 LOD_FAR 米就换成简化网格（约 1/4 面数），
   * 回到 LOD_NEAR 以内换回原网格；此距离上花头只有十来个像素，肉眼分不出差别。
   * 简化器按需动态加载，未就绪前一直用原网格。
   */
  private registerLodTile(mesh: THREE.InstancedMesh, hi: THREE.BufferGeometry) {
    mesh.computeBoundingSphere();
    const sphere = mesh.boundingSphere;
    if (!sphere) return;
    this.lodTiles.push({ mesh, hi, center: sphere.center.clone(), radius: sphere.radius });
    if (this.lodGeos.has(hi)) return;
    this.lodGeos.set(hi, null);
    import("three/addons/modifiers/SimplifyModifier.js")
      .then(({ SimplifyModifier }) => new SimplifyModifier().modify(hi, Math.floor(hi.getAttribute("position").count * 0.75)))
      .then((lo) => {
        const hiTris = (hi.index ? hi.index.count : hi.getAttribute("position").count) / 3;
        if (this.disposed || !lo.index || lo.index.count / 3 > hiTris * 0.6) {
          lo.dispose();
          return;
        }
        if (!hi.boundingSphere) hi.computeBoundingSphere();
        lo.boundingSphere = hi.boundingSphere!.clone();
        this.disposables.push(lo);
        this.lodGeos.set(hi, lo);
      })
      .catch(() => undefined);
  }

  private lodTick(now: number) {
    if (now - this.lastLodTick < 250 || this.lodTiles.length === 0) return;
    this.lastLodTick = now;
    const LOD_FAR = 12;
    const LOD_NEAR = 10;
    const cam = this.camera.position;
    for (const t of this.lodTiles) {
      const lo = this.lodGeos.get(t.hi);
      if (!lo) continue;
      const d = cam.distanceTo(t.center) - t.radius;
      if (t.mesh.geometry === t.hi) {
        if (d > LOD_FAR) t.mesh.geometry = lo;
      } else if (d < LOD_NEAR) {
        t.mesh.geometry = t.hi;
      }
    }
  }

  // ── 过道花拱真实花艺 ────────────────────────────────────────
  /**
   * 三座花拱整体换成 rose-parts.glb 的真实花头 + 真实叶片：非对称造型，
   * 拱顶偏一侧主花团最密、顺同侧拱身蔓延到立柱中段，对侧立柱下半部小团呼应，
   * 其余拱身露出香槟金框仅零星点缀。三座共用一个花头材质 + 3 个花头
   * InstancedMesh 与 1 个叶片 InstancedMesh（新增 4 draw call），成功后隐藏
   * archFloral 程序化花艺作为兜底切换。
   */
  private buildArchRoseInstances() {
    const h0 = this.roseTemplates.head0;
    const h6 = this.roseTemplates.head6;
    const h5 = this.roseTemplates.head5;
    const leafTpl = this.roseTemplates.leaf;
    if (!h0 || !h6 || !h5 || !leafTpl) return;
    const headTpls: GlbTemplate[] = [h0, h6, h5];

    const headMats: THREE.Matrix4[][] = [[], [], []];
    const headCols: THREE.Color[][] = [[], [], []];
    const leafMats: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0);

    const jitterQuat = (dir: THREE.Vector3, maxAngle: number) => {
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      const axis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      return q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, (Math.random() * 2 - 1) * maxAngle));
    };

    const placeHead = (p: THREE.Vector3, dir: THREE.Vector3) => {
      const r = Math.random();
      const hi = r < 0.5 ? 0 : r < 0.8 ? 1 : 2;
      const s = 1.7 + Math.random() * 0.5;
      headMats[hi].push(
        new THREE.Matrix4().compose(p, jitterQuat(dir, 0.44), new THREE.Vector3(s, s, s)),
      );
      headCols[hi].push(this.archRoseTone());
    };

    const placeLeaf = (p: THREE.Vector3, dir: THREE.Vector3, roll: number) => {
      const s = 2.5 + Math.random();
      const q = jitterQuat(dir, 0.7).multiply(
        new THREE.Quaternion().setFromAxisAngle(up, roll + (Math.random() - 0.5) * 1.2),
      );
      leafMats.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s)));
    };

    const X = 1.9;
    const H = 1.7;
    const ZS = [8, -1, -15];
    ZS.forEach((z, ai) => {
      // 主花团偏向左右交替：第 0、2 座偏 +x，第 1 座偏 -x
      const side = ai % 2 === 0 ? 1 : -1;
      const arcPt = (theta: number) =>
        new THREE.Vector3(X * Math.cos(theta), H + X * Math.sin(theta), z);
      const arcN = (theta: number) => new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0);
      const outDir = (theta: number) => arcN(theta).addScaledVector(up, -0.24).normalize();
      const sidePostDir = new THREE.Vector3(side, -0.28, 0).normalize();
      const otherPostDir = new THREE.Vector3(-side, -0.2, 0).normalize();
      const thetaC = Math.PI / 2 + side * 0.3;

      // A. 拱顶偏主侧的一大团主花（最密，允许穿插）
      for (let i = 0; i < 38; i++) {
        const th = thetaC + (Math.random() - 0.5) * 0.85;
        const p = arcPt(th).addScaledVector(arcN(th), 0.04 + Math.random() * 0.26);
        p.y -= Math.random() * 0.1;
        p.z += (Math.random() - 0.5) * 0.3;
        placeHead(p, outDir(th));
      }

      // B. 顺主侧拱身向立柱中段蔓延，越往下越稀
      const thetaStart = Math.PI / 2 + side * 0.08;
      const thetaEnd = side > 0 ? 0.16 : Math.PI - 0.16;
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const th = thetaStart + ((thetaEnd - thetaStart) * i) / steps;
        const n = arcN(th);
        const base = arcPt(th).addScaledVector(n, 0.05 + Math.random() * 0.16);
        base.z += (Math.random() - 0.5) * 0.26;
        const nHead = i < steps * 0.6 ? 2 : 1;
        for (let k = 0; k < nHead; k++) {
          const p = base.clone();
          p.x += (Math.random() - 0.5) * 0.14;
          p.y += (Math.random() - 0.5) * 0.14;
          p.z += (Math.random() - 0.5) * 0.1;
          placeHead(p, outDir(th));
        }
      }

      // C. 主侧立柱中段
      const px = side * X;
      for (let i = 0; i < 11; i++) {
        const p = new THREE.Vector3(
          px + side * (0.06 + Math.random() * 0.12),
          1.55 - i * 0.075 + (Math.random() - 0.5) * 0.06,
          z + (Math.random() - 0.5) * 0.24,
        );
        placeHead(p, sidePostDir);
      }

      // D. 对侧立柱下半部呼应小团
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.06 + Math.random() * 0.14;
        const p = new THREE.Vector3(
          -side * (X + Math.cos(a) * r),
          0.72 + Math.random() * 0.42 + Math.sin(a) * r * 0.6,
          z + Math.sin(a) * r + (Math.random() - 0.5) * 0.3,
        );
        placeHead(p, otherPostDir);
      }

      // E. 非主侧拱身零星点缀，露出香槟金框
      const spStart = side > 0 ? Math.PI - 0.75 : 0.75;
      const spEnd = side > 0 ? Math.PI - 0.3 : 0.3;
      for (let i = 0; i < 6; i++) {
        const th = spStart + ((spEnd - spStart) * i) / 5;
        const p = arcPt(th).addScaledVector(arcN(th), 0.1 + Math.random() * 0.1);
        p.z += (Math.random() - 0.5) * 0.2;
        placeHead(p, outDir(th));
      }

      // 叶片：主花团外围密插，约为花头的 1.2 倍
      for (let i = 0; i < 34; i++) {
        const th = thetaC + (Math.random() - 0.5) * 1.0;
        const p = arcPt(th).addScaledVector(arcN(th), 0.1 + Math.random() * 0.34);
        p.y -= Math.random() * 0.14;
        p.z += (Math.random() - 0.5) * 0.36;
        const dir = arcN(th)
          .addScaledVector(up, -0.3)
          .add(new THREE.Vector3(0, 0, (Math.random() - 0.5) * 0.5))
          .normalize();
        placeLeaf(p, dir, (i % 2) * (Math.PI / 2));
      }
      for (let i = 0; i <= steps; i++) {
        const th = thetaStart + ((thetaEnd - thetaStart) * i) / steps;
        const n = arcN(th);
        const p = arcPt(th).addScaledVector(n, 0.08 + Math.random() * 0.18);
        p.z += (Math.random() - 0.5) * 0.28;
        placeLeaf(p, n.clone().addScaledVector(up, -0.35).normalize(), (i % 2) * (Math.PI / 2));
      }
      for (let i = 0; i < 12; i++) {
        const p = new THREE.Vector3(
          px + side * (0.08 + Math.random() * 0.14),
          1.55 - i * 0.07,
          z + (Math.random() - 0.5) * 0.26,
        );
        placeLeaf(p, new THREE.Vector3(side, -0.4, 0).normalize(), (i % 2) * (Math.PI / 2));
      }
      for (let i = 0; i < 16; i++) {
        const p = new THREE.Vector3(
          -side * X + (Math.random() - 0.5) * 0.22,
          0.5 + Math.random() * 0.55,
          z + (Math.random() - 0.5) * 0.32,
        );
        placeLeaf(p, new THREE.Vector3(-side, -0.3, 0).normalize(), (i % 2) * (Math.PI / 2));
      }
      for (let i = 0; i < 8; i++) {
        const th = spStart + (spEnd - spStart) * Math.random();
        const n = arcN(th);
        const p = arcPt(th).addScaledVector(n, 0.1 + Math.random() * 0.14);
        p.z += (Math.random() - 0.5) * 0.22;
        placeLeaf(p, n.clone().addScaledVector(up, -0.3).normalize(), (i % 2) * (Math.PI / 2));
      }

      // 原下垂尤加利藤 → 真实叶片串：沿下垂曲线每 ~0.07m 一片，交错旋转
      for (let d = 0; d < 5; d++) {
        const th = thetaStart + (thetaEnd - thetaStart) * (0.15 + 0.7 * (d / 4));
        const anchor = arcPt(th).addScaledVector(arcN(th), 0.16);
        const len = 0.34 + Math.random() * 0.3;
        const seg = Math.max(3, Math.round(len / 0.07));
        for (let k = 1; k <= seg; k++) {
          const sway = Math.sin((k / seg) * Math.PI) * 0.05 * side;
          const p = new THREE.Vector3(
            anchor.x + sway + (Math.random() - 0.5) * 0.05,
            anchor.y - (len * k) / seg,
            anchor.z + (Math.random() - 0.5) * 0.16,
          );
          const dir = new THREE.Vector3(
            (Math.random() - 0.5) * 0.35,
            -1,
            (Math.random() - 0.5) * 0.35,
          ).normalize();
          placeLeaf(p, dir, (k % 2) * (Math.PI / 2));
        }
      }
    });

    const headMat = this.archHeadMaterial(h0.primitives[0].material);
    const leafMat = this.archLeafMaterial(leafTpl.primitives[0].material);
    const addInst = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      mats: THREE.Matrix4[],
      cols?: THREE.Color[],
    ) => {
      if (mats.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      if (cols) {
        cols.forEach((c, i) => mesh.setColorAt(i, c));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      this.scene.add(mesh);
    };
    headTpls.forEach((tpl, i) => addInst(tpl.primitives[0].geometry, headMat, headMats[i], headCols[i]));
    addInst(leafTpl.primitives[0].geometry, leafMat, leafMats);

    if (this.archFloral) this.archFloral.visible = false;
  }

  /** 花拱花头材质：clone 模板材质并升级为 Physical 加 sheen，保留白玫瑰贴图 */
  private archHeadMaterial(src: THREE.Material): THREE.Material {
    if (src instanceof THREE.MeshStandardMaterial) {
      const mat = new THREE.MeshPhysicalMaterial({
        map: src.map,
        color: src.color.clone(),
        side: src.side,
        transparent: src.transparent,
        alphaTest: src.alphaTest,
        roughness: 0.55,
        metalness: 0,
        envMapIntensity: 0.7,
        sheen: 0.3,
        sheenColor: new THREE.Color("#ffd9e0"),
      });
      this.regMaterialTextures(mat);
      return mat;
    }
    const mat = src.clone();
    this.regMaterialTextures(mat);
    return mat;
  }

  /** 花拱叶片材质：clone 模板材质保留叶脉贴图，压低粗糙度 */
  private archLeafMaterial(src: THREE.Material): THREE.Material {
    const mat = src.clone();
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.roughness = 0.5;
      mat.metalness = 0;
      mat.envMapIntensity = 0.7;
    }
    this.regMaterialTextures(mat);
    return mat;
  }

  /** 花拱配色：象牙白 45% / 腮红粉 35% / 玫瑰粉 12% / 深玫瑰红 8%，叠加 ±4% 亮度抖动 */
  private archRoseTone(): THREE.Color {
    const r = Math.random();
    const hex = r < 0.45 ? "#fbf5ee" : r < 0.8 ? "#f6d3d9" : r < 0.92 ? "#eab0bd" : "#b3243a";
    return new THREE.Color(hex).multiplyScalar(0.96 + Math.random() * 0.08);
  }

  /** 以「局部 +Y 指向 dir」构造朝向矩阵，并把模型底部对齐 floorY（贴地不穿模） */
  private stemMatrix(
    tpl: GlbTemplate,
    x: number,
    z: number,
    dir: THREE.Vector3,
    s: number,
    floorY: number,
  ): THREE.Matrix4 {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
      new THREE.Vector3(s, s, s),
    );
    const hx = tpl.size.x * 0.5;
    const hz = tpl.size.z * 0.5;
    const corner = new THREE.Vector3();
    let minY = Infinity;
    for (const sx of [-1, 1]) {
      for (const sy of [0, 1]) {
        for (const sz of [-1, 1]) {
          corner.set(sx * hx, sy * tpl.size.y, sz * hz).applyMatrix4(m);
          if (corner.y < minY) minY = corner.y;
        }
      }
    }
    if (Number.isFinite(minY)) m.elements[13] += floorY - minY;
    return m;
  }

  // ── 西式仪式座椅（Chiavari）────────────────────────────────
  /** 生成一段从 a 到 b 的细杆（沿 +Y 的圆柱旋转到 ab 方向） */
  private makeRod(a: THREE.Vector3, b: THREE.Vector3, radius: number, seg: number): THREE.BufferGeometry {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const rod = new THREE.CylinderGeometry(radius, radius, len, seg, 1, true);
    rod.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
    );
    rod.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    return rod;
  }

  /** 金色 Chiavari 宴会椅框架：4 条外撇腿 + 座框 + 椅背立柱/5 竖杆/横档 + 横撑（约 228 面） */
  private makeChairFrameGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const seatY = 0.46;
    const topY = 0.92;
    const half = 0.21;
    const r = 0.013;
    const rail = 0.03;

    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([sx, sz]) => {
      parts.push(
        this.makeRod(
          new THREE.Vector3(sx * half, 0, sz * half),
          new THREE.Vector3(sx * (half - 0.035), seatY, sz * (half - 0.035)),
          r,
          6,
        ),
      );
    });

    const front = new THREE.BoxGeometry(half * 2, rail, rail);
    front.translate(0, seatY, -half);
    const back = new THREE.BoxGeometry(half * 2, rail, rail);
    back.translate(0, seatY, half);
    const sideL = new THREE.BoxGeometry(rail, rail, half * 2);
    sideL.translate(-half, seatY, 0);
    const sideR = new THREE.BoxGeometry(rail, rail, half * 2);
    sideR.translate(half, seatY, 0);
    parts.push(front, back, sideL, sideR);

    [-1, 1].forEach((sx) => {
      const s = new THREE.BoxGeometry(rail, rail, half * 1.8);
      s.translate(sx * half, 0.16, 0);
      parts.push(s);
    });

    [-1, 1].forEach((sx) => {
      parts.push(
        this.makeRod(
          new THREE.Vector3(sx * (half - 0.02), seatY, half),
          new THREE.Vector3(sx * (half - 0.02), topY, half),
          r,
          6,
        ),
      );
    });
    for (let i = 0; i < 5; i++) {
      const x = -0.13 + (i / 4) * 0.26;
      parts.push(
        this.makeRod(
          new THREE.Vector3(x, seatY + 0.01, half),
          new THREE.Vector3(x, topY - 0.02, half),
          0.007,
          6,
        ),
      );
    }

    const topRail = new THREE.BoxGeometry(half * 1.7, rail, rail);
    topRail.translate(0, topY, half);
    const midRail = new THREE.BoxGeometry(half * 1.7, rail, rail);
    midRail.translate(0, 0.6, half);
    parts.push(topRail, midRail);

    return this.mergeParts(parts, "chair frame");
  }

  private makeChairCushionGeometry(): THREE.BufferGeometry {
    const base = new THREE.BoxGeometry(0.4, 0.05, 0.38);
    base.translate(0, 0.485, 0);
    const bevel = new THREE.BoxGeometry(0.34, 0.025, 0.32);
    bevel.translate(0, 0.518, 0);
    return this.mergeParts([base, bevel], "chair cushion");
  }

  /** 腮红粉缎带蝴蝶结（两压扁环 + 结心）+ 两条下垂飘带，合并为一个几何以省 draw call */
  private makeChairBowGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    [-1, 1].forEach((s) => {
      const loop = new THREE.TorusGeometry(0.042, 0.012, 6, 12);
      loop.scale(1, 0.8, 0.45);
      loop.rotateY(s * 0.5);
      loop.translate(s * 0.045, 0.012, 0);
      parts.push(loop);
    });
    const knot = new THREE.SphereGeometry(0.018, 6, 5);
    knot.scale(1, 0.8, 0.7);
    knot.translate(0, 0.005, 0.004);
    parts.push(knot);

    [-1, 1].forEach((s) => {
      const p = new THREE.PlaneGeometry(0.04, 0.3, 1, 4);
      const attr = p.attributes.position;
      for (let i = 0; i < attr.count; i++) {
        const t = (attr.getY(i) + 0.15) / 0.3; // 0 底 → 1 顶
        attr.setX(i, attr.getX(i) * (0.4 + 0.6 * t));
        attr.setZ(i, Math.sin((1 - t) * Math.PI * 0.5) * 0.03);
      }
      p.computeVertexNormals();
      p.rotateZ(s * 0.18);
      p.translate(s * 0.03, -0.17, 0.006);
      parts.push(p);
    });
    return this.mergeParts(parts, "chair bow");
  }

  /** 椅背纱幔：3 片顶部收拢、底部散开的弯曲薄纱 */
  private makeChairVeilGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    [-0.15, 0, 0.15].forEach((dx, i) => {
      const p = new THREE.PlaneGeometry(i === 1 ? 0.22 : 0.14, 0.5, 2, 4);
      const attr = p.attributes.position;
      for (let k = 0; k < attr.count; k++) {
        const t = (attr.getY(k) + 0.25) / 0.5; // 0 底 → 1 顶
        attr.setX(k, attr.getX(k) * (0.25 + 0.75 * (1 - t)));
        attr.setZ(k, Math.sin(attr.getX(k) * 5) * 0.03 + (1 - t) * 0.05);
      }
      p.computeVertexNormals();
      p.translate(dx, -0.25, 0.01);
      parts.push(p);
    });
    return this.mergeParts(parts, "chair veil");
  }

  private makeChairLeafGeometry(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.055, 0.03, 0, 0.12);
    shape.quadraticCurveTo(-0.055, 0.03, 0, 0);
    return new THREE.ShapeGeometry(shape, 3);
  }

  /**
   * 仪式座席：过道两侧金色 Chiavari 椅，全部面朝 -Z（椅背朝 +Z）。
   * 前区 z∈[-27,-12.8]、后区 z∈[-3.6,8.4]，排距放宽到能从两排之间穿过，各排每侧 10 把（最外把与墙边花瓶底座留出 ≥1m 人行间隙）；
   * 逐把按已有碰撞圆避让，靠过道那把记录到 pewEnds 用于挂花饰。
   */
  private buildCeremonyChairs() {
    const obstacles = this.circles.slice();
    const blocked = (x: number, z: number) => {
      // 后墙仪式台占地内不放椅子（台体由 hallStage* 系列参数定义）
      if (z >= this.HALL_STAGE_BACK_Z - 0.9 && z <= this.hallStageTierFrontZ(this.HALL_STAGE_TIERS - 1) + 1.0) {
        if (Math.abs(x) <= this.HALL_STAGE_HALF_W + 0.7) return true;
      }
      return obstacles.some((c) => {
        const dx = x - c.x;
        const dz = z - c.z;
        const rr = c.r + 0.4;
        return dx * dx + dz * dz < rr * rr;
      });
    };

    // 排距 1.75m：椅子碰撞半径 0.26 + 人 0.4，两排之间留出约 0.4m 可走的带子（寻路网格 0.25m 也一定能穿过）
    const ROW = 1.75;
    const rows: number[] = [];
    for (let z = -27; z <= -12.8 + 1e-6; z += ROW) rows.push(z);
    for (let z = -3.6; z <= 8.4 + 1e-6; z += ROW) rows.push(z);

    const X0 = 3.9;
    const XCOUNT = 10;
    const DX = 0.56;
    const frameMats: THREE.Matrix4[] = [];
    const cushionMats: THREE.Matrix4[] = [];
    rows.forEach((z) => {
      [1, -1].forEach((side) => {
        for (let i = 0; i < XCOUNT; i++) {
          const x = side * (X0 + i * DX);
          if (blocked(x, z)) continue;
          const m = this.makeColumn(x, 0, z, 0);
          frameMats.push(m);
          cushionMats.push(m);
          this.circles.push({ x, z, r: 0.26 });
          if (i === 0) this.pewEnds.push(m);
        }
      });
    });

    const frame = new THREE.InstancedMesh(
      this.makeChairFrameGeometry(),
      new THREE.MeshStandardMaterial({ color: C.champagne, metalness: 0.8, roughness: 0.3 }),
      frameMats.length,
    );
    const cushion = new THREE.InstancedMesh(
      this.makeChairCushionGeometry(),
      new THREE.MeshStandardMaterial({ color: "#f7efe6", roughness: 0.85, metalness: 0 }),
      cushionMats.length,
    );
    frame.frustumCulled = false;
    cushion.frustumCulled = false;
    frameMats.forEach((m, i) => frame.setMatrixAt(i, m));
    cushionMats.forEach((m, i) => cushion.setMatrixAt(i, m));
    frame.instanceMatrix.needsUpdate = true;
    cushion.instanceMatrix.needsUpdate = true;
    this.scene.add(frame, cushion);

    this.buildPewDecor();
  }

  /** 椅背花饰：缎带蝴蝶结（含飘带）+ 叶子 + 纱幔，仅靠过道椅子，全部 InstancedMesh */
  private buildPewDecor() {
    if (this.pewEnds.length === 0) return;
    const bowMats: THREE.Matrix4[] = [];
    const leafMats: THREE.Matrix4[] = [];
    const veilMats: THREE.Matrix4[] = [];
    const local = (x: number, y: number, z: number, rx: number, ry: number, rz: number) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(1, 1, 1),
      );
    this.pewEnds.forEach((base) => {
      const aisle = base.elements[12] > 0 ? -1 : 1;
      bowMats.push(new THREE.Matrix4().multiplyMatrices(base, local(aisle * 0.19, 0.72, 0.25, 0, 0, 0)));
      veilMats.push(
        new THREE.Matrix4().multiplyMatrices(base, local(aisle * 0.1, 0.84, 0.235, 0.05, 0, 0)),
      );
      for (let k = 0; k < 2; k++) {
        leafMats.push(
          new THREE.Matrix4().multiplyMatrices(
            base,
            local(aisle * 0.19 + (k === 0 ? -0.05 : 0.05), 0.7, 0.245, 0.3, 0, k === 0 ? 1.1 : -1.1),
          ),
        );
      }
    });

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[]) => {
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      mesh.frustumCulled = false;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    };
    add(
      this.makeChairBowGeometry(),
      new THREE.MeshStandardMaterial({
        color: "#e8aebc",
        roughness: 0.45,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
      bowMats,
    );
    add(
      this.makeChairLeafGeometry(),
      new THREE.MeshStandardMaterial({
        color: "#6f9460",
        roughness: 0.55,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
      leafMats,
    );
    add(
      this.makeChairVeilGeometry(),
      new THREE.MeshStandardMaterial({
        color: "#f4c6cf",
        roughness: 0.6,
        metalness: 0,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
      veilMats,
    );
  }

  private tickGrandChandelier(dt: number) {
    const gr = this.grand;
    if (!gr) return;
    const t = this.clock.elapsedTime;
    this.crystalTimeU.value = t;
    this.sparkleTimeU.value = t;
    for (const b of gr.bulbs) {
      b.mat.emissiveIntensity =
        b.base *
        (1 + 0.09 * Math.sin(t * 12.7 + b.phase) + 0.05 * Math.sin(t * 7.3 + b.phase * 1.7));
    }
    // 每帧轮流刷新 1/3 实例的亮度，控制 CPU
    this.grandCursor = (this.grandCursor + 1) % 3;
    for (const c of gr.crystals) {
      for (let i = this.grandCursor; i < c.count; i += 3) {
        const f = 1 + 0.22 * Math.sin(t * 3.1 + i * 0.53 + c.phase);
        gr.color.setRGB(f, f, f * 1.02);
        c.mesh.setColorAt(i, gr.color);
      }
      if (c.mesh.instanceColor) c.mesh.instanceColor.needsUpdate = true;
    }
    gr.sparkles.rotation.y += Math.sin(t * 0.15) * dt * 0.03;
    for (const c of this.grandCopies) c.sparkles.rotation.y = gr.sparkles.rotation.y;
  }

  // ── 室外：天空 / 草地 / 景观 / 外立面 ─────────────────────

  /**
   * 主题配置。天空三段颜色/雾色以 sRGB 十六进制书写，供天空 shader 直接取分量；
   * 海面反射需要线性色，用 new THREE.Color(hex) 自动转换。
   */
  private readonly THEMES = {
    // 山间草甸晚霞：雾色 = 全景地平线以下填充色（暖金），远处地形无缝融进霞光地平线
    lawn: {
      zenith: "#2f7fd0",
      mid: "#6fb0e8",
      horizon: "#efe2c8",
      fog: "#e1b982",
      bg: "#e1b982",
      fogNear: 60,
      fogFar: 210,
      wall: "#efe4d2",
      roof: "#e9dcc8",
      trim: "#ecdfc9",
    },
    beach: {
      zenith: "#2f8fe0",
      mid: "#6fc2f0",
      horizon: "#d8f1fb",
      fog: "#d6eef8",
      bg: "#d6eef8",
      fogNear: 90,
      fogFar: 420,
      wall: "#fbfaf6",
      roof: "#e9e2d6",
      trim: "#cfb58e",
    },
  } as const;

  private srgbVec(hex: string): THREE.Vector3 {
    const n = parseInt(hex.slice(1), 16);
    return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }

  private themeTints(kind: "lawn" | "beach") {
    const t = this.THEMES[kind];
    return { zenith: this.srgbVec(t.zenith), mid: this.srgbVec(t.mid), horizon: this.srgbVec(t.horizon) };
  }

  /** 切换户外主题（幂等）；notify=false 用于构造期初始化，避免在挂载前触发回调 */
  private activateOutdoor(kind: "lawn" | "beach", notify: boolean) {
    this.outdoor = kind;
    if (kind === "lawn" && !this.lawnBuilt) {
      this.lawnBuilt = true;
      this.buildGround();
      this.buildGrassCards();
      if (this.showMeadowRoses) this.buildLawnFlowers();
      this.buildLawnRotunda();
      this.buildLawnAisle();
      this.buildLawnTrees();
      this.buildMeadowStemRoses();
    }
    if (kind === "beach" && !this.beachBuilt) {
      this.beachBuilt = true;
      this.buildBeach();
    }
    this.lawnGroup.visible = kind === "lawn";
    this.beachGroup.visible = kind === "beach";
    this.applyOutdoorTheme(kind);
    if (notify) this.opts.onOutdoorChange?.(kind);
  }

  /** 切换户外主题：草坪 / 沙滩 */
  setOutdoor(kind: "lawn" | "beach") {
    if (this.disposed || kind === this.outdoor) return;
    if (this.camera.position.z >= this.ARCH_Z) this.cancelAutoWalk();
    this.activateOutdoor(kind, true);
  }

  getOutdoor(): "lawn" | "beach" {
    return this.outdoor;
  }

  private applyOutdoorTheme(kind: "lawn" | "beach") {
    const t = this.THEMES[kind];
    const sky = this.skyMat;
    if (sky instanceof THREE.ShaderMaterial) {
      const tints = this.themeTints(kind);
      (sky.uniforms.uZenith.value as THREE.Vector3).copy(tints.zenith);
      (sky.uniforms.uMid.value as THREE.Vector3).copy(tints.mid);
      (sky.uniforms.uHorizon.value as THREE.Vector3).copy(tints.horizon);
      sky.uniforms.uHdriMix.value = kind === "lawn" ? 1 : 0;
    }
    // 假太阳（所有户外 shader 共享引用）：草坪=落日低角度暖橙，沙滩=正午还原
    const sun = kind === "lawn" ? this.SUNSET_SUN : this.NOON_SUN;
    this.SUN_DIR.copy(sun.dir);
    this.SUN_COLOR.copy(sun.color);
    this.sunIntensityU.value = sun.intensity;
    // 打底灯只改参数不换灯（数量守恒；沙滩/室内数值回到构建期预设）
    if (this.hemiLight) {
      this.hemiLight.color.set(sun.hemiSky);
      this.hemiLight.groundColor.set(sun.hemiGround);
      this.hemiLight.intensity = sun.hemiIntensity;
    }
    if (this.ambientLight) {
      this.ambientLight.color.set(sun.ambient);
      this.ambientLight.intensity = sun.ambientIntensity;
    }
    // 草坪用 HDRI 天空，程序化云会被 HDRI 里的真实云取代（视觉穿帮）
    if (this.cloudMesh) this.cloudMesh.visible = kind !== "lawn";
    this.bgColor.set(t.bg);
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.color.set(t.fog);
      fog.near = t.fogNear;
      fog.far = t.fogFar;
    }
    const mats = this.exteriorMats;
    if (mats) {
      mats.wall.color.set(t.wall);
      mats.roof.color.set(t.roof);
      mats.trim.color.set(t.trim);
    }
  }

  /**
   * 天空球：半径 400 的反向球 + 手写 shader。
   * 沙滩：三段渐变程序化蓝天；草坪：equirect 采样真实落日全景 HDRI
   * （sun 命中 uSunDir 附近即 HDRI 里的太阳，两侧程序化天空完全隐藏）。
   * depthTest/depthWrite 均关、renderOrder=-1000，保证最先绘制并被所有几何覆盖。
   */
  private buildSky() {
    const skyTex = this.loadOutdoorTex(
      this.touchMode ? "sunset_2048.webp" : "sunset_4096.webp",
      true,
      1,
      1,
      "lawn",
    );
    // 天顶/地底不能上下环绕采样；atan 在正后方跳变会让 mipmap 选到最低级出现一条竖线，故关 mipmap
    skyTex.wrapT = THREE.ClampToEdgeWrapping;
    skyTex.generateMipmaps = false;
    skyTex.minFilter = THREE.LinearFilter;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
      uniforms: {
        // 太阳：入口外侧（+Z）、玩家右前方（-X），仰角 35°（与草坪假日照共用 SUN_DIR）
        uSunDir: { value: this.SUN_DIR },
        // 三段渐变颜色以归一化 sRGB 分量直接写入着色器，随主题切换
        uZenith: { value: this.themeTints(this.outdoor).zenith },
        uMid: { value: this.themeTints(this.outdoor).mid },
        uHorizon: { value: this.themeTints(this.outdoor).horizon },
        // 草坪落日全景（equirect）；uHdriMix 由 applyOutdoorTheme 切 0/1
        uHdri: { value: skyTex },
        uHdriMix: { value: this.outdoor === "lawn" ? 1 : 0 },
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform vec3 uZenith;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform sampler2D uHdri;
        uniform float uHdriMix;
        varying vec3 vDir;
        const vec3 SUN = vec3(1.0, 0.965, 0.867);
        // u = 0.5 + atan2(dir.x, dir.z)/(2π)；TextureLoader 默认 flipY，图片顶行在 v=1，
        // 故 v = 0.5 + asin(dir.y)/π（天顶取图片顶部，与 three 内置 equirectUv 一致）
        vec2 equirectUv(vec3 d) {
          return vec2(0.5 + atan(d.x, d.z) / 6.28318530718, 0.5 + asin(clamp(d.y, -1.0, 1.0)) / 3.14159265359);
        }
        void main() {
          vec3 d = normalize(vDir);
          // HDRI（草坪晚霞）：贴图已 tonemap，直接输出
          vec3 hdri = texture2D(uHdri, equirectUv(d)).rgb;
          float h = d.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
          col = mix(col, uZenith, smoothstep(0.12, 0.62, h));
          col = mix(vec3(0.84, 0.89, 0.94), col, smoothstep(-0.14, 0.02, h));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          float disc = smoothstep(0.9985, 0.9996, sd);
          float halo = pow(sd, 7.0) * 0.2 + pow(sd, 60.0) * 0.3;
          col += SUN * (disc * 1.4 + halo);
          gl_FragColor = vec4(mix(col, hdri, uHdriMix), 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 32), mat);
    sky.renderOrder = -1000;
    sky.frustumCulled = false;
    this.skyMat = mat;
    this.scene.add(sky);
  }

  /** 云：canvas 画 2D 软云贴图，用单个 InstancedMesh 的 billboard 顶点着色器铺 16 朵（1 draw call） */
  private buildClouds() {
    const tex = this.reg(
      this.makeCanvasTexture(
        (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          for (let i = 0; i < 14; i++) {
            const px = w * (0.18 + Math.random() * 0.64);
            const py = h * (0.42 + (Math.random() - 0.5) * 0.34);
            const pr = h * (0.16 + Math.random() * 0.24);
            const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
            g.addColorStop(0, "rgba(255,255,255,0.95)");
            g.addColorStop(0.55, "rgba(255,255,255,0.55)");
            g.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(px, py, pr, 0, Math.PI * 2);
            ctx.fill();
          }
        },
        256,
        128,
      ),
    );
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      uniforms: { uMap: { value: tex }, uOpacity: { value: 0.92 } },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 center = (modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec2 sz = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          gl_Position = projectionMatrix * vec4(center + vec3(position.xy * sz, 0.0), 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float a = texture2D(uMap, vUv).a * uOpacity;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.0), a);
        }
      `,
    });
    const COUNT = 16;
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, COUNT);
    mesh.frustumCulled = false;
    mesh.renderOrder = -900;
    for (let i = 0; i < COUNT; i++) {
      // 前 6 朵固定在入口正前方扇区，保证玩家走出门就能看到
      const az = i < 6 ? (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2;
      const el = (8 + Math.random() * 27) * (Math.PI / 180);
      const dist = 250 + Math.random() * 100;
      const base = new THREE.Vector3(
        Math.sin(az) * Math.cos(el) * dist,
        Math.sin(el) * dist,
        Math.cos(az) * Math.cos(el) * dist,
      );
      const scale = 55 + Math.random() * 70;
      this.clouds.push({ base, speed: 0.6 + Math.random() * 1.1, scale });
      this.cloudDummy.position.copy(base);
      this.cloudDummy.scale.set(scale, scale * 0.52, 1);
      this.cloudDummy.updateMatrix();
      mesh.setMatrixAt(i, this.cloudDummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.cloudMesh = mesh;
    this.scene.add(mesh);
  }

  private loadOutdoorTex(
    file: string,
    srgb: boolean,
    rx: number,
    ry: number,
    dir = "outdoor",
  ): THREE.Texture {
    const tex = this.reg(new THREE.TextureLoader().load(`/textures/${dir}/${file}`));
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private buildGround() {
    // 山地草甸地形网格：与 lawnHeight 共用同一函数，保证地面网格与 groundYAt 一致
    // 半径扩展到 ~165m：远端在金雾里融进 HDRI 地平线，不再出现绿色环带
    const [x0, x1] = [-165, 165];
    const [z0, z1] = [this.ARCH_Z, 240];
    const segX = 160;
    const segZ = 110;
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) + cz;
      pos.setX(i, x);
      pos.setZ(i, z);
      pos.setY(i, this.lawnHeight(x, z));
      uv.setXY(i, x, z);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    geo.computeVertexNormals();

    // Poly Haven leafy_grass（2K，真实尺寸 5m 一块）→ 世界坐标 UV：1m ≈ repeat 0.2
    const k = 1 / 5;
    const lawnColor = this.loadOutdoorTex("leafy_grass_color.webp", true, k, k, "lawn");
    const lawnNormal = this.loadOutdoorTex("leafy_grass_normal.webp", false, k, k, "lawn");
    const lawnRough = this.loadOutdoorTex("leafy_grass_rough.webp", false, k, k, "lawn");
    const lawnMat = new THREE.MeshStandardMaterial({
      map: lawnColor,
      normalMap: lawnNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughnessMap: lawnRough,
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.45,
    });
    lawnMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = { value: this.SUN_DIR };
      shader.uniforms.uSunColor = { value: this.SUN_COLOR };
      shader.uniforms.uSunIntensity = this.sunIntensityU;

      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vWorldPos;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunIntensity;
          ${LAWN_SHARED_GLSL}`,
        )
        .replace(
          "#include <map_fragment>",
          `#ifdef USE_MAP
            // 世界坐标 UV：同一贴图按 1:1 与 1:4.3 两个尺度采样，低频噪声混合消除平铺重复
            vec2 lawnUv = vWorldPos.xz * ${k.toFixed(4)};
            vec4 lawnTexA = texture2D(map, lawnUv);
            vec4 lawnTexB = texture2D(map, lawnUv * 0.23 + vec2(0.37, 0.11));
            float lawnBlend = mix(0.35, 0.65, lawnNoise(vWorldPos.xz * 0.07));
            vec4 lawnTex = mix(lawnTexA, lawnTexB, lawnBlend);
            // 贴图作基色：先去黄褐（线性域减 R/B）再补绿滤镜，暮色下呈健康草绿
            float lawnLum = dot(lawnTex.rgb, vec3(0.2126, 0.7152, 0.0722));
            vec3 lawnBase = max(mix(vec3(lawnLum), lawnTex.rgb, 0.82) - vec3(0.145, 0.0, 0.070), vec3(0.0)) * vec3(0.82, 1.21, 1.25);
            diffuseColor.rgb = lawnBase;
          #endif`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          {
            // 草甸大尺度明暗/干湿斑（soil 走深绿苔斑）+ 白石花拱小径
            vec2 lawnWp = vWorldPos.xz;
            vec3 lawnPat = lawnPattern(lawnWp);
            vec3 grassCol = diffuseColor.rgb * lawnPat.x * lawnTint(lawnPat.y, lawnPat.z);
            float pathM = lawnPathMask(lawnWp, ${this.ARCH_Z.toFixed(1)});
            // 石板反照率只在小径及草缘过渡带内计算（整片草地上占比很小，分支在屏幕上高度连贯）
            vec3 finalCol = grassCol;
            if (pathM < 0.999) finalCol = mix(lawnStoneAlbedo(lawnWp, ${this.ARCH_Z.toFixed(1)}), grassCol, pathM);
            diffuseColor.rgb = finalCol;
          }`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#ifdef USE_NORMALMAP_OBJECTSPACE
            normal = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
            #ifdef FLIP_SIDED
              normal = -normal;
            #endif
            #ifdef DOUBLE_SIDED
              normal = normal * faceDirection;
            #endif
            normal = normalize(normalMatrix * normal);
          #elif defined(USE_NORMALMAP_TANGENTSPACE)
            vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
            // 小径区域法线换成石板细斑凹凸（弱幅，白石面走平光），草地区保留贴图法线
            vec2 lawnNp = vWorldPos.xz;
            float pathMaskN = 1.0 - lawnPathMask(lawnNp, ${this.ARCH_Z.toFixed(1)});
            if (pathMaskN > 0.001) {
              float g1 = lawnNoise(lawnNp * 6.7);
              float g2 = lawnNoise(lawnNp * 14.3 + 4.2);
              mapN = mix(mapN, vec3(0.5 + (g1 - 0.5) * 0.16, 0.5 + (g2 - 0.5) * 0.16, 1.0), pathMaskN);
            }
            mapN.xy *= normalScale;
            normal = normalize(tbn * mapN);
          #elif defined(USE_BUMPMAP)
            normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection);
          #endif`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            // 假日照：场景无太阳光，直接把方向光漫反射累加进 reflectedLight（normal 已被法线贴图扰动）
            vec3 lawnSunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            float lawnNdl = max(dot(normal, lawnSunView), 0.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * lawnNdl;
          }`,
        );
    };
    const grass = new THREE.Mesh(geo, lawnMat);
    this.lawnGroup.add(grass);
    this.lawnGroup.add(
      new THREE.Mesh(this.buildSurroundGroundGeometry((x, z) => this.lawnTerrainY(x, z), 165, -210, 160, 110, 1), lawnMat),
    );
  }

  /**
   * 画廊两侧与后方的地面：非均匀网格，网格线精确落在外墙面（x=±(W/2+0.06)、z=DEPTH_START-0.06），
   * 建筑占地内的顶点沉到地板下 0.6m，使下沉斜面全部藏在墙内，墙外不出现沟槽；
   * 法线在下沉前计算，墙根外沿光照不受影响。
   */
  private buildSurroundGroundGeometry(
    heightAt: (x: number, z: number) => number,
    xMax: number,
    zMin: number,
    segX: number,
    segZ: number,
    uvScale: number,
  ): THREE.BufferGeometry {
    const wallX = this.W / 2 + 0.06;
    const wallZ = this.DEPTH_START - 0.06;
    const ticks = (a: number, b: number, n: number, keep: number[]) => {
      const out: number[] = [];
      for (let i = 0; i <= n; i++) {
        const v = a + ((b - a) * i) / n;
        if (keep.every((k) => Math.abs(v - k) > 0.4)) out.push(v);
      }
      return [...out, ...keep].sort((p, q) => p - q);
    };
    const xs = ticks(-xMax, xMax, segX, [-wallX, wallX]);
    const zs = ticks(zMin, this.ARCH_Z, segZ, [wallZ]);
    const nx = xs.length;
    const positions = new Float32Array(nx * zs.length * 3);
    const uvs = new Float32Array(nx * zs.length * 2);
    zs.forEach((z, j) => {
      xs.forEach((x, i) => {
        const k = j * nx + i;
        positions[k * 3] = x;
        positions[k * 3 + 1] = heightAt(x, z);
        positions[k * 3 + 2] = z;
        uvs[k * 2] = x * uvScale;
        uvs[k * 2 + 1] = z * uvScale;
      });
    });
    const index: number[] = [];
    for (let j = 0; j < zs.length - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(index);
    geo.computeVertexNormals();
    zs.forEach((z, j) => {
      if (z <= wallZ) return;
      xs.forEach((x, i) => {
        if (Math.abs(x) < wallX) positions[(j * nx + i) * 3 + 1] = -0.6;
      });
    });
    return geo;
  }

  /**
   * 交叉面片草丛卡：Maxtree Plant Models Vol.60 烘焙 atlas（3-way star 实例化），
   * 真实狗尾草/黑麦草丛替代程序化贴图（授权仅限交付烘焙衍生物，原 FBX/贴图不再分发）。
   * atlas 异步加载就绪后整体替换占位卡；帧世界尺寸在烘焙时记录，运行时按米还原。
   */
  private readonly GRASS_SPECIES: {
    key: string;
    atlas: string;
    /** 每帧草丛高度占帧高比例（atlas 2 列 × 3 行，丛底已对齐帧底），用于把实例缩放到目标丛高 */
    hf: number[];
    weight: number;
    /** 目标丛高区间（米）：匍匐草（狗牙根/沿阶草）远矮于直立草，统一高度会被放大成巨草 */
    hMin: number;
    hMax: number;
  }[] = [
    { key: "setaria", atlas: "/textures/lawn/grass_Setaria_viridis_beauv.webp", hf: [0.79, 0.76, 0.36, 0.84, 0.84, 0.84], weight: 0.16, hMin: 0.32, hMax: 0.6 },
    { key: "lolium", atlas: "/textures/lawn/grass_Lolium_perenne.webp", hf: [0.77, 0.6, 0.45, 0.3, 0.27, 0.44], weight: 0.15, hMin: 0.28, hMax: 0.5 },
    { key: "digitaria", atlas: "/textures/lawn/grass_Digitaria_sanguinalis.webp", hf: [0.48, 0.25, 0.3, 0.48, 0.62, 0.47], weight: 0.1, hMin: 0.25, hMax: 0.45 },
    { key: "zoysia", atlas: "/textures/lawn/grass_Zoysia_japonica_steud.webp", hf: [0.8, 0.77, 0.34, 0.44, 0.49, 0.3], weight: 0.1, hMin: 0.25, hMax: 0.45 },
    { key: "cynodon", atlas: "/textures/lawn/grass_Cynodon_dactylon.webp", hf: [0.219, 0.129, 0.277, 0.398, 0.176, 0.121], weight: 0.2, hMin: 0.1, hMax: 0.2 },
    { key: "cyperus", atlas: "/textures/lawn/grass_Cyperus_eragrostis.webp", hf: [0.75, 0.691, 0.617, 0.465, 0.492, 0.672], weight: 0.08, hMin: 0.35, hMax: 0.6 },
    { key: "ophiopogon", atlas: "/textures/lawn/grass_Ophiopogon_bodinieri.webp", hf: [0.551, 0.574, 0.469, 0.199, 0.238, 0.254], weight: 0.12, hMin: 0.16, hMax: 0.3 },
    { key: "ammophila", atlas: "/textures/lawn/grass_Ammophila_arenaria.webp", hf: [0.645, 0.473, 0.434, 0.402, 0.398, 0.113], weight: 0.09, hMin: 0.4, hMax: 0.72 },
  ];
  /** 草丛卡距离淡出（远端由地面贴图接力） */
  private readonly GRASS_FADE_NEAR = 38;
  private readonly GRASS_FADE_FAR = 52;
  private readonly grassTextures = new Map<string, THREE.Texture>();
  private readonly grassCardsGroup = new THREE.Group();
  private grassAtlasesReady = false;

  private buildGrassCards() {
    this.lawnGroup.add(this.grassCardsGroup);
    this.buildGrassCardSpots();
    if (this.grassAtlasesReady) {
      this.rebuildGrassCards();
      return;
    }
    const loader = new THREE.TextureLoader();
    let pending = this.GRASS_SPECIES.length;
    const done = () => {
      pending -= 1;
      if (pending === 0 && !this.disposed) {
        this.grassAtlasesReady = true;
        this.rebuildGrassCards();
      }
    };
    this.GRASS_SPECIES.forEach((sp) => {
      loader.load(
        sp.atlas,
        (tex) => {
          if (this.disposed) {
            tex.dispose();
            done();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = true;
          tex.minFilter = THREE.LinearMipmapLinearFilter;
          tex.magFilter = THREE.LinearFilter;
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
          this.grassTextures.set(sp.key, tex);
          this.reg(tex);
          done();
        },
        undefined,
        () => {
          console.info(`[WeddingGallery] 草丛 atlas ${sp.atlas} 加载失败，保留程序化草叶`);
          done();
        },
      );
    });
  }

  /** atlas 就绪后移除占位交叉卡，按真实草丛丛卡重建 */
  private rebuildGrassCards() {
    this.grassCardsGroup.children.slice().forEach((c) => {
      this.grassCardsGroup.remove(c);
      this.disposeObject(c);
    });
    // 每物种一个 InstancedMesh,实例由 buildGrassCardSpots 预先按 weight 分桶
    this.GRASS_SPECIES.forEach((sp, si) => {
      const spots = this.grassCardBuckets[si];
      const tex = this.grassTextures.get(sp.key);
      if (!spots || spots.length === 0 || !tex) return;
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: false,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.85,
        metalness: 0,
        envMapIntensity: 0.4,
      });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = this.windUniform;
        shader.uniforms.uSunDir = { value: this.SUN_DIR };
        shader.uniforms.uSunColor = { value: this.SUN_COLOR };
        shader.uniforms.uSunIntensity = this.sunIntensityU;
        shader.uniforms.uFadeNear = { value: this.GRASS_FADE_NEAR };
        shader.uniforms.uFadeFar = { value: this.GRASS_FADE_FAR };
        shader.uniforms.uGreenGrade = { value: sp.key === "ammophila" ? 0.5 : 1.0 };
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>
            uniform float uTime;
            attribute float aFrame;
            varying vec2 vCardUv;
            varying vec3 vWorldPos;`,
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>
            {
              // 风摆:相位由实例位置 hash,幅度随 uv.y²(底部固定)
              vec3 basePos = instanceMatrix[3].xyz;
              float ph = fract(sin(dot(basePos.xz, vec2(12.9898, 78.233))) * 43758.5453);
              float gust = sin(uTime * 0.6 + ph * 6.2831) * 0.6 + sin(uTime * 1.5 + ph * 3.7) * 0.4;
              float sway = gust * uv.y * uv.y * 0.075;
              transformed.x += sway;
              transformed.z += sway * 0.5;
              // star 几何的 uv.x 已平移到 [-0.5,0.5]，还原到 0~1 后映射到 atlas 2 列 × 3 行中的一帧；
              // 纹理 flipY：图片第 0 行在 v 顶端，故行号需翻转
              float col = mod(aFrame, 2.0);
              float row = floor(aFrame / 2.0);
              vCardUv = vec2((uv.x + 0.5 + col) * 0.5, (uv.y + 2.0 - row) / 3.0);
              vWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
            }`,
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>
            uniform vec3 uSunDir;
            uniform vec3 uSunColor;
            uniform float uSunIntensity;
            uniform float uFadeNear;
            uniform float uFadeFar;
            uniform float uGreenGrade;
            varying vec2 vCardUv;
            varying vec3 vWorldPos;
            ${LAWN_SHARED_GLSL}`,
          )
          .replace(
            "#include <color_fragment>",
            `#include <color_fragment>
            {
              #ifdef USE_INSTANCING_COLOR
                diffuseColor.rgb *= instanceColor;
              #endif
              // 去黄：Maxtree 叶片反照率本身为橄榄黄（g≈r），暖光烘焙又压低了蓝；
              // 线性域压红、补蓝，转成草绿（与地面去黄褐滤镜同向），再交给落日暖光
              vec3 gc = diffuseColor.rgb;
              vec3 greened = vec3(gc.r * 0.45, gc.g * 0.82, gc.b * 0.9 + gc.r * 0.1);
              diffuseColor.rgb = mix(gc, greened, uGreenGrade);
              // 与地面/草叶同一斑块函数联动,远处融进地面基色均值(与 buildGround 去褐滤镜联动)
              vec2 lawnWp = vWorldPos.xz;
              vec3 lawnPat = lawnPattern(lawnWp);
              diffuseColor.rgb *= lawnPat.x * lawnTint(lawnPat.y, lawnPat.z);
              float lawnDist = length(vWorldPos - cameraPosition);
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.135, 0.298, 0.068), smoothstep(34.0, 50.0, lawnDist));
            }`,
          )
          .replace(
            "#include <aomap_fragment>",
            `#include <aomap_fragment>
            {
              vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
              // 假太阳:半兰伯特避免 quad 死黑
              float wrap = clamp((dot(normal, sunView) + 1.0) / 2.0, 0.0, 1.0);
              reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * (0.45 + 0.55 * wrap);
              // 金色逆光透光:Setaria 穗头尤其透金,权重随贴图 v 高度增强
              vec3 viewDir = normalize(vViewPosition);
              float back = pow(clamp(dot(viewDir, -sunView), 0.0, 1.0), 2.6);
              reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.8, 0.9, 0.3) * back * (0.16 + 0.4 * vCardUv.y);
            }`,
          )
          .replace(
            "#include <map_fragment>",
            `diffuseColor *= texture2D(map, vCardUv);`,
          )
          .replace(
            "#include <alphatest_fragment>",
            `{
              // alpha 按距离衰减后再做 alphaTest：远处叶片逐渐稀疏消失，而非整体突变
              diffuseColor.a *= 1.0 - smoothstep(uFadeNear, uFadeFar, distance(vWorldPos, cameraPosition));
            }
            #include <alphatest_fragment>`,
          );
      };

      // 3 quad star:中央 + ±60° 面板,uv.x 平移到 [-0.5,0.5] 使其绕面板中心旋转
      const panel = new THREE.PlaneGeometry(1, 1);
      panel.translate(0, 0.5, 0);
      const uvAttr = panel.getAttribute("uv");
      for (let i = 0; i < uvAttr.count; i++) uvAttr.setX(i, uvAttr.getX(i) - 0.5);
      const pL = panel.clone();
      pL.rotateY(Math.PI / 3);
      const pR = panel.clone();
      pR.rotateY(-Math.PI / 3);
      const star = this.mergeParts([panel, pL, pR], `grass star ${sp.key}`);

      const mesh = new THREE.InstancedMesh(star, mat, spots.length);
      mesh.frustumCulled = false;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const one = new THREE.Vector3(1, 1, 1);
      const tint = new THREE.Color();
      const frames = new Float32Array(spots.length);
      spots.forEach((s, i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
        pos.set(s.x, this.lawnHeight(s.x, s.z) - 0.012, s.z);
        // scale = 目标高 / 帧高(帧为正方形,帧高即帧宽);instanceMatrix 缩放几何,风摆幅度随 s 同比缩放
        m.compose(pos, q, one.clone().multiplyScalar(s.s));
        mesh.setMatrixAt(i, m);
        tint.setScalar(s.tint);
        mesh.setColorAt(i, tint);
        frames[i] = s.frame;
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.setAttribute("aFrame", new THREE.InstancedBufferAttribute(frames, 1));
      this.grassCardsGroup.add(mesh);
    });
  }

  /** 草丛卡实例撒点:排除区与旧程序卡一致,按物种 weight 加权分桶,atlas 就绪后由 rebuildGrassCards 消费 */
  private grassCardBuckets: { x: number; z: number; yaw: number; frame: number; s: number; tint: number }[][] = [];

  private buildGrassCardSpots() {
    const COUNT = this.touchMode ? 20000 : 70000;
    const pathCurve = (z: number) => Math.sin((z - this.ARCH_Z) * 0.1) * 0.55;
    const bag: number[] = [];
    this.GRASS_SPECIES.forEach((sp, si) => {
      for (let k = 0; k < Math.round(sp.weight * 100); k++) bag.push(si);
    });
    this.grassCardBuckets = this.GRASS_SPECIES.map(() => []);
    let placed = 0;
    let idx = 0;
    while (placed < COUNT && idx < COUNT * 12) {
      const gi = idx;
      idx += 1;
      const a = this.lawnRand(gi, 21) * Math.PI * 2;
      const rr = Math.sqrt(this.lawnRand(gi, 22)) * 23.5;
      const x = Math.cos(a) * rr;
      const z = this.ARCH_Z + 1.2 + this.lawnRand(gi, 23) * (this.LAWN_WALK_Z - this.ARCH_Z - 2.5);
      if (Math.abs(x - pathCurve(z)) < 1.72) continue;
      if (this.lawnPathArchZs.some((az) => Math.abs(z - az) < 1.1 && Math.abs(x - pathCurve(az)) < 2.0)) continue;
      if (Math.hypot(x, z - this.LAWN_STAGE_Z) < this.LAWN_PLATFORM_R + 1.0) continue;
      if (Math.abs(x) < 6.2 && z > 43.5 && z < 51.5) continue;
      if (Math.abs(Math.abs(x) - 4.7) < 0.6 && Math.abs(z - (this.ARCH_Z + 2.2)) < 0.7) continue;
      const si = bag[Math.floor(this.lawnRand(gi, 27) * bag.length)];
      const sp = this.GRASS_SPECIES[si];
      const frame = Math.floor(this.lawnRand(gi, 28) * sp.hf.length) % sp.hf.length;
      const hTarget = (sp.hMin + this.lawnRand(gi, 24) * (sp.hMax - sp.hMin)) * 1.2;
      const s = Math.min(hTarget / sp.hf[frame], 1.4);
      this.grassCardBuckets[si].push({
        x,
        z,
        yaw: this.lawnRand(gi, 26) * Math.PI * 2,
        frame,
        s,
        tint: 0.88 + this.lawnRand(gi, 29) * 0.24,
      });
      placed += 1;
    }
  }

  private makeBladeGeometry(): THREE.BufferGeometry {
    // 归一化叶片：高 1 / 宽 1，实际尺寸由实例 scale 决定；3 段 6 三角，叶尖收成尖
    const segs = 3;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const half = (1 - 0.92 * t) / 2;
      const bend = t * t * 0.12;
      positions.push(-half, t, bend, half, t, bend);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, t, 1, t);
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    return geo;
  }

  /** 门口两侧大型花瓮：白色车削体 + 白玫瑰/绣球花团（复用程序化花艺实例化管线） */
  private buildUrns() {
    const urnMat = new THREE.MeshStandardMaterial({
      color: "#f6f1e8",
      roughness: 0.5,
      metalness: 0.05,
    });
    const profile = [
      new THREE.Vector2(0.12, 0),
      new THREE.Vector2(0.24, 0.04),
      new THREE.Vector2(0.16, 0.12),
      new THREE.Vector2(0.34, 0.34),
      new THREE.Vector2(0.36, 0.5),
      new THREE.Vector2(0.24, 0.62),
      new THREE.Vector2(0.22, 0.72),
      new THREE.Vector2(0.34, 0.84),
      new THREE.Vector2(0.36, 0.9),
      new THREE.Vector2(0.3, 0.94),
    ];
    const spots = [
      { x: -4.7, z: this.ARCH_Z + 2.2 },
      { x: 4.7, z: this.ARCH_Z + 2.2 },
    ];
    const urns = new THREE.InstancedMesh(
      new THREE.LatheGeometry(profile, 24),
      urnMat,
      spots.length,
    );
    const dummy = new THREE.Object3D();
    spots.forEach((s, i) => {
      dummy.position.set(s.x, 0, s.z);
      dummy.updateMatrix();
      urns.setMatrixAt(i, dummy.matrix);
      this.circles.push({ x: s.x, z: s.z, r: 0.6 });
    });
    urns.instanceMatrix.needsUpdate = true;
    this.scene.add(urns);

    const floral: Floral = {
      roses: [],
      roseColors: [],
      hydrangeas: [],
      hydColors: [],
      leaves: [],
      leafColors: [],
    };
    const whiteTone = () =>
      new THREE.Color("#fbf7f2").offsetHSL(0, 0, (Math.random() - 0.5) * 0.08);
    const greenTone = () =>
      new THREE.Color("#6f9a63").offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
    const one = new THREE.Vector3(1, 1, 1);
    spots.forEach((s) => {
      for (let i = 0; i < 30; i++) {
        const th = Math.random() * Math.PI * 2;
        const rr = 0.34 * (0.3 + 0.7 * Math.cbrt(Math.random()));
        floral.roses.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(
              s.x + Math.cos(th) * rr,
              0.98 + Math.random() * 0.34,
              s.z + Math.sin(th) * rr,
            ),
            this.randomQuat(),
            one.clone().multiplyScalar(1.1),
          ),
        );
        floral.roseColors.push(whiteTone());
      }
      for (let i = 0; i < 14; i++) {
        const th = Math.random() * Math.PI * 2;
        const rr = 0.36 * (0.4 + 0.6 * Math.random());
        floral.leaves.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(
              s.x + Math.cos(th) * rr,
              1.0 + Math.random() * 0.24,
              s.z + Math.sin(th) * rr,
            ),
            this.randomQuat(),
            one.clone().multiplyScalar(1.2),
          ),
        );
        floral.leafColors.push(greenTone());
      }
    });
    this.finalizeFloral(floral);
  }

  /** 建筑外壳：后墙/侧墙补朝外平面、入口外侧象牙白立面、屋顶与四周檐口，避免从草坪看穿内部 */
  private buildExteriorShell() {
    const ivoryMat = new THREE.MeshStandardMaterial({
      color: "#efe9dd",
      roughness: 0.85,
      metalness: 0,
    });
    const roofMat = new THREE.MeshStandardMaterial({
      color: "#e6e3dc",
      roughness: 0.9,
      metalness: 0,
    });
    const corniceMat = new THREE.MeshStandardMaterial({
      color: "#eae4d8",
      roughness: 0.8,
      metalness: 0,
    });
    this.exteriorMats = { wall: ivoryMat, roof: roofMat, trim: corniceMat };

    const shellParts: THREE.BufferGeometry[] = [];
    // 后墙/侧墙各向外多给 0.4m，保证与前立面在角部搭接、不留看穿内部的缝
    // 外墙向下多延 0.6m，与环绕地面在墙根处的下沉斜面衔接，不露缝
    const back = new THREE.PlaneGeometry(this.W + 0.4, this.H + 0.6);
    back.rotateY(Math.PI);
    back.translate(0, this.H / 2 - 0.3, this.DEPTH_START - 0.06);
    shellParts.push(back);
    const left = new THREE.PlaneGeometry(this.LEN + 0.4, this.H + 0.6);
    left.rotateY(-Math.PI / 2);
    left.translate(-this.W / 2 - 0.06, this.H / 2 - 0.3, this.CZ);
    shellParts.push(left);
    const right = new THREE.PlaneGeometry(this.LEN + 0.4, this.H + 0.6);
    right.rotateY(Math.PI / 2);
    right.translate(this.W / 2 + 0.06, this.H / 2 - 0.3, this.CZ);
    shellParts.push(right);
    this.scene.add(new THREE.Mesh(this.mergeParts(shellParts, "exterior shell"), ivoryMat));

    const ar = this.ARCH_R;
    const ph = this.ARCH_PH;
    const fw = this.W / 2 + 0.2;
    const shape = new THREE.Shape();
    shape.moveTo(-fw, 0);
    shape.lineTo(fw, 0);
    shape.lineTo(fw, this.H);
    shape.lineTo(-fw, this.H);
    shape.lineTo(-fw, 0);
    const hole = new THREE.Path();
    hole.moveTo(-ar, 0);
    hole.lineTo(ar, 0);
    hole.lineTo(ar, ph);
    hole.absarc(0, ph, ar, 0, Math.PI, false);
    hole.lineTo(-ar, 0);
    shape.holes.push(hole);
    const facade = new THREE.Mesh(new THREE.ShapeGeometry(shape), ivoryMat);
    facade.position.set(0, 0, this.ARCH_Z + 0.05);
    this.scene.add(facade);

    const roof = new THREE.Mesh(new THREE.PlaneGeometry(this.W + 0.8, this.LEN + 0.8), roofMat);
    roof.rotation.x = -Math.PI / 2;
    roof.position.set(0, this.H + 0.01, this.CZ);
    this.scene.add(roof);

    const corniceParts: THREE.BufferGeometry[] = [];
    const cb = (w: number, d: number, x: number, z: number) => {
      const g = new THREE.BoxGeometry(w, 0.34, d);
      g.translate(x, this.H + 0.1, z);
      corniceParts.push(g);
    };
    cb(this.W + 0.9, 0.24, 0, this.DEPTH_START - 0.1);
    cb(this.W + 0.9, 0.24, 0, this.ARCH_Z + 0.1);
    cb(0.24, this.LEN + 0.4, -this.W / 2 - 0.1, this.CZ);
    cb(0.24, this.LEN + 0.4, this.W / 2 + 0.1, this.CZ);
    this.scene.add(new THREE.Mesh(this.mergeParts(corniceParts, "cornice"), corniceMat));
  }

  // ── 沙滩主题 ───────────────────────────────────────────────

  private beachHash(ix: number, iz: number): number {
    let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  private beachNoise(x: number, z: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const a = this.beachHash(ix, iz);
    const b = this.beachHash(ix + 1, iz);
    const c = this.beachHash(ix, iz + 1);
    const d = this.beachHash(ix + 1, iz + 1);
    return a * (1 - ux) * (1 - uz) + b * ux * (1 - uz) + c * (1 - ux) * uz + d * ux * uz;
  }

  /** 沙滩高度场：门口 y=0，向海缓降至浪花线 z=62 为海平面，再入水；两侧起沙丘 */
  private beachHeight(x: number, z: number): number {
    const t = clamp((z - this.ARCH_Z) / (this.shoreZ - this.ARCH_Z), 0, 1);
    const s = t * t * (3 - 2 * t);
    let h = this.seaLevel * s;
    if (z > this.shoreZ) h -= (z - this.shoreZ) * 0.13;
    const dune = THREE.MathUtils.smoothstep(Math.abs(x), 14, 26);
    if (dune > 0) {
      const n = this.beachNoise(x * 0.05 + 11.3, z * 0.05 + 3.7);
      const n2 = this.beachNoise(x * 0.13 + 2.1, z * 0.13 + 9.4);
      h += dune * (0.6 + n2 * 0.9) * Math.max(0, n - 0.35) * 2.2;
    }
    // 远端向低平沙面收敛，与外圈大平面衔接，避免暴露地形边缘断口
    const far = THREE.MathUtils.smoothstep(Math.abs(x), 105, 150);
    return h * (1 - far) + -1.72 * far;
  }

  /**
   * 画廊两侧与后方的沙地高度（仅地面网格/棕榈落点用）：
   * 两侧沙丘沿用 beachHeight 的 x 向沙丘并在接缝 z=ARCH_Z 处与之逐点相等；
   * 后方随离门距离渐起沙丘，外墙 1.5m 内压平；再向后 110→176m 平滑降到外圈平面 -1.72，
   * 网格恰好止于 176m 处，只在边线与外圈平面重合，不产生共面闪烁。
   */
  private readonly BEACH_BACK_END = 176;
  private beachTerrainY(x: number, z: number): number {
    if (z >= this.ARCH_Z) return this.beachHeight(x, z);
    const back = this.ARCH_Z - z;
    const dx = Math.max(Math.abs(x) - this.W / 2, 0);
    const dz = Math.max(this.DEPTH_START - z, 0);
    const clear = THREE.MathUtils.smoothstep(Math.hypot(dx, dz), 1.5, 8);
    const clearEff = 1 + (clear - 1) * THREE.MathUtils.smoothstep(back, 0, 6);
    const duneX = THREE.MathUtils.smoothstep(Math.abs(x), 14, 26);
    const duneBack = THREE.MathUtils.smoothstep(Math.hypot(dx, dz), 6, 20) * THREE.MathUtils.smoothstep(back, 0, 12);
    const dune = Math.max(duneX, duneBack) * clearEff;
    let h = 0;
    if (dune > 0) {
      const n = this.beachNoise(x * 0.05 + 11.3, z * 0.05 + 3.7);
      const n2 = this.beachNoise(x * 0.13 + 2.1, z * 0.13 + 9.4);
      h = dune * (0.6 + n2 * 0.9) * Math.max(0, n - 0.35) * 2.2;
    }
    const far = Math.max(
      THREE.MathUtils.smoothstep(Math.abs(x), 105, 150),
      THREE.MathUtils.smoothstep(back, 110, this.BEACH_BACK_END),
    );
    return h * (1 - far) + -1.72 * far;
  }

  /** 栈道面板顶面：该段下方沙面最高点 + 0.35，保证面板不埋进沙里 */
  private boardwalkTopY(z: number): number {
    const base = Math.max(
      this.beachHeight(-1.5, z),
      this.beachHeight(0, z),
      this.beachHeight(1.5, z),
    );
    return base + 0.35;
  }

  /** 玩家脚下地面高度：沙滩主题出到室外后跟随栈道/地形，草坪主题跟随草甸地形与凉亭平台 */
  private groundYAt(x: number, z: number): number {
    if (z < this.ARCH_Z) return this.hallStageGroundY(x, z);
    if (this.outdoor === "beach") {
      const onDeck =
        Math.abs(x) <= this.stageHalfW && z >= this.stageFrontZ && z <= this.stageBackZ;
      if (onDeck) return this.stageDeckY;
      if (Math.abs(x) <= this.stepHalfW && z < this.stageFrontZ) {
        const back = this.stageFrontZ - this.stepDepth * 2;
        if (z >= this.stageFrontZ - this.stepDepth) return this.stageDeckY - this.stageRise / 3;
        if (z >= back) return this.stageDeckY - (this.stageRise * 2) / 3;
      }
      if (Math.abs(x) <= this.bwHalfW + 0.1) {
        const onBw = this.boardwalkStairY(z);
        if (onBw !== null) return onBw;
      }
      return this.beachHeight(x, z);
    }
    return this.lawnGroundY(x, z);
  }

  /** 栈道（含两端台阶）在 z 处的踏面高度；不在栈道 z 范围内返回 null */
  private boardwalkStairY(z: number): number | null {
    const d = this.bwStepDepth;
    if (z < this.bwStepsZ0) return null;
    if (z < this.bwStartZ) {
      const i = Math.min(1, Math.floor((z - this.bwStepsZ0) / d));
      return (this.boardwalkTopY(this.bwStartZ) * (i + 1)) / 3;
    }
    if (z <= this.bwEndZ) return this.boardwalkTopY(z);
    if (z < this.bwEndZ + d * 2) {
      const i = Math.min(1, Math.floor((z - this.bwEndZ) / d));
      return this.boardwalkTopY(this.bwEndZ) - this.bwEndRise() * (i + 1);
    }
    return null;
  }

  /** 靠海端每级台阶的落差：面板末端到台阶外沙面的高差三等分 */
  private bwEndRise(): number {
    const top = this.boardwalkTopY(this.bwEndZ);
    const sand = this.beachHeight(0, this.bwEndZ + this.bwStepDepth * 2 + 0.1);
    return Math.max(0.05, (top - sand) / 3);
  }

  private buildBeach() {
    this.buildBeachTerrain();
    this.buildSea();
    this.buildFoam();
    this.buildBoardwalk();
    this.buildDuneGrass();
    this.buildBeachCeremony();
    this.buildBeachLounge();
    this.buildBeachDecorFloral();
    this.loadPalmModels();
  }

  private buildBeachTerrain() {
    const [x0, x1] = [-120, 120];
    const [z0, z1] = [this.ARCH_Z, 220];
    const segX = 160;
    const segZ = 102;
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx;
      const z = pos.getZ(i) + cz;
      pos.setX(i, x);
      pos.setZ(i, z);
      pos.setY(i, this.beachHeight(x, z));
      uv.setXY(i, x / 2, z / 2);
    }
    pos.needsUpdate = true;
    uv.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = this.makeSandMaterial();
    this.beachGroup.add(new THREE.Mesh(geo, mat));
    // 画廊两侧与后方沙地（x 网格与正面同为 ±120/160 段，接缝顶点一致）
    this.beachGroup.add(
      new THREE.Mesh(
        this.buildSurroundGroundGeometry(
          (x, z) => this.beachTerrainY(x, z),
          120,
          this.ARCH_Z - this.BEACH_BACK_END,
          160,
          96,
          0.5,
        ),
        mat,
      ),
    );

    // 外圈低模平面（1600m）：防止极远处露出底面
    const outerGeo = new THREE.PlaneGeometry(1600, 1600);
    outerGeo.rotateX(-Math.PI / 2);
    const opos = outerGeo.attributes.position as THREE.BufferAttribute;
    const ouv = outerGeo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < opos.count; i++) {
      const x = opos.getX(i);
      const z = opos.getZ(i) + 200;
      opos.setZ(i, z);
      ouv.setXY(i, x / 2, z / 2);
    }
    opos.needsUpdate = true;
    ouv.needsUpdate = true;
    const outer = new THREE.Mesh(outerGeo, mat);
    outer.position.y = -1.72;
    this.beachGroup.add(outer);
  }

  private makeSandMaterial(): THREE.MeshStandardMaterial {
    const dryColor = this.loadOutdoorTex("sand_dry_color.webp", true, 1, 1, "beach");
    const dryNormal = this.loadOutdoorTex("sand_dry_normal.webp", false, 1, 1, "beach");
    const dryRough = this.loadOutdoorTex("sand_dry_rough.webp", false, 1, 1, "beach");
    const wetColor = this.loadOutdoorTex("sand_wet_color.webp", true, 1, 1, "beach");
    const wetNormal = this.loadOutdoorTex("sand_wet_normal.webp", false, 1, 1, "beach");
    const wetRough = this.loadOutdoorTex("sand_wet_rough.webp", false, 1, 1, "beach");
    const mat = new THREE.MeshStandardMaterial({
      map: dryColor,
      normalMap: dryNormal,
      roughnessMap: dryRough,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.5,
    });
    const GLSL_NOISE = /* glsl */ `
      float sandHash(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }
      float sandNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(sandHash(i), sandHash(i + vec2(1.0, 0.0)), u.x),
          mix(sandHash(i + vec2(0.0, 1.0)), sandHash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }
      // 潮水一涨一退：湿沙范围为当前潮位与滞后潮位的较大者，退潮后留渐隐湿痕
      float sandWetFactor(vec2 wp) {
        float tide = sin(uTime * 1.0471976);
        float lag = sin(uTime * 1.0471976 - 1.0);
        float edge = uShoreZ + max(tide, lag) * 1.5;
        float nz = sandNoise(wp * 0.55) * 0.7;
        return 1.0 - smoothstep(edge - 1.6, edge + 0.4 + nz, wp.y);
      }
    `;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = { value: this.SUN_DIR };
      shader.uniforms.uSunColor = { value: this.SUN_COLOR };
      shader.uniforms.uSunIntensity = this.sunIntensityU;
      shader.uniforms.uTime = this.seaUniform;
      shader.uniforms.uShoreZ = { value: this.shoreZ };
      shader.uniforms.uWetColor = { value: wetColor };
      shader.uniforms.uWetNormal = { value: wetNormal };
      shader.uniforms.uWetRough = { value: wetRough };
      // 马尔代夫式象牙白细沙：贴图只取明度做颗粒细节，色相由下面几组色调决定（原贴图偏黄褐，像沙漠）
      shader.uniforms.uDryTint = { value: new THREE.Color("#f5ebdf").multiplyScalar(0.56) };
      shader.uniforms.uBlushTint = { value: new THREE.Color("#f6ded6").multiplyScalar(0.56) };
      shader.uniforms.uChampTint = { value: new THREE.Color("#efe0c6").multiplyScalar(0.54) };
      shader.uniforms.uWetTint = { value: new THREE.Color("#d8c6ad").multiplyScalar(0.42) };

      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vWorldPos;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunIntensity;
          uniform float uTime;
          uniform float uShoreZ;
          uniform sampler2D uWetColor;
          uniform sampler2D uWetNormal;
          uniform sampler2D uWetRough;
          uniform vec3 uDryTint;
          uniform vec3 uBlushTint;
          uniform vec3 uChampTint;
          uniform vec3 uWetTint;
          ${GLSL_NOISE}`,
        )
        .replace(
          "#include <map_fragment>",
          `float sandWet = sandWetFactor(vWorldPos.xz);
          #ifdef USE_MAP
            vec4 sandDryA = texture2D(map, vMapUv);
            vec4 sandDryB = texture2D(map, vMapUv * 0.23 + vec2(0.37, 0.11));
            vec4 sandWetA = texture2D(uWetColor, vMapUv);
            vec4 sandWetB = texture2D(uWetColor, vMapUv * 0.23 + vec2(0.37, 0.11));
            float sandBlend = mix(0.35, 0.65, sandNoise(vWorldPos.xz * 0.07));
            const vec3 sandLumW = vec3(0.2126, 0.7152, 0.0722);
            // 线性空间下贴图平均明度：干沙 ≈0.227，湿沙 ≈0.122；除以均值得到围绕 1 的颗粒细节，再放大对比
            float dryLum = dot(mix(sandDryA.rgb, sandDryB.rgb, sandBlend), sandLumW) / 0.227;
            float wetLum = dot(mix(sandWetA.rgb, sandWetB.rgb, sandBlend), sandLumW) / 0.122;
            float dryDetail = clamp(1.0 + (dryLum - 1.0) * 1.8, 0.72, 1.25);
            float wetDetail = clamp(1.0 + (wetLum - 1.0) * 1.5, 0.75, 1.2);
            // 大尺度色斑：象牙白为主，零星淡粉（粉沙）与香槟色，避免单一色块
            float blushN = smoothstep(0.55, 0.85, sandNoise(vWorldPos.xz * 0.045 + vec2(7.1, 2.3)));
            float champN = smoothstep(0.5, 0.9, sandNoise(vWorldPos.xz * 0.06 + vec2(1.7, 9.2)));
            vec3 dryBase = mix(uDryTint, uBlushTint, blushN * 0.75);
            dryBase = mix(dryBase, uChampTint, champN * 0.5);
            // 越靠近海越偏香槟（细沙被潮气浸润），门口一侧最白
            float nearSea = smoothstep(uShoreZ - 22.0, uShoreZ - 3.0, vWorldPos.z);
            dryBase = mix(dryBase, uChampTint, nearSea * 0.45);
            vec3 sandCol = mix(dryBase * dryDetail, uWetTint * wetDetail, sandWet);
            diffuseColor.rgb *= sandCol;
          #endif`,
        )
        .replace(
          "#include <roughnessmap_fragment>",
          `float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            vec4 texelRoughness = texture2D(roughnessMap, vRoughnessMapUv);
            vec4 texelRoughnessWet = texture2D(uWetRough, vRoughnessMapUv);
            texelRoughness = mix(texelRoughness, texelRoughnessWet, sandWet);
            roughnessFactor *= texelRoughness.g;
          #endif`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#ifdef USE_NORMALMAP_OBJECTSPACE
            normal = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
            #ifdef FLIP_SIDED
              normal = -normal;
            #endif
            #ifdef DOUBLE_SIDED
              normal = normal * faceDirection;
            #endif
            normal = normalize(normalMatrix * normal);
          #elif defined(USE_NORMALMAP_TANGENTSPACE)
            vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
            vec3 mapNWet = texture2D(uWetNormal, vNormalMapUv).xyz * 2.0 - 1.0;
            mapN = mix(mapN, mapNWet, sandWet);
            // 风吹沙纹：沿 x 的正弦叠加噪声，形成缓和的横向纹路
            mapN.x += sin(vWorldPos.x * 2.2 + sandNoise(vWorldPos.xz * 0.35) * 6.2831) * 0.15;
            mapN.xy *= normalScale;
            normal = normalize(tbn * mapN);
          #elif defined(USE_BUMPMAP)
            normal = perturbNormalArb(-vViewPosition, normal, dHdxy_fwd(), faceDirection);
          #endif`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            vec3 sandSunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            float sandNdl = max(dot(normal, sandSunView), 0.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * sandNdl;
            // 湿沙的太阳高光
            vec3 sandV = normalize(vViewPosition);
            vec3 sandH = normalize(sandSunView + sandV);
            float sandSpec = pow(max(dot(normal, sandH), 0.0), 48.0) * sandWet * 0.4;
            reflectedLight.directSpecular += uSunColor * uSunIntensity * sandSpec;
            // 干沙里的石英/贝壳碎屑闪点：世界坐标高频格子 + 视角相关，走动时随机闪烁
            vec2 glintCell = floor(vWorldPos.xz * 38.0);
            float glintSeed = sandHash(glintCell);
            float glintView = sandHash(glintCell + floor(sandV.xz * 9.0) * 17.0);
            float glint = step(0.985, glintSeed) * step(0.6, glintView) * (1.0 - sandWet);
            glint *= smoothstep(30.0, 6.0, length(vViewPosition));
            reflectedLight.directSpecular += uSunColor * uSunIntensity * glint * 0.9;
          }`,
        );
    };
    return mat;
  }

  private buildSea() {
    const normalTex = this.loadOutdoorTex("water_normals.webp", false, 1, 1, "beach");
    const t = this.THEMES.beach;
    const mat = new THREE.ShaderMaterial({
      fog: true,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: this.seaUniform,
        uWaterNormal: { value: normalTex },
        uSunDir: { value: this.SUN_DIR },
        uSunColor: { value: this.SUN_COLOR },
        uShoreZ: { value: this.shoreZ },
        uZenith: { value: new THREE.Color(t.zenith) },
        uMid: { value: new THREE.Color(t.mid) },
        uHorizon: { value: new THREE.Color(t.horizon) },
        uShallow: { value: new THREE.Color("#3fd0c9") },
        uMidSea: { value: new THREE.Color("#1ea3c4") },
        uDeep: { value: new THREE.Color("#0d5f9c") },
        uSand: { value: new THREE.Color("#ece0c4") },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        #include <fog_pars_vertex>
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform sampler2D uWaterNormal;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uShoreZ;
        uniform vec3 uZenith;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uShallow;
        uniform vec3 uMidSea;
        uniform vec3 uDeep;
        uniform vec3 uSand;
        varying vec3 vWorldPos;
        #include <common>
        #include <fog_pars_fragment>

        vec3 seaSkyColor(vec3 dir) {
          float h = dir.y;
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
          return mix(col, uZenith, smoothstep(0.12, 0.62, h));
        }

        void main() {
          // 两层不同尺度/速度的法线滚动叠加，避免平铺
          vec2 uv1 = vWorldPos.xz * 0.045;
          vec2 uv2 = vWorldPos.xz * 0.021;
          vec3 n1 = texture2D(uWaterNormal, uv1 + vec2(0.0, uTime * 0.013)).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uWaterNormal, uv2 + vec2(uTime * 0.009, uTime * 0.005)).xyz * 2.0 - 1.0;
          vec2 nxy = (n1.xy + n2.xy * 0.7) * 1.6;
          vec3 N = normalize(vec3(nxy.x, 1.0, nxy.y));

          float offshore = smoothstep(uShoreZ + 4.0, uShoreZ + 70.0, vWorldPos.z);
          vec3 base = mix(uShallow, uMidSea, smoothstep(0.0, 0.5, offshore));
          base = mix(base, uDeep, smoothstep(0.45, 1.0, offshore));
          base = mix(uSand, base, smoothstep(0.0, 0.28, offshore));

          vec3 V = normalize(cameraPosition - vWorldPos);
          vec3 L = normalize(uSunDir);
          vec3 H = normalize(L + V);
          float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0);
          fres = mix(0.03, 1.0, fres);
          vec3 refl = seaSkyColor(reflect(-V, N));
          vec3 col = mix(base, refl, clamp(fres * 0.92, 0.0, 0.95));
          // 碎金太阳光带：高 shininess 让法线扰动形成闪烁
          col += uSunColor * pow(max(dot(N, H), 0.0), 260.0) * 4.0;

          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), mat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, this.seaLevel, 1555);
    sea.frustumCulled = false;
    this.beachGroup.add(sea);
  }

  private buildFoam() {
    const cols = 40;
    const rows = 24;
    const [x0, x1] = [-100, 100];
    const [z0, z1] = [this.shoreZ - 4, this.shoreZ + 2];
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= rows; j++) {
      const z = z0 + ((z1 - z0) * j) / rows;
      for (let i = 0; i <= cols; i++) {
        const x = x0 + ((x1 - x0) * i) / cols;
        const y = Math.max(this.beachHeight(x, z), this.seaLevel) + 0.03;
        positions.push(x, y, z);
        uvs.push(i / cols, j / rows);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * (cols + 1) + i;
        const b = a + 1;
        const c = a + cols + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uTime: this.seaUniform,
        uShoreZ: { value: this.shoreZ },
        uSunColor: { value: this.SUN_COLOR },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        #include <fog_pars_vertex>
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uShoreZ;
        uniform vec3 uSunColor;
        varying vec3 vWorldPos;
        #include <common>
        #include <fog_pars_fragment>

        float foamHash(vec2 p) {
          p = fract(p * vec2(127.1, 311.7));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        float foamNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(foamHash(i), foamHash(i + vec2(1.0, 0.0)), u.x),
            mix(foamHash(i + vec2(0.0, 1.0)), foamHash(i + vec2(1.0, 1.0)), u.x),
            u.y
          );
        }

        void main() {
          // 周期 ~6s：泡沫前缘冲上沙滩 1.5m 再退回
          float tide = sin(uTime * 1.0471976);
          float edge = uShoreZ + tide * 1.5;
          float n = foamNoise(vWorldPos.xz * 0.45 + vec2(uTime * 0.12, 0.0));
          float n2 = foamNoise(vWorldPos.xz * 1.1 - vec2(0.0, uTime * 0.2));
          float band = smoothstep(edge - 1.6, edge - 0.2, vWorldPos.z)
                     * (1.0 - smoothstep(edge + 0.2, edge + 1.8, vWorldPos.z));
          float lacy = smoothstep(0.25, 0.75, n * 0.6 + n2 * 0.4);
          float a = band * (0.35 + 0.65 * lacy);
          if (a < 0.02) discard;

          gl_FragColor = vec4(vec3(1.0, 1.0, 0.99) + uSunColor * 0.05, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    const foam = new THREE.Mesh(geo, mat);
    foam.renderOrder = 2;
    this.beachGroup.add(foam);
  }

  /** 给不写自定义着色器的户外材质补一份 SUN_DIR 漫反射（场景无太阳灯） */
  private applyFakeSun(mat: THREE.MeshStandardMaterial) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = { value: this.SUN_DIR };
      shader.uniforms.uSunColor = { value: this.SUN_COLOR };
      shader.uniforms.uSunIntensity = this.sunIntensityU;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec3 uSunDir;\nuniform vec3 uSunColor;\nuniform float uSunIntensity;",
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * max(dot(normal, sunView), 0.0);
          }`,
        );
    };
  }

  private makeRopeSpan(a: THREE.Vector3, b: THREE.Vector3): THREE.BufferGeometry {
    const seg = 8;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.y -= Math.sin(t * Math.PI) * 0.35;
      pts.push(p);
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, 0.025, 5, false);
  }

  /** 栈道两端台阶：门口 2 级上到面板，靠海端 2 级下到沙面；每级踏板带一道白色前沿压条 */
  private buildBoardwalkSteps(treadMat: THREE.Material) {
    const d = this.bwStepDepth;
    const w = this.bwHalfW * 2 + 0.08;
    const treads: THREE.BufferGeometry[] = [];
    const noses: THREE.BufferGeometry[] = [];
    const addStep = (z0: number, top: number, nosingZ: number) => {
      const bottom = Math.min(this.beachHeight(0, z0), this.beachHeight(0, z0 + d)) - 0.12;
      const h = Math.max(0.05, top - bottom);
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(0, top - h / 2, z0 + d / 2);
      treads.push(g);
      const n = new THREE.BoxGeometry(w + 0.02, 0.035, 0.05);
      n.translate(0, top - 0.012, nosingZ);
      noses.push(n);
    };

    const entryTop = this.boardwalkTopY(this.bwStartZ);
    for (let i = 0; i < 2; i++) {
      const z0 = this.bwStepsZ0 + i * d;
      addStep(z0, (entryTop * (i + 1)) / 3, z0 + 0.02);
    }
    const endTop = this.boardwalkTopY(this.bwEndZ);
    const rise = this.bwEndRise();
    for (let i = 0; i < 2; i++) {
      const z0 = this.bwEndZ + i * d;
      addStep(z0, endTop - rise * (i + 1), z0 + d - 0.02);
    }

    this.beachGroup.add(new THREE.Mesh(this.mergeParts(treads, "boardwalk steps"), treadMat));
    const noseMat = new THREE.MeshStandardMaterial({ color: "#fbf7ef", roughness: 0.6, metalness: 0 });
    this.applyFakeSun(noseMat);
    this.beachGroup.add(new THREE.Mesh(this.mergeParts(noses, "boardwalk nosing"), noseMat));
  }

  private buildBoardwalk() {
    const zStart = this.bwStartZ;
    const zEnd = this.bwEndZ;
    const halfW = this.bwHalfW;
    const rows = Math.round((zEnd - zStart) / 0.5);
    const stepZ = (zEnd - zStart) / rows;

    const planksColor = this.loadOutdoorTex("planks_color.webp", true, 1, 1, "beach");
    const planksNormal = this.loadOutdoorTex("planks_normal.webp", false, 1, 1, "beach");
    const planksRough = this.loadOutdoorTex("planks_rough.webp", false, 1, 1, "beach");
    for (const t of [planksColor, planksNormal, planksRough]) {
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
      t.repeat.set(0.7, 0.7);
    }
    const plankMat = new THREE.MeshStandardMaterial({
      map: planksColor,
      normalMap: planksNormal,
      roughnessMap: planksRough,
      color: "#f6efe3",
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.55,
    });
    this.applyFakeSun(plankMat);
    const sideMat = plankMat.clone();
    sideMat.side = THREE.DoubleSide;

    // 面板：沿 z 逐段取地形最高点 + 0.35，形成缓坡
    const deckPos: number[] = [];
    const deckUv: number[] = [];
    const deckIdx: number[] = [];
    for (let j = 0; j <= rows; j++) {
      const z = zStart + j * stepZ;
      const y = this.boardwalkTopY(z);
      deckPos.push(-halfW, y, z, halfW, y, z);
      deckUv.push(-halfW, z, halfW, z);
    }
    for (let j = 0; j < rows; j++) {
      const a = j * 2;
      deckIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const deckGeo = new THREE.BufferGeometry();
    deckGeo.setAttribute("position", new THREE.Float32BufferAttribute(deckPos, 3));
    deckGeo.setAttribute("uv", new THREE.Float32BufferAttribute(deckUv, 2));
    deckGeo.setIndex(deckIdx);
    deckGeo.computeVertexNormals();
    this.beachGroup.add(new THREE.Mesh(deckGeo, plankMat));

    const fascPos: number[] = [];
    const fascUv: number[] = [];
    const fascIdx: number[] = [];
    let fascBase = 0;
    for (const side of [-1, 1]) {
      for (let j = 0; j <= rows; j++) {
        const z = zStart + j * stepZ;
        const top = this.boardwalkTopY(z);
        const x = side * halfW;
        fascPos.push(x, top, z, x, top - 0.34, z);
        fascUv.push(z, 0, z, 0.34);
      }
      for (let j = 0; j < rows; j++) {
        const a = fascBase + j * 2;
        fascIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      fascBase += (rows + 1) * 2;
    }
    const fascGeo = new THREE.BufferGeometry();
    fascGeo.setAttribute("position", new THREE.Float32BufferAttribute(fascPos, 3));
    fascGeo.setAttribute("uv", new THREE.Float32BufferAttribute(fascUv, 2));
    fascGeo.setIndex(fascIdx);
    fascGeo.computeVertexNormals();
    this.beachGroup.add(new THREE.Mesh(fascGeo, sideMat));
    this.buildBoardwalkSteps(plankMat);

    const dummy = new THREE.Object3D();

    const supportGeo = new THREE.BoxGeometry(0.16, 1, 0.16);
    supportGeo.translate(0, 0.5, 0);
    const supportMat = new THREE.MeshStandardMaterial({
      color: "#b9a488",
      roughness: 0.9,
      metalness: 0,
    });
    this.applyFakeSun(supportMat);
    const supportMats: THREE.Matrix4[] = [];
    for (let z = zStart + 1.25; z < zEnd; z += 2.5) {
      for (const x of [-1.25, 1.25]) {
        const ground = this.beachHeight(x, z) - 0.15;
        const top = this.boardwalkTopY(z) - 0.34;
        dummy.position.set(x, ground, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, Math.max(0.1, top - ground), 1);
        dummy.updateMatrix();
        supportMats.push(dummy.matrix.clone());
      }
    }
    const supports = new THREE.InstancedMesh(supportGeo, supportMat, supportMats.length);
    supports.frustumCulled = false;
    supportMats.forEach((m, i) => supports.setMatrixAt(i, m));
    supports.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(supports);

    const postGeo = new THREE.BoxGeometry(0.1, 1, 0.1);
    postGeo.translate(0, 0.5, 0);
    const postMat = new THREE.MeshStandardMaterial({
      color: "#f8f4ea",
      roughness: 0.7,
      metalness: 0,
    });
    this.applyFakeSun(postMat);
    const postMats: THREE.Matrix4[] = [];
    const ropeParts: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const x = side * (halfW + 0.05);
      let prev: THREE.Vector3 | null = null;
      for (let z = zStart + 1.25; z <= zEnd; z += 2.5) {
        const base = this.boardwalkTopY(z);
        dummy.position.set(x, base, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 0.95, 1);
        dummy.updateMatrix();
        postMats.push(dummy.matrix.clone());
        const anchor = new THREE.Vector3(x, base + 0.82, z);
        if (prev) ropeParts.push(this.makeRopeSpan(prev, anchor));
        prev = anchor;
      }
    }
    const posts = new THREE.InstancedMesh(postGeo, postMat, postMats.length);
    posts.frustumCulled = false;
    postMats.forEach((m, i) => posts.setMatrixAt(i, m));
    posts.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(posts);

    const ropeMat = new THREE.MeshStandardMaterial({
      color: "#cbb28a",
      roughness: 0.95,
      metalness: 0,
    });
    this.applyFakeSun(ropeMat);
    this.beachGroup.add(new THREE.Mesh(this.mergeParts(ropeParts, "beach ropes"), ropeMat));

    const stepParts: THREE.BufferGeometry[] = [];
    const topY0 = this.boardwalkTopY(zEnd);
    const sandY = this.beachHeight(0, zEnd + 1.8);
    const nSteps = 3;
    for (let i = 0; i < nSteps; i++) {
      const top = topY0 + ((sandY - topY0) * (i + 1)) / (nSteps + 1);
      const g = new THREE.BoxGeometry(3, 0.18, 0.5);
      g.translate(0, top - 0.09, zEnd + 0.3 + i * 0.5);
      stepParts.push(g);
    }
    this.beachGroup.add(new THREE.Mesh(this.mergeParts(stepParts, "beach steps"), plankMat));
  }

  private buildDuneGrass() {
    const COUNT = this.touchMode ? 1500 : 3500;
    const mat = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
      envMapIntensity: 0.5,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniform;
      shader.uniforms.uSunDir = { value: this.SUN_DIR };
      shader.uniforms.uSunColor = { value: this.SUN_COLOR };
      shader.uniforms.uSunIntensity = this.sunIntensityU;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          varying vec3 vWorldPos;
          varying vec3 vWorldUp;
          varying vec3 vWorldTan;
          varying vec3 vBlade;
          varying float vShade;
          float duneHash(vec2 p) {
            p = fract(p * vec2(123.34, 345.45));
            p += dot(p, p + 34.345);
            return fract(p.x * p.y);
          }
          float duneNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(duneHash(i), duneHash(i + vec2(1.0, 0.0)), u.x),
              mix(duneHash(i + vec2(0.0, 1.0)), duneHash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            vec3 bladePos = instanceMatrix[3].xyz;
            vec3 rotX = normalize(instanceMatrix[0].xyz);
            vec3 rotY = normalize(instanceMatrix[1].xyz);
            vec3 rotZ = normalize(instanceMatrix[2].xyz);
            vec3 scl = vec3(
              length(instanceMatrix[0].xyz),
              length(instanceMatrix[1].xyz),
              length(instanceMatrix[2].xyz)
            );
            vWorldUp = rotY;
            vWorldTan = rotX;
            vBlade = vec3(uv.y, uv.x * 2.0 - 1.0, duneHash(bladePos.xz));
            vShade = mix(0.78, 1.0, duneHash(bladePos.xz + 19.7));

            vec3 toCam = normalize(cameraPosition - bladePos);
            float edgeOn = 1.0 - abs(dot(rotX, toCam));
            transformed.x *= mix(1.0, 1.7, smoothstep(0.35, 1.0, edgeOn));

            float wt = uTime * 0.65;
            float gust = duneNoise(bladePos.xz * 0.12 + vec2(wt, wt * 0.7)) * 0.7
                       + duneNoise(bladePos.xz * 0.31 - vec2(wt * 0.8, wt)) * 0.3;
            gust = gust * 2.0 - 1.0;
            vec3 windWorld = vec3(0.85, 0.0, 0.5) * (gust * uv.y * uv.y * 0.3 * scl.y);
            vec3 windLocal = vec3(dot(rotX, windWorld), dot(rotY, windWorld), dot(rotZ, windWorld));
            transformed += windLocal / scl;

            float camDist = distance(bladePos, cameraPosition);
            transformed.y *= 1.0 - smoothstep(24.0, 34.0, camDist);

            vWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunIntensity;
          varying vec3 vWorldPos;
          varying vec3 vWorldUp;
          varying vec3 vWorldTan;
          varying vec3 vBlade;
          varying float vShade;`,
        )
        .replace(
          "#include <map_fragment>",
          `{
            float bladeT = vBlade.x;
            vec3 bladeRoot = mix(vec3(0.05, 0.08, 0.02), vec3(0.07, 0.10, 0.03), vBlade.z);
            vec3 bladeTip = mix(vec3(0.42, 0.45, 0.16), vec3(0.60, 0.53, 0.22), fract(vBlade.z * 7.3));
            vec3 bladeColor = mix(bladeRoot, bladeTip, pow(bladeT, 2.6)) * vShade;
            bladeColor *= mix(0.4, 1.0, pow(bladeT, 2.0));
            diffuseColor.rgb = bladeColor;
          }`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            vec3 nUp = normalize((viewMatrix * vec4(vWorldUp, 0.0)).xyz);
            vec3 nTan = normalize((viewMatrix * vec4(vWorldTan, 0.0)).xyz);
            vec3 bladeNormal = normalize(nUp + nTan * vBlade.y * 0.3);
            vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
            vec3 N = normalize(mix(upView, bladeNormal, 0.35));
            vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            vec3 V = normalize(vViewPosition);
            float diff = clamp((dot(N, sunView) + 0.5) / 1.5, 0.0, 1.0);
            reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * diff;
            float back = pow(clamp(dot(V, -sunView), 0.0, 1.0), 3.5) * (0.3 + 0.7 * vBlade.x);
            reflectedLight.directDiffuse += vec3(0.45, 0.5, 0.12) * uSunColor * back * 0.5;
            vec3 H = normalize(sunView + V);
            float spec = pow(clamp(dot(N, H), 0.0, 1.0), 40.0) * 0.15 * vBlade.x;
            reflectedLight.directSpecular += uSunColor * uSunIntensity * spec;
          }`,
        );
    };

    const mesh = new THREE.InstancedMesh(this.makeBladeGeometry(), mat, COUNT);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const clusters = this.touchMode ? 70 : 150;
    let placed = 0;
    let guard = 0;
    while (placed < COUNT && guard < clusters * 6) {
      guard++;
      const edge = Math.random() < 0.78;
      const s = Math.random() < 0.5 ? -1 : 1;
      const cx = edge ? s * (12.5 + Math.random() * 9.5) : s * (2.6 + Math.random() * 3.0);
      const cz = 18 + Math.random() * 38;
      if (this.beachHeight(cx, cz) < -0.9) continue;
      const per = 20 + Math.floor(Math.random() * 21);
      for (let i = 0; i < per && placed < COUNT; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.random() * 0.7;
        const x = cx + Math.cos(ang) * rr;
        const z = cz + Math.sin(ang) * rr;
        if (Math.abs(x) < 2.2) continue;
        const height = 0.3 + Math.random() * 0.4;
        const width = 0.010 + Math.random() * 0.006;
        dummy.position.set(x, this.beachHeight(x, z), z);
        dummy.rotation.set(
          (Math.random() - 0.5) * 0.3,
          Math.random() * Math.PI * 2,
          (Math.random() - 0.5) * 0.3,
        );
        dummy.scale.set(width, height, width);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(mesh);
  }

  // ── 沙滩婚礼仪式区 ─────────────────────────────────────────

  private buildBeachCeremony() {
    this.buildBeachStage();
    this.buildBeachEasels();
    const archZ = this.beachArchZ;
    const archHalfW = this.beachArchHalfW;
    const topY = this.stageDeckY + 2.8;
    this.beachArchTopY = topY;
    this.buildBeachArchFrame(archZ, archHalfW, topY);
    this.buildBeachArchVeils(archZ, archHalfW, topY);
    this.buildBeachArchFloral(archZ, archHalfW, topY);
    this.buildBeachPetalPattern(archZ);
    this.buildBeachBackVeils(archZ, archHalfW, topY);
    this.beachPewEnds = this.buildBeachChairs();
    this.buildBeachAislePetals();
    this.buildBeachStemRoses(archZ, archHalfW, this.beachPewEnds);
    this.buildBeachLanterns();
    this.buildBeachTorches();
    this.buildBeachBirds();
  }

  /**
   * 抬高白木舞台：台面覆盖区沙面最高点 +0.45，四周围白色裙板遮住支撑，
   * 前沿居中两级台阶正对过道；左右前角落地花瓮、后角细高花柱，台面边缘一圈玻璃烛杯。
   */
  private buildBeachStage() {
    const hw = this.stageHalfW;
    const z0 = this.stageFrontZ;
    const z1 = this.stageBackZ;
    const zc = (z0 + z1) / 2;
    const zd = z1 - z0;

    let maxH = -Infinity;
    for (let ix = -4; ix <= 4; ix++) {
      for (let iz = 0; iz <= 6; iz++) {
        const x = (ix / 4) * hw;
        const z = z0 + (iz / 6) * zd;
        maxH = Math.max(maxH, this.beachHeight(x, z));
      }
    }
    const deckTop = maxH + this.stageRise;
    this.stageDeckY = deckTop;
    const deckBottom = deckTop - 0.12;

    const planksColor = this.loadOutdoorTex("planks_color.webp", true, 2.4, 1.4, "beach");
    const planksNormal = this.loadOutdoorTex("planks_normal.webp", false, 2.4, 1.4, "beach");
    const planksRough = this.loadOutdoorTex("planks_rough.webp", false, 2.4, 1.4, "beach");
    for (const t of [planksColor, planksNormal, planksRough]) {
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
    }
    const deckMat = new THREE.MeshStandardMaterial({
      map: planksColor,
      normalMap: planksNormal,
      roughnessMap: planksRough,
      color: "#f7f1e6",
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughness: 1,
      metalness: 0,
      envMapIntensity: 0.55,
    });
    this.applyFakeSun(deckMat);

    const deckParts: THREE.BufferGeometry[] = [];
    const deckBox = new THREE.BoxGeometry(hw * 2, 0.12, zd);
    deckBox.translate(0, deckTop - 0.06, zc);
    deckParts.push(deckBox);
    const stepTopA = deckTop - this.stageRise / 3;
    const stepTopB = deckTop - (this.stageRise * 2) / 3;
    [stepTopA, stepTopB].forEach((top, i) => {
      const g = new THREE.BoxGeometry(this.stepHalfW * 2, 0.14, this.stepDepth + 0.04);
      g.translate(0, top - 0.07, z0 - this.stepDepth * (i + 0.5) + 0.02);
      deckParts.push(g);
    });
    this.beachGroup.add(new THREE.Mesh(this.mergeParts(deckParts, "beach stage deck"), deckMat));

    const trimMat = new THREE.MeshStandardMaterial({
      color: "#d8bb82",
      roughness: 0.35,
      metalness: 0.75,
      envMapIntensity: 1,
    });
    this.applyFakeSun(trimMat);
    const trimParts: THREE.BufferGeometry[] = [];
    const trim = (w: number, d: number, x: number, z: number) => {
      const g = new THREE.BoxGeometry(w, 0.035, d);
      g.translate(x, deckTop + 0.01, z);
      trimParts.push(g);
    };
    trim(hw * 2 + 0.06, 0.06, 0, z0 - 0.02);
    trim(hw * 2 + 0.06, 0.06, 0, z1 + 0.02);
    trim(0.06, zd + 0.06, -hw - 0.02, zc);
    trim(0.06, zd + 0.06, hw + 0.02, zc);
    this.beachGroup.add(new THREE.Mesh(this.mergeParts(trimParts, "beach stage trim"), trimMat));

    const whiteMat = new THREE.MeshStandardMaterial({
      color: "#f6f1e8",
      roughness: 0.65,
      metalness: 0.02,
      envMapIntensity: 0.6,
    });
    this.applyFakeSun(whiteMat);
    const whiteParts: THREE.BufferGeometry[] = [];
    const pushBox = (
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      ry = 0,
    ) => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateY(ry);
      g.translate(x, y, z);
      whiteParts.push(g);
    };
    const skirtBottom = (xs: number[], zs: number[]) => {
      let m = Infinity;
      for (const x of xs) for (const z of zs) m = Math.min(m, this.beachHeight(x, z));
      return m - 0.06;
    };
    const frontSkirt = skirtBottom([-hw, 0, hw], [z0, z0 + 0.3]);
    pushBox(hw * 2, deckBottom - frontSkirt, 0.08, 0, (deckBottom + frontSkirt) / 2, z0 + 0.04);
    const backSkirt = skirtBottom([-hw, 0, hw], [z1 - 0.3, z1]);
    pushBox(hw * 2, deckBottom - backSkirt, 0.08, 0, (deckBottom + backSkirt) / 2, z1 - 0.04);
    const sideSkirt = skirtBottom([-hw, hw], [z0, zc, z1]);
    [-1, 1].forEach((s) =>
      pushBox(0.08, deckBottom - sideSkirt, zd, s * (hw - 0.04), (deckBottom + sideSkirt) / 2, zc),
    );
    const supportZ = [z0 + 0.7, z0 + 1.6, z1 - 0.6];
    [-2.2, 0, 2.2].forEach((x) => {
      supportZ.forEach((z) => {
        const ground = this.beachHeight(x, z) - 0.1;
        pushBox(0.14, deckBottom - ground, 0.14, x, (deckBottom + ground) / 2, z);
      });
    });
    const frameTop = deckTop + 2.8;
    [-1, 1].forEach((s) => {
      const x = s * (hw - 0.25);
      pushBox(0.1, frameTop - deckTop, 0.1, x, (frameTop + deckTop) / 2, z1 - 0.25);
    });
    pushBox(hw * 2 - 0.4, 0.08, 0.08, 0, frameTop - 0.1, z1 - 0.25);

    const urnTop = deckTop + 0.72;
    [-1, 1].forEach((s) => {
      const x = s * (hw - 0.45);
      const z = z0 + 0.7;
      const base = new THREE.CylinderGeometry(0.16, 0.19, 0.1, 12);
      base.translate(x, deckTop + 0.05, z);
      whiteParts.push(base);
      const stem = new THREE.CylinderGeometry(0.09, 0.11, 0.3, 10);
      stem.translate(x, deckTop + 0.25, z);
      whiteParts.push(stem);
      const bowl = new THREE.CylinderGeometry(0.32, 0.16, 0.32, 14);
      bowl.translate(x, deckTop + 0.56, z);
      whiteParts.push(bowl);
      const lip = new THREE.TorusGeometry(0.32, 0.03, 6, 14);
      lip.rotateX(Math.PI / 2);
      lip.translate(x, deckTop + 0.72, z);
      whiteParts.push(lip);
      this.beachDecorFloralSpots.push({ x, y: urnTop, z, r: 0.4, n: 30, s: 1 });
    });

    const pillarTop = deckTop + 1.6;
    [-1, 1].forEach((s) => {
      const x = s * (hw - 0.35);
      const z = z1 - 0.35;
      const pole = new THREE.CylinderGeometry(0.045, 0.055, 1.6, 10);
      pole.translate(x, deckTop + 0.8, z);
      whiteParts.push(pole);
      const finial = new THREE.CylinderGeometry(0.1, 0.05, 0.14, 10);
      finial.translate(x, pillarTop + 0.07, z);
      whiteParts.push(finial);
      this.beachDecorFloralSpots.push({ x, y: pillarTop + 0.16, z, r: 0.24, n: 18, s: 0.85 });
    });

    this.beachGroup.add(new THREE.Mesh(this.mergeParts(whiteParts, "beach stage white"), whiteMat));
    this.addBeachStageFlowerSpots(deckTop, frameTop);
    this.buildBeachStageLuxe(deckTop, frameTop);

    const votiveSpots: [number, number][] = [];
    [-2.4, -1.75, 1.75, 2.4].forEach((x) => votiveSpots.push([x, z0 + 0.16]));
    [-1, 1].forEach((s) =>
      [58.3, 59.2, 60.1].forEach((z) => votiveSpots.push([s * (hw - 0.16), z])),
    );
    [-0.8, 0.8].forEach((x) => votiveSpots.push([x, z1 - 0.16]));
    const votiveGeo = new THREE.CylinderGeometry(0.05, 0.042, 0.1, 10, 1, true);
    votiveGeo.translate(0, 0.05, 0);
    const votives = new THREE.InstancedMesh(
      votiveGeo,
      this.vaseGlassMaterial("#f4fbfb", 0.28),
      votiveSpots.length,
    );
    votives.frustumCulled = false;
    votives.renderOrder = 2;
    const dummy = new THREE.Object3D();
    votiveSpots.forEach(([x, z], i) => {
      dummy.position.set(x, deckTop, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.updateMatrix();
      votives.setMatrixAt(i, dummy.matrix);
      this.beachFlames.push({
        x,
        y: deckTop + 0.07,
        z,
        phase: Math.random() * Math.PI * 2,
        scale: 0.62,
      });
    });
    votives.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(votives);

    for (let x = -hw; x <= hw + 0.01; x += 0.5) {
      this.outdoorCircles.beach.push({ x, z: z1, r: 0.25 });
      if (Math.abs(x) > 1.45) this.outdoorCircles.beach.push({ x, z: z0, r: 0.25 });
    }
    for (let z = z0; z <= z1 + 0.01; z += 0.5) {
      this.outdoorCircles.beach.push({ x: -hw, z, r: 0.25 });
      this.outdoorCircles.beach.push({ x: hw, z, r: 0.25 });
    }
  }

  /**
   * 舞台加花（全部走 beachDecorFloralSpots，玫瑰模板就绪后统一换成真实花头）：
   * 前沿花带（避开台阶口）、两侧台沿垂坠花串、台阶两旁落地花丘、台前沙面花簇、
   * 后框横梁花带 + 两根立柱自上而下的垂花。单头约 700 三角面，本批约 400 朵。
   */
  private addBeachStageFlowerSpots(deckTop: number, frameTop: number) {
    const hw = this.stageHalfW;
    const z0 = this.stageFrontZ;
    const z1 = this.stageBackZ;
    const spots = this.beachDecorFloralSpots;

    for (let x = 1.45; x <= hw - 0.1; x += 0.3) {
      // 前沿烛杯位于 |x|=1.75/2.4，花带在此留空，花与烛光交替
      if (Math.abs(x - 1.75) < 0.2 || Math.abs(x - 2.4) < 0.2) continue;
      for (const s of [-1, 1]) {
        spots.push({ x: s * x, y: deckTop + 0.07, z: z0 + 0.14, r: 0.17, n: 8, s: 0.66 });
      }
    }

    for (let z = z0 + 0.35; z <= z1 - 0.3; z += 0.34) {
      const k = (z - z0) / (z1 - z0);
      const drop = 0.1 + 0.06 * Math.sin(k * Math.PI * 3);
      for (const s of [-1, 1]) {
        spots.push({ x: s * (hw + 0.06), y: deckTop - drop, z, r: 0.14, n: 5, s: 0.6 });
      }
    }

    const stepSand = this.beachHeight(0, z0 - 0.5);
    for (const s of [-1, 1]) {
      const x = s * (this.stepHalfW + 0.42);
      spots.push({ x, y: stepSand + 0.3, z: z0 - 0.42, r: 0.36, n: 22, s: 0.9 });
      spots.push({ x: x + s * 0.28, y: stepSand + 0.14, z: z0 - 0.7, r: 0.2, n: 8, s: 0.7 });
      this.outdoorCircles.beach.push({ x, z: z0 - 0.45, r: 0.3 });
      for (const fx of [2.05, 2.65]) {
        const gx = s * fx;
        const gy = this.beachHeight(gx, z0 - 0.25);
        spots.push({ x: gx, y: gy + 0.16, z: z0 - 0.22, r: 0.24, n: 10, s: 0.75 });
      }
    }

    const beamY = frameTop - 0.02;
    for (let x = 1.9; x <= hw - 0.3; x += 0.28) {
      for (const s of [-1, 1]) {
        spots.push({ x: s * x, y: beamY, z: z1 - 0.25, r: 0.16, n: 6, s: 0.62 });
      }
    }
    for (const s of [-1, 1]) {
      const px = s * (hw - 0.25);
      spots.push({ x: px, y: frameTop + 0.02, z: z1 - 0.25, r: 0.26, n: 14, s: 0.8 });
      for (let y = frameTop - 0.3; y >= deckTop + 1.95; y -= 0.26) {
        const t = (frameTop - y) / (frameTop - deckTop);
        spots.push({ x: px, y, z: z1 - 0.25, r: 0.15 - t * 0.05, n: 4, s: 0.55 });
      }
    }
  }

  /**
   * 舞台精致陈设：
   * - 花拱两侧各一组三只高低错落的玻璃风灯（金色底托 + 白蜡烛，火焰并入 beachFlames 统一闪烁）；
   * - 后框横梁两端垂下水晶珠帘（每侧 8 串，外长内短，末端水滴坠），在白纱前闪光；
   * - 花拱脚、风灯脚补花丘；
   * - 台面前沿与台前沙面撒红/粉/白花瓣。
   */
  private buildBeachStageLuxe(deckTop: number, frameTop: number) {
    const hw = this.stageHalfW;
    const z0 = this.stageFrontZ;
    const z1 = this.stageBackZ;
    const archZ = this.beachArchZ;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();

    const lamps: { x: number; z: number; h: number; r: number }[] = [];
    for (const s of [-1, 1]) {
      const cx = s * 2.12;
      const cz = archZ - 0.55;
      lamps.push({ x: cx, z: cz, h: 0.52, r: 0.1 });
      lamps.push({ x: cx + s * 0.22, z: cz + 0.12, h: 0.38, r: 0.085 });
      lamps.push({ x: cx - s * 0.06, z: cz + 0.27, h: 0.27, r: 0.075 });
      this.beachDecorFloralSpots.push({ x: cx + s * 0.08, y: deckTop + 0.07, z: cz + 0.12, r: 0.3, n: 12, s: 0.6 });
      this.beachDecorFloralSpots.push({ x: s * 1.86, y: deckTop + 0.14, z: archZ - 0.12, r: 0.3, n: 18, s: 0.85 });
    }
    const glassGeo = new THREE.CylinderGeometry(1, 0.9, 1, 18, 1, true);
    glassGeo.translate(0, 0.5, 0);
    const baseGeo = new THREE.CylinderGeometry(1.2, 1.32, 1, 18);
    baseGeo.translate(0, 0.5, 0);
    const candleGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
    candleGeo.translate(0, 0.5, 0);
    const goldMat = new THREE.MeshStandardMaterial({
      color: "#d9bc84",
      metalness: 0.8,
      roughness: 0.28,
      envMapIntensity: 1.2,
    });
    this.applyFakeSun(goldMat);
    const waxMat = new THREE.MeshStandardMaterial({
      color: "#fbf6ec",
      roughness: 0.6,
      metalness: 0,
      emissive: "#ffe3bf",
      emissiveIntensity: 0.18,
    });
    this.applyFakeSun(waxMat);
    const glass = new THREE.InstancedMesh(glassGeo, this.vaseGlassMaterial("#f4fbfb", 0.22), lamps.length);
    const bases = new THREE.InstancedMesh(baseGeo, goldMat, lamps.length);
    const candles = new THREE.InstancedMesh(candleGeo, waxMat, lamps.length);
    glass.renderOrder = 2;
    lamps.forEach((l, i) => {
      const baseH = 0.035;
      bases.setMatrixAt(i, m4.compose(v.set(l.x, deckTop, l.z), q.identity(), sc.set(l.r, baseH, l.r)));
      glass.setMatrixAt(i, m4.compose(v.set(l.x, deckTop + baseH, l.z), q.identity(), sc.set(l.r, l.h, l.r)));
      const ch = l.h * 0.42;
      candles.setMatrixAt(i, m4.compose(v.set(l.x, deckTop + baseH, l.z), q.identity(), sc.set(l.r * 0.5, ch, l.r * 0.5)));
      this.beachFlames.push({
        x: l.x,
        y: deckTop + baseH + ch + 0.03,
        z: l.z,
        phase: Math.random() * Math.PI * 2,
        scale: 0.75,
      });
    });
    for (const mesh of [glass, bases, candles]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      this.beachGroup.add(mesh);
    }

    const beads: THREE.Matrix4[] = [];
    const drops: THREE.Matrix4[] = [];
    const beamBottom = frameTop - 0.14;
    const strandZ = z1 - 0.41;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const x = s * (1.86 + k * 0.1);
        const len = 0.5 + 0.8 * (k / 7) + 0.08 * Math.sin(k * 2.3);
        const n = Math.floor(len / 0.05);
        for (let b = 0; b < n; b++) {
          const r = b % 4 === 3 ? 0.019 : 0.012;
          beads.push(
            new THREE.Matrix4().compose(
              new THREE.Vector3(x, beamBottom - 0.03 - b * 0.05, strandZ),
              new THREE.Quaternion().setFromAxisAngle(v.set(0, 1, 0), Math.random() * Math.PI),
              new THREE.Vector3(r, r, r),
            ),
          );
        }
        drops.push(
          new THREE.Matrix4().compose(
            new THREE.Vector3(x, beamBottom - 0.03 - n * 0.05 - 0.03, strandZ),
            new THREE.Quaternion(),
            new THREE.Vector3(0.026, 0.05, 0.026),
          ),
        );
      }
    }
    const crystalMat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      metalness: 0.1,
      roughness: 0.04,
      envMapIntensity: 2.6,
      emissive: "#fff3e8",
      emissiveIntensity: 0.1,
      flatShading: true,
    });
    const addInst = (geo: THREE.BufferGeometry, mats: THREE.Matrix4[]) => {
      const mesh = new THREE.InstancedMesh(geo, crystalMat, mats.length);
      mesh.frustumCulled = false;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      this.beachGroup.add(mesh);
    };
    addInst(new THREE.IcosahedronGeometry(1, 0), beads);
    addInst(new THREE.OctahedronGeometry(1, 0), drops);

    const petalCount = this.touchMode ? 260 : 380;
    const petalMat = new THREE.MeshStandardMaterial({
      map: this.reg(this.petalTexture()),
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    this.applyFakeSun(petalMat);
    const petals = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.07), petalMat, petalCount);
    petals.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const sandFrontZ = z0 - this.stepDepth * 2;
    for (let i = 0; i < petalCount; i++) {
      let x: number;
      let z: number;
      let y: number;
      const r = Math.random();
      if (r < 0.3) {
        x = (Math.random() * 2 - 1) * (hw - 0.2);
        z = z0 + 0.25 + Math.random() * 0.7;
        y = deckTop + 0.012;
      } else if (r < 0.75) {
        x = (Math.random() * 2 - 1) * 3.2;
        z = sandFrontZ - 0.9 + Math.random() * 0.9;
        y = this.beachHeight(x, z) + 0.01;
      } else {
        const s = Math.random() < 0.5 ? -1 : 1;
        x = s * (this.stepHalfW + 0.1 + Math.random() * (hw + 0.4 - this.stepHalfW));
        z = sandFrontZ + Math.random() * (z0 - sandFrontZ + 0.1);
        y = this.beachHeight(x, z) + 0.01;
      }
      dummy.position.set(x, y, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      dummy.scale.setScalar(0.7 + Math.random() * 0.7);
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
      color.set(this.redMixPetalTone());
      petals.setColorAt(i, color);
    }
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
    petals.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(petals);
  }

  /**
   * 舞台两侧沙面各两座香槟金画架（1.45 倍室内欢迎牌画架），架上金框婚纱照，
   * 朝向观礼席并略向过道内转；画框角挂小花束、架脚一簇落地花。
   * 照片用 MeshBasicMaterial：太阳在海面一侧，画面朝向陆地会逆光，受光材质会发暗。
   */
  private buildBeachEasels() {
    // 舞台两侧：朝向观礼席（-z）并略向过道内转
    const stage = [
      { x: -4.0, z: 58.3 },
      { x: -4.7, z: 59.9 },
      { x: 4.0, z: 58.3 },
      { x: 4.7, z: 59.9 },
    ].map((s) => ({ ...s, dx: (s.x < 0 ? 1 : -1) * 0.38, dz: -0.92 }));
    // 木桥两侧：每 6m 一对、左右对称，画面朝向栈道并略朝门口，沿桥走向舞台时迎面可见
    const bridge: { x: number; z: number; dx: number; dz: number }[] = [];
    for (let k = 0; k < 5; k++) {
      for (const s of [-1, 1]) {
        bridge.push({ x: s * 2.55, z: 21 + k * 6, dx: -s * 0.8, dz: -0.6 });
      }
    }
    this.placeBeachEasels([...stage, ...bridge]);
  }

  private placeBeachEasels(spots: { x: number; z: number; dx: number; dz: number }[]) {
    const photos = this.opts.photos;
    const S = 1.45;
    const easelMat = new THREE.MeshStandardMaterial({
      color: "#e3c995",
      metalness: 0.65,
      roughness: 0.33,
      envMapIntensity: 1.1,
    });
    this.applyFakeSun(easelMat);
    const frameMat = new THREE.MeshStandardMaterial({
      color: "#cfae72",
      metalness: 0.75,
      roughness: 0.3,
      envMapIntensity: 1.2,
    });
    this.applyFakeSun(frameMat);
    const boardMat = new THREE.MeshBasicMaterial({ color: "#ebe5dc" });

    const easel = new THREE.InstancedMesh(this.makeEaselGeometry(), easelMat, spots.length);
    const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.05), frameMat, spots.length);
    const board = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), boardMat, spots.length);

    const ledgeTop = (0.6 + 0.0175) * S;
    const local = new THREE.Matrix4();
    const tilt = new THREE.Matrix4().makeRotationX(-0.1);
    const world = new THREE.Matrix4();
    const scaled = new THREE.Matrix4();
    const sz = new THREE.Matrix4();
    const p = new THREE.Vector3();

    spots.forEach((sp, i) => {
      const y = this.beachHeight(sp.x, sp.z) - 0.02;
      const toAisle = sp.dx > 0 ? 1 : -1;
      const ry = Math.atan2(sp.dx, sp.dz);
      const baseM = this.makeColumn(sp.x, y, sp.z, ry, S);
      easel.setMatrixAt(i, baseM);
      const rootM = this.makeColumn(sp.x, y, sp.z, ry, 1);

      const at = (lx: number, ly: number, lz: number) =>
        world.copy(rootM).multiply(local.makeTranslation(lx, ly, lz)).multiply(tilt);
      const slotId = this.easelSlotId("沙滩", spots, i);
      const wp = this.photoForSlot(slotId);
      const { pw, ph, fw, fh } = this.easelFrameSize(wp);
      const cy = ledgeTop + fh / 2;
      frame.setMatrixAt(i, scaled.copy(at(0, cy, 0.06)).multiply(sz.makeScale(fw, fh, 1)));
      board.setMatrixAt(i, scaled.copy(at(0, cy, 0.087)).multiply(sz.makeScale(fw - 0.08, fh - 0.08, 1)));

      const photoMat = this.makePhotoMaterial();
      // 精修照片按原比例、画框跟着横竖变形；没有时回退到配置照片并裁切铺满
      const src = wp?.src ?? (photos.length > 0 ? photos[i % photos.length].src : "");
      const key = src ? this.usePhoto(photoMat, wp, src, pw / ph) : "";
      const photo = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), photoMat);
      photo.matrixAutoUpdate = false;
      photo.matrix.copy(at(0, cy, 0.09));
      this.beachGroup.add(photo);
      this.photoTargets.push({ mesh: photo, w: pw, h: ph, zone: "beach", key });
      this.slotTag(slotId, new THREE.Vector3().setFromMatrixPosition(at(0, ledgeTop + fh + 0.35, 0.1)), this.beachGroup);

      p.set(-toAisle * (fw / 2 - 0.04), ledgeTop + fh - 0.04, 0.12).applyMatrix4(at(0, 0, 0));
      this.beachDecorFloralSpots.push({ x: p.x, y: p.y, z: p.z, r: 0.2, n: 10, s: 0.62 });
      p.set(0, 0, 0.45).applyMatrix4(rootM);
      this.beachDecorFloralSpots.push({ x: p.x, y: this.beachHeight(p.x, p.z) + 0.15, z: p.z, r: 0.26, n: 12, s: 0.75 });
      this.outdoorCircles.beach.push({ x: sp.x, z: sp.z, r: 0.55 });
    });
    for (const mesh of [easel, frame, board]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.needsUpdate = true;
      this.beachGroup.add(mesh);
    }
  }

  /** 舞台后方（面向大海）长白纱：挂在后框横梁上、随风摆动，形成舞台以海为背景的构图 */
  private buildBeachBackVeils(archZ: number, halfW: number, topY: number) {
    const h = topY - this.stageDeckY;
    const mat = this.chiffonMaterial({ opacity: 0.46, windDir: new THREE.Vector3(0.25, 0, -1), windStrength: 0.42, hangM: h });
    const geo = new THREE.PlaneGeometry(1, 1, 16, 48);
    const panels = [
      { x: -halfW - 0.55, w: 0.9 },
      { x: halfW + 0.55, w: 0.9 },
    ];
    const veil = new THREE.InstancedMesh(geo, mat, panels.length);
    veil.frustumCulled = false;
    const dummy = new THREE.Object3D();
    panels.forEach((p, i) => {
      dummy.position.set(p.x, topY - h / 2, archZ + 0.35);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(p.w, h, 1);
      dummy.updateMatrix();
      veil.setMatrixAt(i, dummy.matrix);
    });
    veil.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(veil);
  }

  // ── 沙滩休闲区（遮阳伞 / 草顶凉亭 / 躺椅 / 吧台）──────────────

  /**
   * 栈道两侧对称布置：左侧 4 组白色帆布遮阳伞 + 躺椅 + 边桌，右侧 3 组茅草 palapa +
   * 藤编双人沙发 + 矮几，另加一座白木草顶吧台。所有同类构件按材质合并，控制 draw call。
   */
  private buildBeachLounge() {
    const parasols = [
      { x: -7.0, z: 35.0 },
      { x: -11.5, z: 33.5 },
      { x: -7.5, z: 42.5 },
      { x: -12.0, z: 45.5 },
    ];
    const palapas = [
      { x: 7.0, z: 33.5 },
      { x: 11.5, z: 36.0 },
      { x: 7.5, z: 43.5 },
    ];
    const bar = { x: 14.0, z: 31.0 };

    const woodGeo: THREE.BufferGeometry[] = [];
    const canopyGeo: THREE.BufferGeometry[] = [];
    const cushionGeo: THREE.BufferGeometry[] = [];
    const thatchGeo: THREE.BufferGeometry[] = [];
    const rattanGeo: THREE.BufferGeometry[] = [];
    const glassGeo: THREE.BufferGeometry[] = [];
    const metalGeo: THREE.BufferGeometry[] = [];

    const place = (
      geo: THREE.BufferGeometry,
      x: number,
      y: number,
      z: number,
      ry = 0,
      s = 1,
    ) => {
      const g = geo.clone();
      g.applyMatrix4(
        new THREE.Matrix4().compose(
          new THREE.Vector3(x, y, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
          new THREE.Vector3(s, s, s),
        ),
      );
      return g;
    };

    const loungerFrame = this.makeLoungerFrameGeometry();
    const loungerCushion = this.makeLoungerCushionGeometry();
    const sideTable = this.makeSideTableGeometry();
    const canopy = this.makeParasolCanopyGeometry();
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.06, 2.6, 8);
    poleGeo.translate(0, 1.3, 0);
    const bucket = this.makeIceBucketGeometry();
    const flute = this.makeFluteGeometry();
    const vase = this.makeVaseGeometry();

    parasols.forEach((p) => {
      const g0 = this.beachHeight(p.x, p.z);
      woodGeo.push(place(poleGeo, p.x, g0, p.z));
      canopyGeo.push(place(canopy, p.x, g0 + 2.6, p.z));
      this.outdoorCircles.beach.push({ x: p.x, z: p.z, r: 0.12 });
      [-0.62, 0.62].forEach((dx) => {
        const lx = p.x + dx;
        const lz = p.z + 0.1;
        const ly = this.beachHeight(lx, lz);
        woodGeo.push(place(loungerFrame, lx, ly, lz));
        cushionGeo.push(place(loungerCushion, lx, ly, lz));
        this.outdoorCircles.beach.push({ x: lx, z: lz - 0.45, r: 0.38 });
        this.outdoorCircles.beach.push({ x: lx, z: lz + 0.45, r: 0.38 });
      });
      const tx = p.x + 1.35;
      const tz = p.z + 0.35;
      const ty = this.beachHeight(tx, tz);
      woodGeo.push(place(sideTable, tx, ty, tz));
      metalGeo.push(place(bucket, tx - 0.06, ty + 0.54, tz - 0.02));
      glassGeo.push(place(flute, tx + 0.06, ty + 0.54, tz + 0.07));
      glassGeo.push(place(flute, tx + 0.13, ty + 0.54, tz - 0.05));
      glassGeo.push(place(vase, tx - 0.04, ty + 0.54, tz + 0.12));
      this.beachDecorFloralSpots.push({
        x: tx - 0.04,
        y: ty + 0.68,
        z: tz + 0.12,
        r: 0.12,
        n: 8,
        s: 0.4,
      });
      this.outdoorCircles.beach.push({ x: tx, z: tz, r: 0.3 });
    });

    const sofa = this.makeSofaGeometry();
    const sofaCushion = this.makeSofaCushionGeometry();
    const coffeeTable = this.makeCoffeeTableGeometry();
    palapas.forEach((p) => {
      const g0 = this.beachHeight(p.x, p.z);
      const pole = new THREE.CylinderGeometry(0.07, 0.085, 2.9, 8);
      pole.translate(0, 1.45, 0);
      woodGeo.push(place(pole, p.x, g0, p.z));
      thatchGeo.push(place(this.makeThatchGeometry(1.55, 0.95), p.x, g0 + 2.15, p.z));
      this.outdoorCircles.beach.push({ x: p.x, z: p.z, r: 0.14 });
      const sx = p.x;
      const sz = p.z - 0.25;
      const sy = this.beachHeight(sx, sz);
      rattanGeo.push(place(sofa, sx, sy, sz));
      cushionGeo.push(place(sofaCushion, sx, sy, sz));
      this.outdoorCircles.beach.push({ x: sx - 0.5, z: sz, r: 0.45 });
      this.outdoorCircles.beach.push({ x: sx + 0.5, z: sz, r: 0.45 });
      const cx = p.x;
      const cz = p.z + 1.05;
      const cy = this.beachHeight(cx, cz);
      woodGeo.push(place(coffeeTable, cx, cy, cz));
      glassGeo.push(place(vase, cx + 0.2, cy + 0.41, cz));
      this.beachDecorFloralSpots.push({ x: cx + 0.2, y: cy + 0.55, z: cz, r: 0.12, n: 8, s: 0.4 });
      this.outdoorCircles.beach.push({ x: cx, z: cz, r: 0.35 });
    });

    const bg = this.beachHeight(bar.x, bar.z);
    const bw = 1.05;
    const bd = 0.35;
    for (const sx of [-bw, bw]) {
      for (const sz of [-bd, bd]) {
        const post = new THREE.CylinderGeometry(0.06, 0.07, 2.3, 8);
        post.translate(bar.x + sx, bg + 1.15, bar.z + sz);
        woodGeo.push(post);
      }
    }
    const counter = new THREE.BoxGeometry(bw * 2 + 0.2, 0.08, bd * 2 + 0.2);
    counter.translate(bar.x, bg + 1.05, bar.z);
    woodGeo.push(counter);
    const front = new THREE.BoxGeometry(bw * 2 + 0.2, 1.0, 0.06);
    front.translate(bar.x, bg + 0.52, bar.z - bd - 0.05);
    woodGeo.push(front);
    thatchGeo.push(place(this.makeThatchGeometry(1.9, 1.0), bar.x, bg + 2.3, bar.z));
    const coco = this.makeCoconutGeometry();
    [-0.5, 0, 0.5].forEach((dx) =>
      rattanGeo.push(place(coco, bar.x + dx, bg + 1.09, bar.z)),
    );
    this.outdoorCircles.beach.push({ x: bar.x - 0.6, z: bar.z, r: 0.5 });
    this.outdoorCircles.beach.push({ x: bar.x + 0.6, z: bar.z, r: 0.5 });

    const woodMat = new THREE.MeshStandardMaterial({
      color: "#f7f2e8",
      roughness: 0.7,
      metalness: 0.02,
      envMapIntensity: 0.55,
    });
    this.applyFakeSun(woodMat);
    const cushionMat = new THREE.MeshStandardMaterial({
      color: "#fbf8f2",
      roughness: 0.88,
      metalness: 0,
    });
    this.applyFakeSun(cushionMat);
    const rattanMat = new THREE.MeshStandardMaterial({
      color: "#9a7448",
      roughness: 0.9,
      metalness: 0,
    });
    this.applyFakeSun(rattanMat);
    const metalMat = new THREE.MeshStandardMaterial({
      color: "#cfd6da",
      roughness: 0.28,
      metalness: 0.8,
      envMapIntensity: 1.1,
    });
    this.applyFakeSun(metalMat);

    const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, label: string) => {
      if (geos.length === 0) return;
      this.beachGroup.add(new THREE.Mesh(this.mergeParts(geos, label), mat));
    };
    add(woodGeo, woodMat, "beach lounge wood");
    add(canopyGeo, this.parasolCanvasMaterial(), "beach parasol canopy");
    add(cushionGeo, cushionMat, "beach lounge cushion");
    add(thatchGeo, this.thatchMaterial(), "beach palapa thatch");
    add(rattanGeo, rattanMat, "beach lounge rattan");
    add(metalGeo, metalMat, "beach lounge metal");
    const glass = new THREE.Mesh(this.mergeParts(glassGeo, "beach lounge glass"), this.vaseGlassMaterial("#eef7f9", 0.34));
    glass.renderOrder = 2;
    this.beachGroup.add(glass);
  }

  /** 躺椅框架：座面 0.62×1.7、靠背 35° 后仰，原点在座面下方、朝 +Z */
  private makeLoungerFrameGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const seatY = 0.3;
    const w = 0.62;
    const len = 1.7;
    const rail = 0.06;
    [-1, 1].forEach((s) => {
      const side = new THREE.BoxGeometry(rail, rail, len);
      side.translate(s * (w / 2 - rail / 2), seatY, 0.05);
      parts.push(side);
      [-0.7, 0.75].forEach((z) => {
        const leg = new THREE.BoxGeometry(rail, seatY, rail);
        leg.translate(s * (w / 2 - rail / 2), seatY / 2, z);
        parts.push(leg);
      });
    });
    const slat = new THREE.BoxGeometry(w - rail, 0.04, len - 0.1);
    slat.translate(0, seatY - 0.01, 0.05);
    parts.push(slat);
    const back = new THREE.BoxGeometry(w, 0.05, 0.72);
    back.rotateX(-Math.PI / 2 + 0.61);
    back.translate(0, seatY + 0.32, -0.72);
    parts.push(back);
    return this.mergeParts(parts, "lounger frame");
  }

  private makeLoungerCushionGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const seat = new THREE.BoxGeometry(0.56, 0.1, 1.5);
    seat.translate(0, 0.4, 0.08);
    parts.push(seat);
    const back = new THREE.BoxGeometry(0.56, 0.1, 0.7);
    back.rotateX(-Math.PI / 2 + 0.61);
    back.translate(0, 0.7, -0.68);
    parts.push(back);
    return this.mergeParts(parts, "lounger cushion");
  }

  private makeSideTableGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const top = new THREE.CylinderGeometry(0.26, 0.26, 0.04, 12);
    top.translate(0, 0.52, 0);
    parts.push(top);
    const rim = new THREE.TorusGeometry(0.26, 0.015, 6, 14);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, 0.5, 0);
    parts.push(rim);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.CylinderGeometry(0.015, 0.02, 0.5, 8);
      leg.translate(Math.cos(a) * 0.2, 0.25, Math.sin(a) * 0.2);
      parts.push(leg);
    }
    return this.mergeParts(parts, "side table");
  }

  private makeSofaGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const base = new THREE.BoxGeometry(1.5, 0.34, 0.72);
    base.translate(0, 0.17, 0);
    parts.push(base);
    const back = new THREE.BoxGeometry(1.5, 0.46, 0.12);
    back.translate(0, 0.57, -0.3);
    parts.push(back);
    [-1, 1].forEach((s) => {
      const arm = new THREE.BoxGeometry(0.12, 0.4, 0.72);
      arm.translate(s * 0.69, 0.44, 0);
      parts.push(arm);
    });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const foot = new THREE.BoxGeometry(0.08, 0.06, 0.08);
        foot.translate(sx * 0.64, 0.03, sz * 0.28);
        parts.push(foot);
      }
    }
    return this.mergeParts(parts, "sofa");
  }

  private makeSofaCushionGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const seat = new THREE.BoxGeometry(1.26, 0.12, 0.6);
    seat.translate(0, 0.4, 0.03);
    parts.push(seat);
    [-1, 1].forEach((s) => {
      const b = new THREE.BoxGeometry(0.58, 0.38, 0.1);
      b.rotateX(-0.12);
      b.translate(s * 0.32, 0.68, -0.24);
      parts.push(b);
    });
    return this.mergeParts(parts, "sofa cushion");
  }

  private makeCoffeeTableGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const top = new THREE.BoxGeometry(0.95, 0.06, 0.55);
    top.translate(0, 0.38, 0);
    parts.push(top);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const leg = new THREE.BoxGeometry(0.06, 0.38, 0.06);
        leg.translate(sx * 0.42, 0.19, sz * 0.22);
        parts.push(leg);
      }
    }
    return this.mergeParts(parts, "coffee table");
  }

  /** 八角帆布伞面：伞骨间下垂 + 外圈荷叶边，顶点色做白/浅沙交替条纹 */
  private makeParasolCanopyGeometry(): THREE.BufferGeometry {
    const R = 1.18;
    const drop = 0.6;
    const sag = 0.12;
    const spokes = 16;
    const ringT = [0, 0.45, 0.78, 1.0, 1.08];
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const edges: number[] = [];
    const indices: number[] = [];
    const white = new THREE.Color("#ffffff");
    const sand = new THREE.Color("#f1e7d2");
    ringT.forEach((t, r) => {
      const fringe = r === ringT.length - 1;
      for (let k = 0; k <= spokes; k++) {
        const kk = k % spokes;
        const rib = kk % 2;
        const sector = Math.floor(kk / 2);
        const a = (kk / spokes) * Math.PI * 2;
        const rr = R * t;
        const y =
          -drop * Math.pow(t, 1.4) -
          sag * rib * Math.pow(t, 2) -
          (fringe ? 0.05 + 0.03 * rib : 0);
        positions.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
        normals.push(0, 1, 0);
        uvs.push(k / spokes, t);
        const c = sector % 2 === 0 ? white : sand;
        colors.push(c.r, c.g, c.b);
        edges.push(Math.min(1, t));
      }
    });
    for (let r = 0; r < ringT.length - 1; r++) {
      for (let k = 0; k < spokes; k++) {
        const a = r * (spokes + 1) + k;
        indices.push(a, a + spokes + 1, a + 1, a + 1, a + spokes + 1, a + spokes + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute("aEdge", new THREE.Float32BufferAttribute(edges, 1));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /** 茅草顶：4 层重叠圆锥，底缘随机错位形成不齐茬口，顶点色带麦秆色噪声 */
  private makeThatchGeometry(radius: number, height: number): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const layers = 4;
    const base = new THREE.Color("#c8ad74");
    const straw = new THREE.Color("#e2cd9c");
    for (let l = 0; l < layers; l++) {
      const f = l / (layers - 1);
      const r = radius * (1 - 0.62 * f);
      const h = height * (0.4 - 0.18 * f) + 0.12;
      const y0 = height * f * 0.85;
      const seg = 12;
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const colors: number[] = [];
      const edges: number[] = [];
      const indices: number[] = [];
      positions.push(0, y0 + h, 0);
      normals.push(0, 1, 0);
      uvs.push(0.5, 1);
      colors.push(straw.r, straw.g, straw.b);
      edges.push(0);
      for (let k = 0; k <= seg; k++) {
        const kk = k % seg;
        const a = (kk / seg) * Math.PI * 2;
        const jitter =
          this.beachNoise(Math.cos(a) * r * 2 + l * 7.3, Math.sin(a) * r * 2 + l * 3.1) * 0.72 +
          Math.random() * 0.28;
        const rr = r * (0.9 + jitter * 0.22);
        positions.push(Math.cos(a) * rr, y0 + (jitter - 0.5) * 0.06, Math.sin(a) * rr);
        normals.push(0, 1, 0);
        uvs.push(k / seg, 0);
        const c = base.clone().lerp(straw, clamp(jitter * 1.2, 0, 1));
        colors.push(c.r, c.g, c.b);
        edges.push(1);
      }
      for (let k = 0; k < seg; k++) indices.push(0, 1 + k, 1 + k + 1);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      g.setAttribute("aEdge", new THREE.Float32BufferAttribute(edges, 1));
      g.setIndex(indices);
      g.computeVertexNormals();
      parts.push(g);
    }
    return this.mergeParts(parts, "thatch layer");
  }

  private makeIceBucketGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const body = new THREE.CylinderGeometry(0.17, 0.13, 0.24, 14);
    body.translate(0, 0.12, 0);
    parts.push(body);
    const rim = new THREE.TorusGeometry(0.17, 0.02, 6, 16);
    rim.rotateX(Math.PI / 2);
    rim.translate(0, 0.24, 0);
    parts.push(rim);
    return this.mergeParts(parts, "ice bucket");
  }

  private makeFluteGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const foot = new THREE.CylinderGeometry(0.035, 0.04, 0.012, 10);
    foot.translate(0, 0.006, 0);
    parts.push(foot);
    const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.07, 6);
    stem.translate(0, 0.047, 0);
    parts.push(stem);
    const bowl = new THREE.CylinderGeometry(0.022, 0.012, 0.1, 10);
    bowl.translate(0, 0.132, 0);
    parts.push(bowl);
    return this.mergeParts(parts, "flute");
  }

  private makeVaseGeometry(): THREE.BufferGeometry {
    const g = new THREE.CylinderGeometry(0.045, 0.035, 0.12, 10);
    g.translate(0, 0.06, 0);
    return g;
  }

  private makeCoconutGeometry(): THREE.BufferGeometry {
    const g = new THREE.SphereGeometry(0.085, 10, 8);
    g.scale(1, 1.05, 1);
    g.translate(0, 0.09, 0);
    return g;
  }

  /** 帆布伞面材质：注入假太阳 + 背光透光 + 边缘风摆（aEdge 控制，仅伞缘晃动） */
  private parasolCanvasMaterial(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0,
      side: THREE.DoubleSide,
      envMapIntensity: 0.5,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniform;
      shader.uniforms.uSunDir = { value: this.SUN_DIR };
      shader.uniforms.uSunColor = { value: this.SUN_COLOR };
      shader.uniforms.uSunIntensity = this.sunIntensityU;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          attribute float aEdge;
          varying float vEdge;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vEdge = aEdge;
          {
            float ph = fract(sin(dot(transformed.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
            float gust = sin(uTime * 0.9 + ph) * 0.6 + sin(uTime * 1.6 + ph * 1.7) * 0.4;
            transformed.x += gust * aEdge * 0.05;
            transformed.z += gust * aEdge * 0.03;
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunIntensity;
          varying float vEdge;`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            vec3 V = normalize(vViewPosition);
            float diff = max(dot(normal, sunView), 0.0);
            float back = pow(clamp(dot(V, -sunView), 0.0, 1.0), 2.5) * (0.35 + 0.65 * vEdge);
            reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * (diff * 0.9 + back * 0.45);
          }`,
        );
    };
    return mat;
  }

  /** 茅草顶材质：平面着色做草片棱角 + 假太阳 + 底缘风摆 */
  private thatchMaterial(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
      envMapIntensity: 0.45,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniform;
      shader.uniforms.uSunDir = { value: this.SUN_DIR };
      shader.uniforms.uSunColor = { value: this.SUN_COLOR };
      shader.uniforms.uSunIntensity = this.sunIntensityU;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          attribute float aEdge;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            float ph = fract(sin(dot(transformed.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
            float gust = sin(uTime * 0.8 + ph) * 0.6 + sin(uTime * 1.5 + ph * 1.6) * 0.4;
            transformed.x += gust * aEdge * 0.03;
            transformed.z += gust * aEdge * 0.02;
          }`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunIntensity;`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            vec3 sunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * max(dot(normal, sunView), 0.0);
          }`,
        );
    };
    return mat;
  }

  /** 舞台花瓮/花柱与休闲区小花：优先真实玫瑰模板，缺模板时程序化兜底并在就绪后替换 */
  private buildBeachDecorFloral() {
    if (this.beachDecorFloralReal || this.beachDecorFloralSpots.length === 0) return;
    const h0 = this.roseTemplates.head0;
    const h6 = this.roseTemplates.head6;
    const h5 = this.roseTemplates.head5;
    const leafTpl = this.roseTemplates.leaf;
    if (h0 && h6 && h5 && leafTpl) {
      this.addRealDecorFloral(h0, h6, h5, leafTpl);
      this.beachDecorFloralReal = true;
      return;
    }
    if (this.beachDecorFloralFallback) return;
    const b: Floral = {
      roses: [],
      roseColors: [],
      hydrangeas: [],
      hydColors: [],
      leaves: [],
      leafColors: [],
    };
    this.beachDecorFloralSpots.forEach((sp) =>
      this.scatterFloral(b, sp.x, sp.y, sp.z, sp.r, sp.n, sp.s),
    );
    const group = this.finalizeFloral(b);
    this.scene.remove(group);
    this.beachGroup.add(group);
    this.beachDecorFloralFallback = group;
  }

  private addRealDecorFloral(
    h0: GlbTemplate,
    h6: GlbTemplate,
    h5: GlbTemplate,
    leafTpl: GlbTemplate,
  ) {
    const headTpls: GlbTemplate[] = [h0, h6, h5];
    const headMats: THREE.Matrix4[][] = [[], [], []];
    const headCols: THREE.Color[][] = [[], [], []];
    const leafMats: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    this.beachDecorFloralSpots.forEach((sp) => {
      const center = new THREE.Vector3(sp.x, sp.y, sp.z);
      for (let i = 0; i < sp.n; i++) {
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const rr = sp.r * (0.4 + 0.6 * Math.cbrt(Math.random()));
        const p = new THREE.Vector3(
          sp.x + Math.sin(ph) * Math.cos(th) * rr,
          sp.y + Math.cos(ph) * rr * 0.65,
          sp.z + Math.sin(ph) * Math.sin(th) * rr,
        );
        const dir = p.clone().sub(center);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
        const r = Math.random();
        const hi = r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
        const s = (1.6 + Math.random() * 0.5) * sp.s;
        headMats[hi].push(
          new THREE.Matrix4().compose(p, this.floralDirQuat(dir, 0.44), new THREE.Vector3(s, s, s)),
        );
        headCols[hi].push(this.beachRoseTone());
      }
      const leaves = Math.round(sp.n * 0.7);
      for (let i = 0; i < leaves; i++) {
        const th = Math.random() * Math.PI * 2;
        const rr = sp.r * (0.85 + Math.random() * 0.25);
        const p = new THREE.Vector3(
          sp.x + Math.cos(th) * rr,
          sp.y - sp.r * 0.2 + Math.random() * sp.r * 0.4,
          sp.z + Math.sin(th) * rr,
        );
        const q = this.floralDirQuat(
          new THREE.Vector3(Math.cos(th), -0.2, Math.sin(th)),
          0.7,
        ).multiply(new THREE.Quaternion().setFromAxisAngle(up, Math.random() * Math.PI * 2));
        const s = (2.5 + Math.random()) * sp.s;
        leafMats.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s)));
      }
    });

    const headMat = this.archHeadMaterial(h0.primitives[0].material);
    const leafMat = this.archLeafMaterial(leafTpl.primitives[0].material);
    if (headMat instanceof THREE.MeshStandardMaterial) this.applyFakeSun(headMat);
    if (leafMat instanceof THREE.MeshStandardMaterial) this.applyFakeSun(leafMat);
    const addInst = (
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      mats: THREE.Matrix4[],
      cols?: THREE.Color[],
    ) => {
      if (mats.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      mesh.frustumCulled = false;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      if (cols) {
        cols.forEach((c, i) => mesh.setColorAt(i, c));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      this.beachGroup.add(mesh);
    };
    headTpls.forEach((tpl, i) =>
      addInst(tpl.primitives[0].geometry, headMat, headMats[i], headCols[i]),
    );
    addInst(leafTpl.primitives[0].geometry, leafMat, leafMats);
  }

  private floralDirQuat(dir: THREE.Vector3, maxAngle: number): THREE.Quaternion {
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    const axis = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize();
    return q.multiply(
      new THREE.Quaternion().setFromAxisAngle(axis, (Math.random() * 2 - 1) * maxAngle),
    );
  }

  /**
   * 舞台雪纺纱：顶部收拢密褶 + 恒定风向持续吹拂（阵风只调强弱）+ 横向行进波 + 下摆高频抖动；
   * 顶点里用有限差分重算法线，褶皱/波浪能正确受光。
   * 约定：纱面几何在局部 XY 平面、实例不旋转（局部轴 = 世界轴），uv.y=1 为挂点、0 为下摆；
   * hangM 为纱面实际下垂长度（米），用于把 uv.y 换算成米制偏导。
   */
  private chiffonMaterial(opts: { opacity: number; windDir: THREE.Vector3; windStrength: number; hangM: number }) {
    const mat = new THREE.MeshPhysicalMaterial({
      color: "#fffdf8",
      roughness: 0.78,
      metalness: 0,
      sheen: 1,
      sheenRoughness: 0.42,
      sheenColor: new THREE.Color("#fff3e6"),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: opts.opacity,
      depthWrite: false,
      envMapIntensity: 0.55,
    });
    const wind = opts.windDir.clone().setY(0).normalize();
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniform;
      shader.uniforms.uWindDir = { value: wind };
      shader.uniforms.uWindStrength = { value: opts.windStrength };
      shader.uniforms.uHangM = { value: opts.hangM };
      shader.uniforms.uSunDir = { value: this.SUN_DIR };
      shader.uniforms.uSunColor = { value: this.SUN_COLOR };
      shader.uniforms.uSunIntensity = this.sunIntensityU;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          uniform vec3 uWindDir;
          uniform float uWindStrength;
          uniform float uHangM;
          varying vec2 vVeilUv;
          varying vec2 vVeilM;
          varying float vFold;
          float veilHash(vec2 p) {
            p = fract(p * vec2(123.34, 345.45));
            p += dot(p, p + 34.345);
            return fract(p.x * p.y);
          }
          // pm：纱面米制坐标；t：0=挂点 → 1=下摆
          vec3 veilDisp(vec3 pm, float t, float ph) {
            // 阵风包络恒 > 0.55：风一直在吹，只是忽强忽弱
            float gust = 0.8 + 0.2 * sin(uTime * 0.53 + ph) + 0.12 * sin(uTime * 1.37 + ph * 2.1);
            float lean = uWindStrength * pow(t, 1.6) * gust;
            vec3 d = uWindDir * lean;
            // 下摆被吹起时整体上扬（摆长守恒近似）
            d.y += lean * lean / (2.0 * max(uHangM, 0.3));
            // 沿纱面横向推进的鼓浪
            float wave = sin(pm.x * 3.2 - uTime * 2.2 + t * 3.0 + ph) * 0.6
                       + sin(pm.x * 5.7 + uTime * 1.6 - t * 2.2 + ph * 1.3) * 0.4;
            d.z += wave * 0.09 * pow(t, 1.2) * (0.6 + 0.4 * gust);
            d.x += sin(uTime * 1.9 + t * 4.0 + ph) * 0.05 * t * t;
            // 下摆高频抖动
            d.z += sin(pm.x * 22.0 - uTime * 7.0 + ph) * 0.018 * smoothstep(0.7, 1.0, t);
            // 褶皱：约 0.2m 一褶，挂点处收拢更深，向下逐渐舒展
            d.z += sin(pm.x * 31.4 + ph) * mix(0.05, 0.028, t);
            return d;
          }`,
        )
        .replace(
          "#include <beginnormal_vertex>",
          `vec3 veilScl = vec3(1.0);
          float veilPh = 0.0;
          #ifdef USE_INSTANCING
            veilScl = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
            veilPh = veilHash(instanceMatrix[3].xz) * 6.2831;
          #endif
          vec3 veilPm = position * veilScl;
          float veilT = 1.0 - uv.y;
          vec3 veilD = veilDisp(veilPm, veilT, veilPh);
          vec3 veilP = veilPm + veilD;
          // 有限差分法线（米制空间），再换回局部空间：n_local ∝ S · n_metre
          float ve = 0.02;
          vec3 veilPx = veilPm + vec3(ve, 0.0, 0.0) + veilDisp(veilPm + vec3(ve, 0.0, 0.0), veilT, veilPh);
          vec3 veilPy = veilPm + vec3(0.0, ve, 0.0) + veilDisp(veilPm + vec3(0.0, ve, 0.0), veilT - ve / max(uHangM, 0.05), veilPh);
          vec3 veilN = normalize(cross(veilPx - veilP, veilPy - veilP));
          vec3 objectNormal = normalize(veilN * veilScl);
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif
          vVeilUv = uv;
          vVeilM = veilPm.xy;
          vFold = sin(veilPm.x * 31.4 + veilPh);`,
        )
        .replace(
          "#include <begin_vertex>",
          `vec3 transformed = veilP / veilScl;
          #ifdef USE_ALPHAHASH
            vPosition = vec3(position);
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunIntensity;
          varying vec2 vVeilUv;
          varying vec2 vVeilM;
          varying float vFold;`,
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          {
            // 褶谷略暗、褶峰略亮
            diffuseColor.rgb *= 0.9 + 0.1 * vFold;
            // 经纬纱线细纹：按屏幕导数淡出，远处不闪
            float wx = vVeilM.x * 180.0;
            float wy = vVeilM.y * 180.0;
            float aa = clamp(1.0 - max(fwidth(wx), fwidth(wy)) * 0.6, 0.0, 1.0);
            float weave = (0.5 + 0.5 * sin(wx)) * (0.5 + 0.5 * sin(wy));
            diffuseColor.a *= 1.0 - 0.18 * weave * aa;
          }`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          {
            // 薄纱掠射角更密；卷边下摆与挂点更实
            vec3 veilV = normalize(vViewPosition);
            float grazing = pow(1.0 - abs(dot(normal, veilV)), 2.0);
            float hem = 1.0 - smoothstep(0.0, 0.025, vVeilUv.y);
            float top = smoothstep(0.975, 1.0, vVeilUv.y);
            diffuseColor.a = clamp(diffuseColor.a * (0.72 + 0.95 * grazing) + 0.35 * max(hem, top), 0.0, 0.96);
          }`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            vec3 veilL = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            vec3 veilV2 = normalize(vViewPosition);
            // 薄布两面受光
            float ndl = abs(dot(normal, veilL));
            reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * (0.18 + 0.4 * ndl);
            // 逆光透射：视线穿过纱朝向太阳时透出暖光
            float trans = pow(clamp(dot(veilV2, -veilL), 0.0, 1.0), 3.0);
            reflectedLight.directDiffuse += uSunColor * uSunIntensity * trans * 0.32 * vec3(1.0, 0.95, 0.86);
          }`,
        );
    };
    return mat;
  }

  /** 半透明白纱材质：上缘固定、越往下摆幅越大的阵风摆动（复用 windUniform） */
  private veilWindMaterial(opacity: number): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 0.92,
      metalness: 0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity,
      depthWrite: false,
      envMapIntensity: 0.4,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          float veilHash(vec2 p) {
            p = fract(p * vec2(123.34, 345.45));
            p += dot(p, p + 34.345);
            return fract(p.x * p.y);
          }`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            float tt = 1.0 - uv.y;
            float ph = 0.0;
            #ifdef USE_INSTANCING
              ph = veilHash(instanceMatrix[3].xz) * 6.2831;
            #endif
            float gust = sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.4;
            float amp = tt * tt;
            transformed.x += gust * amp * 0.22;
            transformed.z += (0.5 + 0.5 * sin(uTime * 0.8 + ph)) * amp * 0.1;
          }`,
        );
    };
    return mat;
  }

  private buildBeachArchFrame(archZ: number, halfW: number, topY: number) {
    const postR = 0.07;
    const base = this.stageDeckY - 0.2;
    const parts: THREE.BufferGeometry[] = [];
    const post = (x: number) => {
      const g = new THREE.CylinderGeometry(postR, postR * 1.12, topY - base, 10);
      g.translate(x, (topY + base) / 2, archZ);
      parts.push(g);
    };
    post(-halfW);
    post(halfW);
    const beam = new THREE.CylinderGeometry(postR * 0.9, postR * 0.9, halfW * 2 + 0.34, 10);
    beam.rotateZ(Math.PI / 2);
    beam.translate(0, topY, archZ);
    parts.push(beam);

    const mat = new THREE.MeshStandardMaterial({
      color: "#f4efe6",
      roughness: 0.72,
      metalness: 0.02,
      envMapIntensity: 0.6,
    });
    this.applyFakeSun(mat);
    this.beachGroup.add(new THREE.Mesh(this.mergeParts(parts, "beach arch frame"), mat));
    this.outdoorCircles.beach.push({ x: -halfW, z: archZ, r: 0.25 });
    this.outdoorCircles.beach.push({ x: halfW, z: archZ, r: 0.25 });
  }

  private buildBeachArchVeils(archZ: number, halfW: number, topY: number) {
    const mat = this.chiffonMaterial({ opacity: 0.55, windDir: new THREE.Vector3(0.25, 0, -1), windStrength: 0.3, hangM: 2.9 });
    const geo = new THREE.PlaneGeometry(1, 1, 10, 40);
    const panels: { x: number; z: number; w: number; h: number }[] = [
      { x: -halfW + 0.1, z: archZ + 0.03, w: 0.5, h: 2.9 },
      { x: -halfW + 0.32, z: archZ - 0.05, w: 0.4, h: 2.6 },
      { x: halfW - 0.1, z: archZ + 0.03, w: 0.5, h: 2.9 },
      { x: halfW - 0.32, z: archZ - 0.05, w: 0.4, h: 2.6 },
    ];
    const veil = new THREE.InstancedMesh(geo, mat, panels.length);
    veil.frustumCulled = false;
    const dummy = new THREE.Object3D();
    panels.forEach((p, i) => {
      dummy.position.set(p.x, topY - p.h / 2, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(p.w, p.h, 1);
      dummy.updateMatrix();
      veil.setMatrixAt(i, dummy.matrix);
    });
    veil.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(veil);

    // 横梁上的弧形垂纱
    const swag = new THREE.Mesh(
      this.makeBeachSwagGeometry(),
      this.chiffonMaterial({ opacity: 0.52, windDir: new THREE.Vector3(0.25, 0, -1), windStrength: 0.1, hangM: 0.4 }),
    );
    swag.position.set(0, topY - 0.02, archZ - 0.09);
    this.beachGroup.add(swag);
  }

  private makeBeachSwagGeometry(): THREE.BufferGeometry {
    const N = 40;
    const ROWS = 8;
    const span = 0.95;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = -span + 2 * span * t;
      const sag = -0.35 * Math.sin(Math.PI * t);
      for (let r = 0; r <= ROWS; r++) {
        const v = r / ROWS;
        positions.push(x, sag - 0.4 * v, 0);
        uvs.push(t, 1 - v);
      }
    }
    for (let i = 0; i < N; i++) {
      for (let r = 0; r < ROWS; r++) {
        const a = i * (ROWS + 1) + r;
        const b = a + ROWS + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /** 花拱花艺：横梁左上角一大团 + 右侧立柱中段一小团（不对称），真实 GLB 花头，缺模板则程序化兜底 */
  private buildBeachArchFloral(archZ: number, halfW: number, topY: number) {
    const h0 = this.roseTemplates.head0;
    const h6 = this.roseTemplates.head6;
    const h5 = this.roseTemplates.head5;
    const leafTpl = this.roseTemplates.leaf;

    if (!h0 || !h6 || !h5 || !leafTpl) {
      if (this.beachArchFloralFallback) return;
      const b: Floral = {
        roses: [],
        roseColors: [],
        hydrangeas: [],
        hydColors: [],
        leaves: [],
        leafColors: [],
      };
      this.scatterFloral(b, -halfW + 0.2, topY - 0.12, archZ, 0.42, 30, 1);
      this.scatterFloral(b, halfW - 0.05, topY - 1.0, archZ, 0.22, 12, 0.9);
      const group = this.finalizeFloral(b);
      this.scene.remove(group);
      this.beachGroup.add(group);
      this.beachArchFloralFallback = group;
      return;
    }

    if (this.beachArchFloralReal) return;

    const headTpls: GlbTemplate[] = [h0, h6, h5];
    const headMats: THREE.Matrix4[][] = [[], [], []];
    const headCols: THREE.Color[][] = [[], [], []];
    const leafMats: THREE.Matrix4[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const jitterQuat = (dir: THREE.Vector3, maxAngle: number) => {
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      const axis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
      ).normalize();
      return q.multiply(new THREE.Quaternion().setFromAxisAngle(axis, (Math.random() * 2 - 1) * maxAngle));
    };
    const placeHead = (p: THREE.Vector3, dir: THREE.Vector3) => {
      const r = Math.random();
      const hi = r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
      const s = 1.6 + Math.random() * 0.5;
      headMats[hi].push(new THREE.Matrix4().compose(p, jitterQuat(dir, 0.44), new THREE.Vector3(s, s, s)));
      headCols[hi].push(this.beachRoseTone());
    };
    const placeLeaf = (p: THREE.Vector3, dir: THREE.Vector3, s: number, roll: number) => {
      const q = jitterQuat(dir, 0.7).multiply(
        new THREE.Quaternion().setFromAxisAngle(up, roll + (Math.random() - 0.5) * 1.2),
      );
      leafMats.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s)));
    };

    // A. 横梁左上角一大团
    for (let i = 0; i < 40; i++) {
      const p = new THREE.Vector3(
        -halfW + 0.25 + (Math.random() - 0.5) * 0.9,
        topY - 0.12 + (Math.random() - 0.5) * 0.5 + Math.random() * 0.18,
        archZ + (Math.random() - 0.5) * 0.5,
      );
      placeHead(p, new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5, (Math.random() - 0.5) * 0.5));
    }
    // B. 右侧立柱中段一小团
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Vector3(
        halfW - 0.06 + (Math.random() - 0.5) * 0.26,
        topY - 1.05 + (Math.random() - 0.5) * 0.4,
        archZ + (Math.random() - 0.5) * 0.34,
      );
      placeHead(p, new THREE.Vector3(1, -0.2, (Math.random() - 0.5) * 0.4));
    }
    // C. 叶片：主团外围 + 立柱小团
    for (let i = 0; i < 34; i++) {
      const p = new THREE.Vector3(
        -halfW + 0.25 + (Math.random() - 0.5) * 1.1,
        topY - 0.18 + (Math.random() - 0.5) * 0.6,
        archZ + (Math.random() - 0.5) * 0.6,
      );
      placeLeaf(p, new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3, (Math.random() - 0.5) * 0.6), 2.5 + Math.random(), (i % 2) * (Math.PI / 2));
    }
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Vector3(
        halfW - 0.05 + (Math.random() - 0.5) * 0.3,
        topY - 1.05 + (Math.random() - 0.5) * 0.45,
        archZ + (Math.random() - 0.5) * 0.4,
      );
      placeLeaf(p, new THREE.Vector3(1, -0.25, (Math.random() - 0.5) * 0.5), 2.2 + Math.random(), (i % 2) * (Math.PI / 2));
    }
    // D. 热带大叶：放大叶模板形成棕榈/龟背叶观感
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Vector3(
        -halfW + 0.2 + (Math.random() - 0.5) * 1.0,
        topY - 0.35 - Math.random() * 0.35,
        archZ + (Math.random() - 0.5) * 0.45,
      );
      placeLeaf(p, new THREE.Vector3((Math.random() - 0.5) * 0.9, -0.5, (Math.random() - 0.5) * 0.7), 5.5 + Math.random() * 1.5, Math.random() * Math.PI * 2);
    }

    const headMat = this.archHeadMaterial(h0.primitives[0].material);
    const leafMat = this.archLeafMaterial(leafTpl.primitives[0].material);
    if (headMat instanceof THREE.MeshStandardMaterial) this.applyFakeSun(headMat);
    if (leafMat instanceof THREE.MeshStandardMaterial) this.applyFakeSun(leafMat);
    const addInst = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], cols?: THREE.Color[]) => {
      if (mats.length === 0) return;
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      if (cols) {
        cols.forEach((c, i) => mesh.setColorAt(i, c));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      this.beachGroup.add(mesh);
    };
    headTpls.forEach((tpl, i) => addInst(tpl.primitives[0].geometry, headMat, headMats[i], headCols[i]));
    addInst(leafTpl.primitives[0].geometry, leafMat, leafMats);
    this.beachArchFloralReal = true;
  }

  private beachRoseTone(): THREE.Color {
    const r = Math.random();
    const hex = r < 0.55 ? "#fbf6ef" : r < 0.85 ? "#f7d4da" : "#f6c9a8";
    return new THREE.Color(hex).multiplyScalar(0.96 + Math.random() * 0.08);
  }

  /** 花拱前的心形花瓣图案（直径约 1.6m） */
  private buildBeachPetalPattern(archZ: number) {
    const COUNT = 140;
    const mat = new THREE.MeshStandardMaterial({
      map: this.reg(this.petalTexture()),
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    this.applyFakeSun(mat);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.08, 0.055), mat, COUNT);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const cz = archZ - 1.4;
    const k = 0.052;
    for (let i = 0; i < COUNT; i++) {
      const th = Math.random() * Math.PI * 2;
      const f = Math.sqrt(Math.random()) * 0.94;
      const hx = 16 * Math.pow(Math.sin(th), 3);
      const hz = 13 * Math.cos(th) - 5 * Math.cos(2 * th) - 2 * Math.cos(3 * th) - Math.cos(4 * th);
      const x = hx * f * k;
      const z = cz - hz * f * k;
      dummy.position.set(x, this.stageDeckY + 0.012, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      dummy.scale.setScalar(0.8 + Math.random() * 0.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(f > 0.74 ? (Math.random() < 0.7 ? "#b3142e" : "#d33249") : Math.random() > 0.5 ? "#f6dde2" : "#fdf6f2");
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(mesh);
  }

  /** 舞台前花瓣配色：深红/正红约一半，其余腮红与象牙白 */
  private redMixPetalTone(): string {
    const r = Math.random();
    if (r < 0.34) return "#a8102a";
    if (r < 0.52) return "#d02c45";
    if (r < 0.8) return "#f6dde2";
    return "#fdf6f2";
  }

  /** 过道两侧各 5 排 × 5 把，面朝大海（+Z），返回靠过道椅的变换用于挂花饰 */
  private buildBeachChairs(): THREE.Matrix4[] {
    const rows: number[] = [];
    for (let i = 0; i < 5; i++) rows.push(51.8 + i * 1.05);
    const X0 = 1.9;
    const DX = 0.58;
    const PER = 5;
    const frameMats: THREE.Matrix4[] = [];
    const cushionMats: THREE.Matrix4[] = [];
    const pewEnds: THREE.Matrix4[] = [];
    rows.forEach((z) => {
      [1, -1].forEach((side) => {
        for (let i = 0; i < PER; i++) {
          const x = side * (X0 + i * DX);
          const y = this.beachHeight(x, z) - 0.03;
          const m = this.makeColumn(x, y, z, Math.PI);
          frameMats.push(m);
          cushionMats.push(m);
          this.outdoorCircles.beach.push({ x, z, r: 0.26 });
          if (i === 0) pewEnds.push(m);
        }
      });
    });

    const frameMat = new THREE.MeshStandardMaterial({
      color: "#ead9b8",
      metalness: 0.4,
      roughness: 0.38,
      envMapIntensity: 1,
    });
    this.applyFakeSun(frameMat);
    const cushionMat = new THREE.MeshStandardMaterial({
      color: "#fbf8f3",
      roughness: 0.85,
      metalness: 0,
    });
    this.applyFakeSun(cushionMat);
    const frame = new THREE.InstancedMesh(this.makeChairFrameGeometry(), frameMat, frameMats.length);
    const cushion = new THREE.InstancedMesh(this.makeChairCushionGeometry(), cushionMat, cushionMats.length);
    frame.frustumCulled = false;
    cushion.frustumCulled = false;
    frameMats.forEach((m, i) => frame.setMatrixAt(i, m));
    cushionMats.forEach((m, i) => cushion.setMatrixAt(i, m));
    frame.instanceMatrix.needsUpdate = true;
    cushion.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(frame, cushion);

    this.buildBeachPewDecor(pewEnds);
    return pewEnds;
  }

  /** 椅背花饰：白色缎带蝴蝶结 + 绿叶 + 飘动白纱，仅靠过道椅子 */
  private buildBeachPewDecor(pewEnds: THREE.Matrix4[]) {
    if (pewEnds.length === 0) return;
    const bowMats: THREE.Matrix4[] = [];
    const leafMats: THREE.Matrix4[] = [];
    const veilMats: THREE.Matrix4[] = [];
    const local = (x: number, y: number, z: number, rx: number, ry: number, rz: number) =>
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
        new THREE.Vector3(1, 1, 1),
      );
    pewEnds.forEach((base) => {
      const aisle = base.elements[12] > 0 ? -1 : 1;
      bowMats.push(new THREE.Matrix4().multiplyMatrices(base, local(aisle * 0.19, 0.72, 0.25, 0, 0, 0)));
      veilMats.push(new THREE.Matrix4().multiplyMatrices(base, local(aisle * 0.1, 0.84, 0.235, 0.05, 0, 0)));
      for (let k = 0; k < 2; k++) {
        leafMats.push(
          new THREE.Matrix4().multiplyMatrices(
            base,
            local(aisle * 0.19 + (k === 0 ? -0.05 : 0.05), 0.7, 0.245, 0.3, 0, k === 0 ? 1.1 : -1.1),
          ),
        );
      }
    });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[]) => {
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      mesh.frustumCulled = false;
      mats.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      this.beachGroup.add(mesh);
    };
    const bowMat = new THREE.MeshStandardMaterial({
      color: "#f6efe2",
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.applyFakeSun(bowMat);
    const leafMat = new THREE.MeshStandardMaterial({
      color: "#7fa06e",
      roughness: 0.55,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    this.applyFakeSun(leafMat);
    add(this.makeChairBowGeometry(), bowMat, bowMats);
    add(this.makeChairLeafGeometry(), leafMat, leafMats);
    add(this.makeChairVeilGeometry(), this.veilWindMaterial(0.72), veilMats);
  }

  /** 长茎玫瑰：花拱前几支 + 每排花饰 2 支，按模板拆成花头/茎/叶三个 InstancedMesh */
  private buildBeachStemRoses(
    archZ: number,
    halfW: number,
    pewEnds: THREE.Matrix4[],
  ) {
    const tpl = this.roseTemplates.stemLo ?? this.roseTemplates.stem;
    if (!tpl) return;
    const ivory = new THREE.Color("#fbf3ea");
    const blush = new THREE.Color("#f4c6cf");
    const placements: StemPlacement[] = [];
    const palette = [ivory, blush];

    // 拱脚两侧斜插 4 支
    const archSpots: [number, number][] = [
      [-halfW - 0.15, archZ - 0.3],
      [-halfW + 0.05, archZ - 0.55],
      [halfW + 0.12, archZ - 0.35],
      [halfW - 0.08, archZ - 0.6],
    ];
    archSpots.forEach(([x, z], i) => {
      const dir = new THREE.Vector3((i % 2 === 0 ? -1 : 1) * 0.25, 1, -0.45).normalize();
      placements.push({
        matrix: this.stemMatrix(tpl, x, z, dir, 0.62, this.stageDeckY + 0.02),
        color: palette[i % 2],
      });
    });

    // 椅背花饰：每排靠过道椅子挂 2 支，斜插交叉
    pewEnds.forEach((base) => {
      const aisle = base.elements[12] > 0 ? -1 : 1;
      for (let k = 0; k < 2; k++) {
        const s = 0.4 * (0.95 + Math.random() * 0.1);
        const local = new THREE.Matrix4().compose(
          new THREE.Vector3(aisle * 0.19 + (k === 0 ? -0.03 : 0.03), 0.66, 0.245),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(0.3, 0, aisle * (k === 0 ? 0.55 : -0.55)),
          ),
          new THREE.Vector3(s, s, s),
        );
        placements.push({
          matrix: new THREE.Matrix4().multiplyMatrices(base, local),
          color: palette[(k + 1) % 2],
        });
      }
    });

    this.addStemInstances(tpl, placements, this.beachGroup, true);
    this.beachStemsBuilt = true;
  }

  /** 过道沙面白/腮红花瓣，中间密两边疏 */
  private buildBeachAislePetals() {
    const COUNT = this.touchMode ? 320 : 500;
    const mat = new THREE.MeshStandardMaterial({
      map: this.reg(this.petalTexture()),
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0,
    });
    this.applyFakeSun(mat);
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.1, 0.07), mat, COUNT);
    mesh.frustumCulled = false;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const z0 = 51.9;
    const z1 = 56.85;
    for (let i = 0; i < COUNT; i++) {
      const t = Math.random();
      const z = z0 + t * (z1 - z0);
      const spread = 0.35 + 0.95 * (1 - t);
      const x = (Math.random() * 2 - 1) * spread;
      dummy.position.set(x, this.beachHeight(x, z) + 0.01, z);
      dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
      dummy.scale.setScalar(0.7 + Math.random() * 0.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.set(this.redMixPetalTone());
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(mesh);
  }

  private buildBeachLanterns() {
    const spots: { x: number; z: number }[] = [];
    [52.85, 53.95, 55.05, 56.15].forEach((z) =>
      [1, -1].forEach((s) => spots.push({ x: s * 1.55, z })),
    );
    spots.push({ x: -3.3, z: 57.0 }, { x: 3.3, z: 57.0 });

    const bodyParts: THREE.BufferGeometry[] = [];
    const post = (dx: number, dz: number) => {
      const g = new THREE.BoxGeometry(0.025, 0.42, 0.025);
      g.translate(dx, 0.21, dz);
      return g;
    };
    [
      [-0.1, -0.1],
      [0.1, -0.1],
      [-0.1, 0.1],
      [0.1, 0.1],
    ].forEach(([dx, dz]) => bodyParts.push(post(dx, dz)));
    [-1, 1].forEach((s) => {
      const top = new THREE.BoxGeometry(0.24, 0.025, 0.025);
      top.translate(0, 0.42, s * 0.1);
      bodyParts.push(top);
      const bottom = new THREE.BoxGeometry(0.24, 0.025, 0.025);
      bottom.translate(0, 0.02, s * 0.1);
      bodyParts.push(bottom);
      const side = new THREE.BoxGeometry(0.025, 0.025, 0.24);
      side.translate(s * 0.1, 0.42, 0);
      bodyParts.push(side);
      const sbottom = new THREE.BoxGeometry(0.025, 0.025, 0.24);
      sbottom.translate(s * 0.1, 0.02, 0);
      bodyParts.push(sbottom);
    });
    const candle = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 10);
    candle.translate(0, 0.08, 0);
    bodyParts.push(candle);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: "#efe6d2",
      roughness: 0.7,
      metalness: 0.03,
    });
    this.applyFakeSun(bodyMat);
    const body = new THREE.InstancedMesh(this.mergeParts(bodyParts, "beach lantern"), bodyMat, spots.length);
    body.frustumCulled = false;
    const glassGeo = new THREE.BoxGeometry(0.19, 0.36, 0.19);
    glassGeo.translate(0, 0.22, 0);
    const glass = new THREE.InstancedMesh(
      glassGeo,
      this.vaseGlassMaterial("#f4fbfb", 0.26),
      spots.length,
    );
    glass.frustumCulled = false;
    glass.renderOrder = 2;

    const dummy = new THREE.Object3D();
    spots.forEach((s, i) => {
      const y = this.beachHeight(s.x, s.z);
      dummy.position.set(s.x, y, s.z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);
      glass.setMatrixAt(i, dummy.matrix);
      this.outdoorCircles.beach.push({ x: s.x, z: s.z, r: 0.2 });
      this.beachFlames.push({
        x: s.x,
        y: y + 0.2,
        z: s.z,
        phase: Math.random() * Math.PI * 2,
        scale: 0.9,
      });
    });
    const flamePos = new Float32Array(this.beachFlames.length * 3);
    this.beachFlames.forEach((f, i) => {
      flamePos[i * 3] = f.x;
      flamePos[i * 3 + 1] = f.y;
      flamePos[i * 3 + 2] = f.z;
    });
    body.instanceMatrix.needsUpdate = true;
    glass.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(body, glass);

    const flameGeo = new THREE.SphereGeometry(0.02, 6, 5);
    flameGeo.scale(1, 1.9, 1);
    const flame = new THREE.InstancedMesh(
      flameGeo,
      new THREE.MeshBasicMaterial({ color: "#ffd9a2", toneMapped: false }),
      this.beachFlames.length,
    );
    flame.frustumCulled = false;
    this.beachFlameMesh = flame;

    const glowGeo = new THREE.BufferGeometry();
    glowGeo.setAttribute("position", new THREE.BufferAttribute(flamePos, 3));
    const glowMat = new THREE.PointsMaterial({
      map: this.getGlowTexture(),
      color: "#ffd7a0",
      size: 0.17,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.beachGlowMat = glowMat;
    const glow = new THREE.Points(glowGeo, glowMat);
    glow.frustumCulled = false;
    this.beachGroup.add(flame, glow);
  }

  private buildBeachTorches() {
    // 仪式区四角 + 栈道末端两侧
    const spots: [number, number][] = [
      [-5.4, 52.3],
      [5.4, 52.3],
      [-5.2, 57.0],
      [5.2, 57.0],
      [-1.9, 50.8],
      [1.9, 50.8],
    ];
    const poleParts: THREE.BufferGeometry[] = [];
    const pole = new THREE.CylinderGeometry(0.035, 0.045, 1.8, 8);
    pole.translate(0, 0.9, 0);
    poleParts.push(pole);
    const brazier = new THREE.CylinderGeometry(0.11, 0.06, 0.16, 10);
    brazier.translate(0, 1.82, 0);
    poleParts.push(brazier);
    const poleMat = new THREE.MeshStandardMaterial({
      color: "#8a6a44",
      roughness: 0.85,
      metalness: 0.05,
    });
    this.applyFakeSun(poleMat);
    const poleMesh = new THREE.InstancedMesh(this.mergeParts(poleParts, "beach torch"), poleMat, spots.length);
    poleMesh.frustumCulled = false;

    const dummy = new THREE.Object3D();
    spots.forEach(([x, z], i) => {
      const y = this.beachHeight(x, z);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, Math.random() * Math.PI, 0);
      dummy.updateMatrix();
      poleMesh.setMatrixAt(i, dummy.matrix);
      this.outdoorCircles.beach.push({ x, z, r: 0.2 });
      this.beachTorches.push({ x, y: y + 1.92, z, phase: Math.random() * Math.PI * 2 });
    });
    poleMesh.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(poleMesh);

    // 火苗：3 层加色 billboard，逐帧摇曳
    const flameTex = this.reg(this.flameTexture());
    const flameMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
      uniforms: { uMap: { value: flameTex } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          #ifdef USE_INSTANCING_COLOR
            vColor = instanceColor;
          #else
            vColor = vec3(1.0);
          #endif
          vec3 center = (modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec2 sz = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
          gl_Position = projectionMatrix * vec4(center + vec3(position.xy * sz, 0.0), 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uMap, vUv);
          float a = t.a * 0.85;
          if (a < 0.01) discard;
          gl_FragColor = vec4(t.rgb * vColor, a);
        }
      `,
    });
    const layers = 3;
    const torchFlame = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), flameMat, spots.length * layers);
    torchFlame.frustumCulled = false;
    torchFlame.renderOrder = 3;
    const c = new THREE.Color();
    this.beachTorches.forEach((_t, ti) => {
      for (let l = 0; l < layers; l++) {
        c.set(l === 0 ? "#ffcf7a" : l === 1 ? "#ff9a3c" : "#ffe9b0");
        torchFlame.setColorAt(ti * layers + l, c);
      }
    });
    if (torchFlame.instanceColor) torchFlame.instanceColor.needsUpdate = true;
    this.beachTorchFlameMesh = torchFlame;
    this.beachGroup.add(torchFlame);

    // 上升火星
    const emberCount = spots.length * 7;
    const pos = new Float32Array(emberCount * 3);
    const phase = new Float32Array(emberCount);
    const speed = new Float32Array(emberCount);
    let ei = 0;
    this.beachTorches.forEach((t) => {
      for (let k = 0; k < 7; k++) {
        pos[ei * 3] = t.x + (Math.random() - 0.5) * 0.12;
        pos[ei * 3 + 1] = t.y - 0.05;
        pos[ei * 3 + 2] = t.z + (Math.random() - 0.5) * 0.12;
        phase[ei] = Math.random();
        speed[ei] = 0.35 + Math.random() * 0.4;
        ei++;
      }
    });
    const emberGeo = new THREE.BufferGeometry();
    emberGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    emberGeo.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
    emberGeo.setAttribute("aSpeed", new THREE.BufferAttribute(speed, 1));
    const emberMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      toneMapped: false,
      uniforms: { uTime: this.windUniform, uColor: { value: new THREE.Color("#ff9b3d") } },
      vertexShader: `
        attribute float aPhase;
        attribute float aSpeed;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          float rise = fract(uTime * aSpeed + aPhase);
          vec3 p = position;
          p.y += rise * 1.1;
          p.x += sin(uTime * 1.7 + aPhase * 6.2831) * 0.05 * rise;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vAlpha = (1.0 - rise) * smoothstep(0.0, 0.15, rise);
          gl_PointSize = max(1.0, (0.06 - rise * 0.035) * 300.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d) * vAlpha;
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    const embers = new THREE.Points(emberGeo, emberMat);
    embers.frustumCulled = false;
    this.beachGroup.add(embers);
  }

  private makeBirdGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [
          0, 0, 0, -0.7, 0.06, 0.15, -0.1, 0, 0.35,
          0, 0, 0, 0.1, 0, 0.35, 0.7, 0.06, 0.15,
        ],
        3,
      ),
    );
    geo.computeVertexNormals();
    return geo;
  }

  private buildBeachBirds() {
    const BIRDS = 6;
    const mat = new THREE.MeshBasicMaterial({
      color: "#3a3f45",
      side: THREE.DoubleSide,
      fog: true,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.windUniform;
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          float birdHash(vec2 p) {
            p = fract(p * vec2(123.34, 345.45));
            p += dot(p, p + 34.345);
            return fract(p.x * p.y);
          }`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          {
            float ph = birdHash(instanceMatrix[3].xz) * 6.2831;
            float flap = sin(uTime * 3.2 + ph) * 0.5 + 0.5;
            transformed.y += pow(abs(transformed.x) / 0.7, 1.6) * flap * 0.5;
          }`,
        );
    };
    const mesh = new THREE.InstancedMesh(this.makeBirdGeometry(), mat, BIRDS);
    mesh.frustumCulled = false;
    for (let i = 0; i < BIRDS; i++) {
      this.beachBirds.push({
        cx: (Math.random() - 0.5) * 60,
        cz: 90 + Math.random() * 50,
        r: 30 + Math.random() * 40,
        a0: Math.random() * Math.PI * 2,
        speed: 0.06 + Math.random() * 0.05,
        phase: Math.random() * Math.PI * 2,
        h: 12 + Math.random() * 13,
      });
    }
    this.beachBirdMesh = mesh;
    mesh.instanceMatrix.needsUpdate = true;
    this.beachGroup.add(mesh);
  }

  /** 火苗贴图：椭圆渐变水滴形（加色 billboard 复用） */
  private flameTexture(): THREE.Texture {
    return this.makeCanvasTexture(
      (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h);
        const g = ctx.createRadialGradient(w / 2, h * 0.72, 0, w / 2, h * 0.72, h * 0.62);
        g.addColorStop(0, "rgba(255,247,214,1)");
        g.addColorStop(0.35, "rgba(255,190,86,0.92)");
        g.addColorStop(0.7, "rgba(255,110,30,0.45)");
        g.addColorStop(1, "rgba(255,80,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(w / 2, h * 0.55, w * 0.38, h * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      },
      64,
      128,
    );
  }

  /** 草坪仪式区每帧动画：风灯/烛杯火焰闪烁（与沙滩同一套假光风格） */
  private tickLawn() {
    const t = this.outdoorTime;
    const d = this.isoDummy;
    const fm = this.lawnFlameMesh;
    if (fm) {
      this.lawnFlames.forEach((f, i) => {
        const s =
          f.scale *
          (1 + 0.12 * Math.sin(t * 11.3 + f.phase) + 0.06 * Math.sin(t * 6.1 + f.phase * 1.7));
        d.position.set(f.x, f.y, f.z);
        d.rotation.set(0, f.phase + t * 0.8, 0);
        d.scale.set(f.scale, s, f.scale);
        d.updateMatrix();
        fm.setMatrixAt(i, d.matrix);
      });
      fm.instanceMatrix.needsUpdate = true;
    }
    if (this.lawnGlowMesh) {
      const glowMesh = this.lawnGlowMesh;
      const flick = 1 + 0.14 * Math.sin(t * 9.7) + 0.07 * Math.sin(t * 15.3);
      const gm = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const v = new THREE.Vector3();
      const s = new THREE.Vector3();
      this.lawnFlames.forEach((f, i) => {
        gm.compose(v.set(f.x, f.y, f.z), q, s.set(0.34 * flick, 0.34 * flick, 1));
        glowMesh.setMatrixAt(i, gm);
      });
      glowMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** 沙滩仪式区每帧动画：灯笼烛火闪烁、火把摇曳、海鸟滑翔 */
  private tickBeach() {
    const t = this.outdoorTime;
    const d = this.isoDummy;

    const fm = this.beachFlameMesh;
    if (fm) {
      this.beachFlames.forEach((f, i) => {
        const s =
          f.scale *
          (1 + 0.12 * Math.sin(t * 11.3 + f.phase) + 0.06 * Math.sin(t * 6.1 + f.phase * 1.7));
        d.position.set(f.x, f.y, f.z);
        d.rotation.set(0, f.phase + t * 0.8, 0);
        d.scale.set(f.scale, s, f.scale);
        d.updateMatrix();
        fm.setMatrixAt(i, d.matrix);
      });
      fm.instanceMatrix.needsUpdate = true;
    }
    if (this.beachGlowMat) {
      const flick = 1 + 0.14 * Math.sin(t * 9.7) + 0.07 * Math.sin(t * 15.3);
      this.beachGlowMat.size = 0.17 * flick;
      this.beachGlowMat.opacity = 0.5 * flick;
    }

    const tf = this.beachTorchFlameMesh;
    if (tf) {
      let idx = 0;
      this.beachTorches.forEach((tr) => {
        for (let layer = 0; layer < 3; layer++) {
          const ph = tr.phase + layer * 1.7;
          const sc = (0.55 - layer * 0.12) * (1 + 0.18 * Math.sin(t * 9 + ph) + 0.08 * Math.sin(t * 17 + ph * 1.3));
          d.position.set(tr.x, tr.y + layer * 0.03, tr.z);
          d.rotation.set(0, 0, 0);
          d.scale.set(sc, sc * (1.5 + 0.2 * layer), sc);
          d.updateMatrix();
          tf.setMatrixAt(idx, d.matrix);
          idx++;
        }
      });
      tf.instanceMatrix.needsUpdate = true;
    }

    const bm = this.beachBirdMesh;
    if (bm) {
      this.beachBirds.forEach((b, i) => {
        const a = b.a0 + b.speed * t;
        this.beachBirdDummy.position.set(
          b.cx + Math.cos(a) * b.r,
          b.h + Math.sin(t * 0.6 + b.phase) * 0.6,
          b.cz + Math.sin(a) * b.r,
        );
        this.beachBirdDummy.rotation.set(0, -a, 0);
        this.beachBirdDummy.scale.setScalar(1);
        this.beachBirdDummy.updateMatrix();
        bm.setMatrixAt(i, this.beachBirdDummy.matrix);
      });
      bm.instanceMatrix.needsUpdate = true;
    }
  }

  private loadPalmModels() {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    loader.setDRACOLoader(draco);

    let pending = 2;
    const settle = () => {
      pending -= 1;
      if (pending > 0) return;
      draco.dispose();
    };

    const loadOne = (url: string, kind: "coconut" | "slim") => {
      loader.load(
        url,
        (gltf) => {
          if (this.disposed) {
            this.disposeObject(gltf.scene);
            settle();
            return;
          }
          const tpl = this.makeGlbTemplate(gltf.scene);
          this.palmTemplates[kind] = tpl;
          this.buildPalmSpecies(kind, tpl);
          this.releaseGltfSource(gltf.scene);
          settle();
        },
        undefined,
        (err) => {
          console.warn(`[WeddingGallery] 椰子树模型 ${url} 加载失败，跳过`, err);
          settle();
        },
      );
    };

    loadOne("/models/palm_coconut.glb", "coconut");
    loadOne("/models/palm_slim.glb", "slim");
  }

  private palmSpotsCache: typeof this.PALM_SPOTS | null = null;

  /**
   * 手摆的 14 棵 + 按固定种子撒出的补充椰林（每次加载位置一致）。
   * 避开：栈道走廊、门口、仪式座椅/舞台、遮阳伞休闲区；中间开阔区稀疏、两侧及远处成林，
   * 约 40% 的树再配一棵矮的伴生树形成自然的"一簇两三棵"。
   * 性能：椰子树模型约 2.9 万三角面，补充部分以细高棕榈（约 3.5 千面）为主。
   */
  private allPalmSpots(): typeof this.PALM_SPOTS {
    if (this.palmSpotsCache) return this.palmSpotsCache;
    const spots = [...this.PALM_SPOTS];
    let seed = 20261020;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const lounge = [
      { x: -7.0, z: 35.0 },
      { x: -11.5, z: 33.5 },
      { x: -7.5, z: 42.5 },
      { x: -12.0, z: 45.5 },
      { x: 7.0, z: 33.5 },
      { x: 11.5, z: 36.0 },
      { x: 7.5, z: 43.5 },
      { x: 14.0, z: 31.0 },
    ];
    const free = (x: number, z: number, minGap: number) => {
      if (Math.abs(x) < 3.6 && z < 51.5) return false;
      if (Math.abs(x) < 8 && z > 48) return false;
      if (Math.abs(x) < 9 && z < 20.5) return false;
      if (lounge.some((l) => Math.hypot(l.x - x, l.z - z) < 3.8)) return false;
      return spots.every((s) => Math.hypot(s.x - x, s.z - z) >= minGap);
    };

    const want = { coconut: 12, slim: 28 };
    let tries = 0;
    while ((want.coconut > 0 || want.slim > 0) && tries++ < 4000) {
      const x = (rand() * 2 - 1) * 42;
      const z = 19 + rand() * 39;
      const ax = Math.abs(x);
      if (ax < 13 && rand() > 0.35) continue;
      if (!free(x, z, 3.4)) continue;
      let kind: "coconut" | "slim" = rand() < (ax > 22 ? 0.25 : 0.55) ? "coconut" : "slim";
      if (want[kind] <= 0) kind = kind === "coconut" ? "slim" : "coconut";
      if (want[kind] <= 0) break;
      want[kind] -= 1;
      const h = kind === "coconut" ? 8 + rand() * 3.2 : 6 + rand() * 2.2;
      spots.push({ kind, x, z, h, tilt: 5 + rand() * 11, yaw: rand() * Math.PI * 2 });

      if (rand() < 0.4 && want.slim > 0) {
        const a = rand() * Math.PI * 2;
        const r = 1.8 + rand() * 0.8;
        const cx = x + Math.cos(a) * r;
        const cz = z + Math.sin(a) * r;
        if (cz > 19 && cz < 58.5 && free(cx, cz, 1.6)) {
          want.slim -= 1;
          spots.push({
            kind: "slim",
            x: cx,
            z: cz,
            h: h * (0.62 + rand() * 0.18),
            tilt: 12 + rand() * 10,
            yaw: rand() * Math.PI * 2,
          });
        }
      }
    }
    // 画廊两侧与后方一圈细叶棕榈（轻模），让画廊坐落在棕榈林边
    const ring = this.touchMode ? 12 : 24;
    let placedRing = 0;
    let ringTries = 0;
    while (placedRing < ring && ringTries++ < 2000) {
      const x = (rand() * 2 - 1) * 42;
      const z = this.ARCH_Z - 2 - rand() * 70;
      const dx = Math.max(Math.abs(x) - this.W / 2, 0);
      const dz = Math.max(this.DEPTH_START - z, 0);
      const d = Math.hypot(dx, dz);
      if (d < 5 || d > 28) continue;
      if (z > this.ARCH_Z - 4 && Math.abs(x) < 22) continue;
      if (!spots.every((s) => Math.hypot(s.x - x, s.z - z) >= 4.5)) continue;
      spots.push({ kind: "slim", x, z, h: 6.5 + rand() * 3, tilt: 5 + rand() * 12, yaw: rand() * Math.PI * 2 });
      placedRing += 1;
    }
    this.palmSpotsCache = spots;
    return spots;
  }

  private buildPalmSpecies(kind: "coconut" | "slim", tpl: GlbTemplate) {
    if (this.palmBuilt[kind] || tpl.primitives.length === 0) return;
    this.palmBuilt[kind] = true;
    const spots = this.allPalmSpots().filter((s) => s.kind === kind);
    const sizeY = Math.max(tpl.size.y, 1e-4);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const euler = new THREE.Euler();
    tpl.primitives.forEach((p, pi) => {
      // GLTF MASK 材质会被 loader 设上 alphaTest，可作为叶片判据（两模型的命名不一致）
      const isLeaf = /leaf|frond|clip/i.test(p.name) || p.material.alphaTest > 0;
      const mat = this.palmMaterial(p.material, isLeaf, sizeY);
      const mesh = new THREE.InstancedMesh(p.geometry, mat, spots.length);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      const matrix = new THREE.Matrix4();
      spots.forEach((s, i) => {
        const sc = s.h / sizeY;
        const tilt = (s.tilt * Math.PI) / 180;
        const a = s.yaw * 2.3;
        euler.set(Math.cos(a) * tilt, s.yaw, Math.sin(a) * tilt, "YXZ");
        quat.setFromEuler(euler);
        pos.set(s.x, this.beachTerrainY(s.x, s.z), s.z);
        scl.set(sc, sc, sc);
        matrix.compose(pos, quat, scl);
        mesh.setMatrixAt(i, matrix);
        if (pi === 0) this.outdoorCircles.beach.push({ x: s.x, z: s.z, r: 0.4 });
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.beachGroup.add(mesh);
    });
  }

  private palmMaterial(src: THREE.Material, isLeaf: boolean, sizeY: number): THREE.Material {
    const mat = src.clone();
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.metalness = 0;
      mat.roughness = Math.max(mat.roughness, isLeaf ? 0.7 : 0.85);
      mat.envMapIntensity = 0.6;
    }
    mat.side = THREE.DoubleSide;
    if (isLeaf) {
      mat.alphaTest = 0.4;
      mat.transparent = false;
      mat.depthWrite = true;
    }
    this.regMaterialTextures(mat);

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = { value: this.SUN_DIR };
      shader.uniforms.uSunColor = { value: this.SUN_COLOR };
      shader.uniforms.uSunIntensity = this.sunIntensityU;
      shader.uniforms.uTime = this.windUniform;
      shader.uniforms.uTreeH = { value: sizeY };
      if (isLeaf) {
        shader.vertexShader = "#define PALM_LEAF\n" + shader.vertexShader;
        shader.fragmentShader = "#define PALM_LEAF\n" + shader.fragmentShader;
      }

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
          uniform float uTime;
          uniform float uTreeH;
          varying vec3 vWorldPos;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef PALM_LEAF
            if (transformed.y > 0.0) {
              float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
              float gust = sin(uTime * 0.9 + ph * 6.2831) * 0.6 + sin(uTime * 1.7 + ph * 3.1) * 0.4;
              float up = clamp(transformed.y / uTreeH, 0.0, 1.0);
              float sway = gust * up * uTreeH * 0.02;
              transformed.x += sway * 0.8;
              transformed.z += sway * 0.5;
            }
          #endif
          vWorldPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
          varying vec3 vWorldPos;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uSunIntensity;`,
        )
        .replace(
          "#include <aomap_fragment>",
          `#include <aomap_fragment>
          {
            vec3 palmSunView = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
            float palmNdl = dot(normal, palmSunView);
            #ifdef PALM_LEAF
              float palmDiff = clamp((palmNdl + 0.4) / 1.4, 0.0, 1.0);
              vec3 palmV = normalize(vViewPosition);
              float palmBack = pow(clamp(dot(palmV, -palmSunView), 0.0, 1.0), 3.0) * 0.35;
              reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * (palmDiff + palmBack);
            #else
              reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * uSunIntensity * max(palmNdl, 0.0);
            #endif
          }`,
        );
    };
    return mat;
  }

  /** 每帧推进：草叶风摆时间 + 云朵缓慢横移（越界后循环）+ 沙滩海面时间 + 草坪烛火 */
  private tickOutdoor(dt: number) {
    this.outdoorTime += dt;
    this.windUniform.value = this.outdoorTime;
    if (this.outdoor === "beach") {
      this.seaUniform.value = this.outdoorTime;
      this.tickBeach();
    } else if (this.outdoor === "lawn") {
      this.tickLawn();
    }
    const mesh = this.cloudMesh;
    if (!mesh) return;
    const span = 520;
    this.clouds.forEach((c, i) => {
      const raw = c.base.x + c.speed * this.outdoorTime + span / 2;
      const x = ((raw % span) + span) % span - span / 2;
      this.cloudDummy.position.set(x, c.base.y, c.base.z);
      this.cloudDummy.scale.set(c.scale, c.scale * 0.52, 1);
      this.cloudDummy.updateMatrix();
      mesh.setMatrixAt(i, this.cloudDummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ── 工具 / 纹理 ────────────────────────────────────────────
  /** 登记纹理，dispose 时统一释放（含 clone 材质共用与 loader 纹理） */
  private reg<T extends THREE.Texture>(tex: T): T {
    this.textures.push(tex);
    return tex;
  }

  private marbleVeinLayout(size: number): MarbleVein[] {
    const half = size / 2;
    const veins: MarbleVein[] = [];
    for (let sy = 0; sy < 2; sy++) {
      for (let sx = 0; sx < 2; sx++) {
        const ox = sx * half;
        const oy = sy * half;
        for (let i = 0; i < 5; i++) {
          const y0 = oy + Math.random() * half;
          veins.push({
            x0: ox - half * 0.25,
            y0,
            cx1: ox + half * 0.3,
            cy1: y0 + (Math.random() - 0.5) * half * 0.7,
            cx2: ox + half * 0.7,
            cy2: y0 + (Math.random() - 0.5) * half * 0.7,
            x1: ox + half * 1.25,
            y1: y0 + (Math.random() - 0.5) * half * 0.5,
            width: half * (0.02 + Math.random() * 0.06),
            alpha: 0.05 + Math.random() * 0.07,
            fine: false,
          });
        }
        for (let i = 0; i < 2; i++) {
          const y0 = oy + Math.random() * half;
          veins.push({
            x0: ox - half * 0.1,
            y0,
            cx1: ox + half * 0.35,
            cy1: y0 + (Math.random() - 0.5) * half * 0.5,
            cx2: ox + half * 0.65,
            cy2: y0 + (Math.random() - 0.5) * half * 0.5,
            x1: ox + half * 1.1,
            y1: y0 + (Math.random() - 0.5) * half * 0.4,
            width: half * (0.003 + Math.random() * 0.006),
            alpha: 0.18 + Math.random() * 0.14,
            fine: true,
          });
        }
      }
    }
    return veins;
  }

  private traceVein(ctx: CanvasRenderingContext2D, v: MarbleVein) {
    ctx.beginPath();
    ctx.moveTo(v.x0, v.y0);
    ctx.bezierCurveTo(v.cx1, v.cy1, v.cx2, v.cy2, v.x1, v.y1);
    ctx.stroke();
  }

  private strokeGrid(ctx: CanvasRenderingContext2D, size: number, style: string, width: number) {
    const half = size / 2;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    for (const p of [0, half, size]) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
  }

  private marbleTexture(
    base: string,
    vein: string,
    size: number,
    repX: number,
    repY: number,
    veins: MarbleVein[],
  ): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");

    const half = size / 2;
    for (let sy = 0; sy < 2; sy++) {
      for (let sx = 0; sx < 2; sx++) {
        ctx.fillStyle = base;
        ctx.fillRect(sx * half, sy * half, half, half);
      }
    }
    for (let sy = 0; sy < 2; sy++) {
      for (let sx = 0; sx < 2; sx++) {
        const v = (Math.random() - 0.5) * 0.06;
        ctx.fillStyle = v >= 0 ? `rgba(255,255,255,${v})` : `rgba(120,105,95,${-v})`;
        ctx.fillRect(sx * half, sy * half, half, half);
      }
    }

    for (const v of veins) {
      ctx.globalAlpha = v.alpha;
      ctx.strokeStyle = v.fine ? "#9b9288" : vein;
      ctx.lineWidth = v.width;
      this.traceVein(ctx, v);
    }
    ctx.globalAlpha = 1;

    this.strokeGrid(ctx, size, "rgba(0,0,0,0.06)", 2);
    this.strokeGrid(ctx, size, "rgba(0,0,0,0.10)", 1);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  private marbleRoughnessTexture(size: number, repX: number, repY: number, veins: MarbleVein[]): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    ctx.fillStyle = "#3c3c3c";
    ctx.fillRect(0, 0, size, size);

    for (const v of veins) {
      ctx.globalAlpha = v.fine ? 0.55 : 0.45;
      ctx.strokeStyle = v.fine ? "#8c8c8c" : "#6e6e6e";
      ctx.lineWidth = v.width * 1.35;
      this.traceVein(ctx, v);
    }
    ctx.globalAlpha = 1;

    for (let i = 0; i < 30; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = size * (0.01 + Math.random() * 0.045);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(212,212,212,0.18)");
      g.addColorStop(1, "rgba(212,212,212,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    this.strokeGrid(ctx, size, "rgba(122,122,122,0.5)", 2);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  private marbleNormalTexture(size: number, repX: number, repY: number, veins: MarbleVein[]): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, size, size);

    for (const v of veins) {
      ctx.globalAlpha = v.fine ? 0.7 : 0.35;
      ctx.strokeStyle = v.fine ? "#4a4a4a" : "#a8a8a8";
      ctx.lineWidth = v.width;
      this.traceVein(ctx, v);
    }
    ctx.globalAlpha = 1;
    this.strokeGrid(ctx, size, "rgba(60,60,60,0.6)", 2);

    const src = ctx.getImageData(0, 0, size, size);
    const out = ctx.createImageData(size, size);
    const d = src.data;
    const o = out.data;
    const strength = 0.035;
    for (let y = 0; y < size; y++) {
      const ym = (y > 0 ? y - 1 : 0) * size;
      const yp = (y < size - 1 ? y + 1 : size - 1) * size;
      for (let x = 0; x < size; x++) {
        const xm = x > 0 ? x - 1 : 0;
        const xp = x < size - 1 ? x + 1 : size - 1;
        const dx = d[(y * size + xp) * 4] - d[(y * size + xm) * 4];
        const dy = d[(yp + x) * 4] - d[(ym + x) * 4];
        const nx = -dx * strength;
        const ny = -dy * strength;
        const len = Math.sqrt(nx * nx + ny * ny + 1);
        const i = (y * size + x) * 4;
        o[i] = ((nx / len) * 0.5 + 0.5) * 255;
        o[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        o[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        o[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repX, repY);
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  /**
   * 加载一组真实 PBR 贴图（color/normal/rough/ao），全部经 reg() 登记以便 dispose 释放。
   * 四张全部就绪后才回调，避免半加载状态污染光照；此前材质以纯色兜底显示。
   */
  private loadPbrSet(
    prefix: string,
    repeatX: number,
    repeatY: number,
    onReady: (set: PbrSet) => void,
  ): PbrSet {
    const loader = new THREE.TextureLoader();
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    let pending = 4;
    const done = () => {
      pending -= 1;
      if (pending === 0) onReady(set);
    };
    const load = (suffix: string, srgb: boolean) => {
      const tex = this.reg(loader.load(`${prefix}_${suffix}.webp`, done));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeatX, repeatY);
      tex.anisotropy = aniso;
      if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const set: PbrSet = {
      map: load("color", true),
      normalMap: load("normal", false),
      roughnessMap: load("rough", false),
      aoMap: load("ao", false),
    };
    return set;
  }

  /**
   * 按 BoxGeometry 六个面的真实世界尺寸改写 UV，使贴图按 texScale 米/瓦铺开而不被拉伸。
   * 面顺序沿用 BoxGeometry 默认顶点排布：+x,-x,+y,-y,+z,-z，每面 4 个顶点。
   */
  private boxWorldUv(geo: THREE.BufferGeometry, texScale: number, faceDims: [number, number][]) {
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const [us, vs] = faceDims[Math.min(5, Math.floor(i / 4))];
      uv.setXY(i, uv.getX(i) * (us / texScale), uv.getY(i) * (vs / texScale));
    }
    uv.needsUpdate = true;
  }

  private makeRoseReliefTexture(size: number): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    ctx.clearRect(0, 0, size, size);
    const R = size * 0.42;
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.strokeStyle = C.plasterRose;
    ctx.fillStyle = C.plasterRose;

    ctx.globalAlpha = 0.35;
    ctx.lineWidth = size * 0.006;
    for (const k of [0.98, 0.72, 0.46, 0.2]) {
      ctx.beginPath();
      ctx.arc(0, 0, R * k, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.35;
    ctx.lineWidth = size * 0.005;
    const petals = 12;
    for (let i = 0; i < petals; i++) {
      ctx.save();
      ctx.rotate((i / petals) * Math.PI * 2);
      for (const sign of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(0, R * 0.18);
        ctx.bezierCurveTo(sign * R * 0.28, R * 0.3, sign * R * 0.34, R * 0.62, 0, R * 0.86);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    return tex;
  }

  /** 径向柔光贴图，供吊灯光晕与光尘复用 */
  private getGlowTexture(): THREE.Texture {
    if (this.glowTex) return this.glowTex;
    const tex = this.reg(
      this.makeCanvasTexture((ctx, w, h) => {
        const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        grd.addColorStop(0, "rgba(255,236,214,1)");
        grd.addColorStop(0.35, "rgba(255,220,184,0.5)");
        grd.addColorStop(1, "rgba(255,220,184,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
      }, 128, 128),
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    this.glowTex = tex;
    return tex;
  }

  /** 椭圆花瓣贴图（软边），用于 instanced 花瓣 */
  /**
   * 花瓣贴图：倒卵形瓣身 + 顶端浅凹，瓣根略深、边缘提亮并带几道细脉，
   * 白底灰度绘制，实际颜色由实例色相乘得到。
   */
  private petalTexture(): THREE.Texture {
    const tex = this.makeCanvasTexture((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const base = h * 0.9;
      const top = h * 0.1;
      const half = w * 0.44;
      const shape = new Path2D();
      shape.moveTo(cx, base);
      shape.bezierCurveTo(cx - half * 0.55, base - h * 0.1, cx - half * 1.08, h * 0.42, cx - half * 0.78, h * 0.2);
      shape.quadraticCurveTo(cx - half * 0.45, top - h * 0.02, cx - half * 0.1, top + h * 0.03);
      shape.quadraticCurveTo(cx, top + h * 0.08, cx + half * 0.1, top + h * 0.03);
      shape.quadraticCurveTo(cx + half * 0.45, top - h * 0.02, cx + half * 0.78, h * 0.2);
      shape.bezierCurveTo(cx + half * 1.08, h * 0.42, cx + half * 0.55, base - h * 0.1, cx, base);
      shape.closePath();
      const body = ctx.createRadialGradient(cx, base, 0, cx, h * 0.5, h * 0.62);
      body.addColorStop(0, "#d9c3c6");
      body.addColorStop(0.35, "#f1e4e5");
      body.addColorStop(1, "#ffffff");
      ctx.fillStyle = body;
      ctx.fill(shape);
      ctx.save();
      ctx.clip(shape);
      ctx.strokeStyle = "rgba(170,140,145,0.22)";
      ctx.lineWidth = w * 0.012;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(cx, base);
        ctx.quadraticCurveTo(cx + i * half * 0.18, h * 0.55, cx + i * half * 0.34, top + h * 0.12);
        ctx.stroke();
      }
      const rim = ctx.createRadialGradient(cx, h * 0.55, h * 0.2, cx, h * 0.5, h * 0.5);
      rim.addColorStop(0, "rgba(255,255,255,0)");
      rim.addColorStop(1, "rgba(255,255,255,0.35)");
      ctx.fillStyle = rim;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }, 128, 128);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** 地面散落花瓣：瓣身微微上卷（边缘抬高约 1cm），侧光下有明暗而不是一张平贴片 */
  private makeCuppedPetalGeometry(): THREE.BufferGeometry {
    const geo = new THREE.PlaneGeometry(0.11, 0.075, 4, 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / 0.055;
      const v = pos.getY(i) / 0.0375;
      pos.setZ(i, 0.011 * (u * u * 0.8 + v * v * 0.35));
    }
    geo.computeVertexNormals();
    return geo;
  }

  private makeCanvasTexture(
    draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
    w: number,
    h: number,
  ): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable");
    draw(ctx, w, h);
    return new THREE.CanvasTexture(c);
  }

  private fireReady() {
    if (this.readyFired || this.disposed) return;
    this.readyFired = true;
    this.opts.onReady();
  }

  // ── 输入 ───────────────────────────────────────────────────
  private setupInput() {
    const kd = (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      // 拖拽模式下 Esc 暂停（与原指针锁定的 Esc 行为一致）
      if (e.code === "Escape" && this.dragMode && this.active) {
        this.exit();
        return;
      }
      if (e.code === "KeyT") {
        this.setOutdoor(this.outdoor === "beach" ? "lawn" : "beach");
      }
      if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    };
    const blur = () => {
      for (const k of Object.keys(this.keys)) this.keys[k] = false;
    };
    const resize = () => this.handleResize();

    document.addEventListener("keydown", kd);
    document.addEventListener("keyup", ku);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);

    this.cleanups.push(
      () => document.removeEventListener("keydown", kd),
      () => document.removeEventListener("keyup", ku),
      () => window.removeEventListener("blur", blur),
      () => window.removeEventListener("resize", resize),
      () => window.removeEventListener("orientationchange", resize),
    );
  }

  private handleResize() {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const size = this.renderer.getSize(this.farWarmSize);
    if (size.x === w && size.y === h) return;
    this.notePerfEvent(`resize ${size.x}x${size.y}->${w}x${h}`);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 74 : 70;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  /** 触屏左摇杆：x = 右为正（右平移），y = 下为正（后退） */
  setMoveInput(x: number, y: number) {
    this.moveInput.x = x;
    this.moveInput.y = y;
  }

  /** 触屏右摇杆：x = 右为正（向右看），y = 下为正（向下看） */
  setLookInput(x: number, y: number) {
    this.lookInput.x = x;
    this.lookInput.y = y;
  }

  /** 触屏滑动环视：dx/dy 为手指位移（px），视角跟手（手指往右滑 → 往右看，往上滑 → 抬头） */
  addLookDelta(dx: number, dy: number) {
    if (!this.active) return;
    this.autoFace = null;
    const k = (Math.PI * 0.4) / Math.max(this.canvas.clientWidth, 1);
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k * 0.8, -1.15, 1.15);
  }

  /**
   * 点哪走哪：屏幕坐标射线先测照片、再沿射线步进找地面。
   * 点中照片 → 走到照片正前方（按视场角算出能看全整张的距离）并转身正对；
   * 点中地面 → 走到该点。跨越室内外时经门洞中线绕行，避免撞前墙卡住。
   */
  tapAt(clientX: number, clientY: number) {
    if (!this.active) return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / Math.max(rect.width, 1)) * 2 - 1,
      -((clientY - rect.top) / Math.max(rect.height, 1)) * 2 + 1,
    );
    this.camera.updateMatrixWorld();
    this.tapRay.setFromCamera(ndc, this.camera);
    const ray = this.tapRay.ray;
    const cam = this.camera.position;
    const indoor = cam.z < this.ARCH_Z;
    const zone = indoor ? "hall" : this.outdoor;

    const candidates = this.photoTargets.filter((t) => t.zone === zone);
    const hit = this.tapRay.intersectObjects(
      candidates.map((t) => t.mesh),
      false,
    )[0];
    const ground = this.marchGround(ray.origin, ray.direction, indoor);

    if (hit && (!ground || hit.distance < ground.distance + 0.5)) {
      const t = candidates.find((c) => c.mesh === hit.object);
      if (t) {
        this.walkToPhoto(t);
        return;
      }
    }
    if (ground) {
      this.startAutoWalk(ground.point.x, ground.point.z, null);
    }
  }

  /** 沿射线步进求与地面的交点；室内出了厅堂范围（撞墙/天花板）即以最后一个室内点为准 */
  private marchGround(o: THREE.Vector3, d: THREE.Vector3, indoor: boolean) {
    const p = new THREE.Vector3();
    const last = new THREE.Vector3().copy(o);
    const margin = 0.6;
    for (let t = 0.3; t < 60; t += 0.15) {
      p.copy(o).addScaledVector(d, t);
      if (indoor) {
        const out =
          Math.abs(p.x) > this.W / 2 - margin || p.z < this.DEPTH_START + margin || p.y > this.H;
        if (out) {
          if (d.y >= 0 || t < 1) return null;
          return { point: last.clone(), distance: t };
        }
      }
      if (p.y <= this.groundYAt(p.x, p.z)) return { point: p.clone(), distance: t };
      last.copy(p);
    }
    return null;
  }

  private walkToPhoto(t: { mesh: THREE.Mesh; w: number; h: number; key?: string }) {
    // 走过去约需 1s，出发时就开始下载高清档，到了正好换上
    const entry = t.key ? this.photoEntries.get(t.key) : undefined;
    if (entry?.hdUrl && entry.base) {
      entry.hdWantedAt = performance.now() + 3000;
      if (!entry.hd && !entry.hdLoading) this.loadHd(entry);
    }
    t.mesh.updateMatrixWorld();
    const center = new THREE.Vector3().setFromMatrixPosition(t.mesh.matrixWorld);
    const n = new THREE.Vector3(0, 0, 1).transformDirection(t.mesh.matrixWorld);
    n.y = 0;
    if (n.lengthSq() < 1e-6) return;
    n.normalize();
    if (n.dot(new THREE.Vector3().subVectors(this.camera.position, center)) < 0) n.negate();

    // 竖直/水平两个方向都要装下整张照片，取较远者再留 15% 边
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const dist = clamp(Math.max(t.h / 2 / Math.tan(vHalf), t.w / 2 / Math.tan(hHalf)) * 1.15, 1.4, 7);
    let x = center.x + n.x * dist;
    let z = center.z + n.z * dist;
    if (center.z < this.ARCH_Z) {
      x = clamp(x, -this.W / 2 + 0.8, this.W / 2 - 0.8);
      z = clamp(z, this.DEPTH_START + 0.8, this.ARCH_Z - 0.8);
    }
    const eyeY = this.groundYAt(x, z) + 1.72;
    const flat = Math.hypot(center.x - x, center.z - z);
    this.startAutoWalk(x, z, {
      yaw: Math.atan2(n.x, n.z),
      pitch: clamp(Math.atan2(center.y - eyeY, Math.max(flat, 0.5)), -0.5, 0.5),
    });
  }

  private startAutoWalk(x: number, z: number, face: { yaw: number; pitch: number } | null) {
    const cam = this.camera.position;
    let path = this.findPath(cam.x, cam.z, x, z);
    if (!path) {
      // 找不到路（目标被围死等）：退回直线走，跨室内外时仍经门洞中线
      path = [];
      const fromIn = cam.z < this.ARCH_Z;
      const toIn = z < this.ARCH_Z;
      if (fromIn !== toIn) {
        const inside = new THREE.Vector2(0, this.ARCH_Z - 1.2);
        const outside = new THREE.Vector2(0, this.ARCH_Z + 1.2);
        path.push(fromIn ? inside : outside, fromIn ? outside : inside);
      }
      path.push(new THREE.Vector2(x, z));
    }
    const end = path[path.length - 1];
    this.autoPath = path;
    this.autoFace = face;
    this.autoBestD = Infinity;
    this.autoStuckT = 0;
    this.showTapMarker(end.x, end.y);
  }

  /** 该点能否站人：与 resolveBounds 同一套边界/前墙/碰撞圆/矩形，额外留 5cm 余量 */
  private navFree(x: number, z: number): boolean {
    const R = 0.45;
    if (z < this.ARCH_Z) {
      if (Math.abs(x) > this.W / 2 - 0.5 || z < this.DEPTH_START + 0.5) return false;
    } else if (this.outdoor === "beach") {
      if (Math.abs(x) > 22 || z > 61) return false;
    } else if (Math.hypot(x / this.LAWN_WALK_R, (z - this.ARCH_Z) / (this.LAWN_WALK_Z - this.ARCH_Z)) > 1) {
      return false;
    }
    if (Math.abs(z - this.ARCH_Z) < 0.45 && Math.abs(x) > this.ARCH_R - 0.5) return false;
    const inCircles = (list: Circle[]) => {
      for (const c of list) {
        const rr = c.r + R;
        if ((x - c.x) * (x - c.x) + (z - c.z) * (z - c.z) < rr * rr) return true;
      }
      return false;
    };
    if (inCircles(this.circles) || inCircles(this.outdoorCircles[this.outdoor])) return false;
    for (const b of this.boxes) {
      const dx = x - clamp(x, b.x0, b.x1);
      const dz = z - clamp(z, b.z0, b.z1);
      if (dx * dx + dz * dz < R * R) return false;
    }
    return true;
  }

  /**
   * 网格 A* 寻路（格子 0.25m，8 邻接，不切角；往上一步高差 > 0.5m 视为不可走，与 blockTallSteps 一致）。
   * 只在起终点外扩的矩形里按需求格子，找不到再扩大一次；路径最后做视线拉直，只留拐点。
   * 起点/终点落在障碍里时就近吸附到 1.5m 内的空地。
   */
  private findPath(sx: number, sz: number, gx: number, gz: number): THREE.Vector2[] | null {
    const CELL = 0.25;
    const MAX_UP = 0.5;
    for (const pad of [6, 20]) {
      const x0 = Math.min(sx, gx) - pad;
      const z0 = Math.min(sz, gz) - pad;
      const nx = Math.ceil((Math.max(sx, gx) + pad - x0) / CELL) + 1;
      const nz = Math.ceil((Math.max(sz, gz) + pad - z0) / CELL) + 1;
      const n = nx * nz;
      // 0 = 未求值，1 = 可走，2 = 不可走
      const state = new Uint8Array(n);
      const height = new Float32Array(n);
      const cx = (i: number) => x0 + (i % nx) * CELL;
      const cz = (i: number) => z0 + Math.floor(i / nx) * CELL;
      const free = (i: number) => {
        if (state[i] === 0) {
          const x = cx(i);
          const z = cz(i);
          const ok = this.navFree(x, z);
          state[i] = ok ? 1 : 2;
          if (ok) height[i] = this.groundYAt(x, z);
        }
        return state[i] === 1;
      };
      const cellOf = (x: number, z: number) => {
        const ix = clamp(Math.round((x - x0) / CELL), 0, nx - 1);
        const iz = clamp(Math.round((z - z0) / CELL), 0, nz - 1);
        return iz * nx + ix;
      };
      const snap = (x: number, z: number) => {
        const c = cellOf(x, z);
        if (free(c)) return c;
        const ix = c % nx;
        const iz = Math.floor(c / nx);
        let best = -1;
        let bestD = Infinity;
        const r = Math.ceil(1.5 / CELL);
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const jx = ix + dx;
            const jz = iz + dz;
            if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
            const d = dx * dx + dz * dz;
            if (d < bestD && free(jz * nx + jx)) {
              bestD = d;
              best = jz * nx + jx;
            }
          }
        }
        return best;
      };
      const start = snap(sx, sz);
      const goal = snap(gx, gz);
      if (start < 0 || goal < 0) return null;

      const gCost = new Float32Array(n).fill(Infinity);
      const from = new Int32Array(n).fill(-1);
      const closed = new Uint8Array(n);
      const heap: number[] = [];
      const fOf = new Float32Array(n);
      const gxI = goal % nx;
      const gzI = Math.floor(goal / nx);
      const hOf = (i: number) => {
        const dx = Math.abs((i % nx) - gxI);
        const dz = Math.abs(Math.floor(i / nx) - gzI);
        return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
      };
      const push = (i: number) => {
        heap.push(i);
        let k = heap.length - 1;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (fOf[heap[p]] <= fOf[heap[k]]) break;
          [heap[p], heap[k]] = [heap[k], heap[p]];
          k = p;
        }
      };
      const pop = () => {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length > 0) {
          heap[0] = last;
          let k = 0;
          for (;;) {
            const l = k * 2 + 1;
            const r = l + 1;
            let m = k;
            if (l < heap.length && fOf[heap[l]] < fOf[heap[m]]) m = l;
            if (r < heap.length && fOf[heap[r]] < fOf[heap[m]]) m = r;
            if (m === k) break;
            [heap[m], heap[k]] = [heap[k], heap[m]];
            k = m;
          }
        }
        return top;
      };

      gCost[start] = 0;
      fOf[start] = hOf(start);
      push(start);
      let found = false;
      let budget = 60000;
      while (heap.length > 0 && budget-- > 0) {
        const cur = pop();
        if (closed[cur]) continue;
        if (cur === goal) {
          found = true;
          break;
        }
        closed[cur] = 1;
        const ix = cur % nx;
        const iz = Math.floor(cur / nx);
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dz === 0) continue;
            const jx = ix + dx;
            const jz = iz + dz;
            if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
            const j = jz * nx + jx;
            if (closed[j] || !free(j)) continue;
            if (dx !== 0 && dz !== 0 && (!free(iz * nx + jx) || !free(jz * nx + ix))) continue;
            if (height[j] - height[cur] > MAX_UP) continue;
            const g = gCost[cur] + (dx !== 0 && dz !== 0 ? 1.4142 : 1);
            if (g < gCost[j]) {
              gCost[j] = g;
              from[j] = cur;
              fOf[j] = g + hOf(j);
              push(j);
            }
          }
        }
      }
      if (!found) continue;

      const cells: number[] = [];
      for (let c = goal; c >= 0; c = from[c]) cells.push(c);
      cells.reverse();
      // 视线拉直：沿线段每 0.1m 采样，全程可站且往上无大台阶才算直达
      const clear = (ax: number, az: number, bx: number, bz: number) => {
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.ceil(len / 0.1));
        let prevY = this.groundYAt(ax, az);
        for (let k = 1; k <= steps; k++) {
          const t = k / steps;
          const x = ax + (bx - ax) * t;
          const z = az + (bz - az) * t;
          if (!this.navFree(x, z)) return false;
          const y = this.groundYAt(x, z);
          if (y - prevY > MAX_UP) return false;
          prevY = y;
        }
        return true;
      };
      const goalFree = this.navFree(gx, gz);
      const pts = cells.map((c) => new THREE.Vector2(cx(c), cz(c)));
      pts[pts.length - 1] = goalFree ? new THREE.Vector2(gx, gz) : pts[pts.length - 1];
      const out: THREE.Vector2[] = [];
      let ax = sx;
      let az = sz;
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && !clear(ax, az, pts[j].x, pts[j].y)) j--;
        out.push(pts[j]);
        ax = pts[j].x;
        az = pts[j].y;
        i = j;
      }
      if (out.length === 0) out.push(pts[pts.length - 1]);
      return out;
    }
    return null;
  }

  private cancelAutoWalk() {
    this.autoPath = null;
    this.autoFace = null;
  }

  /** 自动行走转向：写入 tmpDesired，返回速度系数（0 = 已到达/放弃） */
  private steerAutoWalk(dt: number): number {
    const path = this.autoPath;
    if (!path || path.length === 0) {
      this.autoPath = null;
      return 0;
    }
    const wp = path[0];
    const dx = wp.x - this.camera.position.x;
    const dz = wp.y - this.camera.position.z;
    const d = Math.hypot(dx, dz);
    const last = path.length === 1;
    // 进度卡住（被椅子/花柱挡住）超过 0.9s：中途点跳过，终点就地停下
    if (d < this.autoBestD - 0.05) {
      this.autoBestD = d;
      this.autoStuckT = 0;
    } else {
      this.autoStuckT += dt;
    }
    if (d < (last ? 0.12 : 0.3) || this.autoStuckT > 0.9) {
      path.shift();
      this.autoBestD = Infinity;
      this.autoStuckT = 0;
      if (path.length === 0) this.autoPath = null;
      return 0;
    }
    this.tmpDesired.set(dx / d, 0, dz / d);
    return (last ? clamp(d / 1.2, 0.2, 1) : 1) * 0.75;
  }

  /** 到达朝向：yaw 取最短角差平滑转过去，转到位且已停步后清除 */
  private applyAutoFace(dt: number) {
    const f = this.autoFace;
    if (!f) return;
    const k = 1 - Math.exp(-3.2 * dt);
    let dy = f.yaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dp = f.pitch - this.pitch;
    this.yaw += dy * k;
    this.pitch += dp * k;
    if (!this.autoPath && Math.abs(dy) < 0.003 && Math.abs(dp) < 0.003) this.autoFace = null;
  }

  /** 落点提示：地面金色圆环，放大并淡出 */
  private showTapMarker(x: number, z: number) {
    if (!this.tapMarker) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.2, 0.27, 40).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: "#ffe2b0", transparent: true, depthWrite: false, opacity: 0 }),
      );
      ring.renderOrder = 5;
      this.tapMarker = ring;
      this.scene.add(ring);
    }
    this.tapMarker.position.set(x, this.groundYAt(x, z) + 0.03, z);
    this.tapMarker.visible = true;
    this.tapMarkerT = 0;
  }

  private tickTapMarker(dt: number) {
    const m = this.tapMarker;
    if (!m || !m.visible) return;
    this.tapMarkerT += dt / 0.9;
    const t = Math.min(this.tapMarkerT, 1);
    m.scale.setScalar(0.7 + t * 0.8);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - t);
    if (t >= 1) m.visible = false;
  }

  // pointer lock 被浏览器拒绝后的降级：按住左键拖拽转向（复用 yaw/pitch 模型）
  private enableDragMode() {
    if (this.touchMode || this.dragMode || this.disposed) return;
    this.dragMode = true;

    this.lookEuler.setFromQuaternion(this.camera.quaternion);
    this.yaw = this.lookEuler.y;
    this.pitch = this.lookEuler.x;

    let downX = 0;
    let downY = 0;
    let downT = 0;
    const pd = (e: PointerEvent) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      downX = e.clientX;
      downY = e.clientY;
      downT = performance.now();
    };
    const pm = (e: PointerEvent) => {
      if (!this.dragging) return;
      if (e.clientX !== this.lastPX || e.clientY !== this.lastPY) this.autoFace = null;
      this.yaw -= (e.clientX - this.lastPX) * 0.005;
      this.pitch = clamp(this.pitch - (e.clientY - this.lastPY) * 0.0035, -1.15, 1.15);
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
    };
    const pu = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      const still = Math.hypot(e.clientX - downX, e.clientY - downY) < 6;
      if (still && performance.now() - downT < 400) this.tapAt(e.clientX, e.clientY);
    };

    this.canvas.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    this.cleanups.push(
      () => this.canvas.removeEventListener("pointerdown", pd),
      () => window.removeEventListener("pointermove", pm),
      () => window.removeEventListener("pointerup", pu),
    );

    this.active = true;
    this.opts.onActiveChange(true);
  }

  /** 进入画廊：桌面请求指针锁定；触屏直接标记 active */
  enter() {
    this.resetAdaptiveResolution();
    if (this.touchMode || this.dragMode) {
      this.active = true;
      this.opts.onActiveChange(true);
      return;
    }
    // 桌面不再锁定鼠标：保留光标，按住左键拖拽转向 + WASD / 屏幕摇杆移动
    this.enableDragMode();
  }

  /** 退出画廊 */
  exit() {
    this.cancelAutoWalk();
    if (this.touchMode || this.dragMode) {
      this.active = false;
      this.opts.onActiveChange(false);
      return;
    }
    this.controls?.unlock();
  }

  // ── 帧循环 ─────────────────────────────────────────────────
  private animate = () => {
    const loop = (now: number) => {
      this.animId = requestAnimationFrame(loop);
      if (this.renderPaused && this.framesRendered > 0) {
        // 画廊不在视口时用户正在滚页面，手机上大图上传单张就十几毫秒，预算要克制
        this.warmTick(now, this.touchMode ? 2 : 4);
        return;
      }
      const dt = Math.min(this.clock.getDelta(), 0.05);

      if (this.idleMode) {
        // 封面层不透明度 0.72~0.92，半帧率下的跳变被遮罩吸收，肉眼不可分辨
        this.idleAcc += dt;
        if (this.idleAcc < 1 / 30) {
          this.warmTick(now, this.touchMode ? 2 : 4);
          return;
        }
        this.idleAcc = 0;
      }

      const frameStart = this.perfEnabled ? performance.now() : 0;
      this.update(dt);
      const updateMs = this.perfEnabled ? performance.now() - frameStart : 0;
      this.syncOutdoorVisibility();
      if (this.active && !this.idleMode) {
        this.fadeLightCones();
        this.hdTick(now);
      }
      this.updateBoost(now);
      this.lodTick(now);
      this.verifyCulledInstances();
      this.updateFarMaterials();
      this.flushFarWarmQueue();
      this.applyPortalCull();
      const renderStart = this.perfEnabled ? performance.now() : 0;
      this.renderer.render(this.scene, this.camera);
      const renderMs = this.perfEnabled ? performance.now() - renderStart : 0;
      this.restorePortalCull();
      this.framesRendered++;
      this.trackFrameInterval(now);
      if (this.perfEnabled) this.recordPerf(now, updateMs, renderMs);
      // 漫游中每 250ms 只传 1 张：多张集中上传会在手机上形成可感知的顿挫
      this.warmTick(now, this.idleMode ? (this.touchMode ? 2 : 4) : 1);
    };
    this.animId = requestAnimationFrame(loop);
  };

  private recordPerf(now: number, updateMs: number, renderMs: number) {
    if (!this.perfPanel) return;
    const frame = this.perfLastFrame > 0 ? now - this.perfLastFrame : 0;
    this.perfLastFrame = now;
    if (!this.active || this.idleMode) {
      this.perfSamples.length = 0;
      this.perfSlowest = { frame: 0, marker: "-" };
      return;
    }
    if (!frame) return;
    const marker = this.perfFrameNote || this.perfMarker;
    this.perfFrameNote = "";
    this.perfSamples.push({ frame, update: updateMs, render: renderMs, marker });
    if (this.perfSamples.length > 180) this.perfSamples.shift();
    if (frame > this.perfSlowest.frame) this.perfSlowest = { frame, marker };
    if (now - this.perfLastReport < 500) return;
    this.perfLastReport = now;
    const sorted = (key: "frame" | "update" | "render") =>
      this.perfSamples.map((s) => s[key]).sort((a, b) => a - b);
    const p95 = (key: "frame" | "update" | "render") => {
      const values = sorted(key);
      return values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] ?? 0;
    };
    const info = this.renderer.info;
    const programs = info.programs?.length ?? 0;
    const maxFrame = Math.max(...this.perfSamples.map((s) => s.frame));
    const slow = this.perfSamples.filter((s) => s.frame > 50).length;
    let hd = 0;
    for (const e of this.photoEntries.values()) if (e.hd) hd++;
    this.perfPanel.textContent = [
      `frame p95 ${p95("frame").toFixed(1)}ms max ${maxFrame.toFixed(0)}ms >50 ${slow} | update ${p95("update").toFixed(1)}ms | render ${p95("render").toFixed(1)}ms`,
      `pr ${this.renderer.getPixelRatio().toFixed(2)} | far ${this.farActive} | outdoor ${this.camera.position.z > this.ARCH_Z + 0.5}`,
      `calls ${info.render.calls} | tris ${Math.round(info.render.triangles / 1000)}k | programs ${programs}`,
      `geo ${info.memory.geometries} | tex ${info.memory.textures} | hd ${hd} loading ${this.hdLoading}`,
      `photo ${this.perfPhoto} | marker ${this.perfMarker} | noGrass ${this.noGrassDebug} | meadowRoses ${this.showMeadowRoses} | lawnFlowers ${this.fullLawnFlowers} | chandeliers ${this.showChandeliers} | smallChandeliers ${this.showSmallChandeliers}`,
      `slowest ${this.perfSlowest.frame.toFixed(0)}ms ${this.perfSlowest.marker} | context ${this.perfContextLost ? "LOST" : "ok"}`,
      `events ${this.perfEvents.join(" / ") || "none"}`,
    ].join("\n");
  }

  /**
   * 预热：有材质还没编译就整体 compileAsync（支持 KHR_parallel_shader_compile 时不阻塞主线程）；
   * 已加载但未上传的贴图每次最多上传 budget 张。室外组在厅内背对大门时不参与渲染，
   * 不预热的话首次转身会集中编译+上传（实测卡 1.2s）。
   * 扫描基于缓存扁平表（材质 → 其纹理列表），避免每 tick 全场景 traverse + Object.values 的
   * 重复分配开销；表每 2s 重建一次，兼顾异步挂载的 GLB / 装饰材质。
   */
  private warmTick(now: number, budget: number) {
    const interval = this.idleMode ? 120 : 250;
    if (now - this.lastWarmTs < interval) return;
    this.lastWarmTs = now;
    if (now - this.warmTableTs > 2000) this.rebuildWarmTable();
    const props = this.renderer.properties;
    let needCompile = false;
    let uploads = 0;
    for (const entry of this.warmTable) {
      if ((props.get(entry.mat) as { currentProgram?: unknown }).currentProgram === undefined) needCompile = true;
      for (const tex of entry.texs) {
        if (uploads >= budget) break;
        if (tex.version > 0 && (props.get(tex) as { __version?: number }).__version !== tex.version) {
          this.renderer.initTexture(tex);
          uploads++;
        }
      }
      if (uploads >= budget) break;
    }
    if (uploads > 0) {
      this.skipFrameSamples = 2;
      this.notePerfEvent(`texture-upload ${uploads}`);
    }
    this.warmFarMaterials();
    if (needCompile && !this.warmCompiling) {
      this.warmCompiling = true;
      this.renderer
        .compileAsync(this.scene, this.camera)
        .catch(() => undefined)
        .finally(() => {
          this.warmCompiling = false;
        });
    }
  }

  /** 收集场景中所有「材质 → 纹理引用列表」，供 warmTick 零分配扫描；约 2-5ms，2s 才跑一次 */
  private rebuildWarmTable() {
    this.warmTableTs = performance.now();
    const table: { mat: THREE.Material; texs: THREE.Texture[] }[] = [];
    const seen = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh && !this.cullChecked.has(o)) this.enableInstanceCulling(o);
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        if (seen.has(m)) continue;
        seen.add(m);
        const texs: THREE.Texture[] = [];
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) texs.push(v);
        const uniforms = (m as THREE.ShaderMaterial).uniforms;
        if (uniforms) for (const u of Object.values(uniforms)) if (u?.value instanceof THREE.Texture) texs.push(u.value);
        table.push({ mat: m, texs });
      }
    });
    this.warmTable = table;
    this.classifyIndoorRoots();
    this.collectFarSwaps();
  }

  /** 登记室内根下新出现的 MeshPhysicalMaterial 网格（GLB/花艺异步挂载，随 rebuildWarmTable 每 2s 增量扫描） */
  private collectFarSwaps() {
    for (const root of this.indoorRoots) {
      root.traverse((o) => {
        if (this.farChecked.has(o)) return;
        this.farChecked.add(o);
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || Array.isArray(mesh.material)) return;
        const hi = mesh.material;
        // transmission 依赖额外的透射 pass，换材质会明显变样，保持原样
        if (!(hi instanceof THREE.MeshPhysicalMaterial) || hi.transmission > 0) return;
        let lo = this.farMats.get(hi);
        if (!lo) {
          lo = this.makeFarMaterial(hi);
          this.farMats.set(hi, lo);
          this.disposables.push(lo);
        }
        this.farMeshes.push({ mesh, hi, lo, warmed: false });
        this.farPending = true;
      });
    }
  }

  private makeFarMaterial(hi: THREE.MeshPhysicalMaterial): THREE.MeshStandardMaterial {
    const lo = new THREE.MeshStandardMaterial();
    lo.copy(hi);
    lo.name = `${hi.name}#far`;
    // 双面透明在 three 里拆成背面+正面两遍绘制；门外远看只剩朝外切面可见，单面即可（截图差异 <1.5% 像素）
    if (hi.transparent && hi.side === THREE.DoubleSide) lo.side = THREE.FrontSide;
    lo.onBeforeCompile = hi.onBeforeCompile;
    const hiKey = hi.customProgramCacheKey.bind(hi);
    lo.customProgramCacheKey = () => `${hiKey()}|far`;
    return lo;
  }

  /**
   * 预编译远景材质：先 compileAsync（有并行编译扩展时不阻塞），再用远景材质往 1×1 视口真实画一帧。
   * 只 compile 不画的话，首次出门那帧仍要建绘制管线（实测 CPU 卡 32~43ms），画过一次后降到 2ms。
   */
  private warmFarMaterials() {
    if (!this.farPending || this.warmCompiling || this.farWarmQueue || this.disposed) return;
    this.farPending = false;
    const cold = this.farMeshes.filter((e) => !e.warmed);
    if (cold.length === 0) return;
    const swap = (far: boolean) => {
      for (const e of cold) e.mesh.material = far ? e.lo : this.farActive && e.warmed ? e.lo : e.hi;
    };
    swap(true);
    this.warmCompiling = true;
    const done = this.renderer.compileAsync(this.scene, this.camera);
    swap(false);
    done
      .catch(() => undefined)
      .finally(() => {
        this.warmCompiling = false;
        if (this.disposed) return;
        this.farWarmQueue = cold;
      });
  }

  /** 默认帧缓冲不保留上一帧；预画必须与完整画面在同一个 rAF 回调内，否则帧间的 1×1 绘制会闪黑。 */
  private flushFarWarmQueue() {
    const cold = this.farWarmQueue;
    if (!cold) return;
    this.farWarmQueue = null;
    this.notePerfEvent(`far-warm ${cold.length}`);
    const r = this.renderer;
    const culled = cold.map((e) => e.mesh.frustumCulled);
    const autoClear = r.autoClear;
    const scissorTest = r.getScissorTest();
    const size = r.getSize(this.farWarmSize);
    try {
      for (const e of cold) {
        e.mesh.material = e.lo;
        e.mesh.frustumCulled = false;
      }
      r.autoClear = false;
      r.setScissorTest(true);
      r.setScissor(0, 0, 1, 1);
      r.setViewport(0, 0, 1, 1);
      r.render(this.scene, this.camera);
      const props = r.properties;
      for (const e of cold) {
        if ((props.get(e.lo) as { currentProgram?: unknown }).currentProgram !== undefined) e.warmed = true;
        else this.farPending = true;
      }
    } finally {
      r.setScissorTest(scissorTest);
      r.setViewport(0, 0, size.x, size.y);
      r.autoClear = autoClear;
      cold.forEach((e, i) => {
        e.mesh.frustumCulled = culled[i];
        e.mesh.material = this.farActive && e.warmed ? e.lo : e.hi;
      });
      this.skipFrameSamples = 2;
    }
  }

  /** 出门 1.5m 换远景材质、回到门内 0.5m 换回（滞回避免门口来回抖动） */
  private updateFarMaterials() {
    const z = this.camera.position.z;
    const want = this.farActive ? z > this.ARCH_Z + 0.5 : z > this.ARCH_Z + 1.5;
    if (want === this.farActive) return;
    this.farActive = want;
    if (this.perfEnabled) this.perfMarker = want ? "far-on" : "far-off";
    for (const e of this.farMeshes) if (e.warmed) e.mesh.material = want ? e.lo : e.hi;
  }

  /**
   * 场景里的 InstancedMesh 构建时一律关了视锥剔除（草坪/大厅合计 3.7M 三角形每帧全画）。
   * 静态的改用覆盖全部实例的包围球剔除，半径外扩吸收着色器里的风摆位移；
   * ShaderMaterial 与标记 noAutoCull（顶点着色器整体改写位置，如 billboard）的不动。
   */
  private enableInstanceCulling(mesh: THREE.InstancedMesh) {
    this.cullChecked.add(mesh);
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (
      mesh.frustumCulled ||
      mesh.userData.noAutoCull ||
      mat instanceof THREE.ShaderMaterial ||
      mesh.instanceMatrix.usage === THREE.DynamicDrawUsage ||
      mesh.count === 0
    ) {
      return;
    }
    mesh.computeBoundingSphere();
    const sphere = mesh.boundingSphere;
    if (!sphere) return;
    sphere.radius += Math.max(1.5, sphere.radius * 0.1);
    mesh.frustumCulled = true;
    this.culledInstances.push({ mesh, version: mesh.instanceMatrix.version, count: mesh.count });
  }

  /** 每帧渲染前核对：运行期被改过矩阵/数量的实例退回不剔除，避免包围球过期导致误剔 */
  private verifyCulledInstances() {
    const list = this.culledInstances;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (c.mesh.instanceMatrix.version === c.version && c.mesh.count === c.count) continue;
      c.mesh.frustumCulled = false;
      for (let p: THREE.Object3D | null = c.mesh; p; p = p.parent) this.portalSpheres.delete(p);
      list[i] = list[list.length - 1];
      list.pop();
    }
  }

  /** 场景里已就绪（version>0，即图像已加载或为画布贴图）的贴图，含 ShaderMaterial uniforms 里的 */
  private collectSceneTextures(): Set<THREE.Texture> {
    const out = new Set<THREE.Texture>();
    const add = (v: unknown) => {
      if (v instanceof THREE.Texture && v.version > 0) out.add(v);
    };
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        for (const v of Object.values(m)) add(v);
        const uniforms = (m as THREE.ShaderMaterial).uniforms;
        if (uniforms) for (const u of Object.values(uniforms)) add(u?.value);
      }
    });
    add(this.scene.environment);
    return out;
  }

  private trackFrameInterval(now: number) {
    const iv = now - this.lastFrameTs;
    this.lastFrameTs = now;
    if (this.idleMode || !this.active) return;
    // 暂停恢复、偶发编译等超长帧不代表持续负载
    if (iv <= 0 || iv > 100) return;
    if (this.skipFrameSamples > 0) {
      this.skipFrameSamples--;
      return;
    }
    // 静止高分辨率期间单独计量：低于约 48fps 就退回（30s 后再试，失败两次本次浏览不再尝试），不影响自适应档位
    if (this.boosted) {
      this.boostEma += (iv - this.boostEma) * 0.1;
      this.boostSlow = this.boostEma > 21 ? this.boostSlow + 1 : 0;
      if (this.boostSlow > 30) {
        this.setBoost(false);
        this.boostFails++;
        this.boostBlockedUntil = this.boostFails >= 2 ? Infinity : now + 30000;
      }
      return;
    }
    if (this.prLevels.length < 2) return;
    this.frameIvEma += (iv - this.frameIvEma) * 0.05;
    this.frameJitterEma += (Math.abs(iv - this.frameIvEma) - this.frameJitterEma) * 0.05;
    // 稳定的 33ms（iOS 低电量模式把 rAF 锁在 30fps）不是掉帧：只有忽快忽慢，或明显低于 25fps 才算
    const struggling = (this.frameIvEma > 22 && this.frameJitterEma > 3) || this.frameIvEma > 40;
    this.slowFrames = struggling ? this.slowFrames + 1 : 0;
    this.fastFrames = this.frameIvEma < 19 ? this.fastFrames + 1 : 0;
    // 连续约 1 秒吃力就降一档（原 2 秒）：手机持续满载发热降频时更早减负
    if (this.slowFrames > 60 && this.prIdx < this.prLevels.length - 1) {
      // 刚升档不久又撑不住：延长下次升档前的观察期，避免清晰度来回跳
      if (now - this.lastUpgradeTs < 5000) this.prUpgradeHoldMs = Math.min(this.prUpgradeHoldMs * 2, 60000);
      this.prIdx++;
      this.applyPixelRatio();
      this.slowFrames = 0;
      this.fastFrames = 0;
      this.frameIvEma = 16.7;
      this.frameJitterEma = 0;
      this.lastDowngradeTs = now;
    } else if (this.fastFrames > 240 && this.prIdx > 0 && now - this.lastDowngradeTs > this.prUpgradeHoldMs) {
      this.prIdx--;
      this.applyPixelRatio();
      this.fastFrames = 0;
      this.lastUpgradeTs = now;
    }
  }

  setRenderPaused(paused: boolean) {
    if (this.renderPaused === paused || this.disposed) return;
    this.renderPaused = paused;
    if (!paused && this.framesRendered > 0) {
      this.clock.getDelta();
      this.renderer.render(this.scene, this.camera);
    }
  }

  setIdleMode(idle: boolean) {
    this.idleMode = idle;
    this.idleAcc = 0;
  }

  private resetAdaptiveResolution() {
    this.boosted = false;
    this.prIdx = 0;
    if (this.prLevels.length > 0) this.applyPixelRatio();
    this.boostBlockedUntil = this.boostFails >= 2 ? Infinity : 0;
    this.stillSince = performance.now() + 800;
    this.slowFrames = 0;
    this.fastFrames = 0;
    this.frameIvEma = 16.7;
    this.frameJitterEma = 0;
    this.prUpgradeHoldMs = 8000;
    this.lastDowngradeTs = -Infinity;
    this.lastUpgradeTs = -Infinity;
  }

  /**
   * 3 倍屏静止 0.6s 后把渲染像素比从 2 提到设备原生（最高 3），停下来细看照片时更锐；
   * 镜头一动立即回到自适应档位，走动时仍保持流畅。自适应已降档时不启用。
   * 户外整屏都是草地/花海，3 倍渲染 GPU 开销涨约 1/3 且看不出差别，只在照片占屏 ≥22% 时才启用，
   * 避免在户外一停一走反复切换分辨率、手机持续满负荷发热降频。
   */
  private updateBoost(now: number) {
    if (!this.boostPr) return;
    const cam = this.camera.position;
    const moving =
      cam.distanceToSquared(this.lastCamPos) > 1e-8 || 1 - Math.abs(this.camera.quaternion.dot(this.lastCamQuat)) > 1e-9;
    this.lastCamPos.copy(cam);
    this.lastCamQuat.copy(this.camera.quaternion);
    if (moving) this.stillSince = now;
    const outdoors = cam.z > this.ARCH_Z + 0.5;
    const want =
      this.active &&
      !this.idleMode &&
      this.prIdx === 0 &&
      now >= this.boostBlockedUntil &&
      now - this.stillSince > 600 &&
      (!outdoors || this.photoFocusRatio >= 0.22);
    if (want !== this.boosted) this.setBoost(want);
  }

  private setBoost(on: boolean) {
    this.boosted = on;
    this.applyPixelRatio();
    this.boostEma = 16.7;
    this.boostSlow = 0;
    this.skipFrameSamples = 3;
  }

  /**
   * 不按位置/走停主动切分辨率：实测切换那一帧要重建画布缓冲，CPU 卡 33~43ms（比省下的 GPU 更显眼），
   * 只在自适应判定持续吃力时才降档。
   */
  private effectivePr(): number {
    return this.boosted ? this.boostPr : (this.prLevels[this.prIdx] ?? 1);
  }

  private applyPixelRatio() {
    const pr = this.effectivePr();
    if (this.renderer.getPixelRatio() === pr) return;
    this.notePerfEvent(`pixel-ratio ${this.renderer.getPixelRatio().toFixed(2)}->${pr.toFixed(2)}`);
    this.renderer.setPixelRatio(pr);
    this.skipFrameSamples = 3;
  }

  /** 把 scene 根下完全落在大厅内（门洞平面以内）的对象记为室内根，供门外回看时做门洞剔除 */
  private classifyIndoorRoots() {
    const box = this.portalBox;
    for (const o of this.scene.children) {
      if (this.portalClassified.has(o)) continue;
      this.portalClassified.add(o);
      if (o === this.lawnGroup || o === this.beachGroup || (o as THREE.Light).isLight) continue;
      box.makeEmpty().expandByObject(o);
      if (box.isEmpty()) continue;
      if (
        box.max.z < this.ARCH_Z - 0.2 &&
        box.min.z > this.DEPTH_START - 1 &&
        Math.abs(box.min.x) < this.W / 2 + 0.5 &&
        Math.abs(box.max.x) < this.W / 2 + 0.5
      ) {
        this.indoorRoots.push(o);
      }
    }
  }

  /**
   * 对象的门洞剔除包围球（世界坐标，外扩 1m 兜住摆动/风动）。含灯光的子树不参与（隐藏灯会改光源数、触发重编译）；
   * 子树里的 InstancedMesh 须已被 enableInstanceCulling 判定为静态，否则暂不参与，下次再试。
   */
  private portalEntry(o: THREE.Object3D): THREE.Sphere | null {
    const cached = this.portalSpheres.get(o);
    if (cached !== undefined) return cached;
    let ok = true;
    let pending = false;
    o.traverse((c) => {
      if ((c as THREE.Light).isLight) ok = false;
      if (c instanceof THREE.InstancedMesh) {
        if (!this.cullChecked.has(c)) pending = true;
        else if (!c.frustumCulled) ok = false;
      }
    });
    if (pending && ok) return null;
    let sphere: THREE.Sphere | null = null;
    if (ok) {
      const box = this.portalBox.makeEmpty().expandByObject(o);
      if (!box.isEmpty()) {
        sphere = box.getBoundingSphere(new THREE.Sphere());
        sphere.radius += 1;
      }
    }
    this.portalSpheres.set(o, sphere);
    return sphere;
  }

  /** 渲染前：相机在门洞一侧时，把另一侧完全看不到的对象临时隐藏（restorePortalCull 在渲染后恢复） */
  private applyPortalCull() {
    const cam = this.camera.position;
    const dz = cam.z - this.ARCH_Z;
    if (!this.active || Math.abs(dz) < 0.6) return;
    const outside = dz > 0;
    let roots: THREE.Object3D[];
    if (outside) {
      roots = this.indoorRoots;
    } else {
      const g = this.lawnGroup.visible ? this.lawnGroup : this.beachGroup.visible ? this.beachGroup : null;
      if (!g) return;
      roots = g.children;
    }
    const hw = this.ARCH_R + 0.3;
    const top = this.ARCH_PH + this.ARCH_R + 0.3;
    const z = this.ARCH_Z;
    const c = this.portalCorners;
    c[0].set(-hw, -0.2, z);
    c[1].set(hw, -0.2, z);
    c[2].set(hw, top, z);
    c[3].set(-hw, top, z);
    const mid = this.portalMid.set(0, top / 2, z);
    for (let i = 0; i < 4; i++) {
      const p = this.portalPlanes[i];
      p.setFromCoplanarPoints(cam, c[i], c[(i + 1) % 4]);
      if (p.distanceToPoint(mid) < 0) p.negate();
    }
    for (const o of roots) {
      if (!o.visible) continue;
      const s = this.portalEntry(o);
      if (!s) continue;
      // 门洞平面同侧（相机这一侧）的东西不归门洞管，交给普通视锥剔除
      if (outside ? s.center.z - s.radius > z : s.center.z + s.radius < z) continue;
      for (const p of this.portalPlanes) {
        if (p.distanceToPoint(s.center) < -s.radius) {
          o.visible = false;
          this.portalHidden.push(o);
          break;
        }
      }
    }
  }

  private restorePortalCull() {
    for (const o of this.portalHidden) o.visible = true;
    this.portalHidden.length = 0;
  }

  /** 室内时整片室外（草坪/沙滩各 ~1.9M 三角形）只能透过大门拱看见；朝向不对就整组不渲染 */
  private syncOutdoorVisibility() {
    if (!this.lawnBuilt && !this.beachBuilt) return;
    const show = this.outdoorInFrustum();
    if (this.lawnGroup.visible !== (this.outdoor === "lawn" && show)) {
      this.lawnGroup.visible = this.outdoor === "lawn" && show;
      if (this.perfEnabled) this.perfMarker = this.lawnGroup.visible ? "lawn-visible" : "lawn-hidden";
    }
    if (this.noGrassDebug) this.grassCardsGroup.visible = false;
    if (this.beachGroup.visible !== (this.outdoor === "beach" && show)) {
      this.beachGroup.visible = this.outdoor === "beach" && show;
    }
  }

  private outdoorInFrustum(): boolean {
    const cam = this.camera.position;
    if (cam.z >= this.ARCH_Z - 0.5) return true;
    const ar = this.ARCH_R;
    const ph = this.ARCH_PH + this.ARCH_R;
    const dx = -cam.x;
    const dz = this.ARCH_Z - cam.z;
    const distSq = dx * dx + dz * dz;
    if (distSq > 60 * 60) return false;
    // 门中心相对视线方向的水平夹角 vs. 相机水平半视场角 + 门的角半径
    this.camera.getWorldDirection(this.tmpForward);
    const forwardXZ = Math.hypot(this.tmpForward.x, this.tmpForward.z) || 1;
    const fx = this.tmpForward.x / forwardXZ;
    const fz = this.tmpForward.z / forwardXZ;
    const dirLen = Math.sqrt(distSq) || 1;
    const cosA = (dx / dirLen) * fx + (dz / dirLen) * fz;
    const doorAngle = Math.atan2(ar, dirLen);
    const halfHfov = Math.atan(Math.tan(THREE.MathUtils.degToRad(35)) * this.camera.aspect);
    return Math.acos(THREE.MathUtils.clamp(cosA, -1, 1)) < halfHfov + doorAngle;
  }

  private update(dt: number) {
    const manualLook = this.touchMode || this.dragMode;
    const canMove = manualLook ? this.active : (this.controls?.isLocked ?? false);

    if (manualLook && this.active) {
      this.applyAutoFace(dt);
      this.yaw -= this.lookInput.x * 2.3 * dt;
      this.pitch -= this.lookInput.y * 1.7 * dt;
      this.pitch = clamp(this.pitch, -1.15, 1.15);
      this.lookEuler.set(this.pitch - this.stepLean * 0.035, this.yaw, 0);
      this.camera.quaternion.setFromEuler(this.lookEuler);
    }

    if (canMove) {
      // 未按过的键在 keys 中为 undefined，Number(undefined) 会得到 NaN 并污染相机坐标，必须显式转 0/1
      const pressed = (a: string, b: string) => (this.keys[a] || this.keys[b] ? 1 : 0);
      // 键盘与屏幕摇杆叠加（桌面也显示摇杆），结果限制在 [-1, 1]
      const fwd = clamp(
        pressed("KeyW", "ArrowUp") - pressed("KeyS", "ArrowDown") - (this.moveInput.y || 0),
        -1,
        1,
      );
      const side = clamp(
        pressed("KeyD", "ArrowRight") - pressed("KeyA", "ArrowLeft") + (this.moveInput.x || 0),
        -1,
        1,
      );

      // 上台阶时步子放缓（stepLean 为上台阶用力程度 0~1）
      let SPEED = 3.2 * (1 - 0.2 * this.stepLean);
      this.tmpDesired.set(0, 0, 0);
      if (fwd !== 0 || side !== 0) this.cancelAutoWalk();

      if (fwd !== 0) {
        this.camera.getWorldDirection(this.tmpForward);
        this.tmpForward.y = 0;
        if (this.tmpForward.lengthSq() > 1e-6) {
          this.tmpForward.normalize();
          this.tmpDesired.addScaledVector(this.tmpForward, fwd);
        }
      }
      if (side !== 0) {
        this.camera.getWorldDirection(this.tmpForward);
        this.tmpForward.y = 0;
        if (this.tmpForward.lengthSq() > 1e-6) {
          this.tmpForward.normalize();
          this.tmpRight.crossVectors(this.tmpForward, this.camera.up).normalize();
          this.tmpDesired.addScaledVector(this.tmpRight, side);
        }
      }

      if (this.autoPath) SPEED *= this.steerAutoWalk(dt);
      if (this.tmpDesired.lengthSq() > 0) this.tmpDesired.normalize();
      this.tmpTarget.copy(this.tmpDesired).multiplyScalar(SPEED);
      const k = 1 - Math.exp(-10 * dt);
      this.velocity.lerp(this.tmpTarget, k);
      const prevX = this.camera.position.x;
      const prevZ = this.camera.position.z;
      const prevGround = this.groundYAt(prevX, prevZ);
      this.camera.position.addScaledVector(this.velocity, dt);
      // 兜底：任何非有限值都会让整帧只剩背景色，出现即回到出生点
      const cp = this.camera.position;
      if (!Number.isFinite(cp.x) || !Number.isFinite(cp.z)) {
        cp.set(0, 1.72, this.ARCH_Z - 4);
        this.velocity.set(0, 0, 0);
        this.eyeSmoothY = 1.72;
      }

      this.resolveBounds();
      this.blockTallSteps(prevX, prevZ, prevGround);
      this.updateVertical(dt, Math.hypot(this.velocity.x, this.velocity.z));
    } else {
      this.velocity.set(0, 0, 0);
      this.updateVertical(dt, 0);
    }

    this.tickTapMarker(dt);
    this.tickPetals(dt);
    this.tickDust();
    this.tickGrandChandelier(dt);
    this.tickAisleDecor(dt);
    this.tickOutdoor(dt);
  }

  /**
   * 人一步迈不上超过 0.5m 的高差（如舞台侧面）：本帧落点比上一帧地面高出太多时，
   * 依次尝试只保留 x / 只保留 z 的位移（贴边滑行），都不行就退回原位。
   */
  private blockTallSteps(prevX: number, prevZ: number, prevGround: number) {
    const MAX_STEP = 0.5;
    const p = this.camera.position;
    if (this.groundYAt(p.x, p.z) - prevGround <= MAX_STEP) return;
    const nx = p.x;
    const nz = p.z;
    if (this.groundYAt(nx, prevZ) - prevGround <= MAX_STEP) {
      p.z = prevZ;
      this.velocity.z = 0;
    } else if (this.groundYAt(prevX, nz) - prevGround <= MAX_STEP) {
      p.x = prevX;
      this.velocity.x = 0;
    } else {
      p.x = prevX;
      p.z = prevZ;
      this.velocity.set(0, 0, 0);
    }
  }

  /**
   * 竖直方向的步行手感：
   * - 上台阶：身体在 ~0.15s 内被腿抬上去，随后轻微下沉回稳，同时低头、放慢步速；
   * - 下台阶/下坡：按重力下落（不再是匀速插值），落地时膝盖缓冲 → 视线下沉再弹回；
   * - 行走起伏：双步频竖直起伏，幅度随速度渐入渐出（不做左右 roll，持续侧倾会晕）。
   */
  private updateVertical(dt: number, speed: number) {
    const EYE = 1.72;
    const ground = this.groundYAt(this.camera.position.x, this.camera.position.z);
    const base = ground + EYE;

    const jump = ground - this.lastGroundY;
    if (jump > 0.05 && jump < 0.6) {
      this.landDipVel -= jump * 2.2;
      this.stepLean = Math.min(1, this.stepLean + jump * 5);
    }
    this.lastGroundY = ground;

    if (base > this.eyeSmoothY) {
      this.eyeSmoothY += (base - this.eyeSmoothY) * (1 - Math.exp(-14 * dt));
      this.vyFall = 0;
    } else if (base < this.eyeSmoothY - 0.001) {
      this.vyFall -= 9.8 * dt;
      this.eyeSmoothY += this.vyFall * dt;
      if (this.eyeSmoothY <= base) {
        const impact = -this.vyFall;
        this.eyeSmoothY = base;
        this.vyFall = 0;
        if (impact > 0.7) this.landDipVel -= Math.min(impact, 4) * 0.32;
      }
    } else {
      this.vyFall = 0;
    }

    // 膝盖缓冲：欠阻尼弹簧（k=170，阻尼比≈0.55），下沉后回弹一次即稳
    const K = 170;
    const C = 2 * Math.sqrt(K) * 0.55;
    this.landDipVel += (-K * this.landDip - C * this.landDipVel) * dt;
    this.landDip += this.landDipVel * dt;
    this.landDip = clamp(this.landDip, -0.12, 0.05);

    this.stepLean *= Math.exp(-3.5 * dt);

    const targetAmp = clamp(speed / 3.2, 0, 1);
    this.bobAmp += (targetAmp - this.bobAmp) * (1 - Math.exp(-6 * dt));
    // 约 1.8 步/秒：bobTime 为步态相位，竖直起伏取其 2 倍频（每迈一步起伏一次）
    this.bobTime += dt * Math.PI * 1.8 * (0.35 + 0.65 * targetAmp);
    const bobY = -Math.abs(Math.sin(this.bobTime)) * 0.034 * this.bobAmp + 0.017 * this.bobAmp;

    this.camera.position.y = this.eyeSmoothY + this.landDip + bobY;
  }

  /** 边界钳制 + 圆形碰撞（室内墙内 / 室外草坪范围 / 门洞通行 / 柱子基座） */
  private resolveBounds() {
    const p = this.camera.position;
    const margin = 0.5;
    if (p.z < this.ARCH_Z) {
      p.x = clamp(p.x, -this.W / 2 + margin, this.W / 2 - margin);
      p.z = Math.max(p.z, this.DEPTH_START + margin);
    } else if (this.outdoor === "beach") {
      // 沙滩：可走到湿沙边缘，不能入海
      p.x = clamp(p.x, -22, 22);
      p.z = Math.min(p.z, 61);
    } else {
      // 草坪：以门口为心的椭圆可行区（与 lawnHeight 压平区同式），纵向半轴直达 LAWN_WALK_Z，覆盖整座凉亭舞台
      const nx = p.x / this.LAWN_WALK_R;
      const nz = (p.z - this.ARCH_Z) / (this.LAWN_WALK_Z - this.ARCH_Z);
      const d = Math.hypot(nx, nz);
      if (d > 1) {
        p.x /= d;
        p.z = this.ARCH_Z + (p.z - this.ARCH_Z) / d;
      }
    }

    // 前墙除门洞外为实体：贴墙时推回玩家所在的一侧，而不是把 x 吸进门洞
    if (Math.abs(p.z - this.ARCH_Z) < 0.4 && Math.abs(p.x) > this.ARCH_R - 0.5) {
      p.z = p.z >= this.ARCH_Z ? this.ARCH_Z + 0.4 : this.ARCH_Z - 0.4;
    }

    this.pushOutOfCircles(p, this.circles);
    this.pushOutOfCircles(p, this.outdoorCircles[this.outdoor]);
    this.pushOutOfBoxes(p);
  }

  /** 圆角矩形推离：取矩形上最近点，距离 < 玩家半径则沿法线推出（贴边时只有法向分量，平滑滑行） */
  private pushOutOfBoxes(p: THREE.Vector3) {
    const playerR = 0.4;
    for (const b of this.boxes) {
      const qx = clamp(p.x, b.x0, b.x1);
      const qz = clamp(p.z, b.z0, b.z1);
      const dx = p.x - qx;
      const dz = p.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 1e-8) {
        if (d2 >= playerR * playerR) continue;
        const d = Math.sqrt(d2);
        p.x = qx + (dx / d) * playerR;
        p.z = qz + (dz / d) * playerR;
        continue;
      }
      // 已在矩形内：从最近的一条边推出
      const exits = [p.x - b.x0, b.x1 - p.x, p.z - b.z0, b.z1 - p.z];
      const i = exits.indexOf(Math.min(...exits));
      if (i === 0) p.x = b.x0 - playerR;
      else if (i === 1) p.x = b.x1 + playerR;
      else if (i === 2) p.z = b.z0 - playerR;
      else p.z = b.z1 + playerR;
    }
  }

  private pushOutOfCircles(p: THREE.Vector3, list: Circle[]) {
    const playerR = 0.4;
    for (const c of list) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const rr = c.r + playerR;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = rr - d;
        p.x += (dx / d) * push;
        p.z += (dz / d) * push;
      }
    }
  }

  // ── 释放 ───────────────────────────────────────────────────
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animId);
    if (this.readyTimer) window.clearTimeout(this.readyTimer);

    this.cleanups.forEach((fn) => fn());
    this.cleanups.length = 0;

    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m.dispose();
      } else if (obj instanceof THREE.Sprite) {
        obj.material.dispose();
      }
    });

    for (const t of this.textures) t.dispose();
    this.textures.length = 0;
    for (const e of this.photoEntries.values()) e.hd?.dispose();
    this.photoEntries.clear();

    this.renderer.dispose();
  }
}
