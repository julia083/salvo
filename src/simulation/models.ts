import * as THREE from 'three';

export interface CharacterRig {
  group: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  torso: THREE.Group;
  statusRing: THREE.Mesh;
}

export interface FlagRig {
  group: THREE.Group;
  clothMesh: THREE.Mesh;
  clothBasePositions: Float32Array;
  ringMesh: THREE.Mesh;
}

let sharedShadowTexture: THREE.CanvasTexture | null = null;

function getContactShadowTexture(): THREE.CanvasTexture {
  if (sharedShadowTexture) return sharedShadowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  sharedShadowTexture = tex;
  return tex;
}

export function createTurfTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Base olive-moss turf matching Salvo's campo color (0.215, 0.239, 0.02) lifted slightly for PBR legibility
  ctx.fillStyle = '#384118';
  ctx.fillRect(0, 0, 512, 1024);

  // Subtle mowed grass stripes
  const stripeCount = 16;
  const stripeH = 1024 / stripeCount;
  for (let i = 0; i < stripeCount; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, i * stripeH, 512, stripeH);
  }

  // Organic turf grain
  for (let i = 0; i < 6500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 1024;
    const shade = Math.random() > 0.5 ? 'rgba(130, 155, 65, 0.08)' : 'rgba(15, 22, 8, 0.1)';
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, 2, 3);
  }

  // Crisp perimeter touchlines
  ctx.strokeStyle = 'rgba(232, 238, 224, 0.45)';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 492, 1004);

  // Penalty / flag zone arcs at north & south ends
  ctx.strokeStyle = 'rgba(232, 238, 224, 0.32)';
  ctx.lineWidth = 4;
  ctx.strokeRect(86, 10, 340, 110);
  ctx.strokeRect(86, 904, 340, 110);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createOuterGroundTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2d3b1d';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(88,112,56,0.12)' : 'rgba(16,24,10,0.14)';
    ctx.fillRect(x, y, 3, 3);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 22);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export interface CharacterPalette {
  primary: number;
  secondary: number;
  accent: number;
  visor: number;
  ring: number;
}

export function createCharacterModel(palette: CharacterPalette, scale = 1): CharacterRig {
  const group = new THREE.Group();

  const primaryMat = new THREE.MeshStandardMaterial({
    color: palette.primary,
    roughness: 0.58,
    metalness: 0.12,
  });
  const secondaryMat = new THREE.MeshStandardMaterial({
    color: palette.secondary,
    roughness: 0.72,
    metalness: 0.08,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: palette.accent,
    roughness: 0.35,
    metalness: 0.55,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: palette.visor,
    roughness: 0.16,
    metalness: 0.88,
  });

  // Contact shadow disc grounded at y = 0.015
  const shadowGeo = new THREE.PlaneGeometry(1.35, 1.35);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: getContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.65,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.015;
  group.add(shadowMesh);

  // Ground indicator ring
  const ringGeo = new THREE.RingGeometry(0.46, 0.54, 32);
  const ringMat = new THREE.MeshBasicMaterial({
    color: palette.ring,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
  });
  const statusRing = new THREE.Mesh(ringGeo, ringMat);
  statusRing.rotation.x = -Math.PI / 2;
  statusRing.position.y = 0.022;
  group.add(statusRing);

  // Legs (pivot at hip y = 0.74)
  const makeLeg = (xOffset: number) => {
    const legPivot = new THREE.Group();
    legPivot.position.set(xOffset, 0.74, 0);

    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.32, 6, 12), secondaryMat);
    thigh.position.y = -0.26;
    thigh.castShadow = true;
    legPivot.add(thigh);

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.3), accentMat);
    boot.position.set(0, -0.65, 0.04);
    boot.castShadow = true;
    legPivot.add(boot);

    return legPivot;
  };

  const leftLeg = makeLeg(-0.17);
  const rightLeg = makeLeg(0.17);
  group.add(leftLeg, rightLeg);

  // Torso group
  const torso = new THREE.Group();
  torso.position.y = 0.76;

  // Pelvis / belt
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.25, 0.16, 14), accentMat);
  belt.position.y = 0.08;
  belt.castShadow = true;
  torso.add(belt);

  // Chest armor (beveled capsule/box profile)
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.26, 0.56, 14), primaryMat);
  chest.position.y = 0.42;
  chest.scale.set(1.06, 1, 0.76);
  chest.castShadow = true;
  chest.receiveShadow = true;
  torso.add(chest);

  // Chest stripe / emblem plate
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.08), accentMat);
  chestPlate.position.set(0, 0.46, 0.21);
  torso.add(chestPlate);

  // Backpack / power cell
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.18), secondaryMat);
  pack.position.set(0, 0.44, -0.24);
  pack.castShadow = true;
  torso.add(pack);

  // Shoulder pauldrons & arms
  const makeArm = (xOffset: number) => {
    const armPivot = new THREE.Group();
    armPivot.position.set(xOffset, 0.62, 0);

    const pauldron = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), accentMat);
    pauldron.scale.set(1.1, 0.9, 1.0);
    pauldron.castShadow = true;
    armPivot.add(pauldron);

    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 6, 10), primaryMat);
    limb.position.y = -0.24;
    limb.castShadow = true;
    armPivot.add(limb);

    return armPivot;
  };

  const leftArm = makeArm(-0.37);
  const rightArm = makeArm(0.37);
  torso.add(leftArm, rightArm);

  // Helmet & visor
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 14), primaryMat);
  head.position.y = 0.92;
  head.scale.set(0.95, 1.04, 1.0);
  head.castShadow = true;
  torso.add(head);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.18), visorMat);
  visor.position.set(0, 0.93, 0.15);
  torso.add(visor);

  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.34), accentMat);
  crest.position.set(0, 1.13, -0.01);
  torso.add(crest);

  group.add(torso);
  group.scale.setScalar(scale);

  return { group, leftLeg, rightLeg, leftArm, rightArm, torso, statusRing };
}

