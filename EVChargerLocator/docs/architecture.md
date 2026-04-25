# System Architecture

```mermaid
graph TD
    Client[Web Browser / Client]
    
    subgraph Frontend "Frontend (S3 + CloudFront)"
        App[HTML / CSS / JS UI]
        Maps[Google Maps API]
    end
    
    subgraph AWS_Backend "AWS Serverless Backend"
        API[Amazon API Gateway REST API]
        
        Lambda1[Lambda: getCharger]
        Lambda2[Lambda: addCharger]
        Lambda3[Lambda: updateStatus]
        
        DB[(Amazon DynamoDB TABLE: EVChargers)]
    end
    
    %% Connections
    Client -->|Loads| App
    App -->|Requests Map| Maps
    
    App -->|HTTPS REST| API
    
    API -->|GET /chargers| Lambda1
    API -->|POST /chargers| Lambda2
    API -->|PUT /chargers/status| Lambda3
    
    Lambda1 -->|Scan/Query| DB
    Lambda2 -->|PutItem| DB
    Lambda3 -->|UpdateItem| DB
```

*(Note: Replace this diagram with an actual `architecture.png` if required for external presentation)*
