import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as CANNON from "cannon-es";

const sceneEl = document.querySelector("#scene");
const statusEl = document.querySelector("#status");
const scoreEl = document.querySelector("#score");
const speedEl = document.querySelector("#speed");
const targetEl = document.querySelector("#target");
const keeperEl = document.querySelector("#keeper");

const controls = {
  aim: document.querySelector("#aim"),
  height: document.querySelector("#height"),
  power: document.querySelector("#power"),
  curl: document.querySelector("#curl"),
  shoot: document.querySelector("#shoot"),
  reset: document.querySelector("#reset"),
};

const outputs = {
  aim: document.querySelector("#aimValue"),
  height: document.querySelector("#heightValue"),
  power: document.querySelector("#powerValue"),
  curl: document.querySelector("#curlValue"),
};

const goal = { z: -18.2, width: 7.32, height: 2.44 };
const ballRadius = 0.22;
const kickSpot = new THREE.Vector3(0, ballRadius + 0.02, -7);

const state = {
  shots: 0,
  goals: 0,
  inFlight: false,
  resolved: false,
  shotTime: 0,
  previousPosition: new CANNON.Vec3(),
  shotTarget: { x: 0, y: 1.35 },
  keeperTarget: 0,
  keeperVelocity: 0,
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
sceneEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101410);
scene.fog = new THREE.Fog(0x101410, 28, 58);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
camera.position.set(0, 4.6, 13.2);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.set(0, 1.1, -8.2);
orbit.maxPolarAngle = Math.PI * 0.48;
orbit.minDistance = 8;
orbit.maxDistance = 24;

scene.add(new THREE.HemisphereLight(0xd9f2ff, 0x233321, 1.75));

const sun = new THREE.DirectionalLight(0xfff0ca, 2.8);
sun.position.set(-6, 10, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
scene.add(sun);

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.allowSleep = true;
world.broadphase = new CANNON.SAPBroadphase(world);

const groundMaterial = new CANNON.Material("ground");
const ballMaterial = new CANNON.Material("ball");
world.addContactMaterial(
  new CANNON.ContactMaterial(groundMaterial, ballMaterial, {
    friction: 0.48,
    restitution: 0.5,
  }),
);

const groundBody = new CANNON.Body({
  mass: 0,
  material: groundMaterial,
  shape: new CANNON.Plane(),
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

scene.add(createField());
scene.add(createGoalFrame());

const ballBody = new CANNON.Body({
  mass: 0.43,
  material: ballMaterial,
  shape: new CANNON.Sphere(ballRadius),
  linearDamping: 0.03,
  angularDamping: 0.18,
});
world.addBody(ballBody);

const ballMesh = createBall();
scene.add(ballMesh);

const keeper = createKeeper();
scene.add(keeper.group);

const aimLine = createAimLine();
scene.add(aimLine);

const clock = new THREE.Clock();
resetBall();
syncControls();
resize();
animate();

controls.shoot.addEventListener("click", shoot);
controls.reset.addEventListener("click", () => {
  resetBall();
  setStatus("已重置，重新选择射门路线");
});

for (const input of Object.values(controls)) {
  if (input instanceof HTMLInputElement) input.addEventListener("input", syncControls);
}

window.addEventListener("resize", resize);

window.penaltySim = {
  shoot,
  reset: resetBall,
  setControls: ({ aim, height, power, curl } = {}) => {
    if (aim !== undefined) controls.aim.value = String(aim);
    if (height !== undefined) controls.height.value = String(height);
    if (power !== undefined) controls.power.value = String(power);
    if (curl !== undefined) controls.curl.value = String(curl);
    syncControls();
  },
  getDebug: () => ({
    ball: {
      x: ballBody.position.x,
      y: ballBody.position.y,
      z: ballBody.position.z,
      speed: ballBody.velocity.length(),
    },
    target: state.shotTarget,
    inFlight: state.inFlight,
    resolved: state.resolved,
    shotTime: state.shotTime,
    goals: state.goals,
    shots: state.shots,
    keeperX: keeper.group.position.x,
  }),
};

function createField() {
  const group = new THREE.Group();
  const stripeMatA = new THREE.MeshStandardMaterial({ color: 0x357b43, roughness: 0.95 });
  const stripeMatB = new THREE.MeshStandardMaterial({ color: 0x276235, roughness: 0.95 });

  for (let i = 0; i < 10; i += 1) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(22, 4.2), i % 2 ? stripeMatA : stripeMatB);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.z = -19 + i * 4.2;
    stripe.position.y = 0.006;
    stripe.receiveShadow = true;
    group.add(stripe);
  }

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xeaf1e4 });
  addLine(group, 0, -11, 8.8, 0.04, lineMat);
  addLine(group, -4.4, -14.8, 0.04, 7.6, lineMat);
  addLine(group, 4.4, -14.8, 0.04, 7.6, lineMat);
  addLine(group, 0, -18.6, 8.8, 0.04, lineMat);
  addLine(group, 0, -7.2, 0.7, 0.04, lineMat);

  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 32),
    new THREE.MeshBasicMaterial({ color: 0xeaf1e4 }),
  );
  spot.rotation.x = -Math.PI / 2;
  spot.position.set(0, 0.018, -7);
  group.add(spot);

  return group;
}

