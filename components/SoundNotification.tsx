// components/SoundNotification.tsx

'use client';

import { useEffect, useRef } from 'react';

interface SoundNotificationProps {
  playSound: boolean;
  volume?: number; // 0.0 to 1.0
}

export function SoundNotification({ playSound, volume = 0.7 }: SoundNotificationProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio once
    audioRef.current = new Audio('/oberon.mp3');
    audioRef.current.volume = volume;
    audioRef.current.preload = 'auto';

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [volume]);

  useEffect(() => {
    // Play sound when trigger changes to true
    if (playSound && audioRef.current) {
      audioRef.current.currentTime = 0; // Restart from beginning
      audioRef.current.play().catch((err) => {
        console.warn('Audio play failed (browser may require user interaction):', err);
      });
    }
  }, [playSound]);

  return null; // This component doesn't render anything visible
}