export function createFlagModel(colorHex: number, ringHex: number): FlagRig {
  const group = new THREE.Group();

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x262b26,
    roughness: 0.62,
    metalness: 0.35,
  });
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0xd8dee2,
    roughness: 0.22,
    metalness: 0.9,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    color: colorHex,
    roughness: 0.65,
    metalness: 0.06,
    side: THREE.DoubleSide,
  });

  // Base pedestal
  const baseBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 0.14, 18), baseMat);
  baseBottom.position.y = 0.07;
  baseBottom.castShadow = true;
  baseBottom.receiveShadow = true;
  group.add(baseBottom);

  const baseCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.18, 16), poleMat);
  baseCollar.position.y = 0.22;
  baseCollar.castShadow = true;
  group.add(baseCollar);

  // Pole
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.75, 14), poleMat);
  pole.position.y = 1.5;
  pole.castShadow = true;
  group.add(pole);

  // Finial sphere
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), poleMat);
  finial.position.y = 2.92;
  group.add(finial);

  // Crossbar
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 10), poleMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0.48, 2.72, 0);
  group.add(crossbar);

  // Segmented pennant cloth for smooth waving animation
  const clothGeo = new THREE.PlaneGeometry(1.05, 0.68, 10, 4);
  clothGeo.translate(0.54, 0, 0);
  const clothMesh = new THREE.Mesh(clothGeo, clothMat);
  clothMesh.position.set(0.04, 2.38, 0);
  clothMesh.castShadow = true;
  group.add(clothMesh);

  const posAttr = clothGeo.attributes.position as THREE.BufferAttribute;
  const clothBasePositions = new Float32Array(posAttr.array);

  // Ground capture ring
  const ringGeo = new THREE.RingGeometry(0.85, 0.96, 36);
  const ringMat = new THREE.MeshBasicMaterial({
    color: ringHex,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.024;
  group.add(ringMesh);

  return { group, clothMesh, clothBasePositions, ringMesh };
}

export function createFloodlightTower(x: number, z: number, lookAtX: number, lookAtZ: number): THREE.Group {
  const tower = new THREE.Group();
  tower.position.set(x, 0.5, z);

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3b423c,
    roughness: 0.4,
    metalness: 0.72,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff5dc,
    emissive: 0xffe4a8,
    emissiveIntensity: 0.75,
    roughness: 0.25,
    metalness: 0.1,
  });

  const footing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.6, 12), steelMat);
  footing.position.y = 0.3;
  tower.add(footing);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 9.5, 12), steelMat);
  mast.position.y = 5.0;
  mast.castShadow = true;
  tower.add(mast);

  const head = new THREE.Group();
  head.position.y = 9.7;
  head.lookAt(lookAtX, 0.5, lookAtZ);

  const housing = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.35), steelMat);
  head.add(housing);

  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.08), lampMat);
  panel.position.z = 0.16;
  head.add(panel);

  tower.add(head);
  return tower;
}
