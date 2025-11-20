// Script for connecting to Vercel Postgres (Neon) and seeding the database
// by reading CSV files and inserting them directly in a WIDE format.

// 1. Setup Environment Variables
import { config } from 'dotenv';
import fs from 'fs';
import csv from 'csv-parser';
import { sql } from '@vercel/postgres';

// Load environment variables from .env.local or .env file
config({ path: '.env.local' });

const TABLE_NAME = 'house_data_wide'; // Renaming the table for clarity
const CSV_FILE = process.env.CSV_SOURCE_PATH;
const BATCH_SIZE = 1000; // Records to insert per transaction

// This defines the structure of the plotly going into the database (WIDE FORMAT)
// FIX: ALL DATES ARE NOW SEPARATE COLUMNS AS REQUESTED.
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
        "Metro" VARCHAR(50),
        "CountyName" VARCHAR(30),
        
        -- WIDE FORMAT COLUMNS: These MUST match the columns in your CSV file
        "2000-01-31" NUMERIC(12, 2), "2001-01-31" NUMERIC(12, 2), "2002-01-31" NUMERIC(12, 2), "2003-01-31" NUMERIC(12, 2), 
        "2004-01-31" NUMERIC(12, 2), "2005-01-31" NUMERIC(12, 2), "2006-01-31" NUMERIC(12, 2), "2007-01-31" NUMERIC(12, 2), 
        "2008-01-31" NUMERIC(12, 2), "2009-01-31" NUMERIC(12, 2), "2010-01-31" NUMERIC(12, 2), "2011-01-31" NUMERIC(12, 2), 
        "2012-01-31" NUMERIC(12, 2), "2013-01-31" NUMERIC(12, 2), "2014-01-31" NUMERIC(12, 2), "2015-01-31" NUMERIC(12, 2), 
        "2016-01-31" NUMERIC(12, 2), "2017-01-31" NUMERIC(12, 2), "2018-01-31" NUMERIC(12, 2), "2019-01-31" NUMERIC(12, 2), 
        "2020-01-31" NUMERIC(12, 2), "2021-01-31" NUMERIC(12, 2), "2022-01-31" NUMERIC(12, 2), "2023-01-31" NUMERIC(12, 2), 
        "2024-01-31" NUMERIC(12, 2), "2025-01-31" NUMERIC(12, 2)
    );
`;

// List of ALL columns in the final wide database table, including dates
// NOTE: This list needs to be updated if you add/remove date columns above
const ALL_COLUMNS = [
  "RegionID", "SizeRank", "RegionName", "RegionType", "StateName",
  "State", "City", "Metro", "CountyName",
  "2000-01-31", "2001-01-31", "2002-01-31", "2003-01-31", "2004-01-31",
  "2005-01-31", "2006-01-31", "2007-01-31", "2008-01-31", "2009-01-31",
  "2010-01-31", "2011-01-31", "2012-01-31", "2013-01-31", "2014-01-31",
  "2015-01-31", "2016-01-31", "2017-01-31", "2018-01-31", "2019-01-31",
  "2020-01-31", "2021-01-31", "2022-01-31", "2023-01-31", "2024-01-31",
  "2025-01-31"
];

let globalInsertedCount = 0;
const startTime = Date.now();

/**
 * Executes the database setup: dropping the old table and creating the new one.
 */
async function setupDatabase() {
  console.log(`\n--- Database Setup ---`);
  console.log(`Connecting to database via POSTGRES_URL...`);

  try {
    await sql.query(`DROP TABLE IF EXISTS ${TABLE_NAME}`);
    console.log(`Old tables cleared.`);

    await sql.query(CREATE_TABLE_QUERY);
    console.log(`Table '${TABLE_NAME}' created successfully with WIDE schema.`);
  } catch (error) {
    console.error('FATAL: Database setup failed.', error);
    throw error;
  }
}

/**
 * Inserts the current batch of records into the database.
 * @param {Array<Object>} batch - Array of wide row objects (as read from CSV).
 * @param {number} totalRowsProcessed - Running count of source CSV rows processed.
 */
async function insertBatch(batch, totalRowsProcessed) {
  if (batch.length === 0) return;

  // Construct a single VALUES list for the entire batch for efficiency
  const valuesString = batch.map(row => {
    // Iterate through the predefined ALL_COLUMNS list to ensure order and handling
    const rowValues = ALL_COLUMNS.map(col => {
      let val = row[col];

      if (val === undefined || val === null || val === '') {
        return 'NULL';
      }

      // If the column is a date column, it should be treated as a number
      if (ALL_COLUMNS.indexOf(col) > 8) { // Assuming first 9 columns are strings/integers
        const numVal = parseFloat(val);
        return isNaN(numVal) ? 'NULL' : numVal;
      }

      // For string/static columns, sanitize and quote
      return `'${String(val).replace(/'/g, "''")}'`;
    }).join(',');

    return `(${rowValues})`;
  }).join(',');

  const columnNames = ALL_COLUMNS.map(col => `"${col}"`).join(', ');

  const insertQuery = `
        INSERT INTO ${TABLE_NAME} (
            ${columnNames}
        )
        VALUES ${valuesString};
    `;

  try {
    await sql.query(insertQuery);
    globalInsertedCount += batch.length;
    process.stdout.write(`  -> Total inserted records (wide format): ${globalInsertedCount}... \r`);
    batch.length = 0; // Clear the batch

  } catch (error) {
    console.error(`\nError inserting batch (processed ${totalRowsProcessed} source rows):`, error);
    // Log the problematic SQL for debugging
    console.error("Problematic SQL snippet:", insertQuery.substring(0, 500) + '...');
    throw error; // Re-throw to stop the script
  }
}

/**
 * Streams a single CSV file and inserts the plotly in chunks.
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
        // The 'row' is one wide row from the CSV.
        totalRowsProcessed++;

        // Push the entire row object (which includes all date columns)
        batch.push(row);

        // Check if we have enough records to insert a batch
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
    if (!CSV_FILE || !fs.existsSync(CSV_FILE)) {
      throw new Error(`CSV_SOURCE_PATH environment variable is not set or file not found at: ${CSV_FILE}`);
    }

    // NOTE: If your CSV contains dates OTHER than the January-end dates listed
    // in the CREATE_TABLE_QUERY, you MUST update that query and the ALL_COLUMNS list.

    await setupDatabase();
    await processCsvFile(CSV_FILE);

    const endTime = Date.now();
    console.log(`\n✅ Database is now seeded and ready!`);
    console.log(`Total wide-format records inserted: ${globalInsertedCount}`);
    console.log(`Total elapsed time: ${(endTime - startTime) / 1000} seconds.`);

  } catch (error) {
    console.error('\n❌ An error occurred during the seeding process:', error.message);
    process.exit(1);
  }
}

main();