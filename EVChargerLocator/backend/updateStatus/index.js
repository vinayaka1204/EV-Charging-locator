const AWS = require('aws-sdk');
const dynamoDb = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
    try {
        const body = JSON.parse(event.body);
        const { id, status } = body;
        
        const params = {
            TableName: process.env.TABLE_NAME || 'EVChargers',
            Key: { id },
            UpdateExpression: "set #status = :s, lastUpdated = :l",
            ExpressionAttributeNames: {
                "#status": "status"
            },
            ExpressionAttributeValues: {
                ":s": status,
                ":l": new Date().toISOString()
            },
            ReturnValues: "ALL_NEW"
        };
        
        const result = await dynamoDb.update(params).promise();
        
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify(result.Attributes)
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: "Could not update status" })
        };
    }
};
