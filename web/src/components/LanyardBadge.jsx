/* eslint-disable react/no-unknown-property */
'use client';

import { useEffect, useRef, useState, useMemo, Suspense } from 'react';
import { Canvas, extend, useFrame } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import * as THREE from 'three';

extend({ MeshLineGeometry, MeshLineMaterial });

/**
 * Creates a procedural lanyard strap texture on a canvas.
 * Returns a THREE.CanvasTexture with a woven fabric pattern.
 */
function createLanyardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Dark base
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, 64, 512);

  // Subtle woven lines
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 1;
  for (let i = 0; i < 512; i += 4) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(64, i);
    ctx.stroke();
  }

  // Brand stripe down the center
  ctx.fillStyle = '#222222';
  ctx.fillRect(24, 0, 16, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Loads an image from a src (supports base64 data URIs and URLs).
 * Returns a Promise that resolves with the Image element.
 */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

/**
 * Creates a procedural texture for the ID card face.
 * The photo is baked directly into the canvas for reliability with base64 URIs.
 */
function createCardTexture(name, enrollment, photoImg) {
  const canvas = document.createElement('canvas');
  const w = 512;
  const h = 720;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Card background - near black with subtle gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a0a0a');
  grad.addColorStop(1, '#050505');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Top accent line
  ctx.fillStyle = '#333';
  ctx.fillRect(40, 40, w - 80, 1);

  // Header text - "JIITSPHERE"
  ctx.fillStyle = '#555';
  ctx.font = '600 14px "Instrument Sans", system-ui, sans-serif';
  ctx.letterSpacing = '8px';
  ctx.textAlign = 'center';
  ctx.fillText('JIITSPHERE', w / 2, 72);

  // Subheader
  ctx.fillStyle = '#333';
  ctx.font = '400 10px "Instrument Sans", system-ui, sans-serif';
  ctx.fillText('STUDENT IDENTITY MODULE', w / 2, 92);

  // Photo area
  const px = 126, py = 120, pw = 260, ph = 320;
  ctx.fillStyle = '#111';
  ctx.fillRect(px, py, pw, ph);

  // Draw actual photo if available
  if (photoImg) {
    try {
      // Draw the image, fitting it into the photo area while maintaining aspect ratio
      const imgAspect = photoImg.width / photoImg.height;
      const areaAspect = pw / ph;
      let drawW, drawH, drawX, drawY;
      if (imgAspect > areaAspect) {
        // Image is wider — fit by height, crop width
        drawH = ph;
        drawW = ph * imgAspect;
        drawX = px + (pw - drawW) / 2;
        drawY = py;
      } else {
        // Image is taller — fit by width, crop height
        drawW = pw;
        drawH = pw / imgAspect;
        drawX = px;
        drawY = py + (ph - drawH) / 2;
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      ctx.drawImage(photoImg, drawX, drawY, drawW, drawH);
      ctx.restore();
    } catch (_e) {
      // Photo draw failed, silently use placeholder
    }
  }

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 22px "Instrument Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  const displayName = (name || 'STUDENT').toUpperCase();
  ctx.fillText(displayName, w / 2, 490);

  // Enrollment
  ctx.fillStyle = '#666';
  ctx.font = '500 14px "Instrument Sans", system-ui, sans-serif';
  ctx.fillText(`ID // ${enrollment || '—'}`, w / 2, 520);

  // Separator
  ctx.fillStyle = '#222';
  ctx.fillRect(160, 545, w - 320, 1);

  // Footer
  ctx.fillStyle = '#333';
  ctx.font = '400 10px "Instrument Sans", system-ui, sans-serif';
  ctx.fillText('PORTAL AUTH // IDENTITY-01', w / 2, 575);

  // Bottom accent line
  ctx.fillStyle = '#333';
  ctx.fillRect(40, h - 40, w - 80, 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * The physics-driven band (Band) connects all joint segments visually.
 * Uses MeshLine for the thick lanyard strap rendering.
 * Follows the exact React Bits implementation pattern:
 * - 4 curve control points from j3, j2.lerped, j1.lerped, fixed
 * - Lerped positions for smooth band movement
 */
function Band({ maxSpeed = 50, minSpeed = 0, isMobile = false, fixed, j1, j2, j3, card }) {
  const bandRef = useRef();
  const lanyardTexture = useMemo(() => createLanyardTexture(), []);

  const [curve] = useState(
    () => new THREE.CatmullRomCurve3([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3()
    ])
  );

  useFrame((state, delta) => {
    if (!fixed.current || !j1.current || !j2.current || !j3.current || !card.current || !bandRef.current) return;

    // Lerped positions for smooth band (official pattern)
    [j1, j2].forEach(ref => {
      if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
      const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
      ref.current.lerped.lerp(
        ref.current.translation(),
        delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed))
      );
    });

    // Update curve control points (official order: j3 → j2 → j1 → fixed)
    curve.points[0].copy(j3.current.translation());
    curve.points[1].copy(j2.current.lerped);
    curve.points[2].copy(j1.current.lerped);
    curve.points[3].copy(fixed.current.translation());

    // Update band geometry
    bandRef.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));

    // Angular velocity damping for card rotation stability
    const ang = card.current.angvel();
    const rot = card.current.rotation();
    card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });
  });

  curve.curveType = 'chordal';

  return (
    <mesh ref={bandRef}>
      <meshLineGeometry />
      <meshLineMaterial
        color="white"
        resolution={isMobile ? [1000, 2000] : [1000, 1000]}
        useMap
        map={lanyardTexture}
        repeat={[-4, 1]}
        lineWidth={1}
      />
    </mesh>
  );
}

