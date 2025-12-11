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
  latBin: number;
  lonBin: number;
};

type TimeSeriesPoint = {
  year: number;
  value: number | null;
};

type SelectedBinSeries = {
  latBin: number;
  lonBin: number;
  latCenter: number;
  lonCenter: number;
  binSize: number;
  series: TimeSeriesPoint[];
};

function getBinSizeFromZoom(zoom: number): number {
  if (zoom < 2) return 1.0;
  if (zoom < 4) return 0.5;
  if (zoom < 6) return 0.25;
  return 0.125;
}

function getDataUrlForBinSize(binSize: number): string {
  if (binSize === 1.0) return '/binned_year_averages_1_0deg.csv';
  if (binSize === 0.5) return '/binned_year_averages_0_5deg.csv';
  if (binSize === 0.25) return '/binned_year_averages_0_25deg.csv';
  return '/binned_year_averages_0_125deg.csv';
}

function binKey(binSize: number): string {
  // "1", "0.5", "0.25", "0.125"
  return binSize.toString();
}

const BubbleMap = () => {
  const [groupedData, setGroupedData] = useState<GroupedData[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const [startYear, setStartYear] = useState(2000);
  const [endYear, setEndYear] = useState(2010);

  const [zoom, setZoom] = useState(3);
  const [binSize, setBinSize] = useState(1.0); // matches initial zoom

  const [center, setCenter] = useState<{ lat: number; lon: number }>({
    lat: 39,
    lon: -98,
  });

  // raw data for each bin size, keyed by binSize string
  const [rawDataByBin, setRawDataByBin] = useState<Record<string, Row[]>>({});

  // overlay: 'visible' -> 'fading' (1s) -> 'hidden'
  const [overlayState, setOverlayState] = useState<'visible' | 'fading' | 'hidden'>(
    'visible',
  );

  // selected bin time-series for detail view
  const [selectedBinSeries, setSelectedBinSeries] =
    useState<SelectedBinSeries | null>(null);

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

  // When bin size changes, clear any selected detail series (since bins changed)
  useEffect(() => {
    setSelectedBinSeries(null);
  }, [binSize]);

  // Initial load: fetch all 4 CSVs once and cache their rows
  useEffect(() => {
    const sizes = [1.0, 0.5, 0.25, 0.125];

    const loadAll = async () => {
      try {
        const results: Record<string, Row[]> = {};

        const promises = sizes.map(async (size) => {
          const url = getDataUrlForBinSize(size);
          const res = await fetch(url);
          const text = await res.text();

          return new Promise<void>((resolve) => {
            Papa.parse<Row>(text, {
              header: true,
              dynamicTyping: true,
              skipEmptyLines: true,
              complete: (parsed: ParseResult<Row>) => {
                const rows = parsed.data || [];
                console.log(
                  `Parsed data from ${url}:`,
                  rows.length,
                  'rows for binSize',
                  size,
                );
                results[binKey(size)] = rows;
                resolve();
              },
            });
          });
        });

        await Promise.all(promises);
        setRawDataByBin(results);
      } catch (err) {
        console.error('Error loading CSV data', err);
        setRawDataByBin({});
      } finally {
        setInitialLoading(false);
      }
    };

    loadAll();
  }, []);

  // Whenever raw data, bin size, or year range changes, recompute groupedData in memory
  useEffect(() => {
    const key = binKey(binSize);
    const rows = rawDataByBin[key];

    if (!rows || rows.length === 0) {
      if (!initialLoading) {
        console.warn('No rows available for binSize', binSize);
      }
      setGroupedData([]);
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
          const num =
            typeof value === 'number' ? value : parseFloat(String(value));
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
          latBin: latBinNum,
          lonBin: lonBinNum,
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
  }, [rawDataByBin, binSize, startYear, endYear, initialLoading]);

  if (initialLoading) {
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
      customdata: groupedData.map((g) => [g.latBin, g.lonBin]),
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
      center: { lat: center.lat, lon: center.lon },
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

  // Build Plotly trace & layout for the selected bin's full 2000–2025 series
  const renderSelectedSeries = () => {
    if (!selectedBinSeries) return null;

    const validPoints = selectedBinSeries.series.filter(
      (p) => typeof p.value === 'number' && !Number.isNaN(p.value),
    );

    if (validPoints.length === 0) {
      return (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            borderRadius: 12,
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid rgba(148,163,184,0.5)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 16,
              }}
            >
              No time-series data available for this bin
            </h3>
            <button
              type="button"
              onClick={() => setSelectedBinSeries(null)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#9ca3af',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: '#9ca3af',
            }}
          >
            Try another bubble nearby; this one has no recorded ZHVI values
            between 2000 and 2025.
          </p>
        </div>
      );
    }

    const years = validPoints.map((p) => p.year);
    const values = validPoints.map((p) => p.value as number);

    const tsData = [
      {
        type: 'scatter',
        mode: 'lines+markers',
        x: years,
        y: values,
        line: {
          shape: 'linear',
        },
        marker: {
          size: 6,
        },
        hovertemplate: 'Year %{x}<br>ZHVI: $%{y:.0f}<extra></extra>',
      },
    ];

    const tsLayout = {
      title: {
        text: `ZHVI Trend (2000–2025) for Bin Center (${selectedBinSeries.latCenter.toFixed(
          2,
        )}, ${selectedBinSeries.lonCenter.toFixed(2)}) — ${selectedBinSeries.binSize}°`,
        x: 0,
        xanchor: 'left',
        font: {
          size: 16,
        },
      },
      margin: { l: 60, r: 20, t: 40, b: 40 },
      paper_bgcolor: 'rgba(15,23,42,1)',
      plot_bgcolor: 'rgba(15,23,42,1)',
      font: {
        color: '#e5e7eb',
      },
      xaxis: {
        title: 'Year',
        dtick: 1,
        gridcolor: '#1f2937',
        zerolinecolor: '#1f2937',
      },
      yaxis: {
        title: 'ZHVI ($)',
        gridcolor: '#1f2937',
        zerolinecolor: '#1f2937',
      },
    };

    return (
      <div
        style={{
          marginTop: 24,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid rgba(55,65,81,0.8)',
          background: 'rgba(15,23,42,0.95)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            borderBottom: '1px solid rgba(31,41,55,0.9)',
          }}
        >
          <span
            style={{
              fontSize: 13,
              color: '#9ca3af',
            }}
          >
            Click bubbles on the map to inspect their full ZHVI history.
          </span>
          <button
            type="button"
            onClick={() => setSelectedBinSeries(null)}
            style={{
              border: 'none',
              background: 'transparent',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ height: 320 }}>
          <Plot
            data={tsData as any}
            layout={tsLayout as any}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
            config={{
              responsive: true,
              displayModeBar: true,
            }}
          />
        </div>
      </div>
    );
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
              Zoom in to see finer-grained bubbles. Click a bubble for its full
              2000–2025 ZHVI history.
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

        {/* Map */}
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
              // Zoom changes
              if (ev['mapbox.zoom'] !== undefined) {
                const newZoom = ev['mapbox.zoom'];
                if (typeof newZoom === 'number') {
                  setZoom(newZoom);
                }
              }

              // Center changes – Plotly may send either "mapbox.center"
              // or "mapbox.center.lat"/"mapbox.center.lon"
              if (ev['mapbox.center']) {
                const c = ev['mapbox.center'];
                if (
                  c &&
                  typeof c.lat === 'number' &&
                  typeof c.lon === 'number'
                ) {
                  setCenter({ lat: c.lat, lon: c.lon });
                }
              } else {
                const newLat = ev['mapbox.center.lat'];
                const newLon = ev['mapbox.center.lon'];
                if (typeof newLat === 'number' && typeof newLon === 'number') {
                  setCenter({ lat: newLat, lon: newLon });
                }
              }
            }}
            onClick={(ev: any) => {
              const point = ev.points && ev.points[0];
              if (!point || !point.customdata) return;

              const [latBin, lonBin] = point.customdata as [number, number];
              const rows = rawDataByBin[binKey(binSize)];
              if (!rows || rows.length === 0) return;

              // Find the row for this bin
              const row = rows.find((r) => {
                const rbLat = Number(r.lat_bin);
                const rbLon = Number(r.lon_bin);
                return rbLat === latBin && rbLon === lonBin;
              });

              if (!row) return;

              // Extract all year columns 2000–2025
              const keys = Object.keys(row ?? {});
              const yearCols = keys
                .filter((k) => /^\d{4}$/.test(k))
                .map((k) => parseInt(k, 10))
                .sort((a, b) => a - b);

              const series: TimeSeriesPoint[] = yearCols.map((year) => {
                const valueRaw = row[String(year)];
                if (
                  valueRaw === null ||
                  valueRaw === undefined ||
                  valueRaw === ''
                ) {
                  return { year, value: null };
                }
                const num =
                  typeof valueRaw === 'number'
                    ? valueRaw
                    : parseFloat(String(valueRaw));
                return {
                  year,
                  value: Number.isNaN(num) ? null : num,
                };
              });

              const latCenter = latBin + binSize / 2;
              const lonCenter = lonBin + binSize / 2;

              setSelectedBinSeries({
                latBin,
                lonBin,
                latCenter,
                lonCenter,
                binSize,
                series,
              });
            }}
          />
        </div>

        {/* Time-series detail panel (if bubble selected) */}
        {renderSelectedSeries()}

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
                  Each circle shows the average single-family home ZHVI value in
                  a geographic bin. Darker blues are lower prices; bright
                  yellows are higher.
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
                  Scroll to Zoom
                </h3>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: '#9ca3af',
                  }}
                >
                  Scroll to see the map with more detail.
                  This will also add more bubbles with finer granularity, giving a more detailed visualization.
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
                  The ZHVI value is the weighted average of the 35th to 65th
                  percentile range to represent the typical home.
                  <br />
                  Data sourced from:
                  <br />
                  <a
                    href="https://www.zillow.com/research/data/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
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
