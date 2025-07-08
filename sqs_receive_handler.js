const AWSXRay = require('aws-xray-sdk');
const { GetParameterCommand, SSMClient } = require("@aws-sdk/client-ssm");
const { SageMakerRuntimeClient, InvokeEndpointCommand } = require("@aws-sdk/client-sagemaker-runtime");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const region = "ap-northeast-2";
const ssmClient = new SSMClient({ region });
const sagemakerClient = new SageMakerRuntimeClient({ region });
const snsClient = new SNSClient({ region });

let sageMakerEndpoint;
let topicArn; //SNS topicARN
let initialized = false;

async function init() {
  if (initialized) return;
  try {
    sageMakerEndpoint = await getParam("/finguard/dev/finance/fraud_sage_maker_endpoint_name", false);
    topicArn = await getParam("/finguard/dev/finance/fraud_sns_topic", false);
    initialized = true;
  } catch (err) {
    console.error("SSM 파라미터 조회 실패:", err);
    throw err;
  }
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

exports.receive = async (event) => {
  //await init();

  console.log("📩 SQS 메시지 수신");

  const messages = (event.Records || []).map((record) => {
    const body = JSON.parse(record.body);
    return {
      traceId: body.traceId,
      features: body.features,
    };
  });

  const results = await Promise.allSettled(
    messages.map((msg) => {
      const { traceId, features } = msg;





      return new Promise((resolve) => {
        AWSXRay.captureAsyncFunc(`fromSqsToSageMaker_Inference_${traceId}`, async (subsegment) => {
          try {
            subsegment.addAnnotation("traceId", traceId);
            subsegment.addMetadata("features", features);

            console.log("from sqs features:", features);

            resolve({ traceId, status: "fulfilled", prediction });

          } catch (err) {
            subsegment.addError(err);
            console.error(`[${traceId}]  처리 실패:`, err);
            resolve({ traceId, status: "rejected", reason: err.message });
          } finally {
            subsegment.close();
          }
        });
      });
    })
  );

  const failed = results.filter(r => r.status === "rejected");
  if (failed.length > 0) {
    console.error(` ${failed.length}개의 메시지 처리 실패`, failed);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      received: messages.length,
      failed: failed.length,
    }),
  };
};
