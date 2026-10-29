import * as THREE from './vendor/three/three.module.min.js';

/* A lightweight three-dimensional filing array for the desktop landing page. */
export function createArchiveScene(host, options) {
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false, powerPreference: 'low-power'});
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
  renderer.setClearColor(0xe9e6e2, 1);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e6e2);
  scene.fog = new THREE.Fog(0xe9e6e2, 34, 67);
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 100);
  const ambient = new THREE.HemisphereLight(0xffffff, 0xb4a69b, 2.2);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-8, 18, 12);
  scene.add(ambient, sun);

  const columns = 11, rows = 56, total = columns * rows;
  const columnGap = 5.05, rowGap = .62, focusColumn = 5, baseRow = 24;
  const bodyGeometry = new THREE.BoxGeometry(4.8, 3.45, .30);
  const bodyMaterial = new THREE.MeshStandardMaterial({color: 0xf4f0ea, roughness: .82, metalness: .02});
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, total);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const capGeometry = new THREE.BoxGeometry(4.72, .035, .31);
  const capMaterial = new THREE.MeshStandardMaterial({color: 0xffffff, roughness: .7});
  const caps = new THREE.InstancedMesh(capGeometry, capMaterial, total);
  caps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const detailGeometry = new THREE.BoxGeometry(.24, .08, .012);
  const detailMaterial = new THREE.MeshStandardMaterial({color: 0xaaa19a, roughness: .8});
  const details = new THREE.InstancedMesh(detailGeometry, detailMaterial, total);
  details.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(bodies, caps, details);
  const shade = new THREE.Color();
  for (let i = 0; i < total; i++) {
    const variation = (i % rows) % 3;
    shade.setHex(variation === 0 ? 0xf8f5f0 : variation === 1 ? 0xf3efea : 0xeee9e3);
    bodies.setColorAt(i, shade);
  }

  const dummy = new THREE.Object3D();
  const heights = new Float32Array(total);
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  const desktop = window.matchMedia('(min-width: 960px)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0, selectedAt = 0, visible = true, frame = 0, last = 0;
  let desiredX = 0, desiredY = 0, movingX = 0, movingY = 0, inside = false;
  let drag = null;
  const wrap = (value, length) => ((value % length) + length) % length;
  const motion = () => !document.body.classList.contains('motion-off') && !reduced.matches;
  const canDraw = () => visible && !document.hidden && desktop.matches;

  function resize() {
    const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    invalidate();
  }
  function paint(now) {
    const activeMotion = motion();
    const delta = last ? Math.min((now - last) / 1000, .08) : .016;
    last = now;
    const blend = activeMotion ? 1 - Math.exp(-delta * 5) : 1;
    movingX += ((activeMotion ? desiredX : 0) - movingX) * blend;
    movingY += ((activeMotion ? desiredY : 0) - movingY) * blend;
    camera.position.set(-23 + movingX * 1.2, 13 + movingY * .7, 18 - (inside && activeMotion ? .8 : 0));
    camera.lookAt(0, .25, 0);
    const focusRow = baseRow + current, age = (now - selectedAt) / 1000;
    for (let col = 0; col < columns; col++) {
      for (let row = 0; row < rows; row++) {
        const i = col * rows + row, distance = Math.abs(row - focusRow);
        const shoulder = Math.exp(-distance * .34) * (col === focusColumn ? .65 : .18);
        const selected = col === focusColumn && row === focusRow ? 1.15 : 0;
        const wave = activeMotion && age < 2 ? .22 * Math.exp(-age * 2) * Math.cos(distance * .75 - age * 8) * Math.exp(-distance * .17) : 0;
        const breath = activeMotion ? .035 * Math.sin(now / 2400 + row * .18 + col * .3) : 0;
        const wanted = shoulder + selected + wave + breath;
        heights[i] += (wanted - heights[i]) * (activeMotion ? blend : 1);
        const x = (col - focusColumn) * columnGap, y = -.45 + heights[i], z = (row - (rows - 1) / 2) * rowGap;
        dummy.position.set(x, y, z); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, y + 1.742, z); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x - 1.65, y + 1.29, z + .157); dummy.updateMatrix(); details.setMatrixAt(i, dummy.matrix);
      }
    }
    bodies.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true; details.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }
  function tick(now) {
    frame = 0;
    if (!canDraw()) { last = 0; return; }
    if (!last || now - last >= 32 || !motion()) paint(now);
    if (motion()) frame = requestAnimationFrame(tick);
  }
  function invalidate() { if (canDraw() && !frame) frame = requestAnimationFrame(tick); }
  function setIndex(index) { current = wrap(index, options.count); selectedAt = performance.now(); invalidate(); }

  canvas.addEventListener('pointerenter', () => { inside = true; invalidate(); });
  canvas.addEventListener('pointerleave', () => { inside = false; desiredX = 0; desiredY = 0; invalidate(); });
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = {x: event.clientX, y: event.clientY, lastX: event.clientX, moved: false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    const rect = canvas.getBoundingClientRect();
    desiredX = (event.clientX - rect.left) / rect.width * 2 - 1;
    desiredY = -((event.clientY - rect.top) / rect.height * 2 - 1);
    if (drag && Math.abs(event.clientX - drag.lastX) > 55) {
      drag.moved = true;
      options.onSelect(current + (event.clientX < drag.lastX ? 1 : -1));
      drag.lastX = event.clientX;
    }
    invalidate();
  });
  canvas.addEventListener('pointerup', event => {
    if (!drag) return;
    const moved = drag.moved || Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 10;
    drag = null;
    if (moved) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(bodies)[0];
    if (!hit || hit.instanceId == null) return;
    const row = hit.instanceId % rows, index = wrap(row - baseRow, options.count);
    if (index === current) options.onOpen(); else options.onSelect(index);
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); if (frame) cancelAnimationFrame(frame); frame = 0; host.classList.add('context-lost'); });
  canvas.addEventListener('webglcontextrestored', () => { host.classList.remove('context-lost'); last = 0; resize(); });
  new MutationObserver(() => { if (!motion() && frame) { cancelAnimationFrame(frame); frame = 0; } last = 0; invalidate(); }).observe(document.body, {attributes: true, attributeFilter: ['class']});
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; } last = 0; invalidate(); }, {threshold: .01}).observe(host);
  new ResizeObserver(resize).observe(host);
  document.addEventListener('visibilitychange', () => { if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; } last = 0; invalidate(); });
  reduced.addEventListener('change', () => { last = 0; invalidate(); });
  resize();
  return {select: setIndex};
}
