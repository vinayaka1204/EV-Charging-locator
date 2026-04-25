const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        const { lat, lng, radius } = event.queryStringParameters || {};
        
        // Note: For a real production app with geospatial queries, 
        // you would use Amazon Location Service or DynamoDB Geo.
        // This is a simplified scan for demonstration purposes.
        const params = {
            TableName: process.env.TABLE_NAME || 'EVChargers',
        };
        
        const data = await dynamoDb.scan(params).promise();
        
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data.Items)
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Could not retrieve chargers" })
        };
    }
};
