//-----------------------------------------------------
// 1. Define the Extents of the Analysis (Lucknow)
//-----------------------------------------------------
// Approximate bounding box for Lucknow, India:
// Latitude:  26.72 to 26.96
// Longitude: 80.80 to 81.10

var lat_small = [26.72, 26.96];
var lon_small = [80.80, 81.10];

var bbox = ee.Geometry.Rectangle(
  lon_small[0], lat_small[0],
  lon_small[1], lat_small[1]
);

Map.centerObject(bbox, 10);

// Use 2001 as the base year and 2020 as the latest available
var years = [2001, 2020];
var first_year = years[0];
var last_year  = years[1];

var date_ranges = {};
years.forEach(function(year) {
  date_ranges[year] = [
    ee.Date.fromYMD(year, 1, 1),
    ee.Date.fromYMD(year, 12, 31)
  ];
});

print('Analysis Region (Lucknow):', bbox);
print('Analysis Years:', years);



//-----------------------------------------------------
// 2. Load Land Classification Data (MODIS MCD12Q1)
//-----------------------------------------------------
function loadModisLandCover(year) {
  var id = 'MODIS/006/MCD12Q1/' + year + '_01_01';
  return ee.Image(id)
           .select('LC_Type1')
           .clip(bbox)
           .rename('land_class')
           .set('system:time_start', date_ranges[year][0].millis());
}

var land_cls_data_first_year = loadModisLandCover(first_year);
var land_cls_data_last_year  = loadModisLandCover(last_year);

print('Land Class (first year):', land_cls_data_first_year);
print('Land Class (last year):',  land_cls_data_last_year);

var land_cls_data_encoded = ee.ImageCollection([
  land_cls_data_first_year,
  land_cls_data_last_year
]).sort('system:time_start');

Map.addLayer(
  land_cls_data_first_year, 
  {
    min: 1, max: 17,
    palette: [
      '05450a','086a10','54a708','78d203','009900','c6b044','dcd159','dade48',
      'fbff13','b6ff05','27ff87','c24f44','a5a5a5','ff6d4c','69fff8','f9ffa4','1c0dff'
    ]
  }, 
  'MODIS LC ' + first_year
);
Map.addLayer(
  land_cls_data_last_year, 
  {
    min: 1, max: 17,
    palette: [
      '05450a','086a10','54a708','78d203','009900','c6b044','dcd159','dade48',
      'fbff13','b6ff05','27ff87','c24f44','a5a5a5','ff6d4c','69fff8','f9ffa4','1c0dff'
    ]
  }, 
  'MODIS LC ' + last_year
);



//-----------------------------------------------------
// 3. Load EO Data from the Datacube (Landsat)
//-----------------------------------------------------
// We’ll load Landsat 7 & 8, mask clouds, compute median+NDVI for each year.

var LS_SOURCE_BANDS_L7 = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var LS_SOURCE_BANDS_L8 = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var NEW_BAND_NAMES    = ['blue','green','red','nir','swir2'];

function maskL7sr(image) {
  var qa = image.select('QA_PIXEL');
  var cloud = qa.bitwiseAnd(1 << 3).neq(0)
            .or(qa.bitwiseAnd(1 << 5).neq(0));
  var clear = qa.bitwiseAnd(1 << 0).eq(0)
            .and(qa.bitwiseAnd(1 << 1).eq(0))
            .and(qa.bitwiseAnd(1 << 6).eq(0));
  var mask = clear.and(cloud.not());
  var valid_range = image.select(LS_SOURCE_BANDS_L7)
                    .reduce(ee.Reducer.min()).gt(0)
                    .and(
                      image.select(LS_SOURCE_BANDS_L7)
                           .reduce(ee.Reducer.max()).lt(10000)
                    );
  return image.updateMask(mask.and(valid_range)).divide(10000);
}

function maskL8sr(image) {
  var qa = image.select('QA_PIXEL');
  var cloud = qa.bitwiseAnd(1 << 3).neq(0)
            .or(qa.bitwiseAnd(1 << 5).neq(0));
  var clear = qa.bitwiseAnd(1 << 0).eq(0)
            .and(qa.bitwiseAnd(1 << 1).eq(0))
            .and(qa.bitwiseAnd(1 << 2).eq(0))
            .and(qa.bitwiseAnd(1 << 6).eq(0));
  var mask = clear.and(cloud.not());
  var valid_range = image.select(LS_SOURCE_BANDS_L8)
                    .reduce(ee.Reducer.min()).gt(0)
                    .and(
                      image.select(LS_SOURCE_BANDS_L8)
                           .reduce(ee.Reducer.max()).lt(10000)
                    );
  return image.updateMask(mask.and(valid_range)).divide(10000);
}

