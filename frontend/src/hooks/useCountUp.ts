import { useEffect, useRef, useState } from "react";

/**
 * Animates a number counting up from 0 to `target` whenever `target` changes.
 * Used to give stat tiles a bit of life instead of just snapping to a value.
 */
export function useCountUp(target: number, durationMs = 900) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = 0;
    startRef.current = null;

    let raf: number;

    function step(timestamp: number) {
      if (startRef.current === null) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(1, elapsed / durationMs);
      // ease-out-cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(fromRef.current + (target - fromRef.current) * eased);

      if (progress < 1) {
        raf = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    }

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return value;
}
