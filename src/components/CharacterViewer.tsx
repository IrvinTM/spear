'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, VRMAnimation, createVRMAnimationClip } from '@pixiv/three-vrm-animation';

export type CharacterPose = 'idle' | 'thinking' | 'speaking';

function VRMModel({ url, pose, animationUrl, talkingAnimationUrl }: { url: string; pose: CharacterPose; animationUrl?: string; talkingAnimationUrl?: string }) {
  const [vrm, setVrm] = useState<VRM | null>(null);
  const [standardGltf, setStandardGltf] = useState<THREE.Group | null>(null);
  const [mixer, setMixer] = useState<THREE.AnimationMixer | null>(null);
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const actionsRef = useRef<{ idle?: THREE.AnimationAction; talking?: THREE.AnimationAction }>({});
  const { scene } = useThree();

  useEffect(() => {
    // Prevent memory leaks by disposing of old model when URL changes
    if (vrm) {
      scene.remove(vrm.scene);
      vrm.scene.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m: any) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    if (standardGltf) {
      scene.remove(standardGltf);
    }

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    
    loader.load(url, (gltf) => {
      const vrmData = gltf.userData.vrm as VRM | undefined;
      
      if (vrmData) {
        vrmData.scene.rotation.y = Math.PI; // Face camera
        setVrm(vrmData);
      } else {
        // Fallback for standard .glb files (non-VRM)
        gltf.scene.rotation.y = Math.PI;
        // Adjust position slightly to center standard models
        gltf.scene.position.y = -1;
        setStandardGltf(gltf.scene);
      }
    });

    return () => {
      if (vrm) scene.remove(vrm.scene);
      if (standardGltf) scene.remove(standardGltf);
    }
  }, [url]);

  useEffect(() => {
    if (!vrm) {
      setMixer(null);
      actionsRef.current = {};
      currentActionRef.current = null;
      return;
    }

    const newMixer = new THREE.AnimationMixer(vrm.scene);
    setMixer(newMixer);
    actionsRef.current = {};
    currentActionRef.current = null;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    
    const playCurrentPose = () => {
       const targetKey = pose === 'speaking' ? 'talking' : 'idle';
       const targetAction = actionsRef.current[targetKey as keyof typeof actionsRef.current] || actionsRef.current.idle;
       if (targetAction && targetAction !== currentActionRef.current) {
         targetAction.reset().play();
         if (currentActionRef.current) {
           targetAction.crossFadeFrom(currentActionRef.current, 0.5, true);
         }
         currentActionRef.current = targetAction;
       }
    };

    if (animationUrl) {
      loader.load(animationUrl, (gltf) => {
        const vrmAnimation = gltf.userData.vrmAnimations?.[0] || gltf.userData.vrmAnimation;
        if (vrmAnimation) {
          actionsRef.current.idle = newMixer.clipAction(createVRMAnimationClip(vrmAnimation, vrm));
          playCurrentPose();
        }
      });
    }
    
    if (talkingAnimationUrl) {
      loader.load(talkingAnimationUrl, (gltf) => {
        const vrmAnimation = gltf.userData.vrmAnimations?.[0] || gltf.userData.vrmAnimation;
        if (vrmAnimation) {
          actionsRef.current.talking = newMixer.clipAction(createVRMAnimationClip(vrmAnimation, vrm));
          playCurrentPose();
        }
      });
    }
  }, [vrm, animationUrl, talkingAnimationUrl]);

  useEffect(() => {
    const targetKey = pose === 'speaking' ? 'talking' : 'idle';
    const targetAction = actionsRef.current[targetKey as keyof typeof actionsRef.current] || actionsRef.current.idle;
    if (targetAction && targetAction !== currentActionRef.current) {
      targetAction.reset().play();
      if (currentActionRef.current) {
        targetAction.crossFadeFrom(currentActionRef.current, 0.5, true);
      }
      currentActionRef.current = targetAction;
    }
  }, [pose]);

  // Idle animations
  useFrame(({ clock }, delta) => {
    if (!vrm) return;
    const dt = delta;
    const t = clock.elapsedTime;
    
    // Breathing: subtle chest scale
    const chest = vrm.humanoid?.getNormalizedBoneNode('chest');
    if (chest) {
      chest.scale.y = 1 + Math.sin(t * 1.5) * 0.008;
      chest.scale.x = 1 + Math.sin(t * 1.5) * 0.003;
      chest.scale.z = 1 + Math.sin(t * 1.5) * 0.003;
    }
    
    // Only apply procedural body poses if we aren't running a custom animation
    if (currentActionRef.current && mixer) {
      mixer.update(dt);
    } else {
      // Sway: gentle spine rotation
      const spine = vrm.humanoid?.getNormalizedBoneNode('spine');
      if (spine) {
        spine.rotation.z = Math.sin(t * 0.8) * 0.015;
        spine.rotation.x = Math.sin(t * 1.2) * 0.005;
      }

    // Poses
    const leftUpper = vrm.humanoid?.getNormalizedBoneNode('leftUpperArm');
    const rightUpper = vrm.humanoid?.getNormalizedBoneNode('rightUpperArm');
    const leftLower = vrm.humanoid?.getNormalizedBoneNode('leftLowerArm');
    const rightLower = vrm.humanoid?.getNormalizedBoneNode('rightLowerArm');
    const neck = vrm.humanoid?.getNormalizedBoneNode('neck');

    const dt = delta;
    const lerp = (obj: any, target: number) => {
      if (obj) obj.value = THREE.MathUtils.lerp(obj.value, target, dt * 5);
    };
    
    // Reset all expressions smoothly
    if (vrm.expressionManager) {
      ['a', 'neutral'].forEach(exp => {
        const val = vrm.expressionManager!.getValue(exp) || 0;
        vrm.expressionManager!.setValue(exp, THREE.MathUtils.lerp(val, 0, dt * 5));
      });
    }

    if (pose === 'thinking') {
      // Left hand on chin
      if (leftUpper) {
        leftUpper.rotation.z = THREE.MathUtils.lerp(leftUpper.rotation.z, 0.4, dt * 5);
        leftUpper.rotation.x = THREE.MathUtils.lerp(leftUpper.rotation.x, -0.2, dt * 5);
      }
      if (leftLower) {
        leftLower.rotation.z = THREE.MathUtils.lerp(leftLower.rotation.z, 2.2, dt * 5);
        leftLower.rotation.x = THREE.MathUtils.lerp(leftLower.rotation.x, -0.5, dt * 5);
      }
      if (rightUpper) {
        rightUpper.rotation.z = THREE.MathUtils.lerp(rightUpper.rotation.z, -1.2, dt * 5);
        rightUpper.rotation.x = THREE.MathUtils.lerp(rightUpper.rotation.x, 0, dt * 5);
      }
      if (rightLower) rightLower.rotation.z = THREE.MathUtils.lerp(rightLower.rotation.z, 0, dt * 5);
      if (neck) neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, 0.15, dt * 5);
      
    } else if (pose === 'speaking') {
      // Gesturing and lip sync
      if (leftUpper) {
        leftUpper.rotation.z = THREE.MathUtils.lerp(leftUpper.rotation.z, 0.8 + Math.sin(t * 3) * 0.1, dt * 5);
        leftUpper.rotation.x = THREE.MathUtils.lerp(leftUpper.rotation.x, -0.2, dt * 5);
      }
      if (leftLower) leftLower.rotation.z = THREE.MathUtils.lerp(leftLower.rotation.z, 0.8, dt * 5);
      if (rightUpper) {
        rightUpper.rotation.z = THREE.MathUtils.lerp(rightUpper.rotation.z, -0.8 - Math.sin(t * 2.5) * 0.1, dt * 5);
        rightUpper.rotation.x = THREE.MathUtils.lerp(rightUpper.rotation.x, -0.2, dt * 5);
      }
      if (rightLower) rightLower.rotation.z = THREE.MathUtils.lerp(rightLower.rotation.z, -0.5, dt * 5);
      if (neck) neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, -0.05, dt * 5);
      
      // Simulate talking (even if custom animation is running)
      if (vrm.expressionManager) {
        const talkVol = Math.max(0, Math.sin(t * 20) * 0.8 + 0.2);
        vrm.expressionManager.setValue('a', Math.max(vrm.expressionManager.getValue('a') || 0, talkVol));
      }
      
    }
    
    // Blink: periodic eye close
      if (leftUpper) {
        leftUpper.rotation.z = THREE.MathUtils.lerp(leftUpper.rotation.z, 1.2 + Math.sin(t * 1.5) * 0.02, dt * 5);
        leftUpper.rotation.x = THREE.MathUtils.lerp(leftUpper.rotation.x, 0, dt * 5);
      }
      if (leftLower) {
        leftLower.rotation.z = THREE.MathUtils.lerp(leftLower.rotation.z, 0, dt * 5);
        ['a', 'neutral'].forEach(exp => {
          const val = vrm.expressionManager!.getValue(exp) || 0;
          vrm.expressionManager!.setValue(exp, THREE.MathUtils.lerp(val, 0, dt * 5));
        });
      }

      if (pose === 'thinking') {
        // Left hand on chin
        if (leftUpper) {
          leftUpper.rotation.z = THREE.MathUtils.lerp(leftUpper.rotation.z, 0.4, dt * 5);
          leftUpper.rotation.x = THREE.MathUtils.lerp(leftUpper.rotation.x, -0.2, dt * 5);
        }
        if (leftLower) {
          leftLower.rotation.z = THREE.MathUtils.lerp(leftLower.rotation.z, 2.2, dt * 5);
          leftLower.rotation.x = THREE.MathUtils.lerp(leftLower.rotation.x, -0.5, dt * 5);
        }
        if (rightUpper) {
          rightUpper.rotation.z = THREE.MathUtils.lerp(rightUpper.rotation.z, -1.2, dt * 5);
          rightUpper.rotation.x = THREE.MathUtils.lerp(rightUpper.rotation.x, 0, dt * 5);
        }
        if (rightLower) rightLower.rotation.z = THREE.MathUtils.lerp(rightLower.rotation.z, 0, dt * 5);
        if (neck) neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, 0.15, dt * 5);
        
      } else if (pose === 'speaking') {
        // Gesturing and lip sync
        if (leftUpper) {
          leftUpper.rotation.z = THREE.MathUtils.lerp(leftUpper.rotation.z, 0.8 + Math.sin(t * 3) * 0.1, dt * 5);
          leftUpper.rotation.x = THREE.MathUtils.lerp(leftUpper.rotation.x, -0.2, dt * 5);
        }
        if (leftLower) leftLower.rotation.z = THREE.MathUtils.lerp(leftLower.rotation.z, 0.8, dt * 5);
        if (rightUpper) {
          rightUpper.rotation.z = THREE.MathUtils.lerp(rightUpper.rotation.z, -0.8 - Math.sin(t * 2.5) * 0.1, dt * 5);
          rightUpper.rotation.x = THREE.MathUtils.lerp(rightUpper.rotation.x, -0.2, dt * 5);
        }
        if (rightLower) rightLower.rotation.z = THREE.MathUtils.lerp(rightLower.rotation.z, -0.5, dt * 5);
        if (neck) neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, -0.05, dt * 5);
        
        // Simulate talking (even if custom animation is running)
        if (vrm.expressionManager) {
          const talkVol = Math.max(0, Math.sin(t * 20) * 0.8 + 0.2);
          vrm.expressionManager.setValue('a', Math.max(vrm.expressionManager.getValue('a') || 0, talkVol));
        }
      }
      
      if (rightUpper) {
        rightUpper.rotation.z = THREE.MathUtils.lerp(rightUpper.rotation.z, -1.2 - Math.sin(t * 1.5) * 0.02, dt * 5);
        rightUpper.rotation.x = THREE.MathUtils.lerp(rightUpper.rotation.x, 0, dt * 5);
      }
      if (rightLower) rightLower.rotation.z = THREE.MathUtils.lerp(rightLower.rotation.z, 0, dt * 5);
      if (neck) neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, 0, dt * 5);
    }
    
    // Blink: periodic eye close
    if (vrm.expressionManager) {
      const blinkCycle = t % 4;
      const blinkValue = blinkCycle > 3.8 ? 
        Math.sin((blinkCycle - 3.8) * Math.PI / 0.2) : 0;
      // Additive blink to not override existing expressions abruptly
      vrm.expressionManager.setValue('blink', blinkValue);
    }
    
    vrm.update(delta);
  });

  // Hover animation for standard GLB models (since they lack VRM bones)
  useFrame(({ clock }) => {
    if (!standardGltf) return;
    const t = clock.elapsedTime;
    standardGltf.position.y = -1 + Math.sin(t * 2) * 0.05;
  });

  if (vrm) return <primitive object={vrm.scene} />;
  if (standardGltf) return <primitive object={standardGltf} />;
  return null;
}

export function CharacterViewer({ 
  characterUrl,
  animationUrl,
  talkingAnimationUrl,
  pose = 'idle',
  className 
}: { 
  characterUrl: string;
  animationUrl?: string;
  talkingAnimationUrl?: string;
  pose?: CharacterPose;
  className?: string;
}) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 1.2, 2.5], fov: 30 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 2]} intensity={0.8} />
        <Suspense fallback={null}>
          <VRMModel url={characterUrl} pose={pose} animationUrl={animationUrl} talkingAnimationUrl={talkingAnimationUrl} />
        </Suspense>
        <OrbitControls
          target={[0, 1.1, 0]}
          minDistance={1.0}
          maxDistance={4}
          minPolarAngle={Math.PI / 6}
          maxPolarAngle={Math.PI / 1.9}
          enablePan={false}
        />
      </Canvas>
    </div>
  );
}
