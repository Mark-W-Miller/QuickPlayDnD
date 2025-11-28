import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const buildGrid = (size, divisions, color, opacity = 0.25) => {
  const grid = new THREE.GridHelper(size, divisions, color, color);
  grid.material.transparent = true;
  grid.material.opacity = opacity;
  grid.material.depthWrite = false;
  return grid;
};

export const buildAxisArena = () => {
  const group = new THREE.Group();

  const majorSize = 200;
  const minorSize = 200;
  const majorDiv = 20; // 10-unit majors
  const minorDiv = 200; // 1-unit minors

  // XZ plane grid (green)
  const xzMajor = buildGrid(majorSize, majorDiv, 0x00ff88, 0.4);
  const xzMinor = buildGrid(minorSize, minorDiv, 0x00ff88, 0.12);
  xzMajor.rotation.x = Math.PI / 2;
  xzMinor.rotation.x = Math.PI / 2;
  group.add(xzMinor, xzMajor);

  // XY plane grid (blue)
  const xyMajor = buildGrid(majorSize, majorDiv, 0x99ccff, 0.4);
  const xyMinor = buildGrid(minorSize, minorDiv, 0x99ccff, 0.12);
  xyMajor.rotation.y = Math.PI / 2;
  xyMinor.rotation.y = Math.PI / 2;
  group.add(xyMinor, xyMajor);

  // YZ plane grid (white)
  const yzMajor = buildGrid(majorSize, majorDiv, 0xffffff, 0.35);
  const yzMinor = buildGrid(minorSize, minorDiv, 0xffffff, 0.1);
  yzMajor.rotation.z = Math.PI / 2;
  yzMinor.rotation.z = Math.PI / 2;
  group.add(yzMinor, yzMajor);

  // Axes as thin tubes
  const axisRadius = 0.15;
  const axisLength = 120;
  const axisGeom = new THREE.CylinderGeometry(axisRadius, axisRadius, axisLength, 12);

  const xAxis = new THREE.Mesh(
    axisGeom,
    new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 })
  );
  xAxis.rotation.z = Math.PI / 2;
  xAxis.position.x = axisLength / 2;

  const yAxis = new THREE.Mesh(
    axisGeom,
    new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.9 })
  );
  yAxis.position.y = axisLength / 2;

  const zAxis = new THREE.Mesh(
    axisGeom,
    new THREE.MeshBasicMaterial({ color: 0x0000ff, transparent: true, opacity: 0.9 })
  );
  zAxis.rotation.x = Math.PI / 2;
  zAxis.position.z = axisLength / 2;

  group.add(xAxis, yAxis, zAxis);

  // Origin marker (red X)
  const originGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.8, 0, 0),
    new THREE.Vector3(0.8, 0, 0),
    new THREE.Vector3(0, 0, -0.8),
    new THREE.Vector3(0, 0, 0.8)
  ]);
  const originMat = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
  const originMarker = new THREE.LineSegments(originGeo, originMat);
  originMarker.position.set(0, 0, 0);
  group.add(originMarker);

  return {
    group,
    grids: {
      xyMajor,
      xyMinor,
      yzMajor,
      yzMinor,
      xzMajor,
      xzMinor
    },
    axes: { xAxis, yAxis, zAxis },
    originMarker
  };
};
