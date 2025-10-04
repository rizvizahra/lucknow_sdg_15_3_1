// The following Google Earth Engine script performs a comparative analysis of
// Land Cover (MODIS) and Landsat satellite imagery for the Lucknow, India
// region between 2001 and 2020. The script loads data, preprocesses it,
// combines the datasets for potential classification, generates various charts
// for visualization, and prints summary tables.

//-----------------------------------------------------
// 1. Define the Extents of the Analysis (Lucknow)
//-----------------------------------------------------
// Define the geographic area of interest (AOI) using an approximate bounding
// box for Lucknow, India, to filter image collections efficiently.
// Latitude:  26.72 to 26.96
// Longitude: 80.80 to 81.10

// Define the latitude and longitude ranges.
var lat_small = [26.72, 26.96];
var lon_small = [80.80, 81.10];

// Create an Earth Engine Geometry (Rectangle) object for the AOI.
var bbox = ee.Geometry.Rectangle(
  lon_small[0], lat_small[0],
  lon_small[1], lat_small[1]
);

// Center the map view on the defined bounding box at zoom level 10.
Map.centerObject(bbox, 10);

// Define the two comparison years: the base year (2001) and the latest year (2020).
var years = [2001, 2020];
var first_year = years[0];
var last_year  = years[1];

// Create an object to store Earth Engine Date ranges for each year (Jan 1st to Dec 31st).
var date_ranges = {};
years.forEach(function(year) {
  date_ranges[year] = [
    ee.Date.fromYMD(year, 1, 1),
    ee.Date.fromYMD(year, 12, 31)
  ];
});

// Print the defined AOI and years to the Earth Engine Console for verification.
print('Analysis Region (Lucknow):', bbox);
print('Analysis Years:', years);


//---

//-----------------------------------------------------
// 2. Load Land Classification Data (MODIS MCD12Q1)
//-----------------------------------------------------
// Function to load the MODIS Land Cover Type 1 (LC_Type1, IGBP classification)
// for a given year, clip it to the AOI, and rename the band.
function loadModisLandCover(year) {
  // Construct the asset ID for the annual MODIS land cover image.
  var id = 'MODIS/006/MCD12Q1/' + year + '_01_01';
  return ee.Image(id)
           .select('LC_Type1') // Select the IGBP Land Cover Type 1 band.
           .clip(bbox)         // Clip the image to the Lucknow AOI.
           .rename('land_class') // Rename the band for clarity.
           // Set the system:time_start property for chronological sorting later.
           .set('system:time_start', date_ranges[year][0].millis());
}

// Load the land cover images for the first and last years.
var land_cls_data_first_year = loadModisLandCover(first_year);
var land_cls_data_last_year  = loadModisLandCover(last_year);

// Print the loaded images to the console.
print('Land Class (first year):', land_cls_data_first_year);
print('Land Class (last year):',  land_cls_data_last_year);

// Combine the two land cover images into an ImageCollection, sorted by time.
var land_cls_data_encoded = ee.ImageCollection([
  land_cls_data_first_year,
  land_cls_data_last_year
]).sort('system:time_start');

// Visualization parameters for the MODIS IGBP classes (1-17).
var modisVisParams = {
  min: 1, max: 17,
  // A standard color palette for the 17 IGBP land cover classes.
  palette: [
    '05450a','086a10','54a708','78d203','009900','c6b044','dcd159','dade48',
    'fbff13','b6ff05','27ff87','c24f44','a5a5a5','ff6d4c','69fff8','f9ffa4','1c0dff'
  ]
};

// Add the 2001 and 2020 MODIS Land Cover images to the map for visual inspection.
Map.addLayer(
  land_cls_data_first_year, 
  modisVisParams, 
  'MODIS LC ' + first_year
);
Map.addLayer(
  land_cls_data_last_year, 
  modisVisParams, 
  'MODIS LC ' + last_year
);


//---

//-----------------------------------------------------
// 3. Load EO Data from the Datacube (Landsat)
//-----------------------------------------------------
// This section loads Landsat 7 (L7) and Landsat 8 (L8) Surface Reflectance (SR)
// data, masks clouds, and computes a yearly median composite including NDVI.

// Define the source bands and the desired new band names for Landsat 7 & 8.
// Bands correspond to Blue, Green, Red, Near-Infrared (NIR), and Shortwave-Infrared 2 (SWIR2).
var LS_SOURCE_BANDS_L7 = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B7']; // Landsat 7 SR bands
var LS_SOURCE_BANDS_L8 = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B7']; // Landsat 8 SR bands (same index as L7)
var NEW_BAND_NAMES     = ['blue','green','red','nir','swir2']; // Consistent band names

