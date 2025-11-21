'use client';

import { useEffect, useState } from 'react';
// @ts-ignore
import Papa from 'papaparse';
// @ts-ignore
import { scaleLinear } from 'd3-scale';
import dynamic from 'next/dynamic';

import { zipLocationMap } from '../data/zipLocations'; // <-- add this

// Dynamically import Plotly since it requires the browser
const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
});

const DATA_URL = '/single_family_home.csv';

type Row = {
  RegionID?: string;
  SizeRank?: string;
  RegionName?: string | number; // ZIP here
  RegionType?: string;          // e.g. 'zip'
  StateName?: string;
  State?: string;
  City?: string;
  Metro?: string;
  CountyName?: string;
  [key: string]: any;           // all the date columns
};

type ZipData = {
  zip: string;
  lat: number;
  lon: number;
  avgPrice: number;
};

type GroupedData = {
  lat: number;
  lon: number;
  avgPrice: number;
  count: number;
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
          complete: (results) => {
            const rows = results.data || [];
            console.log('Parsed data:', rows.length, 'rows');
            if (rows.length === 0) {
              setLoading(false);
              return;
            }

            const keys = Object.keys(rows[0]);

            // Pick date columns between startYear and endYear
            const dateCols = keys.filter((k) => {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
              const year = parseInt(k.slice(0, 4), 10);
              return year >= startYear && year <= endYear;
            });

            console.log(
              'Date columns found:',
              dateCols.length,
              dateCols.slice(0, 5)
            );

            if (dateCols.length === 0) {
              console.error('No date columns from 2000–2010 found');
              setLoading(false);
              return;
            }

            const zipData: ZipData[] = [];

            for (const row of rows) {
              // 1. Make sure RegionType is 'zip'
              const regionType = row.RegionType;
              if (!regionType || regionType.toLowerCase() !== 'zip') {
                // Not a ZIP-level row; skip
                continue;
              }

              // 2. Get ZIP from RegionName
              const zip = row.RegionName;
              if (zip === undefined || zip === null || zip === '') {
                console.log('Skipping row: missing RegionName / ZIP', { row });
                continue;
              }
              const zipStr = String(zip);

              // 3. Lookup lat/lon from your ZIP → location map
              const loc = zipLocationMap[zipStr];
              if (!loc) {
                console.log('Skipping ZIP with no lat/lon mapping:', zipStr);
                continue;
              }
              const { lat, lon } = loc;

              // 4. Compute average price over selected date columns
              let sum = 0;
              let count = 0;

              for (const col of dateCols) {
                const value = row[col];
                if (value !== null && value !== undefined && value !== '') {
                  const num =
                    typeof value === 'number' ? value : parseFloat(String(value));
                  if (!Number.isNaN(num)) {
                    sum += num;
                    count += 1;
                  } else {
                    // console.log('Invalid value for col', col, ':', value);
                  }
                } else {
                  // console.log('Null/undefined/empty value for col', col, ':', value);
                }
              }

              if (count > 0) {
                const avgPrice = sum / count;
                zipData.push({ zip: zipStr, lat, lon, avgPrice });
              } else {
                console.log('No valid values for ZIP', zipStr);
              }
            }

            console.log('ZipData entries created:', zipData.length);

            // Group nearby ZIPs in lat/lon space
            const groups: GroupedData[] = [];
            const threshold = 0.01; // ~ grouping radius, tweak later

            for (const zip of zipData) {
              let foundGroup = false;
              for (const group of groups) {
                if (
                  Math.abs(zip.lat - group.lat) <= threshold &&
                  Math.abs(zip.lon - group.lon) <= threshold
                ) {
                  // Update group averages (running mean)
                  const totalPrice = group.avgPrice * group.count + zip.avgPrice;
                  const totalLat = group.lat * group.count + zip.lat;
                  const totalLon = group.lon * group.count + zip.lon;
                  group.count += 1;
                  group.avgPrice = totalPrice / group.count;
                  group.lat = totalLat / group.count;
                  group.lon = totalLon / group.count;
                  foundGroup = true;
                  break;
                }
              }
              if (!foundGroup) {
                groups.push({
                  lat: zip.lat,
                  lon: zip.lon,
                  avgPrice: zip.avgPrice,
                  count: 1,
                });
              }
            }

            setGroupedData(groups);
            console.log('Grouped data:', groups.length, 'groups');
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

  const yearOptions = Array.from({ length: 11 }, (_, i) => 2000 + i); // 2000–2010

  const lats = groupedData.map((g) => g.lat);
  const lons = groupedData.map((g) => g.lon);
  const sizes = groupedData.map((g) => g.avgPrice);
  const texts = groupedData.map(
    (g) => `Avg Price: $${g.avgPrice.toFixed(0)}<br>ZIPs in group: ${g.count}`
  );

  const minSize = Math.min(...sizes);
  const maxSize = Math.max(...sizes);

  const sizeScale = scaleLinear()
    .domain([minSize, maxSize])
    .range([5, 50]); // bubble radius range

  const data = [
    {
      type: 'scattergeo',
      locationmode: 'USA-states',
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
        line: {
          color: 'black',
        },
        opacity: 0.8,
      },
    },
  ];

  const layout = {
    geo: {
      scope: 'usa',
      resolution: 50,
      showland: true,
      landcolor: '#f0f0f0',
    },
    title: `Bubble Map of Average Single-Family Home Prices (${startYear}-${endYear}) by ZIP Groups`,
    margin: { l: 0, r: 0, t: 40, b: 0 },
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <label>
          Start Year:{' '}
          <select
            value={startYear}
            onChange={(e) => setStartYear(parseInt(e.target.value))}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label style={{ marginLeft: 20 }}>
          End Year:{' '}
          <select
            value={endYear}
            onChange={(e) => setEndYear(parseInt(e.target.value))}
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
        useResizeHandler={true}
        config={{ responsive: true }}
      />
    </div>
  );
};

export default BubbleMap;
