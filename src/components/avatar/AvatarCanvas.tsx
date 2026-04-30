'use client'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei'
import { Suspense } from 'react'
import { AvatarModel } from './AvatarModel'
import type { AvatarState } from '@/lib/avatar/types'

export function AvatarCanvas({ state }: { state: AvatarState }) {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 0.5, 3.2], fov: 32 }}
      style={{ background: 'transparent' }}
    >
      {/* Ambient + key + rim lighting */}
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[3, 5, 4]} intensity={1.2}
        castShadow shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-4, 3, -3]} intensity={0.4} color="#a78bfa" />
      <pointLight position={[0, 2, 2]} intensity={0.4} color="#22d3ee" />

      {/* Studio environment for nice reflections */}
      <Suspense fallback={null}>
        <Environment preset="city" />
      </Suspense>

      {/* Avatar */}
      <Suspense fallback={null}>
        <AvatarModel state={state} />
      </Suspense>

      {/* Soft shadow under feet */}
      <ContactShadows
        position={[0, -1.05, 0]}
        opacity={0.4}
        scale={5}
        blur={2.5}
        far={2}
      />

      {/* Camera controls */}
      <OrbitControls
        enablePan={false}
        minPolarAngle={Math.PI / 4}
        maxPolarAngle={Math.PI / 1.8}
        minDistance={2.2}
        maxDistance={5}
        target={[0, 0.2, 0]}
      />
    </Canvas>
  )
}
