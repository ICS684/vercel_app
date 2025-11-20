// Script for connecting to Vercel Postgres (Neon) and seeding the database
// by reading MULTIPLE CSV files and converting them from a wide format
// (many date columns) to a long format (one row per date).

// 1. Setup Environment Variables
import { config } from 'dotenv';
import fs from 'fs';
import csv from 'csv-parser';
import { sql } from '@vercel/postgres';

// Load environment variables from .env.development.local or .env file
config({ path: '.env.local' });

const TABLE_NAME = 'house_data';
const CSV_FILE = process.env.CSV_SOURCE_PATH; // use .env.local
const BATCH_SIZE = 1000; // Records to insert per transaction

// This defines the structure of the data going into the database (LONG FORMAT)
const CREATE_TABLE_QUERY = `
    CREATE TABLE ${TABLE_NAME} (
        id SERIAL PRIMARY KEY,
        "RegionID" INTEGER NOT NULL,
        "SizeRank" INTEGER,
        "RegionName" VARCHAR(8),
        "RegionType" VARCHAR(3),
        "StateName" VARCHAR(15),
        "State" VARCHAR(5),
        "City" VARCHAR(30),
        "Metro" VARCHAR(40),
        "CountyName" VARCHAR(30),
        -- Time-series data is stored here, making the data long/normalized
        "Date" DATE NOT NULL,
        "2000-01-31" NUMERIC(12, 2), "2001-01-31" NUMERIC(12, 2), "2002-01-31" NUMERIC(12, 2), "2003-01-31" NUMERIC(12, 2), "2004-01-31" NUMERIC(12, 2), "2005-01-31" NUMERIC(12, 2), "2006-01-31" NUMERIC(12, 2), "2007-01-31" NUMERIC(12, 2), "2008-01-31" NUMERIC(12, 2), "2009-01-31" NUMERIC(12, 2), "2010-01-31" NUMERIC(12, 2), "2011-01-31" NUMERIC(12, 2), "2012-01-31" NUMERIC(12, 2), "2013-01-31" NUMERIC(12, 2), "2014-01-31" NUMERIC(12, 2), "2015-01-31" NUMERIC(12, 2), "2016-01-31" NUMERIC(12, 2), "2017-01-31" NUMERIC(12, 2), "2018-01-31" NUMERIC(12, 2), "2019-01-31" NUMERIC(12, 2), "2020-01-31" NUMERIC(12, 2), "2021-01-31" NUMERIC(12, 2), "2022-01-31" NUMERIC(12, 2), "2023-01-31" NUMERIC(12, 2), "2024-01-31" NUMERIC(12, 2), "2025-01-31" NUMERIC(12, 2)
    );
`;

// Column names that are *static* (not the date columns)
const STATIC_COLUMNS = [
  "RegionID", "SizeRank", "RegionName", "RegionType", "StateName",
  "State", "City", "Metro", "CountyName"
];

let globalInsertedCount = 0; // Tracks total insertions across all files
const startTime = Date.now();

/**
 * Executes the database setup: dropping the old table and creating the new one.
 */
async function setupDatabase() {
  console.log(`\n--- Database Setup ---`);
  console.log(`Connecting to database via POSTGRES_URL...`);

  try {
    // Drop the new table if it exists (for a clean start)
    await sql.query(`DROP TABLE IF EXISTS ${TABLE_NAME}`);

    console.log(`Old tables cleared.`);

    // Create the new, normalized table
    await sql.query(CREATE_TABLE_QUERY);
    console.log(`Table '${TABLE_NAME}' created successfully with normalized schema.`);
  } catch (error) {
    console.error('FATAL: Database setup failed.', error);
    throw error;
  }
}

/**
 * Inserts the current batch of records into the database.
 * @param {Array<Object>} batch - Array of normalized row objects.
 * @param {number} totalRowsProcessed - Running count of source CSV rows processed.
 */