// Function to mask clouds and invalid pixels in Landsat 7 Surface Reflectance (L2) data.
function maskL7sr(image) {
  // Select the QA_PIXEL band for quality assessment.
  var qa = image.select('QA_PIXEL');
  // Identify clouds (bits 3 or 5 set to 1) based on the CFMask algorithm.
  var cloud = qa.bitwiseAnd(1 << 3).neq(0)
             .or(qa.bitwiseAnd(1 << 5).neq(0));
  // Identify clear sky pixels (bits 0, 1, and 6 set to 0).
  var clear = qa.bitwiseAnd(1 << 0).eq(0)
             .and(qa.bitwiseAnd(1 << 1).eq(0))
             .and(qa.bitwiseAnd(1 << 6).eq(0));
  // Final mask is where it's clear and NOT cloud.
  var mask = clear.and(cloud.not());
  // Identify valid data range (0 to 10000 for Surface Reflectance).
  var valid_range = image.select(LS_SOURCE_BANDS_L7)
                      .reduce(ee.Reducer.min()).gt(0) // Minimum pixel value > 0
                      .and(
                        image.select(LS_SOURCE_BANDS_L7)
                           .reduce(ee.Reducer.max()).lt(10000) // Maximum pixel value < 10000
                      );
  // Apply the mask and scale the Surface Reflectance bands from 0-10000 to 0-1.0.
  return image.updateMask(mask.and(valid_range)).divide(10000);
}

// Function to mask clouds and invalid pixels in Landsat 8 Surface Reflectance (L2) data.
function maskL8sr(image) {
  // Select the QA_PIXEL band.
  var qa = image.select('QA_PIXEL');
  // Identify clouds (bits 3 or 5 set to 1).
  var cloud = qa.bitwiseAnd(1 << 3).neq(0)
             .or(qa.bitwiseAnd(1 << 5).neq(0));
  // Identify clear sky pixels (bits 0, 1, 2, and 6 set to 0).
  var clear = qa.bitwiseAnd(1 << 0).eq(0)
             .and(qa.bitwiseAnd(1 << 1).eq(0))
             .and(qa.bitwiseAnd(1 << 2).eq(0))
             .and(qa.bitwiseAnd(1 << 6).eq(0));
  // Final mask.
  var mask = clear.and(cloud.not());
  // Identify valid data range.
  var valid_range = image.select(LS_SOURCE_BANDS_L8)
                      .reduce(ee.Reducer.min()).gt(0)
                      .and(
                        image.select(LS_SOURCE_BANDS_L8)
                           .reduce(ee.Reducer.max()).lt(10000)
                      );
  // Apply the mask and scale the Surface Reflectance bands.
  return image.updateMask(mask.and(valid_range)).divide(10000);
}

// Function to calculate the Normalized Difference Vegetation Index (NDVI).
function addNDVI(image) {
  // Check if the required 'nir' and 'red' bands exist before calculation.
  var hasNir = image.bandNames().contains('nir');
  var hasRed = image.bandNames().contains('red');
  return ee.Algorithms.If(
    hasNir,
    ee.Algorithms.If(
      hasRed,
      // Calculate NDVI: (NIR - Red) / (NIR + Red)
      image.addBands(image.normalizedDifference(['nir', 'red']).rename('NDVI')),
      image // Return original image if 'red' is missing
    ),
    image // Return original image if 'nir' is missing
  );
}

// Function to load, filter, preprocess, and composite Landsat data for a given year.
function loadAndPreprocessLandsat(year) {
  var date_start = date_ranges[year][0];
  var date_end   = date_ranges[year][1];

  // Load and process Landsat 7 data.
  var ls7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
    .filterDate(date_start, date_end)
    .filterBounds(bbox)
    .map(maskL7sr) // Apply cloud/quality mask and scaling.
    .select(LS_SOURCE_BANDS_L7, NEW_BAND_NAMES); // Select and rename bands.

  // Load and process Landsat 8 data.
  var ls8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterDate(date_start, date_end)
    .filterBounds(bbox)
    .map(maskL8sr) // Apply cloud/quality mask and scaling.
    .select(LS_SOURCE_BANDS_L8, NEW_BAND_NAMES); // Select and rename bands.

  // Merge the Landsat 7 and 8 collections.
  var combined_ls = ls7.merge(ls8);
  
  // Compute the median composite of the combined collection and add the NDVI band.
  // Use ee.Algorithms.If to handle cases where the collection might be empty.
  var median_with_ndvi = ee.Algorithms.If(
    combined_ls.size().gt(0),
    addNDVI(combined_ls.median()), // Compute median and then add NDVI.
    ee.Image([]) // Return an empty image if no data is available.
  );

  // Return the annual Landsat composite image with time and year properties set.
  return ee.Image(median_with_ndvi)
           .set('system:time_start', date_start.millis())
           .set('year', year);
}

