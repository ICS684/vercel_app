'use client';

import { useEffect, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import Papa, { type ParseResult } from 'papaparse';
import { scaleLinear } from 'd3-scale';

// Dynamically import Plotly since it requires the browser
const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
}) as unknown as ComponentType<any>;

// One row per spatial bin in the pre-binned CSVs
type Row = {
  lat_bin?: number | string;
  lon_bin?: number | string;
  [key: string]: any; // year columns like "2000", "2001", ...
};

type GroupedData = {
  lat: number;
  lon: number;
  avgPrice: number;
};

function getBinSizeFromZoom(zoom: number): number {
  if (zoom < 4) return 1.0;
  if (zoom < 6) return 0.5;
  return 0.25;
}

function getDataUrlForBinSize(binSize: number): string {
  if (binSize === 1.0) return '/binned_year_averages_1_0deg.csv';
  if (binSize === 0.5) return '/binned_year_averages_0_5deg.csv';
  // default to finest
  return '/binned_year_averages_0_25deg.csv';
}

const BubbleMap = () => {
  const [groupedData, setGroupedData] = useState<GroupedData[]>([]);
  const [loading, setLoading] = useState(true);

  const [startYear, setStartYear] = useState(2000);
  const [endYear, setEndYear] = useState(2010);

  const [zoom, setZoom] = useState(3);
  const [binSize, setBinSize] = useState(1.0); // matches initial zoom

  // overlay: 'visible' -> 'fading' (1s) -> 'hidden'
  const [overlayState, setOverlayState] = useState<'visible' | 'fading' | 'hidden'>('visible');

  const wrapperStyle = {
    padding: 16,
    boxSizing: 'border-box' as const,
    color: '#e5e7eb',
  };

  const cardStyle = {
    maxWidth: 1200,
    margin: '0 auto',
    padding: 16,
    borderRadius: 16,
    background: 'rgba(15,23,42,0.9)',
    boxShadow: '0 24px 60px rgba(15,23,42,0.9)',
    boxSizing: 'border-box' as const,
    position: 'relative' as const, // so overlay can absolutely-position over it
    overflow: 'hidden' as const,
  };

  const controlsRowStyle = {
    marginBottom: 20,
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  };

  const selectStyle = {
    marginLeft: 8,
    backgroundColor: '#020617',
    color: '#e5e7eb',
    borderRadius: 8,
    border: '1px solid #4b5563',
    padding: '4px 8px',
  };

  // Update bin size whenever zoom changes enough to cross thresholds
  useEffect(() => {
    const newBinSize = getBinSizeFromZoom(zoom);
    if (newBinSize !== binSize) {
      setBinSize(newBinSize);
    }
  }, [zoom, binSize]);

  // Load CSV + compute averages for selected years whenever
  // binSize or year range changes
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const dataUrl = getDataUrlForBinSize(binSize);
        const res = await fetch(dataUrl);
        const text = await res.text();

        Papa.parse<Row>(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results: ParseResult<Row>) => {
            const rows = results.data || [];
            console.log(
              `Parsed data from ${dataUrl}:`,
              rows.length,
              'rows for binSize',
              binSize,
            );
            if (rows.length === 0) {
              setGroupedData([]);
              setLoading(false);
              return;
            }

            const keys = Object.keys(rows[0] ?? {});
            // Year columns are simple "2000", "2001", ...
            const yearCols = keys.filter((k) => /^\d{4}$/.test(k));

            const selectedYearCols = yearCols.filter((k) => {
              const year = parseInt(k, 10);
              return year >= startYear && year <= endYear;
            });

            if (selectedYearCols.length === 0) {
              console.error('No year columns found in selected range');
              setGroupedData([]);
              setLoading(false);
              return;
            }

            const groups: GroupedData[] = [];

            for (const row of rows) {
              const latBin = row.lat_bin;
              const lonBin = row.lon_bin;

              if (latBin === undefined || lonBin === undefined) {
                // eslint-disable-next-line no-continue
                continue;
              }

              const latBinNum = Number(latBin);
              const lonBinNum = Number(lonBin);

              if (Number.isNaN(latBinNum) || Number.isNaN(lonBinNum)) {
                // eslint-disable-next-line no-continue
                continue;
              }

              // Python script stores bin *lower edge*.
              // Place the bubble at the center of the bin.
              const latCenter = latBinNum + binSize / 2;
              const lonCenter = lonBinNum + binSize / 2;

              let sum = 0;
              let count = 0;

              for (const col of selectedYearCols) {
                const value = row[col];
                if (value !== null && value !== undefined && value !== '') {
                  const num = typeof value === 'number' ? value : parseFloat(String(value));
                  if (!Number.isNaN(num)) {
                    sum += num;
                    count += 1;
                  }
                }
              }

              if (count > 0) {
                const avgPrice = sum / count;
                groups.push({
                  lat: latCenter,
                  lon: lonCenter,
                  avgPrice,
                });
              }
            }

            console.log(
              'Bubbles after year averaging:',
              groups.length,
              'for binSize',
              binSize,
            );
            setGroupedData(groups);
            setLoading(false);
          },
        });
      } catch (err) {
        console.error('Error loading CSV', err);
        setGroupedData([]);
        setLoading(false);
      }
    };

    loadData();
  }, [binSize, startYear, endYear]);

  if (loading) {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (groupedData.length === 0) {
    return (
      <div style={wrapperStyle}>
        <div style={cardStyle}>
          <div>No data available</div>
        </div>
      </div>
    );
  }

  // 2000–2025 (26 years)
  const yearOptions = Array.from({ length: 26 }, (_, i) => 2000 + i);

  const lats = groupedData.map((g) => g.lat);
  const lons = groupedData.map((g) => g.lon);
  const sizes = groupedData.map((g) => g.avgPrice);
  const texts = groupedData.map(
    (g) =>
      `Avg Price: $${g.avgPrice.toFixed(
        0,
      )}<br>Bin center: (${g.lat.toFixed(2)}, ${g.lon.toFixed(
        2,
      )})<br>Bin size: ${binSize}°`,
  );

  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);

  const sizeScale = scaleLinear()
    .domain([minSize, maxSize])
    .range([5, 50]); // bubble radius range

  const data = [
    {
      type: 'scattermapbox',
      lat: lats,
      lon: lons,
      text: texts,
      hoverinfo: 'text',
      marker: {
        size: sizes.map((s) => sizeScale(s)),
        color: sizes,
        cmin: minSize,
        cmax: maxSize,
        colorscale: 'Cividis',
        colorbar: {
          title: { text: 'Avg Price' },
          tickprefix: '$',
        },
        opacity: 0.9,
        line: {
          width: 1.5,
          color: '#facc15', // yellow ring for visibility
        },
      },
    },
  ];

  const layout = {
    mapbox: {
      style: 'carto-darkmatter', // dark, tokenless fallback
      center: { lat: 39, lon: -98 }, // roughly center of the US
      zoom,
    },
    title: {
      text: `Average Single-Family Home Prices (${startYear}-${endYear})`,
      x: 0.02,
      xanchor: 'left',
    },
    margin: { l: 0, r: 0, t: 40, b: 0 },
    paper_bgcolor: '#020617',
    plot_bgcolor: '#020617',
    font: {
      color: '#e5e7eb',
    },
  };

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        <div style={controlsRowStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              Zillow Home Value Index Bubble Map
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                opacity: 0.7,
              }}
            >
              Zoom in to see finer-grained bubbles.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {/* Start year */}
            <label style={{ marginRight: 12, fontSize: 14 }}>
              Start Year:
              <select
                value={startYear}
                onChange={(e) => setStartYear(parseInt(e.target.value, 10))}
                style={selectStyle}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>

            {/* End year */}
            <label style={{ fontSize: 14 }}>
              End Year:
              <select
                value={endYear}
                onChange={(e) => setEndYear(parseInt(e.target.value, 10))}
                style={selectStyle}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div style={{ height: 600, borderRadius: 12, overflow: 'hidden' }}>
          <Plot
            data={data}
            layout={layout as any}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
            config={{
              responsive: true,
              scrollZoom: true,
            }}
            onRelayout={(ev: any) => {
              // Plotly emits relayout events frequently; zoom appears as "mapbox.zoom"
              if (ev['mapbox.zoom'] !== undefined) {
                const newZoom = ev['mapbox.zoom'];
                if (typeof newZoom === 'number') {
                  setZoom(newZoom);
                }
              }
            }}
          />
        </div>

        {/* CLICK-TO-DISMISS OVERLAY */}
        {overlayState !== 'hidden' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15,23,42,0.85)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              zIndex: 20,
              opacity: overlayState === 'visible' ? 1 : 0,
              transition: 'opacity 1s ease-out',
              cursor: 'pointer',
            }}
            onClick={() => {
              if (overlayState === 'visible') {
                setOverlayState('fading');
              }
            }}
            onTransitionEnd={() => {
              if (overlayState === 'fading') {
                setOverlayState('hidden');
              }
            }}
          >
            {/* Ribbon-style title */}
            <div
              style={{
                padding: '8px 24px',
                borderRadius: 999,
                background:
                  'linear-gradient(90deg, #1d4ed8 0%, #38bdf8 50%, #22c55e 100%)',
                marginBottom: 24,
                boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  letterSpacing: 0.5,
                }}
              >
                Quick Overview
              </span>
            </div>

            {/* Hint cards */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 16,
                maxWidth: 900,
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: 260,
                  padding: 16,
                  borderRadius: 16,
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid rgba(56,189,248,0.35)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>🗺️</div>
                <h3
                  style={{
                    fontSize: 16,
                    margin: 0,
                    marginBottom: 6,
                  }}
                >
                  Explore the whole US
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#9ca3af',
                  }}
                >
                  Each circle shows the average single-family home ZHVI value in a
                  geographic bin. Darker blues are lower prices; bright yellows
                  are higher.
                </p>
              </div>

              <div
                style={{
                  width: 260,
                  padding: 16,
                  borderRadius: 16,
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid rgba(129,140,248,0.6)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                <h3
                  style={{
                    fontSize: 16,
                    margin: 0,
                    marginBottom: 6,
                  }}
                >
                  LOBROOOOOOOOOOON
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#9ca3af',
                  }}
                >
                  Jared.
                </p>
              </div>

              <div
                style={{
                  width: 260,
                  padding: 16,
                  borderRadius: 16,
                  background: 'rgba(15,23,42,0.95)',
                  border: '1px solid rgba(250,204,21,0.6)',
                  boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                }}
              >
                <div style={{ fontSize: 24, marginBottom: 8 }}>🎚️</div>
                <h3
                  style={{
                    fontSize: 16,
                    margin: 0,
                    marginBottom: 6,
                  }}
                >
                  Zillow ZHVI value
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#9ca3af',
                  }}
                >
                  The ZHVI value is the weighted average of the 35th to
                  65th percentile range to represent the typical home.
                  <br />
                  Data sourced from:
                  <br />
                  <a href="https://www.zillow.com/research/data/" target="_blank" rel="noopener noreferrer">
                    https://www.zillow.com/research/data/
                  </a>
                </p>
              </div>
            </div>

            <p
              style={{
                marginTop: 24,
                fontSize: 12,
                color: '#9ca3af',
              }}
            >
              Click anywhere to start exploring.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BubbleMap;