function addLine(group, x, z, width, depth, material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.02, z);
  group.add(mesh);
}

function createGoalFrame() {
  const group = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf5f6ef, roughness: 0.42 });
  const netMat = new THREE.MeshBasicMaterial({
    color: 0xdfe8dc,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
  });

  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, goal.height, 18);
  const leftPost = new THREE.Mesh(postGeo, frameMat);
  leftPost.position.set(-goal.width / 2, goal.height / 2, goal.z);
  leftPost.castShadow = true;
  group.add(leftPost);

  const rightPost = leftPost.clone();
  rightPost.position.x = goal.width / 2;
  group.add(rightPost);

  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, goal.width, 18), frameMat);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(0, goal.height, goal.z);
  crossbar.castShadow = true;
  group.add(crossbar);

  const netBack = new THREE.Mesh(new THREE.PlaneGeometry(goal.width, goal.height), netMat);
  netBack.position.set(0, goal.height / 2, goal.z - 1.15);
  group.add(netBack);

  const gridMat = new THREE.LineBasicMaterial({ color: 0xeef4e8, transparent: true, opacity: 0.4 });
  for (let i = 0; i <= 8; i += 1) {
    const x = -goal.width / 2 + (goal.width / 8) * i;
    group.add(makeLine([x, 0, goal.z - 1.13], [x, goal.height, goal.z - 1.13], gridMat));
  }
  for (let i = 0; i <= 5; i += 1) {
    const y = (goal.height / 5) * i;
    group.add(makeLine([-goal.width / 2, y, goal.z - 1.13], [goal.width / 2, y, goal.z - 1.13], gridMat));
  }

  addPostCollider(-goal.width / 2, goal.height / 2, goal.z, 0.08, goal.height);
  addPostCollider(goal.width / 2, goal.height / 2, goal.z, 0.08, goal.height);
  addCrossbarCollider(0, goal.height, goal.z, goal.width, 0.08);
  return group;
}

function addPostCollider(x, y, z, radius, height) {
  const body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(radius, radius, height, 12) });
  body.position.set(x, y, z);
  world.addBody(body);
}

function addCrossbarCollider(x, y, z, width, radius) {
  const body = new CANNON.Body({ mass: 0 });
  const shape = new CANNON.Cylinder(radius, radius, width, 12);
  const quat = new CANNON.Quaternion();
  quat.setFromEuler(0, 0, Math.PI / 2);
  body.addShape(shape, new CANNON.Vec3(0, 0, 0), quat);
  body.position.set(x, y, z);
  world.addBody(body);
}

function makeLine(start, end, material) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...start), new THREE.Vector3(...end)]),
    material,
  );
}

