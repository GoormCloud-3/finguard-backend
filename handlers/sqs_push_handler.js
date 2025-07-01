const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { GetParameterCommand, SSMClient } = require("@aws-sdk/client-ssm");

const region = "ap-northeast-2";
const ssmClient = new SSMClient({ region });

let queueUrl;
let initialized = false;

async function init() {
  if (initialized) return;
  try {
    queueUrl = await getParam("/finguard/dev/finance/trade_queue_host", false);
    console.log("queueUrl:", queueUrl);
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

const sqs = new SQSClient({ region });

exports.send = async (event) => {
  await init();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (err) {
    console.error("JSON 파싱 실패:", err);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Invalid JSON format" }),
    };
  }

  const params = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(body),
  };

  console.log("params:", params);
  const command = new SendMessageCommand(params);

  try {
    const result = await sqs.send(command);
    return {
      statusCode: 200,
      body: JSON.stringify({ messageId: result.MessageId }),
    };
  } catch (err) {
    console.error("SQS 전송 실패:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to send message to SQS" }),
    };
  }
};
