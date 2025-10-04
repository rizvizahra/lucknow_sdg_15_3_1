# Lucknow Land Cover and Vegetation Health Analysis (2001–2020)

This Google Earth Engine (GEE) JavaScript workflow provides a **complete, reproducible analysis** of **Land Use/Land Cover (LULC) change** and **vegetation health (NDVI)** for the Lucknow metropolitan region, India. The analysis spans two decades (2001–2020), offering critical insights into environmental shifts, particularly those related to **urban expansion** and **Sustainable Development Goal (SDG) Indicator 15.3.1 (Land Degradation Neutrality)**.

---

## Key Analysis Components

The core script, `lucknow_land_cover_ndvi_analysis.js`, integrates **multi-sensor satellite data** to provide a comparative assessment:

| Data Source | Purpose | Temporal Resolution | Spatial Resolution |
| :--- | :--- | :--- | :--- |
| **MODIS MCD12Q1** (IGBP) | Baseline and comparative **Land Cover Classification** | Annual (2001 vs. 2020) | $\sim 500\text{m}$ |
| **Landsat 7/8** (Surface Reflectance) | Annual **Vegetation Health** (NDVI) and spectral data | Annual Median Composite | $\sim 30\text{m}$ |



## Contents

- `lucknow_land_cover_ndvi_analysis.js`: Main GEE script to process MODIS and Landsat data, compute NDVI, generate land-cover statistics, and visualize trends.
- Sample charts include:
  - Land cover class histograms for 2001 and 2020
  - NDVI distribution
  - NDVI vs. land class scatter plot
  - Tabular outputs for land cover change and NDVI stats

## Study Area

- **Location**: Lucknow, India  
- **Coordinates**: 26.72°–26.96° N, 80.80°–81.10° E  
- **Timeframe**: 2001 to 2020

## How to Use

1. Open [Google Earth Engine Code Editor](https://code.earthengine.google.com/).
2. Copy the code from `lucknow_land_cover_ndvi_analysis.js`.
3. Paste it into a new script and run.

## Citation

If using this workflow in publications or presentations, please cite the GitHub repository and related references.

---

© 2025 Zahra Rizvi  
MIT License