function createBall() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.SphereGeometry(ballRadius, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xf7f7ee, roughness: 0.48 }),
  );
  base.castShadow = true;
  group.add(base);

  const seamMat = new THREE.MeshBasicMaterial({ color: 0x182019 });
  for (let i = 0; i < 6; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(ballRadius * 1.006, 0.008, 8, 64), seamMat);
    ring.rotation.set(i * 0.62, i * 0.37, i * 0.71);
    group.add(ring);
  }
  return group;
}

function createKeeper() {
  const group = new THREE.Group();
  const kit = new THREE.MeshStandardMaterial({ color: 0x3a8fde, roughness: 0.68 });
  const glove = new THREE.MeshStandardMaterial({ color: 0xf4c75c, roughness: 0.5 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd19a6a, roughness: 0.55 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.05, 0.28), kit);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), skin);
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.92, 0.18), kit);
  leftArm.position.set(-0.48, 1.1, 0);
  leftArm.rotation.z = -0.25;
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 0.48;
  rightArm.rotation.z = 0.25;
  group.add(rightArm);

  const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 12), glove);
  leftGlove.position.set(-0.62, 0.62, 0);
  group.add(leftGlove);

  const rightGlove = leftGlove.clone();
  rightGlove.position.x = 0.62;
  group.add(rightGlove);

  group.position.set(0, 0, goal.z + 0.22);
  return { group, leftArm, rightArm, leftGlove, rightGlove };
}

function createAimLine() {
  const material = new THREE.LineBasicMaterial({ color: 0xf4c75c, transparent: true, opacity: 0.8 });
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, ballRadius, -7),
    new THREE.Vector3(0, 1.35, goal.z),
  ]);
  return new THREE.Line(geometry, material);
}

function syncControls() {
  const aim = Number(controls.aim.value);
  const height = Number(controls.height.value);
  const power = Number(controls.power.value);
  const curl = Number(controls.curl.value);
  state.shotTarget = getShotTarget(aim, height, curl);

  outputs.aim.value = `${aim}`;
  outputs.height.value = `${height}`;
  outputs.power.value = `${power}%`;
  outputs.curl.value = `${curl}`;
  targetEl.textContent = describeTarget(state.shotTarget);

  const position = aimLine.geometry.attributes.position;
  position.setXYZ(1, state.shotTarget.x, state.shotTarget.y, goal.z);
  position.needsUpdate = true;
}

function getShotTarget(aim, height, curl = 0) {
  return {
    x: THREE.MathUtils.clamp(
      (aim / 100) * (goal.width / 2 - 0.52) + curl * 0.002,
      -goal.width / 2 + 0.34,
      goal.width / 2 - 0.34,
    ),
    y: THREE.MathUtils.clamp(0.42 + (height / 100) * (goal.height - 0.78), 0.36, goal.height - 0.28),
  };
}

function describeTarget(target) {
  const side = target.x < -1.15 ? "左路" : target.x > 1.15 ? "右路" : "中路";
  const level = target.y > 1.75 ? "高球" : target.y < 0.85 ? "低球" : "半高球";
  return `${side} ${level}`;
}

function shoot() {
  if (state.inFlight) return;

  resetBall(false);
  syncControls();
  state.inFlight = true;
  state.resolved = false;
  state.shotTime = 0;
  state.shots += 1;

  const power = Number(controls.power.value);
  const curl = Number(controls.curl.value);
  const speed = 18 + power * 0.16;
  const flightTime = THREE.MathUtils.lerp(0.58, 0.42, (power - 48) / 52);
  const target = state.shotTarget;
  const vx = (target.x - kickSpot.x) / flightTime;
  const vz = (goal.z - kickSpot.z) / flightTime;
  const vy = (target.y - kickSpot.y + 0.5 * Math.abs(world.gravity.y) * flightTime * flightTime) / flightTime;
  const scale = speed / Math.hypot(vx, vy, vz);

  ballBody.velocity.set(vx * scale, vy * scale, vz * scale);
  ballBody.angularVelocity.set(0, curl * -0.025, THREE.MathUtils.clamp(-target.x * 2.2, -10, 10));

  state.keeperTarget = predictKeeperTarget(target, power);
  state.keeperVelocity = 0;
  keeperEl.textContent = state.keeperTarget < -0.6 ? "扑向左侧" : state.keeperTarget > 0.6 ? "扑向右侧" : "守住中路";
  setStatus("射门！");
  updateScore();
  window.setTimeout(resolveProjectedOutcome, 850);
}

