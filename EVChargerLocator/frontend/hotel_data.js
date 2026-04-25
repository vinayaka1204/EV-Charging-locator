/**
 * MAJOR HOTELS DATASET - BENGALURU
 * Hardcoded high-fidelity data to ensure instant hotel markers across the city.
 */

function parseHotelStations() {
  const hotels = [
    { id: "h-itc-gardenia", Brand: "ITC Gardenia", Title: "ITC Gardenia, Luxury Collection", lat: 12.9715, lng: 77.5940, Rating: 4.7, Reviews: 15400, StreetViewHeading: 280 },
    { id: "h-taj-westend", Brand: "Taj West End", Title: "Taj West End, Bengaluru", lat: 12.9817, lng: 77.5855, Rating: 4.8, Reviews: 12100, StreetViewHeading: 180 },
    { id: "h-leela-palace", Brand: "The Leela Palace", Title: "The Leela Palace Bengaluru", lat: 12.9607, lng: 77.6487, Rating: 4.9, Reviews: 18500, StreetViewHeading: 0 },
    { id: "h-jw-marriott", Brand: "JW Marriott", Title: "JW Marriott Hotel Bengaluru", lat: 12.9698, lng: 77.5969, Rating: 4.6, Reviews: 21000, StreetViewHeading: 90 },
    { id: "h-ritz-carlton", Brand: "The Ritz-Carlton", Title: "The Ritz-Carlton, Bangalore", lat: 12.9702, lng: 77.6001, Rating: 4.7, Reviews: 9800, StreetViewHeading: 0 },
    { id: "h-shangri-la", Brand: "Shangri-La", Title: "Shangri-La Bengaluru", lat: 12.9877, lng: 77.5904, Rating: 4.6, Reviews: 14200, StreetViewHeading: 180 },
    { id: "h-conrad", Brand: "Conrad", Title: "Conrad Bengaluru", lat: 12.9785, lng: 77.6115, Rating: 4.7, Reviews: 11500, StreetViewHeading: 90 },
    { id: "h-sheraton-grand", Brand: "Sheraton Grand", Title: "Sheraton Grand Bangalore Hotel at Brigade Gateway", lat: 13.0112, lng: 77.5548, Rating: 4.7, Reviews: 16800, StreetViewHeading: 270 },
    { id: "h-the-oberoi", Brand: "The Oberoi", Title: "The Oberoi, Bengaluru", lat: 12.9733, lng: 77.6165, Rating: 4.8, Reviews: 8500, StreetViewHeading: 180 },
    { id: "h-vivanta-mg", Brand: "Vivanta", Title: "Vivanta Bengaluru, MG Road", lat: 12.9739, lng: 77.6212, Rating: 4.4, Reviews: 13200, StreetViewHeading: 0 }
  ];

  return hotels.map(h => ({
    ID: h.id,
    IsHotel: true,
    Brand: h.Brand,
    Rating: h.Rating,
    Reviews: h.Reviews,
    StreetViewHeading: h.StreetViewHeading,
    AddressInfo: {
      Title: h.Title,
      AddressLine1: h.Title.split(',')[0],
      Latitude: h.lat,
      Longitude: h.lng,
      Town: "Bengaluru",
      State: "Karnataka"
    },
    Status: { IsOp: true },
    Operator: { Title: h.Brand },
    Connections: [],
    Usage: "Public",
    Points: 5
  }));
}
