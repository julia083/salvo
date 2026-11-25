import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CharacterRig,
  createCharacterModel,
  createFlagModel,
  createFloodlightTower,
  createOuterGroundTexture,
  createTurfTexture,
  FlagRig,
} from './models';

export type CameraPreset = 'overview' | 'aux1' | 'aux2' | 'player';
export type AuxState = 'INDO_PARA_BANDEIRA' | 'RETORNANDO_COM_BANDEIRA' | 'CONCLUIDO';

export interface AuxTelemetry {
  id: 'jogador_aux_1' | 'jogador_aux_2';
  label: string;
  state: AuxState;
  targetFlagId: string | null;
  carryingFlagId: string | null;
  capturedCount: number;
}

export interface SimulationSnapshot {
  capturedFlags: number;
  totalEnemyFlags: number;
  elapsedSeconds: number;
  aux1: AuxTelemetry;
  aux2: AuxTelemetry;
  flags: Array<{
    id: string;
    side: 'ally' | 'enemy';
    status: 'base' | 'carried' | 'captured';
    carrier: string | null;
  }>;
  contextLost: boolean;
}

interface FlagEntity {
  id: string;
  side: 'ally' | 'enemy';
  initialPos: THREE.Vector3;
  pos: THREE.Vector3;
  rig: FlagRig;
  captured: boolean;
  carriedBy: string | null;
  reservedBy: string | null;
}

interface AuxEntity {
  id: 'jogador_aux_1' | 'jogador_aux_2';
  label: string;
  initialPos: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  stridePhase: number;
  state: AuxState;
  targetFlagId: string | null;
  carryingFlagId: string | null;
  capturedCount: number;
  rig: CharacterRig;
}

interface BotEntity {
  id: string;
  initialPos: THREE.Vector3;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  stridePhase: number;
  rig: CharacterRig;
}

const SPEED_AUX = 4.2;
const SPEED_BOT = 3.5;
const SPEED_PLAYER = 5.0;
const DIST_PICKUP = 1.6;
const DIST_DELIVER = 1.8;
const DIST_EVADE = 4.0;
const FORCE_EVADE = 1.35;
const FIELD_LIMIT_X = 10.8;
const FIELD_LIMIT_Z = 23.8;
const GROUND_Y = 0.5;

