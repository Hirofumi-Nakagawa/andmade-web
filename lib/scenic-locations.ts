export type ScenicLocation = {
  /** Displayed as its own bottom-of-screen readout (components/scenic-map-background.tsx's
   *  own LocationNameReadout), above the coordinates line — the photo itself
   *  still carries zero baked-in text/labels (that part of the original
   *  brief is about the Static Maps image, not this separate on-page copy). */
  name: string;
  lat: number;
  lng: number;
  /** Static Maps API zoom level, hand-picked per location so the interesting
   *  feature (a mountain, a reef, a city grid, ...) actually fills the frame
   *  instead of being a tiny dot or too cropped to recognize. */
  zoom: number;
};

/**
 * Curated worldwide satellite/aerial spots for the 404 page's background
 * (components/scenic-map-background.tsx) — a mix of mountains, cityscapes,
 * greenery/water, and colorful natural landscapes. Hand-picked rather than
 * sourced from any particular list — coordinates point at the real feature
 * in each case, but treat these as good-faith aerial-photogenic picks
 * rather than verified-precise landmark centers.
 */
export const SCENIC_LOCATIONS: ScenicLocation[] = [
  // Mountains
  { name: "Matterhorn, Swiss Alps", lat: 45.9763, lng: 7.6586, zoom: 12 },
  { name: "Mount Fuji, Japan", lat: 35.3606, lng: 138.7274, zoom: 11 },
  { name: "Torres del Paine, Patagonia", lat: -50.9423, lng: -73.4068, zoom: 11 },
  { name: "Dolomites, Italy", lat: 46.4102, lng: 11.844, zoom: 12 },
  { name: "Himalayas near Everest", lat: 27.9881, lng: 86.925, zoom: 11 },
  { name: "Denali, Alaska", lat: 63.0692, lng: -151.007, zoom: 11 },
  { name: "Mount Kilimanjaro, Tanzania", lat: -3.0674, lng: 37.3556, zoom: 11 },
  { name: "Aconcagua, Argentina", lat: -32.6532, lng: -70.0109, zoom: 12 },
  { name: "Mont Blanc, France/Italy", lat: 45.8326, lng: 6.8652, zoom: 12 },
  { name: "Aoraki/Mount Cook, New Zealand", lat: -43.595, lng: 170.1418, zoom: 12 },

  // Cityscapes
  { name: "Palm Jumeirah, Dubai", lat: 25.1124, lng: 55.139, zoom: 14 },
  { name: "Venice, Italy", lat: 45.4408, lng: 12.3155, zoom: 14 },
  { name: "Santorini, Greece", lat: 36.3932, lng: 25.4615, zoom: 13 },
  { name: "Central Park, Manhattan", lat: 40.7829, lng: -73.9654, zoom: 13 },
  { name: "Eixample District, Barcelona", lat: 41.3958, lng: 2.1642, zoom: 15 },

  // Greenery & water
  { name: "Amazon River meander, Peru", lat: -3.4653, lng: -62.2159, zoom: 11 },
  { name: "Iguazu Falls, Argentina/Brazil", lat: -25.6953, lng: -54.4367, zoom: 14 },
  { name: "Ha Long Bay, Vietnam", lat: 20.9101, lng: 107.1839, zoom: 12 },
  { name: "Milford Sound, New Zealand", lat: -44.6714, lng: 167.925, zoom: 12 },
  // Great Barrier Reef は削除 — per direct follow-up ("404ページの
  // great barrier~は無しにして")。
  { name: "Maldives atolls", lat: 4.1755, lng: 73.5093, zoom: 12 },
  { name: "Bora Bora, French Polynesia", lat: -16.5004, lng: -151.7415, zoom: 13 },

  // Colorful & unusual landscapes
  { name: "Uyuni Salt Flat, Bolivia", lat: -20.1338, lng: -67.4891, zoom: 12 },
  { name: "Zhangye Danxia Landform, China", lat: 38.9328, lng: 100.1054, zoom: 14 },
  { name: "Grand Prismatic Spring, Yellowstone", lat: 44.5251, lng: -110.8381, zoom: 15 },
  { name: "Lake Hillier, Australia", lat: -34.0972, lng: 123.2011, zoom: 14 },
  { name: "Rio Tinto, Spain", lat: 37.7, lng: -6.5667, zoom: 13 },
  { name: "Sossusvlei dunes, Namibia", lat: -24.7333, lng: 15.3, zoom: 13 },
  { name: "Palouse farmland patchwork, USA", lat: 46.6, lng: -117.6, zoom: 12 },
  { name: "Dead Sea, Israel/Jordan", lat: 31.5, lng: 35.4795, zoom: 11 },
  { name: "Tulip fields of Lisse, Netherlands", lat: 52.2705, lng: 4.5466, zoom: 14 },
];