function addNDVI(image) {
  var hasNir = image.bandNames().contains('nir');
  var hasRed = image.bandNames().contains('red');
  return ee.Algorithms.If(
    hasNir,
    ee.Algorithms.If(
      hasRed,
      image.addBands(image.normalizedDifference(['nir', 'red']).rename('NDVI')),
      image
    ),
    image
  );
}

function loadAndPreprocessLandsat(year) {
  var date_start = date_ranges[year][0];
  var date_end   = date_ranges[year][1];

  var ls7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
    .filterDate(date_start, date_end)
    .filterBounds(bbox)
    .map(maskL7sr)
    .select(LS_SOURCE_BANDS_L7, NEW_BAND_NAMES);

  var ls8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterDate(date_start, date_end)
    .filterBounds(bbox)
    .map(maskL8sr)
    .select(LS_SOURCE_BANDS_L8, NEW_BAND_NAMES);

  var combined_ls = ls7.merge(ls8);
  var median_with_ndvi = ee.Algorithms.If(
    combined_ls.size().gt(0),
    addNDVI(combined_ls.median()),
    ee.Image([])
  );

  return ee.Image(median_with_ndvi)
           .set('system:time_start', date_start.millis())
           .set('year', year);
}

var datacube_median_data = ee.ImageCollection(
  years.map(function(year) {
    return loadAndPreprocessLandsat(year);
  })
).filter(ee.Filter.neq('system:band_names', ee.List([])));

print('Landsat Median Composites Collection:', datacube_median_data);



//-----------------------------------------------------
// 4. Combine Landsat + MODIS Land Cover for Training
//-----------------------------------------------------
var target_resolution = 500; // 500 m (MODIS pixel size)
print('Target Resolution:', target_resolution, 'meters');

function prepareLandsatForClassification(image, referenceImage) {
  var hasBands = image.bandNames().size().gt(0);
  return ee.Algorithms.If(
    hasBands,
    image.clip(bbox).reproject({
      crs: referenceImage.projection().crs(),
      scale: target_resolution
    }),
    ee.Image([])
  );
}

var training_image_collection = datacube_median_data.map(function(lsImage) {
  var year = ee.Number(lsImage.get('year'));
  var lcImage = ee.Image(
    ee.Algorithms.If(
      year.eq(first_year),
      land_cls_data_first_year,
      land_cls_data_last_year
    )
  ).rename('land_class');

  var validLS = lsImage.bandNames().size().gt(0);
  var validLC = lcImage.bandNames().size().gt(0);

  return ee.Algorithms.If(
    validLS.and(validLC),
    ee.Image(prepareLandsatForClassification(lsImage, lcImage))
      .addBands(lcImage),
    ee.Image([])
  );
}).filter(ee.Filter.neq('system:band_names', ee.List([])));

print('Training Image Collection:', training_image_collection);



//-----------------------------------------------------
// 5. Generate 3–5 Interesting Charts
//-----------------------------------------------------
// 5.1 Histogram of land‐cover class counts (2001)
var hist2001 = ui.Chart.image.histogram({
  image: land_cls_data_first_year,
  region: bbox,
  scale: 500,
  minBucketWidth: 1
})
  .setOptions({
    title: 'Land‐Cover Class Distribution (2001)',
    hAxis: { title: 'IGBP Class (1–17)' },
    vAxis: { title: 'Pixel Count' }
  });
print(hist2001);

// 5.2 Histogram of land‐cover class counts (2020)
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

// Helper function to extract a frequencyHistogram dictionary for an image
function getClassCounts(img) {
  return ee.Dictionary(
    img.reduceRegion({
      reducer: ee.Reducer.frequencyHistogram(),
      geometry: bbox,
      scale: 500,
      maxPixels: 1e9
    }).get('land_class')
  );
}

// 5.3 Bar chart comparing class counts (2001 vs. 2020)
var dict2001 = getClassCounts(land_cls_data_first_year);
var dict2020 = getClassCounts(land_cls_data_last_year);

var dict2001Obj = dict2001.getInfo();
var dict2020Obj = dict2020.getInfo();

var featureList = [];
for (var i = 1; i <= 17; i++) {
  featureList.push({
    class: i,
    count_2001: dict2001Obj[i] || 0,
    count_2020: dict2020Obj[i] || 0
  });
}

var classTable = ee.FeatureCollection(
  featureList.map(function(obj) {
    return ee.Feature(null, obj);
  })
);

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
    isStacked: false
  });
print(barChart);

// 5.4 Histogram of NDVI values (2020 Landsat composite)
var ls2020 = datacube_median_data.filter(ee.Filter.eq('year', last_year)).first();
var ndvi2020 = ee.Image(ls2020).select('NDVI');

