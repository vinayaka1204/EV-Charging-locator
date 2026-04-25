# EV Charger Locator App - Project Report

## Executive Summary
This report outlines the architecture, design decisions, and implementation details for the EV Charger Locator web application. The goal of this application is to provide a scalable, fast, and user-friendly portal for finding electric vehicle charging stations globally.

## Architecture Highlights
The application relies on a modern serverless AWS infrastructure. By going serverless, the application is highly available, scales dynamically with user traffic, and incurs minimal costs during low-traffic periods.

**1. Frontend Layer:**
- **Technology:** Vanilla HTML5, CSS3, JavaScript.
- **Design:** Implements premium glassmorphism dark-mode UI for visual impact.
- **Mapping:** Leverages the Google Maps JavaScript API with custom dark styling to match the application aesthetic.

**2. API Layer:**
- **Technology:** Amazon API Gateway.
- **Role:** Acts as the "front door" for the API requests, terminating TLS, and handling CORS pre-flight requests before forwarding the payload to the backend functions.

**3. Application Layer:**
- **Technology:** AWS Lambda (Node.js 20.x).
- **Functions:**
  - `getCharger`: Scans the database based on spatial boundaries (mocked as simple scan for MVP).
  - `addCharger`: Inserts a newly provisioned charger station into the database.
  - `updateStatus`: Dynamically updates the real-time status of a charger (Available, Busy, Offline).

**4. Data Layer:**
- **Technology:** Amazon DynamoDB.
- **Design:** A NoSQL Key-Value store offering single-digit millisecond performance. Global Secondary Indexes (GSI) on the `status` attribute allow rapid filtering.

## Next Steps & Enhancements
- **Geo-Spatial Querying:** Upgrade the DynamoDB scan logic to utilize Amazon Location Service or DynamoDB Geo for true geospatial radius searches.
- **Real-Time Data:** Implement AWS AppSync (GraphQL) or API Gateway WebSockets to push status updates to the client in real-time instead of polling.
- **User Authentication:** Integrate Amazon Cognito to securely manage user profiles, saved favorites, and charging history.
