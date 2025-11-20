'use client';

import { useEffect, useMemo, useState } from 'react';
// @ts-ignore
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
// @ts-ignore
import { scaleLinear } from 'd3-scale';
// @ts-ignore
import Papa from 'papaparse';

import dynamic from 'next/dynamic';

// Dynamically import Plotly since it requires the browser
const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
});

const geoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
const DATA_URL = '/single_family_home.csv';

type Row = {
  State?: string;
  StateName?: string;
  [key: string]: any;
};

type StateValues = Record<string, number>;

const nameToCode: Record<string, string> = {
  Alabama: 'AL',
  Alaska: 'AK',
  Arizona: 'AZ',
  Arkansas: 'AR',
  California: 'CA',
  Colorado: 'CO',
  Connecticut: 'CT',
  Delaware: 'DE',
  'District of Columbia': 'DC',
  Florida: 'FL',
  Georgia: 'GA',
  Hawaii: 'HI',
  Idaho: 'ID',
  Illinois: 'IL',
  Indiana: 'IN',
  Iowa: 'IA',
  Kansas: 'KS',
  Kentucky: 'KY',
  Louisiana: 'LA',
  Maine: 'ME',
  Maryland: 'MD',
  Massachusetts: 'MA',
  Michigan: 'MI',
  Minnesota: 'MN',
  Mississippi: 'MS',
  Missouri: 'MO',
  Montana: 'MT',
  Nebraska: 'NE',
  Nevada: 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  Ohio: 'OH',
  Oklahoma: 'OK',
  Oregon: 'OR',
  Pennsylvania: 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  Tennessee: 'TN',
  Texas: 'TX',
  Utah: 'UT',
  Vermont: 'VT',
  Virginia: 'VA',
  Washington: 'WA',
  'West Virginia': 'WV',
  Wisconsin: 'WI',
  Wyoming: 'WY',
};

const codes : Array<string> = [];

Object.values(nameToCode).forEach((value) => {
    codes.push(value);
})

type TooltipState = {
  x: number;
  y: number;
  text: string;
} | null;

const BubbleMap = () => {
  const [stateValues, setStateValues] = useState<StateValues>({});
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch(DATA_URL);
        const text = await res.text();

        Papa.parse<Row>(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results: { data: never[]; }) => {
            const rows = results.data || [];
            if (rows.length === 0) {
              setLoading(false);
              return;
            }

            const firstRow = rows[0];
            const keys = Object.keys(firstRow);

            let stateCol: string | null = null;

            if (keys.includes('State')) {
              stateCol = 'State';
            } else if (keys.includes('StateName')) {
              stateCol = 'StateName';
            } else {
              stateCol = null;
            }

            if (!stateCol) {
              console.error('No State or StateName column found in CSV');
              setLoading(false);
              return;
            }

            const dateCols = keys.filter((k) => {
              if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
              const year = parseInt(k.slice(0, 4), 10);
              return year >= 2000 && year <= 2010;
            });

            if (dateCols.length === 0) {
              console.error('No date columns from 2000–2010 found');
              setLoading(false);
              return;
            }

            const stateSums: Record<string, number> = {};
            const stateCounts: Record<string, number> = {};

            for (const row of rows) {
              const stateRaw = (row as any)[stateCol];
              if (stateRaw) {
                const stateCode = String(stateRaw).trim();

                let sum = 0;
                let count = 0;

                for (const col of dateCols) {
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
                  const zipAvg = sum / count;

                  if (!(stateCode in stateSums)) {
                    stateSums[stateCode] = 0;
                    stateCounts[stateCode] = 0;
                  }
                  stateSums[stateCode] += zipAvg;
                  stateCounts[stateCode] += 1;
                }
              }
            }

            const stateAverages: StateValues = {};
            for (const code of Object.keys(stateSums)) {
              stateAverages[code] = stateSums[code] / stateCounts[code];
            }

            setStateValues(stateAverages);
            setLoading(false);
          },
        });
      } catch (err) {
        console.error('Error loading CSV', err);
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const [minVal, maxVal] = useMemo(() => {
    const vals = Object.values(stateValues);
    if (vals.length === 0) return [0, 1];
    return [Math.min(...vals), Math.max(...vals)];
  }, [stateValues]);

  const colorScale = useMemo(
    () => scaleLinear<string>()
      .domain([minVal, maxVal])
      .range(['#e0ecf4', '#8856a7']),
    [minVal, maxVal],
  );

  const currencyFormatter = useMemo(
    () => new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }),
    [],
  );

  const getStateCodeFromGeo = (geo: any): string | undefined => {
    /* eslint-disable react/prop-types */
    const props = geo.properties || {};
    const postal = props.postal || props.STUSPS;
    if (postal) return postal;

    const name = props.name || props.NAME;
    if (name && nameToCode[name]) return nameToCode[name];

    return undefined;
  };

  interface GeoProperties {
    NAME?: string;
    postal?: string;
    STUSPS?: string;

    [key: string]: unknown;
  }

  interface GeoFeature {
    id?: string | number;
    rsmKey: string;
    properties?: GeoProperties;
    geometry?: {
      type: string;
      coordinates: number[] | number[][] | number[][][];
    };
  }

  let data = [{
    type: 'scattergeo',
    mode: 'markers',
    locations: codes,
    marker: {
        size: new Array(codes.length).fill(300),
        color: new Array(codes.length).fill(20),
        cmin: 0,
        cmax: 600,
        colorscale: 'Greens',
        colorbar: {
            title: {text: 'Price'},
            ticksuffix: ',000',
            tickprefix: '$',
            showticksuccix: 'last'
        },
        line: {
            color: 'black'
        },
        name: 'lobron jared'

    }
  }]

  var layout = {
    'geo': {
        'scope': 'usa',
        'resolution': 50
    }
  }

  return (
    <Plot 
        data={data}
        layout={layout}
        style={{width: '100%', height: '100%'}}
        useResizeHandler={true}
        config={{responsive: true}}
    />
  )
};

export default BubbleMap;