async function insertBatch(batch, totalRowsProcessed) {
  if (batch.length === 0) return;

  // Construct a single VALUES list for the entire batch for efficiency
  const valuesString = batch.map(row => {
    const staticValues = STATIC_COLUMNS.map(col => {
      const val = row[col];
      // Handle null/empty strings by inserting NULL, otherwise quote strings
      return val == null || val === '' ? 'NULL' : `'${val.replace(/'/g, "''")}'`;
    }).join(',');

    // Handle the dynamic Date and Value columns
    const date = row['Date'];
    const value = row['Value'] || 'NULL';

    return `(${staticValues}, '${date}', ${value})`;
  }).join(',');

  const insertQuery = `
        INSERT INTO ${TABLE_NAME} (
            "RegionID", "SizeRank", "RegionName", "RegionType", "StateName", 
            "State", "City", "Metro", "CountyName", "Date", "Value"
        )
        VALUES ${valuesString};
    `;

  try {
    await sql.query(insertQuery);
    globalInsertedCount += batch.length;
    process.stdout.write(`  -> Total inserted time-series records: ${globalInsertedCount}... \r`);
    batch.length = 0; // Clear the batch

  } catch (error) {
    console.error(`\nError inserting batch (processed ${totalRowsProcessed} source rows):`, error);
    // Log the problematic SQL for debugging
    console.error("Problematic SQL snippet:", insertQuery.substring(0, 500) + '...');
    throw error; // Re-throw to stop the script
  }
}

/**
 * Streams a single CSV file, un-pivots the data, and inserts it in chunks.
 * @param {string} filename - The path to the CSV file.
 */
async function processCsvFile(filename) {
  console.log(`\n--- Processing File: ${filename} ---`);

  if (!fs.existsSync(filename)) {
    console.error(`FATAL: CSV file not found at ${filename}. Please place it in the root directory.`);
    return false;
  }

  let batch = [];
  let totalRowsProcessed = 0;

  // Create a Promise to handle the asynchronous stream
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filename)
      .pipe(csv())
      .on('data', async (row) => {
        // The 'row' is one wide row from the CSV. We must un-pivot it.
        totalRowsProcessed++;

        // 1. Extract static regional data
        const staticData = {};
        STATIC_COLUMNS.forEach(col => staticData[col] = row[col]);

        // 2. Iterate over all remaining columns (the dates)
        for (const key in row) {
          // Check if the column name looks like a date (e.g., '2000-01-31')
          if (!STATIC_COLUMNS.includes(key) && key.match(/^\d{4}-\d{2}-\d{2}$/)) {

            const value = parseFloat(row[key]);
            // Only insert if the value is a valid number, ignore null/NaN values
            if (!isNaN(value)) {
              batch.push({
                ...staticData,
                'Date': key,
                'Value': value
              });
            }
          }
        }

        // 3. Check if we have enough records to insert a batch
        if (batch.length >= BATCH_SIZE) {
          // Pause the stream while we perform the async database insertion
          stream.pause();
          await insertBatch(batch, totalRowsProcessed);
          stream.resume();
        }
      })
      .on('end', async () => {
        // Insert any remaining records
        await insertBatch(batch, totalRowsProcessed);
        console.log(`\n\nSuccessfully finished file: ${filename}.`);
        resolve();
      })
      .on('error', (error) => {
        console.error(`File stream error for ${filename}:`, error);
        reject(error);
      });
  });

  return true;
}

/**
 * Main function to run setup and seeding.
 */
async function main() {
  try {
    if (!process.env.POSTGRES_URL) {
      throw new Error("POSTGRES_URL environment variable is not set. Check your .env files.");
    }

    await setupDatabase();

    // --- Process File  ---
    await processCsvFile(CSV_FILE);
    // ---------------------------------------

    const endTime = Date.now();
    console.log(`\n✅ Database is now seeded and ready!`);
    console.log(`Total time-series records inserted across all files: ${globalInsertedCount}`);
    console.log(`Total elapsed time: ${(endTime - startTime) / 1000} seconds.`);
    console.log("Next step: Update 'api/aggregated-data.js' to query the new 'real_estate_data' table.");
    console.log("Then run 'vercel dev' to start your local server.");

  } catch (error) {
    console.error('\n❌ An error occurred during the seeding process:', error.message);
    process.exit(1);
  }
}

main();