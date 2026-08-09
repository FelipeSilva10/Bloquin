import { useEffect, useRef, useState } from 'react';
import logoCompleta from '../assets/LogoCompleta.png';
import './SplashScreen.css';

const SPLASH_DURATION_MS = 2400;
const REDUCED_SPLASH_DURATION_MS = 220;

interface SplashScreenProps {
  ready: boolean;
  onFinished: () => void;
}

function getReducedMotionPreference() {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function SplashScreen({ ready, onFinished }: SplashScreenProps) {
  const startedAtRef = useRef(Date.now());
  const finishedRef = useRef(false);
  const [exiting, setExiting] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(getReducedMotionPreference);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReducedMotion(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, []);

  useEffect(() => {
    if (!ready || exiting) return;

    const minimumDuration = reducedMotion
      ? REDUCED_SPLASH_DURATION_MS
      : SPLASH_DURATION_MS;
    const elapsed = Date.now() - startedAtRef.current;
    const remaining = Math.max(0, minimumDuration - elapsed);
    const timer = window.setTimeout(() => setExiting(true), remaining);

    return () => window.clearTimeout(timer);
  }, [exiting, ready, reducedMotion]);

  useEffect(() => {
    if (!exiting) return;

    // O fallback evita manter a camada montada caso o WebView não emita
    // transitionend, sem cortar a transição normal.
    const timer = window.setTimeout(() => {
      if (!finishedRef.current) {
        finishedRef.current = true;
        onFinished();
      }
    }, reducedMotion ? 260 : 520);

    return () => window.clearTimeout(timer);
  }, [exiting, onFinished, reducedMotion]);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinished();
  };

  return (
    <div
      className={`bloquin-splash-screen${exiting ? ' bloquin-splash-screen--exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Abrindo o Bloquin IDE"
      onTransitionEnd={(event) => {
        if (event.propertyName === 'opacity') finish();
      }}
    >
      <div className="bloquin-splash-logo" aria-hidden="true">
        <img
          src={logoCompleta}
          alt=""
          className="bloquin-splash-logo-image"
          draggable="false"
        />
      </div>
    </div>
  );
}
