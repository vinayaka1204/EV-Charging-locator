# API Documentation

This API Gateway serves the REST API for the EV Charger Locator app.

## `GET /chargers`
Retrieves a list of nearby EV chargers.
- **Query Params**: `lat`, `lng`, `radius`
- **Integration**: `getCharger` Lambda Function
- **Response**: Array of charger objects

## `POST /chargers`
Adds a new EV charger.
- **Body**:
  ```json
  {
    "name": "Downtown Fast Charger",
    "latitude": 34.0522,
    "longitude": -118.2437,
    "type": "fast",
    "status": "available"
  }
  ```
- **Integration**: `addCharger` Lambda Function

## `PUT /chargers/status`
Updates the status of an existing EV charger.
- **Body**:
  ```json
  {
    "id": "uuid-here",
    "status": "busy"
  }
  ```
- **Integration**: `updateStatus` Lambda Function