function predictKeeperTarget(target, power) {
  const hesitation = THREE.MathUtils.lerp(1.15, 0.52, (power - 48) / 52);
  const mistake = (Math.random() - 0.5) * hesitation;
  return THREE.MathUtils.clamp(target.x * 0.72 + mistake, -2.85, 2.85);
}

function resetBall(resetKeeper = true) {
  ballBody.position.copy(kickSpot);
  ballBody.velocity.set(0, 0, 0);
  ballBody.angularVelocity.set(0, 0, 0);
  ballBody.quaternion.set(0, 0, 0, 1);
  state.inFlight = false;
  state.resolved = false;
  state.shotTime = 0;
  state.previousPosition.copy(ballBody.position);
  speedEl.textContent = "0 km/h";
  if (resetKeeper) {
    keeper.group.position.set(0, 0, goal.z + 0.22);
    keeper.group.rotation.set(0, 0, 0);
    keeperEl.textContent = "待命";
  }
  updateMeshes();
}

function updateKeeper(dt) {
  if (!state.inFlight && Math.abs(keeper.group.position.x) < 0.01) return;

  const spring = (state.inFlight ? state.keeperTarget : 0) - keeper.group.position.x;
  state.keeperVelocity += spring * 18 * dt;
  state.keeperVelocity *= Math.pow(0.08, dt);
  keeper.group.position.x += state.keeperVelocity * dt;
  keeper.group.position.x = THREE.MathUtils.clamp(keeper.group.position.x, -2.85, 2.85);
  keeper.group.rotation.z = -keeper.group.position.x * 0.18;

  const reach = THREE.MathUtils.clamp(Math.abs(keeper.group.position.x) / 2.85, 0, 1);
  keeper.leftArm.rotation.z = -0.25 - reach * 0.8;
  keeper.rightArm.rotation.z = 0.25 + reach * 0.8;
  keeper.leftGlove.position.y = 0.62 + reach * 0.38;
  keeper.rightGlove.position.y = 0.62 + reach * 0.38;
}

function checkOutcome() {
  if (!state.inFlight || state.resolved) return;

  const pos = ballBody.position;
  const v = ballBody.velocity;
  const crossedGoalLine = state.previousPosition.z > goal.z && pos.z <= goal.z;

  if (crossedGoalLine) {
    const point = interpolateGoalLinePoint(state.previousPosition, pos);
    const inside =
      Math.abs(point.x) <= goal.width / 2 - ballRadius &&
      point.y >= ballRadius &&
      point.y <= goal.height - ballRadius * 0.45;
    const keeperDistance = Math.hypot(point.x - keeper.group.position.x, point.y - 1.12);
    const cornerDifficulty = Math.min(Math.abs(point.x) / (goal.width / 2), point.y / goal.height);
    const saveChance = THREE.MathUtils.clamp(0.78 - cornerDifficulty * 0.42, 0.26, 0.78);
    const saved = inside && keeperDistance < 0.58 && Math.abs(v.z) > 4 && Math.random() < saveChance;

    if (saved) {
      v.z *= -0.42;
      v.x += (point.x - keeper.group.position.x) * 4.5;
      v.y += 2.4;
      keeperEl.textContent = "完成扑救";
      resolveShot("被门将扑出！");
      return;
    }

    if (inside) {
      state.goals += 1;
      keeperEl.textContent = "未能扑到";
      resolveShot("进球！球钻进网窝");
      return;
    }

    resolveShot(point.y > goal.height ? "高出横梁" : "射偏了");
    return;
  }

  if (pos.z < goal.z - 2.5 || Math.abs(pos.x) > 8 || pos.y > 5.5) {
    resolveShot("射偏了");
  } else if (state.shotTime > 2.8 && v.length() < 0.9) {
    resolveShot(pos.z < goal.z + 1.4 ? "球停在门前" : "力度不足");
  } else if (state.shotTime > 6) {
    resolveProjectedOutcome();
  }
}

