const AWSXRay = require('aws-xray-sdk');
const { GetParameterCommand, SSMClient } = require("@aws-sdk/client-ssm");
const { SageMakerRuntimeClient, InvokeEndpointCommand } = require("@aws-sdk/client-sagemaker-runtime");
const { SNSClient, PublishCommand } = require("@aws-sdk/client-sns");

const region = "ap-northeast-2";
const ssmClient = new SSMClient({ region });
const sagemakerClient = new SageMakerRuntimeClient({ region });
const snsClient = new SNSClient({ region });

const segment = AWSXRay.getSegment(); // 현재 Lambda의 기본 segment


let sageMakerEndpoint;
let topicArn; //SNS topicARN
let initialized = false;

async function init() {
  if (initialized) return;
  try {
    sageMakerEndpoint = await getParam("/finguard/dev/finance/fraud_sage_maker_endpoint_name", false);
    topicArn = await getParam("/finguard/dev/sns_arn_fraud_alert", false);
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
  const subsegment = segment.addNewSubsegment('LAMBDA::SQS_SAGEMAKER_SNS');
  subsegment.addMetadata('eventTime', new Date().toISOString());
  subsegment.addMetadata('eventType', 'SQS_SEND_FINISH');


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

      subsegment.addMetadata('eventTime', new Date().toISOString());
      subsegment.addMetadata('traceId', traceId);
      subsegment.addMetadata('eventType', 'SAGEMAKER_SEND_START');





      return new Promise((resolve) => {
        AWSXRay.captureAsyncFunc(`fromSqsToSageMaker_Inference_${traceId}`, async (subsegment) => {
          try {
            subsegment.addAnnotation("traceId", traceId);
            subsegment.addMetadata("features", features);

            console.log("from sqs features:", features);

            const command = new InvokeEndpointCommand({
              EndpointName: sageMakerEndpoint,
              Body: JSON.stringify({ instances: [features] }),
              ContentType: "application/json",
            });

            const response = await sagemakerClient.send(command);
            const result = JSON.parse(Buffer.from(response.Body).toString('utf-8'));


            subsegment.addMetadata('eventTime', new Date().toISOString());
            subsegment.addMetadata('traceId', traceId);
            subsegment.addMetadata('messageId', result.MessageId);
            subsegment.addMetadata('sendResult', result);
            subsegment.addMetadata('eventType', 'SAGEMAKER_SEND_FINISH');

            const prediction = Array.isArray(result?.predictions) ? result.predictions[0] : null;
            if (prediction === null) throw new Error("SageMaker 예측값이 없습니다.");

            subsegment.addMetadata("predictionResult", prediction);
            console.log(`[${traceId}] ✅ 예측 결과:`, prediction);

            // ✅ 조건부 SNS 전송 (0.8 이상일 때만)
            if (prediction >= 0.8) {
              try {
                subsegment.addMetadata('eventTime', new Date().toISOString());
                subsegment.addMetadata('traceId', traceId);
                subsegment.addMetadata('eventType', 'SNS_SEND_START');

                const snsCommand = new PublishCommand({
                  TopicArn: topicArn,
                  Message: JSON.stringify({ traceId, prediction }),
                });
                await snsClient.send(snsCommand);
                console.log(`[${traceId}] 🔔 SNS 전송 완료 (score ≥ 0.8)`);

                subsegment.addMetadata('eventTime', new Date().toISOString());
                subsegment.addMetadata('traceId', traceId);
                subsegment.addMetadata('eventType', 'SNS_SEND_FINISH');

              } catch (snsErr) {
                subsegment.addError(snsErr);

                console.error(`[${traceId}] ❌ SNS 전송 실패:`, snsErr);
              }
            } else {
              subsegment.addMetadata('eventTime', new Date().toISOString());
              subsegment.addMetadata('traceId', traceId);
              subsegment.addMetadata('eventType', 'SNS_SEND_EXIT');
              console.log(`[${traceId}] ℹ️ 예측값 ${prediction}이 기준치 미만이라 SNS 전송 생략`);
            }



            resolve({ traceId, status: "fulfilled", prediction });

          } catch (err) {
            subsegment.addError(err);
            console.error(`[${traceId}] ❌ 처리 실패:`, err);
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
    console.error(`❌ ${failed.length}개의 메시지 처리 실패`, failed);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      received: messages.length,
      failed: failed.length,
    }),
  };
};
