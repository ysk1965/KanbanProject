
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars, Environment, Box, Sphere, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

const GlowSpot: React.FC<{ position: [number, number, number]; color: string; size?: number; delay?: number }> = ({ position, color, size = 0.15, delay = 0 }) => {
  const ref = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.getElapsedTime() + delay;
      const pulse = Math.sin(t * 1.5) * 0.15 + 1;
      ref.current.scale.set(pulse, pulse, pulse);
    }
  });

  return (
    <group position={position}>
      <Sphere ref={ref} args={[size, 32, 32]}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={1.5}
          metalness={1}
          roughness={0}
        />
      </Sphere>
      <pointLight color={color} intensity={1.5} distance={4} />
    </group>
  );
};

const DataPacket: React.FC<{ start: THREE.Vector3; end: THREE.Vector3; delay: number; color: string }> = ({ start, end, delay, color }) => {
  const ref = useRef<THREE.Mesh>(null);
  const direction = useMemo(() => new THREE.Vector3().subVectors(end, start), [start, end]);
  
  useFrame((state) => {
    if (ref.current) {
      const duration = 4;
      const progress = ((state.clock.getElapsedTime() + delay) % duration) / duration;
      ref.current.position.copy(start).addScaledVector(direction, progress);
      const opacity = Math.sin(progress * Math.PI);
      if (ref.current.material instanceof THREE.MeshStandardMaterial) {
        ref.current.material.opacity = opacity;
      }
    }
  });

  return (
    <Sphere ref={ref} args={[0.03, 16, 16]}>
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} transparent />
    </Sphere>
  );
};

const ConnectionLine: React.FC<{ start: [number, number, number]; end: [number, number, number]; color?: string }> = ({ start, end, color = "#6366F1" }) => {
  const geometry = useMemo(() => {
    const points = [
      new THREE.Vector3(...start),
      new THREE.Vector3(...end)
    ];
    return new THREE.BufferGeometry().setFromPoints(points);
  }, [start, end]);

  const LineComponent = 'line' as any;

  return (
    <LineComponent geometry={geometry}>
      <lineBasicMaterial color={color} transparent opacity={0.15} />
    </LineComponent>
  );
};

const SpotNetwork = () => {
  const ref = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.04) * 0.12;
      ref.current.rotation.x = Math.cos(state.clock.getElapsedTime() * 0.04) * 0.06;
    }
  });

  const nodes = useMemo(() => [
    { pos: [-6, -1.5, 0] as [number, number, number], color: "#6366F1" },
    { pos: [-3, 2, 1] as [number, number, number], color: "#818CF8" },
    { pos: [0, -2, 0] as [number, number, number], color: "#2DD4BF" },
    { pos: [4, 1.5, -1.5] as [number, number, number], color: "#6366F1" },
    { pos: [6, -1, 0] as [number, number, number], color: "#2DD4BF" }
  ], []);

  const nodeVectors = useMemo(() => nodes.map(n => new THREE.Vector3(...n.pos)), [nodes]);

  return (
    <group ref={ref}>
      {nodes.map((node, i) => (
        <GlowSpot key={i} position={node.pos} color={node.color} size={0.14} delay={i} />
      ))}
      
      {nodes.map((node, i) => {
        if (i === nodes.length - 1) return null;
        const next = nodes[i + 1];
        return (
          <group key={`conn-${i}`}>
            <ConnectionLine start={node.pos} end={next.pos} color={node.color} />
            <DataPacket start={nodeVectors[i]} end={nodeVectors[i+1]} delay={i * 2} color={next.color} />
            <DataPacket start={nodeVectors[i]} end={nodeVectors[i+1]} delay={i * 2 + 1.5} color={node.color} />
          </group>
        );
      })}

      <Float speed={2.5} rotationIntensity={1.5} floatIntensity={1.5}>
        <Sphere args={[0.6, 32, 32]} position={[3, -3, -4]}>
          <MeshDistortMaterial color="#6366F1" emissive="#6366F1" emissiveIntensity={0.6} distort={0.5} speed={2} transparent opacity={0.3} />
        </Sphere>
      </Float>
      <Float speed={2} rotationIntensity={1.5} floatIntensity={1.5}>
        <Sphere args={[0.5, 32, 32]} position={[-4, 3, -3]}>
          <MeshDistortMaterial color="#2DD4BF" emissive="#2DD4BF" emissiveIntensity={0.6} distort={0.4} speed={1.5} transparent opacity={0.2} />
        </Sphere>
      </Float>
    </group>
  );
};

export const HeroScene: React.FC = () => {
  return (
    <div className="absolute inset-0 z-0 opacity-100 pointer-events-none bg-[#0A0E17]">
      <Canvas camera={{ position: [0, 0, 12], fov: 42 }}>
        <fog attach="fog" args={['#0A0E17', 8, 28]} />
        <ambientLight intensity={0.15} />
        <pointLight position={[12, 12, 12]} intensity={1.2} color="#6366F1" />
        <spotLight position={[-12, 12, 12]} angle={0.35} penumbra={1} intensity={1.2} color="#2DD4BF" />
        
        <Float speed={1.8} rotationIntensity={0.15} floatIntensity={0.25}>
          <SpotNetwork />
        </Float>
        
        <Stars radius={160} depth={50} count={5000} factor={7} saturation={1} fade speed={1.2} />
        <Environment preset="night" />
      </Canvas>
    </div>
  );
};

export const KanbanScene: React.FC = () => {
  return (
    <div className="w-full h-full absolute inset-0 bg-[#0A0E17]">
      <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
        <ambientLight intensity={0.6} />
        <Environment preset="night" />
        <Float rotationIntensity={0.6} floatIntensity={0.6} speed={2}>
           <group>
             <Sphere args={[0.6, 32, 32]} position={[-2, 0, 0]}>
                <meshStandardMaterial color="#6366F1" emissive="#6366F1" emissiveIntensity={2.5} />
             </Sphere>
             <Sphere args={[0.6, 32, 32]} position={[0, 0, 0]}>
                <meshStandardMaterial color="#2DD4BF" emissive="#2DD4BF" emissiveIntensity={2.5} />
             </Sphere>
             <Sphere args={[0.6, 32, 32]} position={[2, 0, 0]}>
                <meshStandardMaterial color="#818CF8" emissive="#818CF8" emissiveIntensity={2.5} />
             </Sphere>
           </group>
        </Float>
      </Canvas>
    </div>
  );
}
