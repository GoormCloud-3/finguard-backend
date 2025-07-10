'use strict';
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} = require('@aws-sdk/client-dynamodb');
const { GetParameterCommand, SSMClient } = require('@aws-sdk/client-ssm');

const dbOps = require('../handler');
const client = new DynamoDBClient();
const ssmClient = new SSMClient();

let initialized = false;
let tableName;


async function init() {
  if (initialized) return;
  const command = new GetParameterCommand({
    Name: "/finguard/dev/finance/notification_table_name",
    WithDecryption: false,
  });

  const response = await ssmClient.send(command);
  tableName = response.Parameter.Value;
  console.log("✅ DynamoDB 테이블명:", tableName);
  initialized = true;
}

async function storeFcmToken(sub, fcmToken) {
  const getCmd = new GetItemCommand({
    TableName: tableName,
    Key: { user_id: { S: sub } },
  });

  const result = await client.send(getCmd);

  // ❌ 존재하지 않으면 새로 추가
  if (!result.Item) {
    const putCmd = new PutItemCommand({
      TableName: tableName,
      Item: {
        user_id: { S: sub },
        fcmTokens: { L: [{ S: fcmToken }] },
      },
    });

    await client.send(putCmd);
    console.log("🆕 sub 새로 등록 + 토큰 추가됨:", fcmToken);
    return;
  }

  // ✅ 이미 존재하면 중복 체크 후 추가
  const existing = result.Item.fcmTokens?.L?.map(t => t.S) || [];

  if (existing.includes(fcmToken)) {
    console.log('✅ 이미 등록된 FCM 토큰:', fcmToken);
    return;
  }

  const updateCmd = new UpdateItemCommand({
    TableName: tableName,
    Key: { user_id: { S: sub } },
    UpdateExpression: "SET fcmTokens = list_append(if_not_exists(fcmTokens, :empty), :new)",
    ExpressionAttributeValues: {
      ":new": { L: [{ S: fcmToken }] },
      ":empty": { L: [] },
    },
  });

  await client.send(updateCmd);
  console.log("✅ 기존 sub에 토큰 추가됨:", fcmToken);
}

module.exports.handler = async (event, context) => {
  const conn = await dbOps();
  await init();
  // const userSub = event.pathParameters.userSub;

  const {
    sub,
    fcmToken
  } = JSON.parse(event.body);
  console.log("sub", sub);
  console.log("fcmToken", fcmToken);

  // ✅ 입력 검증
  if (!sub || !fcmToken || (typeof fcmToken !== 'string' && !Array.isArray(fcmToken))) {
    return {
      statusCode: 400,
      body: "Missing or invalid sub or fcmToken"
    };
  }

  // ✅ fcmToken을 배열로 정규화
  const tokens = Array.isArray(fcmToken) ? fcmToken : [fcmToken];

  // ✅ 중복 체크 및 저장
  for (const token of tokens) {
    await storeFcmToken(sub, token);
  }

  try {
    const [rows] = await conn.execute(
      `SELECT account_id, accountName, accountNumber, balance, bankName
       FROM accounts 
       WHERE userSub = ?`,
      [sub]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        sub,
        accounts: rows.map(row => ({
          accountId: row.account_id,
          accountName: row.accountName,
          accountNumber: row.accountNumber,
          bankName: row.bankName,
          balance: row.balance,
        })),
      }),
    };
  } catch (err) {
    console.error('Error fetching user accounts:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  } finally {
    await conn.end();
  }
};
