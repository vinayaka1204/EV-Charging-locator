// Configuration file for the EV Charger Locator App

const config = {
  // Replace with your actual API Gateway URL
  apiBaseUrl: process.env.API_BASE_URL || 'https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod',
  
  // Replace with your actual Google Maps API Key
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_API_KEY',
  
  // Map settings
  mapOptions: {
    defaultCenter: { lat: 34.0522, lng: -118.2437 }, // Los Angeles
    defaultZoom: 12,
  },
  
  // App settings
  refreshInterval: 60000 // Refresh data every 60 seconds
};

module.exports = config;
