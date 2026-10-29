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
  const selectedFile = new THREE.Group();
  const selectedBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
  const selectedCap = new THREE.Mesh(capGeometry, capMaterial); selectedCap.position.y = 1.742;
  const selectedDetail = new THREE.Mesh(detailGeometry, detailMaterial); selectedDetail.position.set(-1.65, 1.29, .157);
  const imageBacking = new THREE.Mesh(new THREE.PlaneGeometry(4.45, 3.05), new THREE.MeshBasicMaterial({color: 0xe1dcd7}));
  imageBacking.position.set(0, 0, .157);
  const imageMaterial = new THREE.MeshBasicMaterial({color: 0xffffff, toneMapped: false});
  const imagePlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), imageMaterial);
  imagePlane.position.set(0, 0, .17); imagePlane.visible = false;
  selectedFile.add(selectedBody, selectedCap, selectedDetail, imageBacking, imagePlane);
  scene.add(selectedFile);
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
  let desiredX = 0, desiredY = 0, desiredZoom = 0, movingX = 0, movingY = 0, movingZoom = 0;
  let previewTexture = null;
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
    movingZoom += ((activeMotion ? desiredZoom : 0) - movingZoom) * blend;
    camera.position.set(-23 + movingX * 1.2, 13 + movingY * .7, 18 - movingZoom);
    camera.lookAt(0, .25, 0);
    const focusRow = baseRow + current, age = (now - selectedAt) / 1000;
    for (let col = 0; col < columns; col++) {
      for (let row = 0; row < rows; row++) {
        const i = col * rows + row, distance = Math.abs(row - focusRow);
        const shoulder = Math.exp(-distance * .34) * (col === focusColumn ? .65 : .18);
        const isSelected = col === focusColumn && row === focusRow;
        const selected = isSelected ? 3.45 : 0;
        const wave = activeMotion && age < 2 ? .22 * Math.exp(-age * 2) * Math.cos(distance * .75 - age * 8) * Math.exp(-distance * .17) : 0;
        const breath = activeMotion ? .035 * Math.sin(now / 2400 + row * .18 + col * .3) : 0;
        const wanted = shoulder + selected + wave + breath;
        heights[i] += (wanted - heights[i]) * (activeMotion ? blend : 1);
        const x = (col - focusColumn) * columnGap, y = -.45 + heights[i], z = (row - (rows - 1) / 2) * rowGap;
        dummy.scale.setScalar(isSelected ? .0001 : 1);
        dummy.position.set(x, y, z); dummy.updateMatrix(); bodies.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x, y + 1.742, z); dummy.updateMatrix(); caps.setMatrixAt(i, dummy.matrix);
        dummy.position.set(x - 1.65, y + 1.29, z + .157); dummy.updateMatrix(); details.setMatrixAt(i, dummy.matrix);
        if (isSelected) {
          selectedFile.position.set(x, y, z);
          const rotation = THREE.MathUtils.smoothstep(heights[i], 2.75, 3.9);
          selectedFile.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z) * rotation;
        }
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
  function setImage(image) {
    if (previewTexture) previewTexture.dispose();
    previewTexture = null; imagePlane.visible = false; imageMaterial.map = null;
    if (image && image.naturalWidth && image.naturalHeight) {
      previewTexture = new THREE.Texture(image); previewTexture.colorSpace = THREE.SRGBColorSpace; previewTexture.needsUpdate = true;
      imageMaterial.map = previewTexture; imagePlane.visible = true;
      const aspect = image.naturalWidth / image.naturalHeight, maxWidth = 4.25, maxHeight = 2.85;
      const width = Math.min(maxWidth, maxHeight * aspect), height = width / aspect;
      imagePlane.scale.set(width, height, 1);
    }
    imageMaterial.needsUpdate = true; invalidate();
  }

  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const rect = host.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    desiredX = (event.clientX - rect.left) / rect.width * 2 - 1;
    desiredY = -((event.clientY - rect.top) / rect.height * 2 - 1);
    desiredZoom = .8; invalidate();
  }, {passive: true});
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    drag = {x: event.clientX, y: event.clientY, lastX: event.clientX, moved: false};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
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
    const hit = raycaster.intersectObjects([bodies, selectedFile], true)[0];
    if (!hit) return;
    const index = hit.object === bodies && hit.instanceId != null ? wrap(hit.instanceId % rows - baseRow, options.count) : current;
    if (index !== current) options.onSelect(index);
  });
  canvas.addEventListener('pointercancel', () => { drag = null; });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); if (frame) cancelAnimationFrame(frame); frame = 0; host.classList.add('context-lost'); host.parentElement.classList.add('scene-unavailable'); });
  canvas.addEventListener('webglcontextrestored', () => { host.classList.remove('context-lost'); host.parentElement.classList.remove('scene-unavailable'); last = 0; resize(); });
  new MutationObserver(() => { if (!motion() && frame) { cancelAnimationFrame(frame); frame = 0; } last = 0; invalidate(); }).observe(document.body, {attributes: true, attributeFilter: ['class']});
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (!visible && frame) { cancelAnimationFrame(frame); frame = 0; } last = 0; invalidate(); }, {threshold: .01}).observe(host);
  new ResizeObserver(resize).observe(host);
  document.addEventListener('visibilitychange', () => { if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; } last = 0; invalidate(); });
  reduced.addEventListener('change', () => { last = 0; invalidate(); });
  resize();
  return {select: setIndex, setImage};
}
