
const AWSXRay = require('aws-xray-sdk');
const { GetParameterCommand, SSMClient } = require("@aws-sdk/client-ssm");
const { SageMakerRuntimeClient, InvokeEndpointCommand } = require("@aws-sdk/client-sagemaker-runtime");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");


// 공통 설정 및 클라이언트 생성 (1회만)
const region = "ap-northeast-2";
const ssmClient = new SSMClient({ region });
const ddbClient = new DynamoDBClient({ region });
const sagemakerClient = new SageMakerRuntimeClient({ region });
const snsClient = new SNSClient({ region });

let sageMakerEndpoint;
let topicArn;
let initialized = false;
let tableName;


async function getFcmTokens(sub) {
  const getCmd = new GetItemCommand({
    TableName: tableName,
    Key: { user_id: { S: sub } },
    ProjectionExpression: 'fcmTokens',
  });

  const result = await ddbClient.send(getCmd);
  const tokens = result.Item?.fcmTokens?.L?.map(t => t.S) || [];
  console.log(`✅ FCM 토큰 ${tokens.length}개 조회됨:`, tokens);
  return tokens;
}

async function invokeSageMaker(endpoint, features) {
  console.log("📡 invokeSageMaker: sending features to endpoint", endpoint);
  console.log("📤 features:", JSON.stringify(features));
  const command = new InvokeEndpointCommand({
    EndpointName: endpoint,
    Body: JSON.stringify({ features }),
    ContentType: "application/json",
  });
  const response = await sagemakerClient.send(command);
  const result = JSON.parse(Buffer.from(response.Body).toString("utf-8"));
  console.log("✅ SageMaker response received:", result);
  return result;
}

async function publishSns(topicArn, fcmTokens, traceId) {
  console.log(`🔔 publishSns: fcmTokens = ${fcmTokens}`);
  console.log(`🔔 publishSns: traceId = ${traceId}`);
  const command = new PublishCommand({
    TopicArn: topicArn,
    Message: JSON.stringify({ fcmTokens, traceId }),
  });
  const result = await snsClient.send(command);
  console.log("✅ SNS publish result:", result);
  return result;
}

async function getParam(name, withDecryption) {
  const input = {
    Name: name,
    WithDecryption: withDecryption,
  };

  const command = new GetParameterCommand(input);
  const response = await ssmClient.send(command);
  return response.Parameter.Value;
}

async function init() {
  if (initialized) return;
  console.log("⚙️ Initializing Lambda...");
  sageMakerEndpoint = await getParam("/finguard/dev/finance/fraud_sage_maker_endpoint_name");
  topicArn = await getParam("/finguard/dev/finance/alert_sns_topic");
  tableName = await getParam("/finguard/dev/finance/notification_table_name");

  console.log("✅ SageMaker Endpoint:", sageMakerEndpoint);
  console.log("✅ SNS Topic ARN:", topicArn);
  console.log("✅ DynamoDB 테이블명:", tableName);

  initialized = true;
  console.log("✅ Initialization complete");
}


const AWSXRay = require('aws-xray-sdk-core');
const AWS = AWSXRay.captureAWS(require('aws-sdk'));

exports.receive = async (event) => {
  console.log("📥 Lambda triggered with event:", JSON.stringify(event));

  await init();

  const results = await Promise.allSettled(
    (event.Records || []).map(record => {
      const msg = JSON.parse(record.body);
      const traceHeaderStr = record.messageAttributes?.['X-Amzn-Trace-Id']?.stringValue;

      let baseSegment = AWSXRay.getSegment(); // 기본 세그먼트

      // 💡 메시지에 trace header가 있으면 새로운 루트 세그먼트로 설정
      if (traceHeaderStr) {
        const traceData = AWSXRay.utils.processTraceData(traceHeaderStr);
        baseSegment = new AWSXRay.Segment('SQS->Lambda', traceData.Root, traceData.Parent);
        AWSXRay.setSegment(baseSegment);
      }

      return AWSXRay.captureAsyncFunc(`fromSqsToSageMaker_${msg.traceId}`, async (sub) => {
        try {
          sub.addMetadata('startTime', new Date().toISOString());
          console.log(`🚀1️⃣ Processing message with traceId: ${msg.traceId} userSub: ${msg.userSub}`);

          const result = await invokeSageMaker(sageMakerEndpoint, msg.features);
          sub.addMetadata("traceId", msg.traceId);
          sub.addMetadata("prediction", result.prediction);

          console.log("📢prediction", result.prediction);
          console.log("📢probability", result.probability);

          if (result.prediction === 1) {
            console.log(`🔔 Sending alert for traceId ${msg.traceId}`);
            const fcmTokens = await getFcmTokens(msg.userSub);
            console.log("📱 Retrieved FCM tokens:", fcmTokens);

            await publishSns(topicArn, fcmTokens, msg.traceId);
            sub.addMetadata("sns", "sent");
          } else {
            console.log(`ℹ️ Prediction below threshold for traceId ${msg.traceId}`);
            sub.addMetadata("sns", "skipped");
          }

          sub.addMetadata('finishTime', new Date().toISOString());
          return { traceId: msg.traceId, status: "fulfilled" };

        } catch (err) {
          console.error(`❌ Error processing traceId ${msg.traceId}:`, err);
          sub.addError(err);
          return { traceId: msg.traceId, status: "rejected", reason: err.message };
        } finally {
          sub.close();
          baseSegment.close(); // 🔚 루트 세그먼트도 닫아줌
        }
      });
    })
  );

  const failed = results.filter(r => r.status === "rejected");
  if (failed.length > 0) {
    console.error(`❌ ${failed.length}개의 메시지 처리 실패`, failed);
    throw new Error(`${failed.length} 메시지 처리 실패`);
  }

  console.log("✅ 모든 메시지 정상 처리 완료");
  return {
    statusCode: 200,
    body: JSON.stringify({ received: event.Records.length }),
  };
};