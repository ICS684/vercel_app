import pandas as pd
import numpy as np

# --------- 1. Load and clean input data ---------

# ZIP → latitude / longitude
map_df = pd.read_csv("map.csv", header=None, names=["ZIP", "lat", "lon"])

# Ensure types are correct
map_df["ZIP"] = map_df["ZIP"].astype(str)
map_df["lat"] = pd.to_numeric(map_df["lat"], errors="coerce")
map_df["lon"] = pd.to_numeric(map_df["lon"], errors="coerce")
map_df = map_df.dropna(subset=["lat", "lon"])

# Yearly averages with RegionName = ZIP
year_df = pd.read_csv("year_averages.csv")
year_df["RegionName"] = year_df["RegionName"].astype(str)

# Join on ZIP
merged = year_df.merge(map_df, left_on="RegionName", right_on="ZIP", how="inner")

# Identify year columns automatically (e.g., "2000", "2001", ..., "2025")
year_cols = [col for col in merged.columns if col.isdigit()]

# Drop columns we don't want in the output
base_df = merged.drop(columns=["RegionName", "StateName", "State", "ZIP"])


# --------- 2. Helper to bin and write CSV ---------

def bin_and_write(df: pd.DataFrame, bin_size: float) -> None:
    """
    Bin lat/lon at the given bin_size (in degrees), average all year columns
    within each bin, and write a CSV file.
    """
    working = df.copy()

    # Compute bin "base" coordinates (e.g. for bin_size=0.5, bins are ..., 37.0, 37.5, 38.0, ...)
    working["lat_bin"] = np.floor(working["lat"] / bin_size) * bin_size
    working["lon_bin"] = np.floor(working["lon"] / bin_size) * bin_size

    # Avoid floating-point artifacts like 37.499999 by rounding
    working["lat_bin"] = working["lat_bin"].round(6)
    working["lon_bin"] = working["lon_bin"].round(6)

    # Group by bins and average year columns
    grouped = (
        working.groupby(["lat_bin", "lon_bin"])[year_cols]
        .mean()
        .reset_index()
    )

    # Build output filename, e.g. bin_size=0.5 -> "0_5deg"
    bin_str = str(bin_size).replace(".", "_")
    outname = f"binned_year_averages_{bin_str}deg.csv"

    grouped.to_csv(outname, index=False)
    print(f"Wrote {outname} with {len(grouped)} rows")


# --------- 3. Generate all resolutions ---------

if __name__ == "__main__":
    # 1-degree bins (coarsest)
    # bin_and_write(base_df, 1.0)

    # 0.5-degree bins (medium)
    # bin_and_write(base_df, 0.5)

    # 0.25-degree bins (finest)
    bin_and_write(base_df, 0.125)
