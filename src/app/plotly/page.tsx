'use client';

import { useEffect, useRef } from 'react';

export default function PlotlyPage() {
  const plotRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!plotRef.current) return;

    // Dynamically import Plotly in the browser
    // @ts-ignore
    import('plotly.js-dist').then((Plotly) => {
      Plotly.newPlot(plotRef.current!, [
        { x: [1, 2, 3, 4, 5], y: [1, 2, 4, 8, 16] },
      ]);
      console.log('Plotly version:', (Plotly as any).BUILD);
    });
  }, []);

  return (
    <div style={{ width: '90%', height: '250px' }}>
      <p>
        Here&apos;s a simple Plotly plot
        {' '}
        <a
          href="https://bit.ly/1Or9igj"
          target="_blank"
          rel="noreferrer"
        >
          plotly.js documentation
        </a>
      </p>

      <div
        id="tester"
        ref={plotRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
