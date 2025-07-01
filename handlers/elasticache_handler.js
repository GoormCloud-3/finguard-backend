const Redis = require("ioredis");
const { GetParameterCommand, SSMClient } = require("@aws-sdk/client-ssm");

const region = "ap-northeast-2";
const ssmClient = new SSMClient({ region });

let redisHost;
let redisClient;
let initialized = false;

async function init() {
  if (initialized) return;

  try {
    redisHost = await getParam("/finguard/dev/finance/redis_host", false);
    console.log("redisHost:", redisHost);

    redisClient = new Redis({
      host: redisHost,
      port: 6379,
      // tls: {}, // 보안 그룹 통해 내부 통신 시 필요 없으면 지워도 됨
    });

    redisClient.on("error", (err) => {
      console.error("Redis 에러:", err);
    });

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

exports.handler = async (event) => {
  await init();

  const body = JSON.parse(event.body || "{}");
  const key = body.key || "defaultKey";
  const value = body.value || "defaultValue";

  try {
    await redisClient.set(key, value);
    const result = await redisClient.get(key);

    return {
      statusCode: 200,
      body: JSON.stringify({ stored: result }),
    };
  } catch (err) {
    console.error("Redis 오류:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Redis 작업 실패" }),
    };
  }
};
