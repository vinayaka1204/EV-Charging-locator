const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();
const { v4: uuidv4 } = require('uuid');

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const { name, latitude, longitude, type, status } = body;
        
        const params = {
            TableName: process.env.TABLE_NAME || 'EVChargers',
            Item: {
                id: uuidv4(),
                name,
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                type: type || 'level2',
                status: status || 'available',
                lastUpdated: new Date().toISOString()
            }
        };
        
        await dynamoDb.put(params).promise();
        
        return {
            statusCode: 201,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(params.Item)
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Could not add charger" })
        };
    }
};
