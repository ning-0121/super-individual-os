'use client'
import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AvatarState } from '@/lib/avatar/types'
import { OUTFIT_COLORS, GROWTH_SCALE, MOOD_AURA_COLOR } from '@/lib/avatar/types'

// ─────────────────────────────────────────────────
// Procedural Avatar — primitives only, no asset file required.
// Acts as a placeholder until a real .vrm / .glb is loaded.
// ─────────────────────────────────────────────────

interface Props {
  state: AvatarState
}

export function AvatarModel({ state }: Props) {
  const root      = useRef<THREE.Group>(null)
  const headPivot = useRef<THREE.Group>(null)
  const rArmPivot = useRef<THREE.Group>(null)
  const lArmPivot = useRef<THREE.Group>(null)
  const eyeL      = useRef<THREE.Mesh>(null)
  const eyeR      = useRef<THREE.Mesh>(null)

  const outfit = OUTFIT_COLORS[state.outfit]
  const scale  = GROWTH_SCALE[state.growth_stage]
  const aura   = MOOD_AURA_COLOR[state.mood]

  useFrame((stateThree) => {
    const t = stateThree.clock.getElapsedTime()
    if (!root.current) return

    // Idle — gentle breathing + sway
    const breathe = Math.sin(t * 2) * 0.015
    root.current.position.y = breathe
    root.current.rotation.y = Math.sin(t * 0.4) * 0.05

    // Head idle look
    if (headPivot.current && state.action !== 'nod') {
      headPivot.current.rotation.y = Math.sin(t * 0.6) * 0.08
      headPivot.current.rotation.x = 0
    }

    // Action animations
    switch (state.action) {
      case 'wave':
        if (rArmPivot.current) {
          rArmPivot.current.rotation.z = -1.2 + Math.sin(t * 12) * 0.4
          rArmPivot.current.rotation.x = -0.3
        }
        break
      case 'nod':
        if (headPivot.current) {
          headPivot.current.rotation.x = Math.sin(t * 8) * 0.35
          headPivot.current.rotation.y = 0
        }
        break
      case 'happy':
        // bouncy
        if (root.current) {
          root.current.position.y = breathe + Math.abs(Math.sin(t * 10)) * 0.15
        }
        if (rArmPivot.current) rArmPivot.current.rotation.z = -0.6 + Math.sin(t * 12) * 0.3
        if (lArmPivot.current) lArmPivot.current.rotation.z =  0.6 - Math.sin(t * 12) * 0.3
        break
      case 'sad':
        // slumped
        if (root.current) root.current.position.y = breathe - 0.08
        if (headPivot.current) headPivot.current.rotation.x = 0.3
        if (rArmPivot.current) rArmPivot.current.rotation.z = -0.1
        if (lArmPivot.current) lArmPivot.current.rotation.z =  0.1
        break
      case 'idle':
      default:
        if (rArmPivot.current) rArmPivot.current.rotation.z = -0.1 + Math.sin(t * 1.5) * 0.05
        if (lArmPivot.current) lArmPivot.current.rotation.z =  0.1 - Math.sin(t * 1.5) * 0.05
    }

    // Blink occasionally (not for surprised)
    if (eyeL.current && eyeR.current && state.expression !== 'surprised') {
      const blink = Math.sin(t * 0.8) > 0.97 ? 0.1 : 1
      eyeL.current.scale.y = blink
      eyeR.current.scale.y = blink
    }
  })

  // Mouth shape per expression
  const mouth = useMemo(() => {
    switch (state.expression) {
      case 'smile':     return { rotation: Math.PI, arc: Math.PI, scale: [1.2, 1, 1] as [number, number, number], offsetY: -0.12 }
      case 'sad':       return { rotation: 0,        arc: Math.PI, scale: [1.2, 1, 1] as [number, number, number], offsetY: -0.16 }
      case 'angry':     return { rotation: 0,        arc: Math.PI, scale: [0.8, 1, 1] as [number, number, number], offsetY: -0.18 }
      case 'surprised': return { rotation: 0,        arc: Math.PI * 2, scale: [1, 1, 1] as [number, number, number], offsetY: -0.14 }
      case 'neutral':
      default:          return { rotation: 0,        arc: Math.PI, scale: [1, 0.1, 1] as [number, number, number], offsetY: -0.14 }
    }
  }, [state.expression])

  // Eye color by expression
  const eyeColor = useMemo(() => {
    switch (state.expression) {
      case 'angry':     return '#dc2626'
      case 'sad':       return '#3b82f6'
      case 'surprised': return '#1e293b'
      case 'smile':     return '#1e293b'
      default:          return '#1e293b'
    }
  }, [state.expression])

  // Brow tilt for emotion
  const browTilt = useMemo(() => {
    switch (state.expression) {
      case 'angry':     return  0.4
      case 'sad':       return -0.4
      case 'surprised': return  0.2
      default:          return  0
    }
  }, [state.expression])

  // Eye scale for surprised
  const eyeScale = state.expression === 'surprised' ? 1.5 : 1

  return (
    <group ref={root} scale={scale} position={[0, 0, 0]}>

      {/* Mood aura — soft glowing disk under feet */}
      <mesh position={[0, -1.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.8, 32]} />
        <meshBasicMaterial color={aura} transparent opacity={0.25} />
      </mesh>

      {/* Body — capsule */}
      <mesh position={[0, -0.2, 0]} castShadow>
        <capsuleGeometry args={[0.32, 0.7, 8, 24]} />
        <meshStandardMaterial color={outfit.body} roughness={0.6} metalness={0.1} />
      </mesh>

      {/* Belt accent */}
      <mesh position={[0, -0.45, 0]}>
        <torusGeometry args={[0.32, 0.04, 8, 24]} />
        <meshStandardMaterial color={outfit.accent} roughness={0.4} metalness={0.3} />
      </mesh>

      {/* Head */}
      <group ref={headPivot} position={[0, 0.55, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.34, 32, 32]} />
          <meshStandardMaterial color="#fde2c8" roughness={0.7} />
        </mesh>

        {/* Hair cap */}
        <mesh position={[0, 0.08, -0.02]} rotation={[0.2, 0, 0]}>
          <sphereGeometry args={[0.355, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color={outfit.accent} roughness={0.5} />
        </mesh>

        {/* Left eye */}
        <mesh ref={eyeL} position={[-0.11, 0.04, 0.30]} scale={eyeScale}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshStandardMaterial color={eyeColor} />
        </mesh>
        {/* Right eye */}
        <mesh ref={eyeR} position={[0.11, 0.04, 0.30]} scale={eyeScale}>
          <sphereGeometry args={[0.045, 16, 16]} />
          <meshStandardMaterial color={eyeColor} />
        </mesh>

        {/* Brows */}
        <mesh position={[-0.11, 0.13, 0.30]} rotation={[0, 0,  browTilt]}>
          <boxGeometry args={[0.07, 0.012, 0.02]} />
          <meshStandardMaterial color="#3b2218" />
        </mesh>
        <mesh position={[0.11,  0.13, 0.30]} rotation={[0, 0, -browTilt]}>
          <boxGeometry args={[0.07, 0.012, 0.02]} />
          <meshStandardMaterial color="#3b2218" />
        </mesh>

        {/* Mouth */}
        <mesh position={[0, mouth.offsetY, 0.31]} rotation={[0, 0, mouth.rotation]} scale={mouth.scale}>
          <torusGeometry args={[0.07, 0.012, 8, 24, mouth.arc]} />
          <meshStandardMaterial color="#7f1d1d" />
        </mesh>

        {/* Cheek blush — only when happy/smile */}
        {(state.expression === 'smile' || state.mood === 'happy') && (
          <>
            <mesh position={[-0.18, -0.05, 0.27]}>
              <sphereGeometry args={[0.04, 8, 8]} />
              <meshStandardMaterial color="#fb7185" transparent opacity={0.6} />
            </mesh>
            <mesh position={[0.18, -0.05, 0.27]}>
              <sphereGeometry args={[0.04, 8, 8]} />
              <meshStandardMaterial color="#fb7185" transparent opacity={0.6} />
            </mesh>
          </>
        )}
      </group>

      {/* Right arm pivot at shoulder */}
      <group ref={rArmPivot} position={[0.36, 0.18, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.5, 6, 12]} />
          <meshStandardMaterial color={outfit.body} roughness={0.6} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.62, 0]}>
          <sphereGeometry args={[0.085, 16, 16]} />
          <meshStandardMaterial color="#fde2c8" />
        </mesh>
      </group>

      {/* Left arm */}
      <group ref={lArmPivot} position={[-0.36, 0.18, 0]}>
        <mesh position={[0, -0.32, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.5, 6, 12]} />
          <meshStandardMaterial color={outfit.body} roughness={0.6} />
        </mesh>
        <mesh position={[0, -0.62, 0]}>
          <sphereGeometry args={[0.085, 16, 16]} />
          <meshStandardMaterial color="#fde2c8" />
        </mesh>
      </group>

      {/* Legs */}
      <mesh position={[-0.13, -0.85, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.32, 6, 12]} />
        <meshStandardMaterial color={outfit.accent} roughness={0.7} />
      </mesh>
      <mesh position={[0.13, -0.85, 0]} castShadow>
        <capsuleGeometry args={[0.09, 0.32, 6, 12]} />
        <meshStandardMaterial color={outfit.accent} roughness={0.7} />
      </mesh>
    </group>
  )
}
