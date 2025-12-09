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

              // Your Python script stores bin *lower edge*.
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
    return <div>Loading...</div>;
  }

  if (groupedData.length === 0) {
    return <div>No data available</div>;
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
      )}<br>Bin center: (${g.lat.toFixed(2)}, ${g.lon.toFixed(2)})<br>Bin size: ${binSize}°`,
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
        opacity: 0.8,
      },
    },
  ];

  const layout = {
    mapbox: {
      style: 'open-street-map', // no token needed
      center: { lat: 39, lon: -98 }, // roughly center of the US
      zoom,
    },
    title: `Bubble Map of Average Single-Family Home Prices (${startYear}-${endYear}) — bin size ${binSize}°`,
    margin: { l: 0, r: 0, t: 40, b: 0 },
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        {/* Start year */}
        <label style={{ marginRight: 12 }}>
          Start Year:
          <select
            value={startYear}
            onChange={(e) => setStartYear(parseInt(e.target.value, 10))}
            style={{ marginLeft: 8 }}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>

        {/* End year */}
        <label style={{ marginLeft: 20 }}>
          End Year:
          <select
            value={endYear}
            onChange={(e) => setEndYear(parseInt(e.target.value, 10))}
            style={{ marginLeft: 8 }}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Plot
        data={data}
        layout={layout as any}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler
        config={{ responsive: true }}
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
  );
};

export default BubbleMap;
