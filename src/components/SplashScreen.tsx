import { useEffect, useRef, useState, type CSSProperties } from 'react';
import logoCompleta from '../assets/LogoCompleta.png';

const LOGO_WIDTH = 2172;
const SPLASH_DURATION_MS = 2400;
const REDUCED_SPLASH_DURATION_MS = 220;

// Cortes horizontais da marca. Cada fatia continua apontando para a mesma
// imagem; o CSS centraliza o canvas verticalmente e recorta somente a margem
// transparente, deixando uma letra por vez visível durante a animação.
const LETTER_CUTS = [0, 346, 656, 963, 1276, 1553, 1855, LOGO_WIDTH] as const;
const LETTER_ROTATIONS = [-5, 4, -4, 3, -3, 4, -4] as const;
const LETTER_NAMES = ['b', 'l', 'o', 'q', 'u', 'i', 'n'] as const;

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
      className={`splash-screen${exiting ? ' splash-screen--exiting' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Abrindo o Bloquin IDE"
      onTransitionEnd={(event) => {
        if (event.propertyName === 'opacity') finish();
      }}
    >
      <div className="splash-logo" aria-hidden="true">
        {LETTER_NAMES.map((letter, index) => {
          const from = LETTER_CUTS[index];
          const to = LETTER_CUTS[index + 1];
          const width = to - from;
          const style = {
            '--splash-left': `${(from / LOGO_WIDTH) * 100}%`,
            '--splash-width': `${(width / LOGO_WIDTH) * 100}%`,
            '--splash-image-left': `${(-from / width) * 100}%`,
            '--splash-image-width': `${(LOGO_WIDTH / width) * 100}%`,
            '--splash-delay': `${index * 105}ms`,
            '--splash-rotation': `${LETTER_ROTATIONS[index]}deg`,
          } as CSSProperties;

          return (
            <span
              className="splash-letter"
              style={style}
              data-letter={letter}
              key={letter}
            >
              <img
                src={logoCompleta}
                alt=""
                className="splash-letter-image"
                draggable="false"
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
