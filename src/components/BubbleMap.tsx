'use client';

import { useEffect, useState, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import Papa, { type ParseResult } from 'papaparse';
import { scaleLinear } from 'd3-scale';

// Dynamically import Plotly since it requires the browser
const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
}) as unknown as ComponentType<any>;

// Use the new, already-binned CSV
const DATA_URL = '/binned_year_averages.csv';

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

const BubbleMap = () => {
  const [groupedData, setGroupedData] = useState<GroupedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [startYear, setStartYear] = useState(2000);
  const [endYear, setEndYear] = useState(2010);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const res = await fetch(DATA_URL);
        const text = await res.text();

        Papa.parse<Row>(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results: ParseResult<Row>) => {
            const rows = results.data || [];
            console.log('Parsed data:', rows.length, 'rows');
            if (rows.length === 0) {
              setLoading(false);
              return;
            }

            const keys = Object.keys(rows[0] ?? {});

            // Year columns are simple 4-digit strings: "2000", "2001", ...
            const yearCols = keys.filter((k) => /^\d{4}$/.test(k));
            console.log('Year columns:', yearCols);

            const selectedYearCols = yearCols.filter((k) => {
              const year = parseInt(k, 10);
              return year >= startYear && year <= endYear;
            });

            console.log(
              'Selected year columns:',
              selectedYearCols.length,
              selectedYearCols,
            );

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
                console.log('Skipping row: missing lat_bin or lon_bin', row);
                // eslint-disable-next-line no-continue
                continue;
              }

              const latBinNum = Number(latBin);
              const lonBinNum = Number(lonBin);

              if (Number.isNaN(latBinNum) || Number.isNaN(lonBinNum)) {
                console.log('Skipping row: non-numeric lat_bin/lon_bin', row);
                // eslint-disable-next-line no-continue
                continue;
              }

              // Place bubble at the center of the 1°×1° bin
              const latCenter = latBinNum + 0.5;
              const lonCenter = lonBinNum + 0.5;

              let sum = 0;
              let count = 0;

              for (const col of selectedYearCols) {
                const value = row[col];
                if (value !== null && value !== undefined && value !== '') {
                  const num =
                    typeof value === 'number'
                      ? value
                      : parseFloat(String(value));
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

            console.log('Binned rows used as bubbles:', groups.length);
            setGroupedData(groups);
            setLoading(false);
          },
        });
      } catch (err) {
        console.error('Error loading CSV', err);
        setLoading(false);
      }
    };

    loadData();
  }, [startYear, endYear]);

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
    (g) => `Avg Price: $${g.avgPrice.toFixed(0)}<br>Bin center: (${g.lat.toFixed(2)}, ${g.lon.toFixed(2)})`,
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
      zoom: 3,
    },
    title: `Bubble Map of Average Single-Family Home Prices (${startYear}-${endYear}) by 1°×1° Bins`,
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
      />
    </div>
  );
};

export default BubbleMap;