// Pre-allocated scratch math objects (zero GC in render/physics loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _evade = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _targetGoal = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class SalvoSimulation {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  private paused = false;
  private speedMultiplier = 1;
  private cameraPreset: CameraPreset = 'overview';
  private cameraTransitioning = false;
  private elapsedSeconds = 0;
  private contextLost = false;
  private lastHudPush = 0;

  private keys = new Set<string>();
  private auxEntities: AuxEntity[] = [];
  private botEntities: BotEntity[] = [];
  private flagEntities: FlagEntity[] = [];
  private playerRig!: CharacterRig;
  private playerPos = new THREE.Vector3(0.6305, GROUND_Y, 17.024);
  private playerVel = new THREE.Vector3();
  private playerYaw = Math.PI;
  private playerStride = 0;

  private onSnapshot: (snap: SimulationSnapshot) => void;
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(container: HTMLElement, onSnapshot: (snap: SimulationSnapshot) => void) {
    this.container = container;
    this.onSnapshot = onSnapshot;
    this.isSoftwareGl = detectSoftwareWebGL();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x161d14);
    this.scene.fog = new THREE.FogExp2(0x161d14, 0.0115);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.disposables.push(envRT);
    pmremGenerator.dispose();

    const width = container.clientWidth || 1280;
    const height = container.clientHeight || 720;
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 320);
    this.camera.position.set(22, 22, 34);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 7;
    this.controls.maxDistance = 75;
    this.controls.target.set(0, 1.2, 0);
    this.controls.addEventListener('start', () => {
      this.cameraTransitioning = false;
    });

    this.buildLighting();
    this.buildArena();
    this.buildActorsAndFlags();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.pushSnapshot(true);
    this.clock.start();
    this.tick();
  }

  private buildLighting(): void {
    const hemi = new THREE.HemisphereLight(0xc8dcf0, 0x3b4927, 0.75);
    this.scene.add(hemi);

    // Warm key sun light aligned with luz_time_jogador
    const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.0);
    keyLight.position.set(18, 28, 22);
    keyLight.castShadow = !this.isSoftwareGl;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 90;
    keyLight.shadow.camera.left = -28;
    keyLight.shadow.camera.right = 28;
    keyLight.shadow.camera.top = 30;
    keyLight.shadow.camera.bottom = -30;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    this.scene.add(keyLight);

    // Cool rim light from bots side (luz_time_bots)
    const rimLight = new THREE.DirectionalLight(0x9fc2ff, 0.85);
    rimLight.position.set(-16, 16, -26);
    this.scene.add(rimLight);
  }

  private buildArena(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Extended cenario terrain
    const outerTex = createOuterGroundTexture(maxAniso);
    this.disposables.push(outerTex);
    const outerGeo = new THREE.PlaneGeometry(360, 360);
    const outerMat = new THREE.MeshStandardMaterial({
      map: outerTex,
      roughness: 0.92,
      metalness: 0.02,
    });
    const outerGround = new THREE.Mesh(outerGeo, outerMat);
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = 0.46;
    outerGround.receiveShadow = true;
    this.scene.add(outerGround);
    this.disposables.push(outerGeo, outerMat);

    // Main campo 24x50 matching main.tscn
    const turfTex = createTurfTexture(maxAniso);
    this.disposables.push(turfTex);
    const fieldGeo = new THREE.BoxGeometry(24, 1, 50);
    const fieldMat = new THREE.MeshStandardMaterial({
      map: turfTex,
      roughness: 0.85,
      metalness: 0.04,
    });
    const field = new THREE.Mesh(fieldGeo, fieldMat);
    field.position.set(0, 0, 0);
    field.receiveShadow = true;
    this.scene.add(field);
    this.disposables.push(fieldGeo, fieldMat);

    // Center dividing line at z = 0 (linha)
    const lineGeo = new THREE.BoxGeometry(24, 0.04, 0.24);
    const lineMat = new THREE.MeshStandardMaterial({
      color: 0xff4a32,
      roughness: 0.5,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const centerLine = new THREE.Mesh(lineGeo, lineMat);
    centerLine.position.set(0, 0.51, 0);
    this.scene.add(centerLine);
    this.disposables.push(lineGeo, lineMat);

    // Low perimeter boundary curb & corner pylons (instead of giant invisible box walls)
    const curbMat = new THREE.MeshStandardMaterial({
      color: 0x3b4438,
      roughness: 0.68,
      metalness: 0.22,
    });
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0xe6ece0,
      roughness: 0.42,
      metalness: 0.35,
    });
    this.disposables.push(curbMat, pylonMat);

    const sideCurbGeo = new THREE.BoxGeometry(0.28, 0.22, 50.6);
    const endCurbGeo = new THREE.BoxGeometry(24.6, 0.22, 0.28);
    this.disposables.push(sideCurbGeo, endCurbGeo);

    for (const x of [-12.14, 12.14]) {
      const curb = new THREE.Mesh(sideCurbGeo, curbMat);
      curb.position.set(x, 0.58, 0);
      curb.castShadow = true;
      curb.receiveShadow = true;
      this.scene.add(curb);
    }
    for (const z of [-25.14, 25.14]) {
      const curb = new THREE.Mesh(endCurbGeo, curbMat);
      curb.position.set(0, 0.58, z);
      curb.castShadow = true;
      curb.receiveShadow = true;
      this.scene.add(curb);
    }

    // Perimeter pylons + 4 stadium floodlight stanchions
    const pylonGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.72, 12);
    this.disposables.push(pylonGeo);
    const pylonPositions: Array<[number, number]> = [
      [-12.14, -25.14],
      [12.14, -25.14],
      [-12.14, 25.14],
      [12.14, 25.14],
      [-12.14, 0],
      [12.14, 0],
    ];
    for (const [px, pz] of pylonPositions) {
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(px, 0.86, pz);
      pylon.castShadow = true;
      this.scene.add(pylon);
    }

    const towers: Array<[number, number]> = [
      [-16.5, -24],
      [16.5, -24],
      [-16.5, 24],
      [16.5, 24],
    ];
    for (const [tx, tz] of towers) {
      this.scene.add(createFloodlightTower(tx, tz, 0, 0));
    }
  }

  private buildActorsAndFlags(): void {
    // Main player (jogador_principal)
    this.playerRig = createCharacterModel({
      primary: 0xd9e2d5,
      secondary: 0x3b483b,
      accent: 0x34d399,
      visor: 0x0f172a,
      ring: 0x34d399,
    });
    this.playerRig.group.position.copy(this.playerPos);
    this.playerRig.group.rotation.y = this.playerYaw;
    this.scene.add(this.playerRig.group);

    // Auxiliary players (jogador_aux_1 & jogador_aux_2)
    const auxSpecs: Array<{
      id: 'jogador_aux_1' | 'jogador_aux_2';
      label: string;
      pos: [number, number, number];
      accent: number;
    }> = [
      {
        id: 'jogador_aux_1',
        label: 'Auxiliar 1',
        pos: [8.8414, GROUND_Y, 17.1435],
        accent: 0x38bdf8,
      },
      {
        id: 'jogador_aux_2',
        label: 'Auxiliar 2',
        pos: [-6.8239, GROUND_Y, 17.1138],
        accent: 0x22d3ee,
      },
    ];

    for (const spec of auxSpecs) {
      const rig = createCharacterModel({
        primary: 0xc2d5e8,
        secondary: 0x2c3c4c,
        accent: spec.accent,
        visor: 0x0f172a,
        ring: spec.accent,
      });
      const initialPos = new THREE.Vector3(...spec.pos);
      rig.group.position.copy(initialPos);
      rig.group.rotation.y = Math.PI;
      this.scene.add(rig.group);
      this.auxEntities.push({
        id: spec.id,
        label: spec.label,
        initialPos: initialPos.clone(),
        pos: initialPos.clone(),
        vel: new THREE.Vector3(),
        yaw: Math.PI,
        stridePhase: 0,
        state: 'INDO_PARA_BANDEIRA',
        targetFlagId: null,
        carryingFlagId: null,
        capturedCount: 0,
        rig,
      });
    }

    // Bots (bot1, bot2, bot3) matching main.tscn positions & warm amber palette
    const botSpecs: Array<{ id: string; pos: [number, number, number]; primary: number }> = [
      { id: 'bot1', pos: [0, GROUND_Y, -18.863], primary: 0xf59e42 },
      { id: 'bot2', pos: [7.3655, GROUND_Y, -17.7659], primary: 0xffb45c },
      { id: 'bot3', pos: [-7.3346, GROUND_Y, -17.5071], primary: 0xffaa68 },
    ];
    for (const spec of botSpecs) {
      const rig = createCharacterModel({
        primary: spec.primary,
        secondary: 0x402a1a,
        accent: 0xea580c,
        visor: 0x1c1917,
        ring: 0xf97316,
      });
      const initialPos = new THREE.Vector3(...spec.pos);
      rig.group.position.copy(initialPos);
      this.scene.add(rig.group);
      this.botEntities.push({
        id: spec.id,
        initialPos: initialPos.clone(),
        pos: initialPos.clone(),
        vel: new THREE.Vector3(),
        yaw: 0,
        stridePhase: 0,
        rig,
      });
    }

    // Flags (flag1-3 ally side z>0, flag4-6 enemy side z<0) using exact collider world positions from main.tscn
    const flagSpecs: Array<{ id: string; side: 'ally' | 'enemy'; pos: [number, number, number] }> = [
      { id: 'flag1', side: 'ally', pos: [-8.789, GROUND_Y, 23.298] },
      { id: 'flag2', side: 'ally', pos: [-0.251, GROUND_Y, 23.684] },
      { id: 'flag3', side: 'ally', pos: [8.625, GROUND_Y, 22.855] },
      { id: 'flag4', side: 'enemy', pos: [7.532, GROUND_Y, -23.451] },
      { id: 'flag5', side: 'enemy', pos: [-0.06, GROUND_Y, -23.182] },
      { id: 'flag6', side: 'enemy', pos: [-8.43, GROUND_Y, -23.014] },
    ];

    for (const spec of flagSpecs) {
      const color = spec.side === 'ally' ? 0x10b981 : 0xef4444;
      const ring = spec.side === 'ally' ? 0x34d399 : 0xf87171;
      const rig = createFlagModel(color, ring);
      const initialPos = new THREE.Vector3(...spec.pos);
      rig.group.position.copy(initialPos);
      this.scene.add(rig.group);
      this.flagEntities.push({
        id: spec.id,
        side: spec.side,
        initialPos: initialPos.clone(),
        pos: initialPos.clone(),
        rig,
        captured: false,
        carriedBy: null,
        reservedBy: null,
      });
    }
  }

  private bindEvents(): void {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
      this.keys.add(code);
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.pushSnapshot(true);
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
    this.pushSnapshot(true);
  };

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public setSpeedMultiplier(mult: number): void {
    this.speedMultiplier = mult;
  }

  public setCameraPreset(preset: CameraPreset): void {
    this.cameraPreset = preset;
    this.cameraTransitioning = true;
  }

  public reset(): void {
    this.elapsedSeconds = 0;

    this.playerPos.set(0.6305, GROUND_Y, 17.024);
    this.playerVel.set(0, 0, 0);
    this.playerYaw = Math.PI;
    this.playerRig.group.position.copy(this.playerPos);
    this.playerRig.group.rotation.y = this.playerYaw;

    for (const aux of this.auxEntities) {
      aux.pos.copy(aux.initialPos);
      aux.vel.set(0, 0, 0);
      aux.yaw = Math.PI;
      aux.stridePhase = 0;
      aux.state = 'INDO_PARA_BANDEIRA';
      aux.targetFlagId = null;
      aux.carryingFlagId = null;
      aux.capturedCount = 0;
      aux.rig.group.position.copy(aux.pos);
      aux.rig.group.rotation.y = aux.yaw;
      aux.rig.leftLeg.rotation.x = 0;
      aux.rig.rightLeg.rotation.x = 0;
    }

    for (const bot of this.botEntities) {
      bot.pos.copy(bot.initialPos);
      bot.vel.set(0, 0, 0);
      bot.yaw = 0;
      bot.stridePhase = 0;
      bot.rig.group.position.copy(bot.pos);
      bot.rig.group.rotation.y = bot.yaw;
      bot.rig.leftLeg.rotation.x = 0;
      bot.rig.rightLeg.rotation.x = 0;
    }

    for (const flag of this.flagEntities) {
      flag.pos.copy(flag.initialPos);
      flag.captured = false;
      flag.carriedBy = null;
      flag.reservedBy = null;
      flag.rig.group.position.copy(flag.pos);
      flag.rig.group.scale.setScalar(1);
      flag.rig.ringMesh.visible = true;
    }

    this.pushSnapshot(true);
  }

  private stepSimulation(dt: number): void {
    this.elapsedSeconds += dt;

    // 1. Update main player (WASD / Arrow keys)
    let inX = 0;
    let inZ = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) inX -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) inX += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) inZ -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) inZ += 1;

    if (inX !== 0 || inZ !== 0) {
      _dir.set(inX, 0, inZ).normalize();
      this.playerVel.set(_dir.x * SPEED_PLAYER, 0, _dir.z * SPEED_PLAYER);
      this.playerPos.x = THREE.MathUtils.clamp(this.playerPos.x + this.playerVel.x * dt, -11.2, 11.2);
      this.playerPos.z = THREE.MathUtils.clamp(this.playerPos.z + this.playerVel.z * dt, -24.2, 24.2);
      this.playerYaw = Math.atan2(_dir.x, _dir.z);
      this.playerStride += dt * 11;
    } else {
      this.playerVel.set(0, 0, 0);
      this.playerStride = 0;
    }
    this.applyRigMotion(this.playerRig, this.playerPos, this.playerYaw, this.playerStride, this.playerVel.lengthSq() > 0.05);

    // 2. Update auxiliary players (exact mirror of jogador_aux.gd)
    for (const aux of this.auxEntities) {
      this.stepAuxiliaryPlayer(aux, dt);
    }

    // 3. Update bots (exact mirror of bot_1.gd / bot_2.gd / bot_3.gd)
    for (const bot of this.botEntities) {
      this.stepBot(bot, dt);
    }
  }

  private stepAuxiliaryPlayer(aux: AuxEntity, dt: number): void {
    if (aux.state === 'INDO_PARA_BANDEIRA') {
      let target = aux.targetFlagId ? this.flagEntities.find((f) => f.id === aux.targetFlagId) ?? null : null;
      if (!this.isFlagAvailableForAux(target, aux.id)) {
        if (target && target.reservedBy === aux.id) {
          target.reservedBy = null;
        }
        target = this.findNearestEnemyFlag(aux);
        aux.targetFlagId = target ? target.id : null;
      }

      if (!target) {
        if (!this.hasRemainingEnemyFlags(aux.id)) {
          aux.state = 'CONCLUIDO';
        } else {
          aux.vel.set(0, 0, 0);
        }
      } else {
        const distXZ = Math.hypot(target.pos.x - aux.pos.x, target.pos.z - aux.pos.z);
        if (distXZ <= DIST_PICKUP) {
          this.pickupFlag(aux, target);
        } else {
          this.moveCharacterToward(aux, target.pos, SPEED_AUX, true, dt);
        }
      }
    } else if (aux.state === 'RETORNANDO_COM_BANDEIRA') {
      const carried = aux.carryingFlagId ? this.flagEntities.find((f) => f.id === aux.carryingFlagId) ?? null : null;
      if (!carried) {
        aux.carryingFlagId = null;
        aux.state = 'INDO_PARA_BANDEIRA';
      } else {
        this.updateCarriedFlagPosition(aux, carried);
        const distBase = Math.hypot(aux.initialPos.x - aux.pos.x, aux.initialPos.z - aux.pos.z);
        if (distBase <= DIST_DELIVER || aux.pos.z >= aux.initialPos.z) {
          this.deliverFlag(aux, carried);
        } else {
          this.moveCharacterToward(aux, aux.initialPos, SPEED_AUX, true, dt);
          this.updateCarriedFlagPosition(aux, carried);
        }
      }
    } else {
      const distHome = Math.hypot(aux.initialPos.x - aux.pos.x, aux.initialPos.z - aux.pos.z);
      if (distHome > 0.5) {
        this.moveCharacterToward(aux, aux.initialPos, SPEED_AUX, false, dt);
      } else {
        aux.vel.set(0, 0, 0);
      }
    }

    const moving = aux.vel.lengthSq() > 0.05;
    if (moving) {
      aux.stridePhase += dt * 10.5;
    }
    this.applyRigMotion(aux.rig, aux.pos, aux.yaw, aux.stridePhase, moving);
  }

  private isFlagAvailableForAux(flag: FlagEntity | null, auxId: string): boolean {
    if (!flag) return false;
    if (flag.side !== 'enemy') return false;
    if (flag.captured) return false;
    if (flag.carriedBy && flag.carriedBy !== auxId) return false;
    return true;
  }

  private hasRemainingEnemyFlags(auxId: string): boolean {
    return this.flagEntities.some((f) => this.isFlagAvailableForAux(f, auxId));
  }

  private findNearestEnemyFlag(aux: AuxEntity): FlagEntity | null {
    let best: FlagEntity | null = null;
    let bestDist = Infinity;

    for (const flag of this.flagEntities) {
      if (!this.isFlagAvailableForAux(flag, aux.id)) continue;
      if (flag.reservedBy && flag.reservedBy !== aux.id) continue;
      const dist = aux.pos.distanceTo(flag.pos);
      if (dist < bestDist) {
        bestDist = dist;
        best = flag;
      }
    }

    if (best) {
      best.reservedBy = aux.id;
    }
    return best;
  }

  private pickupFlag(aux: AuxEntity, flag: FlagEntity): void {
    aux.carryingFlagId = flag.id;
    aux.targetFlagId = null;
    flag.carriedBy = aux.id;
    if (flag.reservedBy === aux.id) {
      flag.reservedBy = null;
    }
    flag.rig.ringMesh.visible = false;
    flag.rig.group.scale.setScalar(0.82);
    aux.state = 'RETORNANDO_COM_BANDEIRA';
    this.updateCarriedFlagPosition(aux, flag);
  }

  private updateCarriedFlagPosition(aux: AuxEntity, flag: FlagEntity): void {
    flag.pos.set(aux.pos.x, GROUND_Y + 0.55, aux.pos.z);
    flag.rig.group.position.copy(flag.pos);
  }

  private deliverFlag(aux: AuxEntity, flag: FlagEntity): void {
    flag.captured = true;
    flag.carriedBy = null;
    flag.pos.set(aux.pos.x, GROUND_Y, aux.initialPos.z + 1.4);
    flag.rig.group.position.copy(flag.pos);
    flag.rig.group.scale.setScalar(0.95);
    aux.carryingFlagId = null;
    aux.capturedCount += 1;

    const next = this.findNearestEnemyFlag(aux);
    if (next) {
      aux.targetFlagId = next.id;
      aux.state = 'INDO_PARA_BANDEIRA';
    } else {
      aux.targetFlagId = null;
      aux.state = 'CONCLUIDO';
    }
  }

  private moveCharacterToward(
    actor: AuxEntity,
    target: THREE.Vector3,
    speed: number,
    evadeBots: boolean,
    dt: number,
  ): void {
    _dir.subVectors(target, actor.pos);
    _dir.y = 0;
    if (_dir.length() <= 0.1) {
      actor.vel.set(0, 0, 0);
      return;
    }
    _dir.normalize();

    if (evadeBots) {
      _evade.set(0, 0, 0);
      for (const bot of this.botEntities) {
        _v1.subVectors(actor.pos, bot.pos);
        _v1.y = 0;
        const dist = _v1.length();
        if (dist > 0.01 && dist < DIST_EVADE) {
          const weight = (DIST_EVADE - dist) / DIST_EVADE;
          _v1.normalize().multiplyScalar(weight * FORCE_EVADE);
          _evade.add(_v1);
        }
      }
      if (_evade.lengthSq() > 0.001) {
        _dir.add(_evade).normalize();
      }
    }

    if (actor.pos.x >= FIELD_LIMIT_X && _dir.x > 0) _dir.x = 0;
    else if (actor.pos.x <= -FIELD_LIMIT_X && _dir.x < 0) _dir.x = 0;
    if (actor.pos.z >= FIELD_LIMIT_Z && _dir.z > 0) _dir.z = 0;
    else if (actor.pos.z <= -FIELD_LIMIT_Z && _dir.z < 0) _dir.z = 0;

    if (_dir.lengthSq() > 0.001) {
      _dir.normalize();
      actor.vel.set(_dir.x * speed, 0, _dir.z * speed);
      actor.pos.x = THREE.MathUtils.clamp(actor.pos.x + actor.vel.x * dt, -FIELD_LIMIT_X, FIELD_LIMIT_X);
      actor.pos.z = THREE.MathUtils.clamp(actor.pos.z + actor.vel.z * dt, -FIELD_LIMIT_Z, FIELD_LIMIT_Z);
      actor.yaw = Math.atan2(_dir.x, _dir.z);
    } else {
      actor.vel.set(0, 0, 0);
    }
  }

  private stepBot(bot: BotEntity, dt: number): void {
    // Find nearest player among jogador_principal, jogador_aux_1, jogador_aux_2
    let nearestPos: THREE.Vector3 = this.playerPos;
    let bestDist = bot.pos.distanceTo(this.playerPos);

    for (const aux of this.auxEntities) {
      const d = bot.pos.distanceTo(aux.pos);
      if (d < bestDist) {
        bestDist = d;
        nearestPos = aux.pos;
      }
    }

    _dir.subVectors(nearestPos, bot.pos);
    _dir.y = 0;
    if (_dir.length() > 0.35) {
      _dir.normalize();
      bot.vel.set(_dir.x * SPEED_BOT, 0, _dir.z * SPEED_BOT);
      bot.pos.x = THREE.MathUtils.clamp(bot.pos.x + bot.vel.x * dt, -FIELD_LIMIT_X, FIELD_LIMIT_X);
      bot.pos.z = THREE.MathUtils.clamp(bot.pos.z + bot.vel.z * dt, -FIELD_LIMIT_Z, FIELD_LIMIT_Z);
      bot.yaw = Math.atan2(_dir.x, _dir.z);
      bot.stridePhase += dt * 8.8;
    } else {
      bot.vel.set(0, 0, 0);
    }

    this.applyRigMotion(bot.rig, bot.pos, bot.yaw, bot.stridePhase, bot.vel.lengthSq() > 0.05);
  }

  private applyRigMotion(
    rig: CharacterRig,
    pos: THREE.Vector3,
    yaw: number,
    stridePhase: number,
    moving: boolean,
  ): void {
    rig.group.position.copy(pos);
    rig.group.rotation.y = yaw;
    const swing = moving ? Math.sin(stridePhase) * 0.52 : 0;
    rig.leftLeg.rotation.x = swing;
    rig.rightLeg.rotation.x = -swing;
    rig.leftArm.rotation.x = -swing * 0.7;
    rig.rightArm.rotation.x = swing * 0.7;
    rig.torso.position.y = 0.76 + (moving ? Math.abs(Math.cos(stridePhase)) * 0.045 : 0);
  }

  private animateFlags(elapsed: number): void {
    for (let i = 0; i < this.flagEntities.length; i++) {
      const flag = this.flagEntities[i];
      const posAttr = flag.rig.clothMesh.geometry.attributes.position as THREE.BufferAttribute;
      const base = flag.rig.clothBasePositions;
      for (let v = 0; v < posAttr.count; v++) {
        const bx = base[v * 3];
        const by = base[v * 3 + 1];
        const waveFactor = Math.max(0, bx / 1.05);
        const zOffset = Math.sin(elapsed * 4.5 + bx * 3.8 + i * 1.1) * 0.11 * waveFactor;
        const yOffset = Math.cos(elapsed * 3.2 + by * 2.5 + i) * 0.025 * waveFactor;
        posAttr.setXYZ(v, bx, by + yOffset, base[v * 3 + 2] + zOffset);
      }
      posAttr.needsUpdate = true;
    }
  }

  private updateCameraFollow(dt: number): void {
    if (this.cameraPreset === 'overview') {
      if (this.cameraTransitioning) {
        _camGoal.set(22, 22, 34);
        _targetGoal.set(0, 1.2, 0);
        this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camGoal.x, 5, dt);
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _camGoal.y, 5, dt);
        this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camGoal.z, 5, dt);
        this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, _targetGoal.x, 5, dt);
        this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, _targetGoal.y, 5, dt);
        this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, _targetGoal.z, 5, dt);
        if (this.camera.position.distanceTo(_camGoal) < 0.15) {
          this.cameraTransitioning = false;
        }
      }
    } else {
      let focus = this.playerPos;
      if (this.cameraPreset === 'aux1' && this.auxEntities[0]) focus = this.auxEntities[0].pos;
      if (this.cameraPreset === 'aux2' && this.auxEntities[1]) focus = this.auxEntities[1].pos;

      _v2.set(focus.x + 8, focus.y + 9.5, focus.z + 11.5);
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _v2.x, 4.5, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, _v2.y, 4.5, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _v2.z, 4.5, dt);
      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, focus.x, 6, dt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, focus.y + 1.1, 6, dt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, focus.z, 6, dt);
    }

    this.controls.update();
  }

  private pushSnapshot(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastHudPush < 120) return;
    this.lastHudPush = now;

    const aux1 = this.auxEntities[0];
    const aux2 = this.auxEntities[1];
    const enemyFlags = this.flagEntities.filter((f) => f.side === 'enemy');
    const capturedFlags = enemyFlags.filter((f) => f.captured).length;

    this.onSnapshot({
      capturedFlags,
      totalEnemyFlags: enemyFlags.length,
      elapsedSeconds: this.elapsedSeconds,
      aux1: {
        id: 'jogador_aux_1',
        label: 'Auxiliar 1',
        state: aux1.state,
        targetFlagId: aux1.targetFlagId,
        carryingFlagId: aux1.carryingFlagId,
        capturedCount: aux1.capturedCount,
      },
      aux2: {
        id: 'jogador_aux_2',
        label: 'Auxiliar 2',
        state: aux2.state,
        targetFlagId: aux2.targetFlagId,
        carryingFlagId: aux2.carryingFlagId,
        capturedCount: aux2.capturedCount,
      },
      flags: enemyFlags.map((f) => ({
        id: f.id,
        side: f.side,
        status: f.captured ? 'captured' : f.carriedBy ? 'carried' : 'base',
        carrier: f.carriedBy,
      })),
      contextLost: this.contextLost,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const rawDelta = Math.min(this.clock.getDelta(), 0.05);
    const simDelta = this.paused ? 0 : rawDelta * this.speedMultiplier;

    if (!this.contextLost) {
      if (simDelta > 0) {
        this.stepSimulation(simDelta);
        this.pushSnapshot(false);
      }
      this.animateFlags(this.clock.elapsedTime);
      this.updateCameraFollow(rawDelta);
      this.renderer.render(this.scene, this.camera);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.controls.dispose();
    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    for (const d of this.disposables) {
      d.dispose();
    }
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