// Create an ImageCollection of annual Landsat median composites for all specified years.
var datacube_median_data = ee.ImageCollection(
  years.map(function(year) {
    return loadAndPreprocessLandsat(year);
  })
// Filter out any empty images that may have resulted from ee.Algorithms.If calls.
).filter(ee.Filter.neq('system:band_names', ee.List([])));

// Print the resulting Landsat collection to the console.
print('Landsat Median Composites Collection:', datacube_median_data);


//---

//-----------------------------------------------------
// 4. Combine Landsat + MODIS Land Cover for Training
//-----------------------------------------------------
// This section prepares the multi-spectral Landsat data and the Land Cover (LC)
// data for use in a classification process by aligning their resolution and bands.
var target_resolution = 500; // The MODIS pixel size (in meters).
print('Target Resolution:', target_resolution, 'meters');

// Helper function to reproject the Landsat image to the resolution and projection
// of the MODIS land cover image, necessary for layer stacking.
function prepareLandsatForClassification(image, referenceImage) {
  var hasBands = image.bandNames().size().gt(0);
  return ee.Algorithms.If(
    hasBands,
    image.clip(bbox).reproject({
      // Use the MODIS image's Coordinate Reference System (CRS).
      crs: referenceImage.projection().crs(),
      // Use the target resolution (500m).
      scale: target_resolution
    }),
    ee.Image([])
  );
}

// Create the final training image collection by combining co-registered Landsat
// spectral bands (resampled to 500m) with the MODIS land cover band.
var training_image_collection = datacube_median_data.map(function(lsImage) {
  var year = ee.Number(lsImage.get('year'));
  // Select the correct land cover image (2001 or 2020) based on the Landsat image's year.
  var lcImage = ee.Image(
    ee.Algorithms.If(
      year.eq(first_year),
      land_cls_data_first_year,
      land_cls_data_last_year
    )
  ).rename('land_class'); // Ensure the target band is named 'land_class'.

  // Check if both Landsat and Land Cover images are valid (not empty).
  var validLS = lsImage.bandNames().size().gt(0);
  var validLC = lcImage.bandNames().size().gt(0);

  return ee.Algorithms.If(
    validLS.and(validLC),
    // Reproject Landsat to MODIS resolution and stack with the LC band.
    ee.Image(prepareLandsatForClassification(lsImage, lcImage))
      .addBands(lcImage),
    ee.Image([])
  );
// Filter out any resulting empty images.
}).filter(ee.Filter.neq('system:band_names', ee.List([])));

// Print the final collection ready for classification/training.
print('Training Image Collection:', training_image_collection);


//---

//-----------------------------------------------------
// 5. Generate 3–5 Interesting Charts
//-----------------------------------------------------

// 5.1 Histogram of land‐cover class counts (2001)
// Visualizes the area distribution of IGBP land cover classes for the first year.
var hist2001 = ui.Chart.image.histogram({
  image: land_cls_data_first_year,
  region: bbox,
  scale: 500, // MODIS resolution
  minBucketWidth: 1 // One bucket per integer class (1-17)
})
  .setOptions({
    title: 'Land‐Cover Class Distribution (2001)',
    hAxis: { title: 'IGBP Class (1–17)' },
    vAxis: { title: 'Pixel Count' }
  });
print(hist2001);

// 5.2 Histogram of land‐cover class counts (2020)
// Visualizes the area distribution of IGBP land cover classes for the last year.
var hist2020 = ui.Chart.image.histogram({
  image: land_cls_data_last_year,
  region: bbox,
  scale: 500,
  minBucketWidth: 1
})
  .setOptions({
    title: 'Land‐Cover Class Distribution (2020)',
    hAxis: { title: 'IGBP Class (1–17)' },
    vAxis: { title: 'Pixel Count' }
  });
print(hist2020);

