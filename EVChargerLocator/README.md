# ⚡ EV Charger Locator App

A production-level web application designed to help users find nearby Electric Vehicle (EV) charging stations. The app features a professional, modern dark mode UI/UX and is powered by a scalable AWS Serverless backend.

## Features
- **Interactive Map**: Built with Google Maps API and Marker Clustering.
- **Modern UI**: Full glassmorphism design, dark mode, responsive layout.
- **Real-time Filters**: Filter by Charger Type (Fast/Slow/Level 2) and Availability.
- **Search**: Auto-complete location search.
- **Serverless Backend**: Powered by AWS Lambda, API Gateway, and DynamoDB.

## Architecture
- **Frontend**: HTML5, CSS3 (Modern, Vanilla), JavaScript
- **Backend / API**: AWS API Gateway, AWS Lambda (Node.js)
- **Database**: Amazon DynamoDB

## Setup Instructions

### Backend Setup (AWS)
1. **DynamoDB**: Create a table using the schema provided in `database/dynamodb-schema.json`.
2. **Lambda Functions**: Deploy the three functions in `backend/` (`getCharger`, `addCharger`, `updateStatus`). Ensure they have execution roles with DynamoDB access. Set the `TABLE_NAME` environment variable.
3. **API Gateway**: Set up routes according to `api/routes.md` and connect them to the Lambda functions. Enable CORS.

### Frontend Setup
1. Replace `YOUR_API_KEY` in `frontend/index.html` with your actual Google Maps API Key.
2. In `frontend/script.js`, ensure the API paths match your deployed API Gateway endpoints.
3. Serve the `frontend/` folder using a static web server (e.g., Live Server, S3 Static Web Hosting, or CloudFront).

## License
MIT