/**
 * The main scene content: physics bodies, joints, card, and band.
 * Follows the exact React Bits joint chain:
 *   fixed ——rope—— j1 ——rope—— j2 ——rope—— j3 ——spherical—— card
 */
function LanyardScene({ profileName, enrollment, profilePhotoSrc, isMobile }) {
  const fixed = useRef();
  const j1 = useRef();
  const j2 = useRef();
  const j3 = useRef();
  const card = useRef();
  const vec = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);

  const [dragged, setDragged] = useState(false);
  const [hovered, setHovered] = useState(false);

  const segmentProps = {
    type: 'dynamic',
    canSleep: true,
    colliders: false,
    angularDamping: 4,
    linearDamping: 4,
  };

  // Card face texture — procedurally generated with photo baked in
  const [cardTexture, setCardTexture] = useState(() => createCardTexture(profileName, enrollment, null));

  useEffect(() => {
    let cancelled = false;

    const buildTexture = async () => {
      let photoImg = null;
      if (profilePhotoSrc) {
        try {
          photoImg = await loadImage(profilePhotoSrc);
        } catch (_e) {
          // Photo load failed, proceed without it
        }
      }
      if (!cancelled) {
        setCardTexture(createCardTexture(profileName, enrollment, photoImg));
      }
    };

    buildTexture();
    return () => { cancelled = true; };
  }, [profileName, enrollment, profilePhotoSrc]);

  // Joint chain (official pattern)
  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, 1.5, 0]]);

  // Cursor management
  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
      return () => { document.body.style.cursor = 'auto'; };
    }
  }, [hovered, dragged]);

  // Drag handler (official pattern)
  useFrame((state) => {
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      vec.add(dir.multiplyScalar(state.camera.position.length()));
      [card, j1, j2, j3, fixed].forEach(ref => ref.current?.wakeUp());
      card.current?.setNextKinematicTranslation({
        x: vec.x - dragged.x,
        y: vec.y - dragged.y,
        z: vec.z - dragged.z,
      });
    }
  });

  return (
    <>
      <group position={[0, 4, 0]}>
        {/* Fixed anchor at top */}
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />

        {/* 3 intermediate rope segments with ball colliders */}
        <RigidBody position={[0.5, 0, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1, 0, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[1.5, 0, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>

        {/* The card body */}
        <RigidBody
          position={[2, 0, 0]}
          ref={card}
          {...segmentProps}
          type={dragged ? 'kinematicPosition' : 'dynamic'}
        >
          <CuboidCollider args={[0.8, 1.125, 0.01]} />
          <group
            scale={2.25}
            position={[0, -1.2, -0.05]}
            onPointerOver={() => setHovered(true)}
            onPointerOut={() => setHovered(false)}
            onPointerUp={(e) => {
              e.target.releasePointerCapture(e.pointerId);
              setDragged(false);
            }}
            onPointerDown={(e) => {
              e.target.setPointerCapture(e.pointerId);
              setDragged(
                new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation()))
              );
            }}
          >
            {/* Main card face — photo baked into canvas texture */}
            <mesh>
              <planeGeometry args={[0.72, 1.0]} />
              <meshPhysicalMaterial
                map={cardTexture}
                clearcoat={isMobile ? 0 : 1}
                clearcoatRoughness={0.15}
                roughness={0.3}
                metalness={0.5}
              />
            </mesh>

            {/* Card back */}
            <mesh rotation={[0, Math.PI, 0]} position={[0, 0, -0.005]}>
              <planeGeometry args={[0.72, 1.0]} />
              <meshStandardMaterial color="#050505" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Metal clip at top */}
            <mesh position={[0, 0.52, 0]}>
              <boxGeometry args={[0.12, 0.06, 0.02]} />
              <meshStandardMaterial color="#888" metalness={1} roughness={0.3} />
            </mesh>

            {/* Metal clamp ring */}
            <mesh position={[0, 0.56, 0]}>
              <torusGeometry args={[0.03, 0.008, 8, 16]} />
              <meshStandardMaterial color="#999" metalness={1} roughness={0.2} />
            </mesh>
          </group>
        </RigidBody>
      </group>

      {/* The visible lanyard band */}
      <Band
        fixed={fixed}
        j1={j1}
        j2={j2}
        j3={j3}
        card={card}
        isMobile={isMobile}
      />
    </>
  );
}

/**
 * Root export: wraps the Canvas, Physics, and Environment.
 * Dynamically imported with { ssr: false } in ProfileView.
 */
export default function LanyardBadge({ profilePhotoSrc, profileName, enrollment }) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '600px',
        zIndex: 1,
        touchAction: 'none',
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 13], fov: 25 }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ alpha: true }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), 0)}
      >
        <ambientLight intensity={Math.PI} />
        <Suspense fallback={null}>
          <Physics gravity={[0, -40, 0]} timeStep={isMobile ? 1 / 30 : 1 / 60}>
            <LanyardScene
              profileName={profileName}
              enrollment={enrollment}
              profilePhotoSrc={profilePhotoSrc}
              isMobile={isMobile}
            />
          </Physics>
          <Environment blur={0.75}>
            <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
            <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
            <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
            <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
          </Environment>
        </Suspense>
      </Canvas>
    </div>
  );
}
