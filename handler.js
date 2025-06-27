const { Signer } = require("@aws-sdk/rds-signer");
const { GetParameterCommand, SSMClient } = require("@aws-sdk/client-ssm");
const mysql = require("mysql2/promise");

const region = "ap-northeast-2";
const ssmClient = new SSMClient({ region });

let hostName, dbUserName, database;
let initialized = false;


const createUser = require('./handlers/createUser');
const signIn = require('./handlers/signIn');
const createAccount = require('./handlers/createAccount');
const getAccount = require('./handlers/getAccount');
const createTransaction = require('./handlers/createTransaction');


async function init() {
  if (initialized) return; // 여러 번 호출되지 않도록 방지
  try {
    [hostName, dbUserName, database] = await Promise.all([
      getParam("/finguard/finance/rds_proxy", false),
      getParam("/finguard/finance/rds_username", false),
      getParam("/finguard/finance/rds_database", false),
    ]);
    initialized = true;
  } catch (err) {
    console.error("SSM 파라미터 조회 실패:", err);
    throw err; // Lambda가 실패하도록 에러 전파
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

async function createAuthToken() {
  const signer = new Signer({
    region,
    hostname: hostName,
    port: 3306,
    username: dbUserName,
  });

  return await signer.getAuthToken();
}

async function dbOps() {
  await init(); // 파라미터 미리 초기화

  const token = await createAuthToken();

  const connectionConfig = {
    host: hostName,
    user: dbUserName,
    password: token,
    database: database,
    ssl: {
      rejectUnauthorized: true
    }
  };

  const conn = await mysql.createConnection(connectionConfig);
  // const [res] = await conn.execute('SELECT ? + ? AS sum', [3, 2]);
  // await conn.end();
  return conn; // 커넥션 객체 반환, 쿼리 실행 및 종료는 호출자가 담당
}



exports.hello = async (event) => {
  //const result = await dbOps();
  const path = event.rawPath;
  const method = event.requestContext.http.method;

  // return {
  //   statusCode: 200,
  //   body: JSON.stringify("The selected sum is: " + result[0].sum)
  // };

  try {
    if (path === '/users' && method === 'POST') {
      return await createUsers(event, dbOps);
    } else if (path === '/users/sign-in' && method === 'POST') {
      return await signIn(event, dbOps);
    } else if (path === '/financial/accounts' && method === 'POST') {
      return await createAccount(event, dbOps);
    } else if (path.startsWith('/accounts/') && method === 'GET') {
      return await getAccount(event, dbOps);
    } else if (path.startsWith('/financial/accounts/') && method === 'GET') {
      return await getAccountList(event, dbOps);
    } else if (path.startsWith('/banks/accounts') && method === 'POST') {
      return await createTransaction(event, dbOps);
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Not Found' }),
      };
    }
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }




};