// Helper function to extract a frequencyHistogram dictionary of land cover classes.
function getClassCounts(img) {
  return ee.Dictionary(
    img.reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(), // Counts pixels per unique value.
      geometry: bbox,
      scale: 500,
      maxPixels: 1e9 // Allow many pixels for a large region.
    }).get('land_class') // Get the histogram for the 'land_class' band.
  );
}

// 5.3 Bar chart comparing class counts (2001 vs. 2020)
// Compares the change in area (pixel count) for each land cover class over time.
var dict2001 = getClassCounts(land_cls_data_first_year);
var dict2020 = getClassCounts(land_cls_data_last_year);

// Convert the EE Dictionaries to client-side JavaScript Objects for iteration.
var dict2001Obj = dict2001.getInfo();
var dict2020Obj = dict2020.getInfo();

// Create a client-side array of objects to structure the data for the chart.
var featureList = [];
for (var i = 1; i <= 17; i++) {
  featureList.push({
    class: i,
    count_2001: dict2001Obj[i] || 0, // Use 0 if the class is not present.
    count_2020: dict2020Obj[i] || 0
  });
}

// Convert the client-side array into an Earth Engine FeatureCollection.
var classTable = ee.FeatureCollection(
  featureList.map(function(obj) {
    return ee.Feature(null, obj);
  })
);

// Generate a column chart to visualize the comparison.
var barChart = ui.Chart.feature.byFeature(classTable, 'class', ['count_2001', 'count_2020'])
  .setChartType('ColumnChart')
  .setOptions({
    title: 'Comparison of Land‐Cover Class Counts: 2001 vs. 2020',
    hAxis: { title: 'IGBP Class' },
    vAxis: { title: 'Pixel Count' },
    series: {
      0: { color: '2166ac', labelInLegend: '2001' },
      1: { color: 'b2182b', labelInLegend: '2020' }
    },
    isStacked: false // Use separate columns for each year.
  });
print(barChart);

// 5.4 Histogram of NDVI values (2020 Landsat composite)
// Shows the distribution of vegetation health (NDVI) in the latest year.
var ls2020 = datacube_median_data.filter(ee.Filter.eq('year', last_year)).first();
var ndvi2020 = ee.Image(ls2020).select('NDVI');

var histNDVI2020 = ui.Chart.image.histogram({
  image: ndvi2020,
  region: bbox,
  scale: 30, // Landsat's native resolution
  minBucketWidth: 0.02 // Granularity of the histogram
}).setOptions({
  title: 'NDVI Distribution (2020 Landsat Composite)',
  hAxis: { title: 'NDVI' },
  vAxis: { title: 'Pixel Count' }
});
print(histNDVI2020);

// 5.5 Scatter plot: NDVI vs. land_class (2020)
// Explores the relationship between NDVI and the land cover class for the latest year.
var combined2020 = ee.Image.cat([ndvi2020, land_cls_data_last_year])
  // Only use pixels where land cover data exists.
  .updateMask(land_cls_data_last_year);

// Randomly sample a subset of pixels to create the scatter plot data.
var sample2020 = combined2020.sample({
  region: bbox,
  scale: 500, // Sample at MODIS resolution to match land_class band.
  numPixels: 1000,
  seed: 42, // For reproducibility
  dropNulls: true
});

var scatter2020 = ui.Chart.feature.byFeature(sample2020, 'land_class', ['NDVI'])
  .setChartType('ScatterChart')
  .setOptions({
    title: 'NDVI vs. Land Class (2020)',
    hAxis: { title: 'IGBP Class' },
    vAxis: { title: 'NDVI' },
    pointSize: 3
  });
print(scatter2020);


//---

//-----------------------------------------------------
// 6. Create a Summary Table for Results/Discussion
//-----------------------------------------------------

// 6.1: Land Cover Class Counts (pixels) for each IGBP class
// Re-use the class count data to create a formal feature collection table.
var classCounts2001 = getClassCounts(land_cls_data_first_year);
var classCounts2020 = getClassCounts(land_cls_data_last_year);

var cc2001 = classCounts2001.getInfo();
var cc2020 = classCounts2020.getInfo();

// Populate the summary feature collection with class counts for 2001 and 2020.
var summaryFeatures = [];
for (var i = 1; i <= 17; i++) {
  summaryFeatures.push(
    ee.Feature(null, {
      'Class': i,
      'Count_2001': cc2001[i] || 0,
      'Count_2020': cc2020[i] || 0
    })
  );
}
var summaryTable = ee.FeatureCollection(summaryFeatures);
print('Land Cover Class Counts (pixels)', summaryTable); // Print the EE FeatureCollection table.