function resolveProjectedOutcome() {
  if (!state.inFlight || state.resolved) return;

  const point = state.shotTarget;
  const inside =
    Math.abs(point.x) <= goal.width / 2 - ballRadius &&
    point.y >= ballRadius &&
    point.y <= goal.height - ballRadius * 0.45;

  if (!inside) {
    resolveShot(point.y > goal.height ? "高出横梁" : "射偏了");
    return;
  }

  const keeperDistance = Math.hypot(point.x - keeper.group.position.x, point.y - 1.12);
  const cornerDifficulty = Math.min(Math.abs(point.x) / (goal.width / 2), point.y / goal.height);
  const saveChance = THREE.MathUtils.clamp(0.72 - cornerDifficulty * 0.42, 0.2, 0.72);
  const saved = keeperDistance < 0.64 && Math.random() < saveChance;

  if (saved) {
    keeperEl.textContent = "完成扑救";
    resolveShot("被门将扑出！");
    return;
  }

  state.goals += 1;
  keeperEl.textContent = "未能扑到";
  resolveShot("进球！球钻进网窝");
}

function interpolateGoalLinePoint(from, to) {
  const zDelta = to.z - from.z;
  const t = Math.abs(zDelta) < 0.0001 ? 1 : (goal.z - from.z) / zDelta;
  return {
    x: THREE.MathUtils.lerp(from.x, to.x, t),
    y: THREE.MathUtils.lerp(from.y, to.y, t),
    z: goal.z,
  };
}

function resolveShot(message) {
  state.resolved = true;
  state.inFlight = false;
  speedEl.textContent = "0 km/h";
  setStatus(message);
  updateScore();
}

function setStatus(message) {
  statusEl.textContent = message;
}

function updateScore() {
  scoreEl.textContent = `进球 ${state.goals} / 射门 ${state.shots}`;
}

function applyBallForces() {
  if (!state.inFlight) return;
  const velocity = ballBody.velocity;
  const speed = velocity.length();
  if (speed <= 0.01) return;

  const drag = velocity.scale(-0.012 * speed);
  ballBody.applyForce(drag, ballBody.position);

  const spin = THREE.MathUtils.clamp(ballBody.angularVelocity.y, -2.8, 2.8);
  const forwardSpeed = Math.abs(velocity.z);
  const sideForce = THREE.MathUtils.clamp(spin * -0.0022 * forwardSpeed, -0.22, 0.22);
  ballBody.applyForce(new CANNON.Vec3(sideForce, 0, 0), ballBody.position);
  speedEl.textContent = `${Math.round(speed * 3.6)} km/h`;
}

function updateMeshes() {
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);
}

function resize() {
  const { width, height } = sceneEl.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 1 / 30);
  if (state.inFlight) state.shotTime += dt;
  applyBallForces();
  state.previousPosition.copy(ballBody.position);
  world.step(1 / 60, dt, 3);
  limitBallVelocity();
  limitLateralDrift();
  updateKeeper(dt);
  checkOutcome();
  updateMeshes();
  orbit.update();
  renderer.render(scene, camera);
}

function limitBallVelocity() {
  const maxSpeed = 43;
  const speed = ballBody.velocity.length();
  if (speed > maxSpeed) ballBody.velocity.scale(maxSpeed / speed, ballBody.velocity);
}

function limitLateralDrift() {
  if (!state.inFlight) return;
  const maxSideSpeed = Math.abs(ballBody.velocity.z) * 0.38 + 0.8;
  ballBody.velocity.x = THREE.MathUtils.clamp(ballBody.velocity.x, -maxSideSpeed, maxSideSpeed);
}
