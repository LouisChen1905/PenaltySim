const goal = { z: -18.2, width: 7.32, height: 2.44 };
const ballRadius = 0.22;
const kickSpot = { x: 0, y: ballRadius + 0.02, z: -7 };
const gravity = -9.82;

Page({
  data: {
    aim: 0,
    height: 48,
    power: 78,
    curl: 0,
    goals: 0,
    shots: 0,
    status: "调整角度和力度，准备射门",
    speedText: "0 km/h",
    targetText: "中路 半高球",
    keeperText: "待命",
  },

  onReady() {
    this.initState();
    this.initCanvas();
  },

  onUnload() {
    if (this.frameTimer) clearTimeout(this.frameTimer);
  },

  initState() {
    this.state = {
      ball: { ...kickSpot },
      velocity: { x: 0, y: 0, z: 0 },
      spin: 0,
      target: this.getShotTarget(),
      keeperX: 0,
      keeperTarget: 0,
      keeperVelocity: 0,
      inFlight: false,
      resolved: false,
      shotTime: 0,
      lastTime: 0,
      previousZ: kickSpot.z,
    };
  },

  initCanvas() {
    const query = wx.createSelectorQuery();
    query
      .select("#simCanvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const canvas = res[0].node;
        const width = res[0].width;
        const height = res[0].height;
        const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.ctx.scale(dpr, dpr);
        this.view = { width, height };
        this.loop();
      });
  },

  onAim(event) {
    this.setData({ aim: event.detail.value }, () => this.updateTarget());
  },

  onHeight(event) {
    this.setData({ height: event.detail.value }, () => this.updateTarget());
  },

  onPower(event) {
    this.setData({ power: event.detail.value });
  },

  onCurl(event) {
    this.setData({ curl: event.detail.value }, () => this.updateTarget());
  },

  onCanvasTouch(event) {
    const touch = event.touches && event.touches[0];
    if (!touch || !this.view) return;

    const normalizedX = (touch.x / this.view.width - 0.5) * 2;
    const normalizedY = 1 - touch.y / this.view.height;
    const aim = Math.round(clamp(normalizedX * 120, -100, 100));
    const height = Math.round(clamp((normalizedY - 0.22) * 150, 0, 100));
    this.setData({ aim, height }, () => this.updateTarget());
  },

  updateTarget() {
    this.state.target = this.getShotTarget();
    this.setData({ targetText: this.describeTarget(this.state.target) });
  },

  getShotTarget() {
    const { aim, height, curl } = this.data;
    return {
      x: clamp((aim / 100) * (goal.width / 2 - 0.52) + curl * 0.002, -goal.width / 2 + 0.34, goal.width / 2 - 0.34),
      y: clamp(0.42 + (height / 100) * (goal.height - 0.78), 0.36, goal.height - 0.28),
    };
  },

  describeTarget(target) {
    const side = target.x < -1.15 ? "左路" : target.x > 1.15 ? "右路" : "中路";
    const level = target.y > 1.75 ? "高球" : target.y < 0.85 ? "低球" : "半高球";
    return `${side} ${level}`;
  },

  shoot() {
    if (this.state.inFlight) return;

    this.reset(false);
    this.updateTarget();

    const target = this.state.target;
    const power = this.data.power;
    const speed = 18 + power * 0.16;
    const flightTime = lerp(0.58, 0.42, (power - 48) / 52);
    const vx = (target.x - kickSpot.x) / flightTime;
    const vz = (goal.z - kickSpot.z) / flightTime;
    const vy = (target.y - kickSpot.y + 0.5 * Math.abs(gravity) * flightTime * flightTime) / flightTime;
    const scale = speed / Math.hypot(vx, vy, vz);

    this.state.velocity = { x: vx * scale, y: vy * scale, z: vz * scale };
    this.state.spin = this.data.curl * -0.025;
    this.state.keeperTarget = this.predictKeeperTarget(target, power);
    this.state.keeperVelocity = 0;
    this.state.inFlight = true;
    this.state.resolved = false;
    this.state.shotTime = 0;
    this.state.previousZ = kickSpot.z;

    this.setData({
      shots: this.data.shots + 1,
      status: "射门！",
      keeperText: this.state.keeperTarget < -0.6 ? "扑向左侧" : this.state.keeperTarget > 0.6 ? "扑向右侧" : "守住中路",
    });

    clearTimeout(this.projectedTimer);
    this.projectedTimer = setTimeout(() => this.resolveProjectedOutcome(), 850);
  },

  predictKeeperTarget(target, power) {
    const hesitation = lerp(1.15, 0.52, (power - 48) / 52);
    const mistake = (Math.random() - 0.5) * hesitation;
    return clamp(target.x * 0.72 + mistake, -2.85, 2.85);
  },

  reset(resetKeeper = true) {
    Object.assign(this.state.ball, kickSpot);
    this.state.velocity = { x: 0, y: 0, z: 0 };
    this.state.spin = 0;
    this.state.inFlight = false;
    this.state.resolved = false;
    this.state.shotTime = 0;
    this.state.previousZ = kickSpot.z;

    const nextData = {
      speedText: "0 km/h",
      status: resetKeeper ? "已重置，重新选择射门路线" : this.data.status,
    };
    if (resetKeeper) {
      this.state.keeperX = 0;
      this.state.keeperVelocity = 0;
      nextData.keeperText = "待命";
    }
    this.setData(nextData);
  },

  loop() {
    const now = Date.now();
    const dt = this.state.lastTime ? Math.min((now - this.state.lastTime) / 1000, 1 / 30) : 1 / 60;
    this.state.lastTime = now;

    this.step(dt);
    this.draw();
    this.frameTimer = setTimeout(() => this.loop(), 16);
  },

  step(dt) {
    if (!this.state.inFlight || this.state.resolved) {
      this.updateKeeper(dt);
      return;
    }

    const ball = this.state.ball;
    const velocity = this.state.velocity;
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    const previous = { ...ball };

    velocity.x += clamp(this.state.spin * -0.0022 * Math.abs(velocity.z), -0.22, 0.22) * dt;
    velocity.x += -0.012 * speed * velocity.x * dt;
    velocity.y += (gravity - 0.012 * speed * velocity.y) * dt;
    velocity.z += -0.012 * speed * velocity.z * dt;

    const maxSideSpeed = Math.abs(velocity.z) * 0.38 + 0.8;
    velocity.x = clamp(velocity.x, -maxSideSpeed, maxSideSpeed);

    ball.x += velocity.x * dt;
    ball.y += velocity.y * dt;
    ball.z += velocity.z * dt;

    if (ball.y < ballRadius) {
      ball.y = ballRadius;
      velocity.y *= -0.42;
      velocity.x *= 0.82;
      velocity.z *= 0.82;
    }

    this.state.shotTime += dt;
    this.state.previousZ = previous.z;
    this.updateKeeper(dt);
    this.checkOutcome(previous, ball);

    this.setData({ speedText: `${Math.round(speed * 3.6)} km/h` });
  },

  updateKeeper(dt) {
    const target = this.state.inFlight ? this.state.keeperTarget : 0;
    const spring = target - this.state.keeperX;
    this.state.keeperVelocity += spring * 18 * dt;
    this.state.keeperVelocity *= Math.pow(0.08, dt);
    this.state.keeperX = clamp(this.state.keeperX + this.state.keeperVelocity * dt, -2.85, 2.85);
  },

  checkOutcome(previous, ball) {
    const crossedGoalLine = previous.z > goal.z && ball.z <= goal.z;
    if (crossedGoalLine) {
      const point = interpolateGoalLinePoint(previous, ball);
      this.resolvePoint(point);
      return;
    }

    if (ball.z < goal.z - 2.5 || Math.abs(ball.x) > 8 || ball.y > 5.5) {
      this.resolveShot(ball.y > goal.height ? "高出横梁" : "射偏了");
    } else if (this.state.shotTime > 2.8 && vectorLength(this.state.velocity) < 0.9) {
      this.resolveShot(ball.z < goal.z + 1.4 ? "球停在门前" : "力度不足");
    }
  },

  resolvePoint(point) {
    const inside = Math.abs(point.x) <= goal.width / 2 - ballRadius && point.y >= ballRadius && point.y <= goal.height - ballRadius * 0.45;
    if (!inside) {
      this.resolveShot(point.y > goal.height ? "高出横梁" : "射偏了");
      return;
    }

    const keeperDistance = Math.hypot(point.x - this.state.keeperX, point.y - 1.12);
    const cornerDifficulty = Math.min(Math.abs(point.x) / (goal.width / 2), point.y / goal.height);
    const saveChance = clamp(0.78 - cornerDifficulty * 0.42, 0.26, 0.78);
    const saved = keeperDistance < 0.58 && Math.random() < saveChance;

    if (saved) {
      this.resolveShot("被门将扑出！", { keeperText: "完成扑救" });
      return;
    }

    this.resolveShot("进球！球钻进网窝", { goal: true, keeperText: "未能扑到" });
  },

  resolveProjectedOutcome() {
    if (!this.state.inFlight || this.state.resolved) return;
    this.resolvePoint(this.state.target);
  },

  resolveShot(message, options = {}) {
    if (this.state.resolved) return;
    this.state.resolved = true;
    this.state.inFlight = false;

    const next = {
      status: message,
      speedText: "0 km/h",
    };
    if (options.goal) next.goals = this.data.goals + 1;
    if (options.keeperText) next.keeperText = options.keeperText;
    this.setData(next);
  },

  draw() {
    if (!this.ctx || !this.view) return;

    const ctx = this.ctx;
    const { width, height } = this.view;
    ctx.clearRect(0, 0, width, height);

    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#17211b");
    sky.addColorStop(1, "#101410");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    this.drawField(ctx);
    this.drawGoal(ctx);
    this.drawKeeper(ctx);
    this.drawAim(ctx);
    this.drawBall(ctx);
  },

  drawField(ctx) {
    const p1 = this.project({ x: -11, y: 0, z: 2 });
    const p2 = this.project({ x: 11, y: 0, z: 2 });
    const p3 = this.project({ x: 11, y: 0, z: -24 });
    const p4 = this.project({ x: -11, y: 0, z: -24 });

    ctx.fillStyle = "#286737";
    polygon(ctx, [p1, p2, p3, p4]);

    for (let i = 0; i < 9; i += 1) {
      const z0 = 0 - i * 2.8;
      const z1 = z0 - 1.4;
      const a = this.project({ x: -11, y: 0.01, z: z0 });
      const b = this.project({ x: 11, y: 0.01, z: z0 });
      const c = this.project({ x: 11, y: 0.01, z: z1 });
      const d = this.project({ x: -11, y: 0.01, z: z1 });
      ctx.fillStyle = i % 2 ? "rgba(63, 139, 72, 0.34)" : "rgba(24, 78, 39, 0.24)";
      polygon(ctx, [a, b, c, d]);
    }

    this.drawWorldLine(ctx, { x: -4.4, y: 0.03, z: -11 }, { x: -4.4, y: 0.03, z: -18.6 }, "#eaf1e4", 2);
    this.drawWorldLine(ctx, { x: 4.4, y: 0.03, z: -11 }, { x: 4.4, y: 0.03, z: -18.6 }, "#eaf1e4", 2);
    this.drawWorldLine(ctx, { x: -4.4, y: 0.03, z: -11 }, { x: 4.4, y: 0.03, z: -11 }, "#eaf1e4", 2);
    this.drawWorldLine(ctx, { x: -4.4, y: 0.03, z: -18.6 }, { x: 4.4, y: 0.03, z: -18.6 }, "#eaf1e4", 2);
  },

  drawGoal(ctx) {
    const leftBottom = this.project({ x: -goal.width / 2, y: 0, z: goal.z });
    const leftTop = this.project({ x: -goal.width / 2, y: goal.height, z: goal.z });
    const rightBottom = this.project({ x: goal.width / 2, y: 0, z: goal.z });
    const rightTop = this.project({ x: goal.width / 2, y: goal.height, z: goal.z });
    ctx.strokeStyle = "#f5f6ef";
    ctx.lineWidth = 5;
    line(ctx, leftBottom, leftTop);
    line(ctx, rightBottom, rightTop);
    line(ctx, leftTop, rightTop);

    ctx.strokeStyle = "rgba(238,244,232,0.35)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i += 1) {
      const x = -goal.width / 2 + (goal.width / 8) * i;
      this.drawWorldLine(ctx, { x, y: 0, z: goal.z - 0.8 }, { x, y: goal.height, z: goal.z - 0.8 }, ctx.strokeStyle, 1);
    }
  },

  drawKeeper(ctx) {
    const base = this.project({ x: this.state.keeperX, y: 0, z: goal.z + 0.18 });
    const head = this.project({ x: this.state.keeperX, y: 1.75, z: goal.z + 0.18 });
    const scale = base.scale;

    ctx.fillStyle = "#3a8fde";
    roundRect(ctx, base.x - 18 * scale, base.y - 68 * scale, 36 * scale, 58 * scale, 6 * scale);
    ctx.fill();

    ctx.fillStyle = "#d19a6a";
    circle(ctx, head.x, head.y, 12 * scale);

    ctx.strokeStyle = "#3a8fde";
    ctx.lineWidth = 8 * scale;
    line(ctx, { x: base.x - 8 * scale, y: base.y - 55 * scale }, { x: base.x - 36 * scale, y: base.y - 25 * scale });
    line(ctx, { x: base.x + 8 * scale, y: base.y - 55 * scale }, { x: base.x + 36 * scale, y: base.y - 25 * scale });

    ctx.fillStyle = "#f4c75c";
    circle(ctx, base.x - 39 * scale, base.y - 23 * scale, 8 * scale);
    circle(ctx, base.x + 39 * scale, base.y - 23 * scale, 8 * scale);
  },

  drawAim(ctx) {
    if (this.state.inFlight) return;
    const from = this.project(kickSpot);
    const to = this.project({ x: this.state.target.x, y: this.state.target.y, z: goal.z });
    ctx.strokeStyle = "#f4c75c";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    line(ctx, from, to);
    ctx.setLineDash([]);
  },

  drawBall(ctx) {
    const point = this.project(this.state.ball);
    const radius = Math.max(7, 18 * point.scale);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    circle(ctx, point.x + radius * 0.35, point.y + radius * 0.75, radius * 0.9);
    ctx.fillStyle = "#f7f7ee";
    circle(ctx, point.x, point.y, radius);
    ctx.strokeStyle = "#182019";
    ctx.lineWidth = Math.max(1, radius * 0.1);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 0.72, -0.7, 0.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 0.7, 2.15, 4.0);
    ctx.stroke();
  },

  drawWorldLine(ctx, a, b, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    line(ctx, this.project(a), this.project(b));
  },

  project(point) {
    const { width, height } = this.view;
    const cameraZ = 8.5;
    const depth = Math.max(1.4, cameraZ - point.z);
    const scale = 7.8 / depth;
    return {
      x: width / 2 + point.x * 42 * scale,
      y: height * 0.84 - point.y * 58 * scale + point.z * 5.2 * scale,
      scale,
    };
  },
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

function vectorLength(v) {
  return Math.hypot(v.x, v.y, v.z);
}

function interpolateGoalLinePoint(from, to) {
  const zDelta = to.z - from.z;
  const t = Math.abs(zDelta) < 0.0001 ? 1 : (goal.z - from.z) / zDelta;
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    z: goal.z,
  };
}

function polygon(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.fill();
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function circle(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