// 6.2: NDVI Statistics (mean, min, max) for each year
// Helper function to calculate mean, min, and max NDVI for a given year's composite.
function ndviStats(year) {
  var lsImage = ee.Image(datacube_median_data.filter(ee.Filter.eq('year', year)).first());
  // Combine multiple reducers (mean, min, max) into a single reduction.
  var stats = lsImage.select('NDVI').reduceRegion({
    reducer: ee.Reducer.mean()
               .combine(ee.Reducer.min(), '', true)
               .combine(ee.Reducer.max(), '', true),
    geometry: bbox,
    scale: 30, // Use Landsat's native resolution for statistics.
    maxPixels: 1e9
  });
  
  // Return a feature containing the year and the calculated statistics.
  return ee.Feature(null, {
    'Year': year,
    'Mean_NDVI': stats.get('NDVI_mean'),
    'Min_NDVI': stats.get('NDVI_min'),
    'Max_NDVI': stats.get('NDVI_max')
  });
}

// Create a feature collection containing NDVI statistics for both years.
var ndviSummary = ee.FeatureCollection([
  ndviStats(first_year),
  ndviStats(last_year)
]);
print('NDVI Statistics', ndviSummary); // Print the EE FeatureCollection table.


//---

//-----------------------------------------------------
// 7. Print Simple, Copyable Tables in the Console
//-----------------------------------------------------
// Prints the summary data in a tab-delimited format, which is easy to copy/paste
// into a spreadsheet program.

// 7.1: Simple tab-delimited table for land cover counts
print('Class\tCount_2001\tCount_2020');
// Iterate over the client-side representation of the FeatureCollection.
summaryTable.getInfo().features.forEach(function(f) {
  var props = f.properties;
  print(props.Class + '\t' + props.Count_2001 + '\t' + props.Count_2020);
});

// 7.2: Simple tab-delimited table for NDVI stats
print('Year\tMean_NDVI\tMin_NDVI\tMax_NDVI');
// Iterate over the client-side representation of the FeatureCollection.
ndviSummary.getInfo().features.forEach(function(f) {
  var p = f.properties;
  // Format NDVI values to 4 decimal places for presentation.
  var meanN = p.Mean_NDVI ? p.Mean_NDVI.toFixed(4) : 'null';
  var minN  = p.Min_NDVI  ? p.Min_NDVI.toFixed(4)  : 'null';
  var maxN  = p.Max_NDVI  ? p.Max_NDVI.toFixed(4)  : 'null';
  print(p.Year + '\t' + meanN + '\t' + minN + '\t' + maxN);
});


//---

//-----------------------------------------------------
// 8. (Optional) Legend for MODIS IGBP Classes
//-----------------------------------------------------
// Creates a custom, interactive legend on the map to interpret the colors used
// for the MODIS land cover layers.

// Color palette used in section 2.
var palette = [
  '05450a','086a10','54a708','78d203','009900','c6b044','dcd159','dade48',
  'fbff13','b6ff05','27ff87','c24f44','a5a5a5','ff6d4c','69fff8','f9ffa4','1c0dff'
];
// Corresponding IGBP class names (1-17).
var classNames = [
  '1:Evergreen Needleleaf','2:Evergreen Broadleaf','3:Deciduous Needleleaf',
  '4:Deciduous Broadleaf','5:Mixed Forest','6:Closed Shrub',
  '7:Open Shrub','8:Woody Savanna','9:Savanna','10:Grassland',
  '11:Wetlands','12:Croplands','13:Urban','14:Crop/Nat Veg','15:Snow/Ice',
  '16:Barren','17:Water'
];

// Create a UI panel to hold the legend components.
var legend = ui.Panel({
  style: { position: 'bottom-left', padding: '8px 15px' }
});
// Add a title to the legend.
legend.add(ui.Label('MODIS IGBP Classes'));

// Loop through the classes to create a color box and label for each.
classNames.forEach(function(name, i) {
  // Create a color box (label with background color).
  var colorBox = ui.Label({
    style: {
      backgroundColor: palette[i],
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });
  // Create the class name description.
  var description = ui.Label(name, { margin: '0 0 4px 6px' });
  // Add both to a panel using a horizontal flow layout.
  legend.add(ui.Panel([colorBox, description], ui.Panel.Layout.Flow('horizontal')));
});

// Add the finished legend panel to the map.
Map.add(legend);
