'use client';

import { createContext, useContext, useCallback, useEffect, useState, useSyncExternalStore, ReactNode } from 'react';
import type { CharacterPose } from './CharacterViewer';

interface CharacterConfig {
  character: string;
  animation: string;
  talkingAnimation: string;
  initialHidden: boolean;
}

interface CharacterConfigContextType extends CharacterConfig {
  characterHidden: boolean;
  toggleCharacter: () => void;
  characterPose: CharacterPose;
}

const CharacterConfigContext = createContext<CharacterConfigContextType>({
  character: 'default_character.glb',
  animation: 'procedural',
  talkingAnimation: 'procedural',
  initialHidden: false,
  characterHidden: false,
  toggleCharacter: () => {},
  characterPose: 'idle',
});

function subscribeToKey(key: string, notify: () => void): () => void {
  const customEvent = `spear:local:${key}`;
  const onStorage = (e: StorageEvent) => {
    if (e.key === key) notify();
  };
  const onCustom = () => notify();
  window.addEventListener('storage', onStorage);
  window.addEventListener(customEvent, onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(customEvent, onCustom);
  };
}

function readKey(key: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return defaultValue;
    return stored === 'true';
  } catch {
    return defaultValue;
  }
}

function writeKey(key: string, next: boolean): void {
  try {
    localStorage.setItem(key, String(next));
  } catch {}
  window.dispatchEvent(new Event(`spear:local:${key}`));
}

/**
 * Hydration-safe persisted boolean backed by localStorage.
 * Uses useSyncExternalStore so the server snapshot (defaultValue) is used
 * during SSR/hydration and the client value is picked up after mount —
 * no localStorage reads in render, no setState-in-effect.
 */
export function usePersistentBoolean(key: string, defaultValue: boolean): [boolean, (next: boolean) => void, () => void] {
  const value = useSyncExternalStore(
    (notify) => subscribeToKey(key, notify),
    () => readKey(key, defaultValue),
    () => defaultValue,
  );

  const set = useCallback((next: boolean) => writeKey(key, next), [key]);

  const toggle = useCallback(() => writeKey(key, !readKey(key, defaultValue)), [key, defaultValue]);

  return [value, set, toggle];
}

export function CharacterConfigProvider({
  children,
  character,
  animation,
  talkingAnimation,
  initialHidden = false,
}: {
  children: ReactNode;
  character: string;
  animation: string;
  talkingAnimation: string;
  initialHidden?: boolean;
}) {
  const [characterHidden, , toggleCharacter] = usePersistentBoolean('spear_hide_character', initialHidden);
  const [characterPose, setCharacterPose] = useState<CharacterPose>('idle');

  useEffect(() => {
    const handlePose = (e: Event) => {
      setCharacterPose((e as CustomEvent).detail as CharacterPose);
    };
    window.addEventListener('character-pose', handlePose);
    return () => window.removeEventListener('character-pose', handlePose);
  }, []);

  return (
    <CharacterConfigContext.Provider
      value={{ character, animation, talkingAnimation, initialHidden, characterHidden, toggleCharacter, characterPose }}
    >
      {children}
    </CharacterConfigContext.Provider>
  );
}

export function useCharacterConfig() {
  return useContext(CharacterConfigContext);
}
