const { GetParameterCommand, SSMClient } = require("@aws-sdk/client-ssm");

const region = "ap-northeast-2";
const ssmClient = new SSMClient({ region });

let queueName;
let initialized = false;

async function init() {
  if (initialized) return;
  try {
    queueName = await getParam("/finguard/dev/finance/trade_queue_host", false);
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
  await init();

  console.log("📩 SQS 메시지 수신");
  console.log("Queue Name:", queueName);
  console.log("Event:", JSON.stringify(event, null, 2));

  const messages = (event.Records || []).map((record) => {
    return {
      messageId: record.messageId,
      body: record.body,
      attributes: record.attributes,
    };
  });

  console.log("Parsed Messages:", messages);

  return {
    statusCode: 200,
    body: JSON.stringify({ received: messages.length }),
  };
};
