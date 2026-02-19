import { useRef, useState, useEffect, useMemo } from 'react';

interface SpiralBindingProps {
  layer: 'back' | 'front';
}

const RING_SPACING = 28;
const EDGE_PADDING = 16;
const RING_RX = 7;
const RING_RY = 11;
const WIRE_WIDTH = 2.8;
const SVG_HEIGHT = 26;
const CENTER_Y = SVG_HEIGHT / 2;

export function SpiralBinding({ layer }: SpiralBindingProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(280);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { paths, gradientId } = useMemo(() => {
    const gId = `spiral-grad-${layer}`;
    const count = Math.max(3, Math.floor((containerWidth - EDGE_PADDING * 2) / RING_SPACING));
    const totalWidth = count * RING_SPACING;
    const startX = (containerWidth - totalWidth) / 2 + RING_SPACING / 2;

    const p: string[] = [];
    for (let i = 0; i < count; i++) {
      const cx = startX + i * RING_SPACING;
      if (layer === 'back') {
        // Bottom semicircle — the wire going behind the paper
        p.push(
          `M ${cx - RING_RX} ${CENTER_Y} A ${RING_RX} ${RING_RY} 0 0 0 ${cx + RING_RX} ${CENTER_Y}`
        );
      } else {
        // Top semicircle — the wire arcing over the top edge
        p.push(
          `M ${cx - RING_RX} ${CENTER_Y} A ${RING_RX} ${RING_RY} 0 0 1 ${cx + RING_RX} ${CENTER_Y}`
        );
      }
    }
    return { paths: p, gradientId: gId };
  }, [containerWidth, layer]);

  return (
    <div
      ref={containerRef}
      className={`spiral-binding-container spiral-binding-${layer}`}
    >
      <svg
        width={containerWidth}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${containerWidth} ${SVG_HEIGHT}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {layer === 'front' ? (
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d8d8d8" />
              <stop offset="20%" stopColor="#eeeeee" />
              <stop offset="40%" stopColor="#ffffff" />
              <stop offset="55%" stopColor="#f0f0f0" />
              <stop offset="75%" stopColor="#c0c0c0" />
              <stop offset="100%" stopColor="#a8a8a8" />
            </linearGradient>
          ) : (
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a0a0a0" />
              <stop offset="50%" stopColor="#888888" />
              <stop offset="100%" stopColor="#a0a0a0" />
            </linearGradient>
          )}
        </defs>

        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={WIRE_WIDTH}
            strokeLinecap="round"
          />
        ))}
      </svg>
    </div>
  );
}