var histNDVI2020 = ui.Chart.image.histogram({
  image: ndvi2020,
  region: bbox,
  scale: 30,
  minBucketWidth: 0.02
}).setOptions({
  title: 'NDVI Distribution (2020 Landsat Composite)',
  hAxis: { title: 'NDVI' },
  vAxis: { title: 'Pixel Count' }
});
print(histNDVI2020);

// 5.5 Scatter plot: NDVI vs. land_class (2020)
var combined2020 = ee.Image.cat([ndvi2020, land_cls_data_last_year])
  .updateMask(land_cls_data_last_year);

var sample2020 = combined2020.sample({
  region: bbox,
  scale: 500,
  numPixels: 1000,
  seed: 42,
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



//-----------------------------------------------------
// 6. Create a Summary Table for Results/Discussion
//-----------------------------------------------------
// 6.1: Land Cover Class Counts (pixels) for each IGBP class
var classCounts2001 = getClassCounts(land_cls_data_first_year);
var classCounts2020 = getClassCounts(land_cls_data_last_year);

var cc2001 = classCounts2001.getInfo();
var cc2020 = classCounts2020.getInfo();

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
print('Land Cover Class Counts (pixels)', summaryTable);

// 6.2: NDVI Statistics (mean, min, max) for each year
function ndviStats(year) {
  var lsImage = ee.Image(datacube_median_data.filter(ee.Filter.eq('year', year)).first());
  var stats = lsImage.select('NDVI').reduceRegion({
    reducer: ee.Reducer.mean()
               .combine(ee.Reducer.min(), '', true)
               .combine(ee.Reducer.max(), '', true),
    geometry: bbox,
    scale: 30,
    maxPixels: 1e9
  });
  return ee.Feature(null, {
    'Year': year,
    'Mean_NDVI': stats.get('NDVI_mean'),
    'Min_NDVI': stats.get('NDVI_min'),
    'Max_NDVI': stats.get('NDVI_max')
  });
}

var ndviSummary = ee.FeatureCollection([
  ndviStats(first_year),
  ndviStats(last_year)
]);
print('NDVI Statistics', ndviSummary);



//-----------------------------------------------------
// 7. Print Simple, Copyable Tables in the Console
//-----------------------------------------------------
// 7.1: Simple tab-delimited table for land cover counts
print('Class\tCount_2001\tCount_2020');
summaryTable.getInfo().features.forEach(function(f) {
  var props = f.properties;
  print(props.Class + '\t' + props.Count_2001 + '\t' + props.Count_2020);
});

// 7.2: Simple tab-delimited table for NDVI stats
print('Year\tMean_NDVI\tMin_NDVI\tMax_NDVI');
ndviSummary.getInfo().features.forEach(function(f) {
  var p = f.properties;
  // Format NDVI values to 4 decimal places
  var meanN = p.Mean_NDVI ? p.Mean_NDVI.toFixed(4) : 'null';
  var minN  = p.Min_NDVI  ? p.Min_NDVI.toFixed(4)  : 'null';
  var maxN  = p.Max_NDVI  ? p.Max_NDVI.toFixed(4)  : 'null';
  print(p.Year + '\t' + meanN + '\t' + minN + '\t' + maxN);
});



//-----------------------------------------------------
// 8. (Optional) Legend for MODIS IGBP Classes
//-----------------------------------------------------
var palette = [
  '05450a','086a10','54a708','78d203','009900','c6b044','dcd159','dade48',
  'fbff13','b6ff05','27ff87','c24f44','a5a5a5','ff6d4c','69fff8','f9ffa4','1c0dff'
];
var classNames = [
  '1:Evergreen Needleleaf','2:Evergreen Broadleaf','3:Deciduous Needleleaf',
  '4:Deciduous Broadleaf','5:Mixed Forest','6:Closed Shrub',
  '7:Open Shrub','8:Woody Savanna','9:Savanna','10:Grassland',
  '11:Wetlands','12:Croplands','13:Urban','14:Crop/Nat Veg','15:Snow/Ice',
  '16:Barren','17:Water'
];

var legend = ui.Panel({
  style: { position: 'bottom-left', padding: '8px 15px' }
});
legend.add(ui.Label('MODIS IGBP Classes'));

classNames.forEach(function(name, i) {
  var colorBox = ui.Label({
    style: {
      backgroundColor: palette[i],
      padding: '8px',
      margin: '0 0 4px 0'
    }
  });
  var description = ui.Label(name, { margin: '0 0 4px 6px' });
  legend.add(ui.Panel([colorBox, description], ui.Panel.Layout.Flow('horizontal')));
});
Map.add(legend);
