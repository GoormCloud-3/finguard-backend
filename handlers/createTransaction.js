'use strict';

const { v4: uuidv4 } = require('uuid');
const { MinHeap, MaxHeap } = require('./heap');
const dbOps = require('../handler');
const AWSXRay = require('aws-xray-sdk');
const segment = AWSXRay.getSegment();
const traceId = segment.trace_id; // 현재 traceId


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



// Haversine distance 계산 함수
function haversineDistance(coord1, coord2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;
  const R = 6371; // 지구 반지름 (km)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}


module.exports.handler = async (event, context) => {
  const conn = await dbOps();

  try {
    await init();

    const {
      userSub,
      my_account,
      counter_account,
      money,
      used_card,
      description = '출금',
      location //[12.2134, 21.3124] => [위도, 경도]
    } = JSON.parse(event.body);

    // 1. 사기 계좌 확인
    const [fraudCheck] = await conn.execute(
      `SELECT 1 FROM fraud WHERE accountNumber = ?`,
      [counter_account]
    );
    if (fraudCheck.length > 0) {
      return {
        statusCode: 403,
        body: JSON.stringify({ error: "FraudulentAccount", message: "사기 계좌로 송금할 수 없습니다." })
      };
    }

    // 2. 내 계좌 찾기
    const [[myAccRow]] = await conn.execute(
      //`SELECT account_id, balance, gps_location FROM accounts WHERE accountNumber = ?`,
      `SELECT account_id, balance FROM accounts WHERE accountNumber = ?`,
      [my_account]
    );
    if (myAccRow.balance < money) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "InsufficientBalance", message: "잔고가 부족합니다." })
      };
    }

    // 3. 상대방 계좌 찾기
    const [[counterAccRow]] = await conn.execute(
      `SELECT account_id FROM accounts WHERE accountNumber = ?`,
      [counter_account]
    );
    if (!counterAccRow) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "CounterAccountNotFound" })
      };
    }

    // 4. 마지막 출금 트랜잭션 찾기 및 거리 비교. distance_from_home&&distance_from_last_transaction.
    const [[lastTxn]] = await conn.execute(
      `SELECT ST_Y(transaction_gps) AS lat, ST_X(transaction_gps) AS lon FROM transactions WHERE account_id = ? AND type = 'debit' ORDER BY date DESC, time DESC LIMIT 1`,
      [myAccRow.account_id]
    );
    const gps_lastTxn = lastTxn ? [lastTxn.lat, lastTxn.lon] : null; // null 체크


    const [[{ lat, lon }]] = await conn.execute(
      `SELECT ST_Y(gps_location) AS lat, ST_X(gps_location) AS lon FROM users WHERE userSub = ?`,
      [userSub]
    );
    const gps_home = [lat, lon]; // 내 집 위도, 경도


    const distance_from_home = haversineDistance(gps_home, location);
    const distance_from_last_transaction = lastTxn
      ? haversineDistance(gps_lastTxn, location)
      : 0;          //거래한 적 있으면 계산. 거래한 적 없으면 0 return.


    // 5. repeat_retailer 여부 확인
    const [retailerRows] = await conn.execute(
      `SELECT 1 FROM transactions WHERE account_id = ? AND counter_account = ? LIMIT 1`,
      [myAccRow.account_id, counter_account]
    );
    const repeat_retailer = retailerRows.length > 0 ? 1.0 : 0.0; // 거래한 적 있으면 1. 없으면 0.


    // 6. used_chip 카드 사용 여부 확인
    const used_chip = used_card; // 카드 사용아니면 0. 카드 사용&&온라인 결제는 1.

    // 7. 트랜잭션 실행
    await conn.beginTransaction();


    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];
    const debitId = uuidv4();
    const creditId = uuidv4();

    await conn.execute(`UPDATE accounts SET balance = balance - ? WHERE account_id = ?`, [money, myAccRow.account_id]);
    await conn.execute(`UPDATE accounts SET balance = balance + ? WHERE account_id = ?`, [money, counterAccRow.account_id]);


    await conn.execute(
      `INSERT INTO transactions (
    transaction_id, account_id, date, description, time, amount, type, transaction_gps, counter_account
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ST_PointFromText(?), ?)`,
      [debitId, myAccRow.account_id, date, description, time, -money, 'debit', `POINT(${location[1]} ${location[0]})`, counter_account]
    );

    await conn.execute(
      `INSERT INTO transactions (
    transaction_id, account_id, date, description, time, amount, type, transaction_gps, counter_account
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ST_PointFromText(?), ?)`,
      [creditId, counterAccRow.account_id, date, '입금', time, money, 'credit', `POINT(${location[1]} ${location[0]})`, my_account]
    );


    // 8. 중앙값 계산 (거래 성공 후에 수행)
    const [[medianRow]] = await conn.execute(
      `SELECT minHeap, maxHeap FROM median_prices WHERE account_number = ?`,
      [my_account]
    );
    const minHeap = new MinHeap(medianRow ? JSON.parse(medianRow.minHeap) : []);
    const maxHeap = new MaxHeap(medianRow ? JSON.parse(medianRow.maxHeap) : []);


    let medianBeforeInsert = 0;
    if (minHeap.size() === 0 && maxHeap.size() === 0) {
      medianBeforeInsert = 0;
    } else if (minHeap.size() === maxHeap.size()) {
      medianBeforeInsert = (minHeap.peek() + maxHeap.peek()) / 2;
    } else {
      medianBeforeInsert = maxHeap.peek();
    }

    const ratio_to_median_purchase_price = medianBeforeInsert === 0 ? 1.0 : money / medianBeforeInsert;


    // 이후 money를 힙에 넣고 업데이트
    if (maxHeap.size() === 0 || money < maxHeap.peek()) {
      maxHeap.push(money);
    } else {
      minHeap.push(money);
    }

    // 힙 균형 조정
    if (maxHeap.size() > minHeap.size() + 1) {
      minHeap.push(maxHeap.pop());
    } else if (minHeap.size() > maxHeap.size()) {
      maxHeap.push(minHeap.pop());
    }

    await conn.execute(
      `REPLACE INTO median_prices (account_number, minHeap, maxHeap) VALUES (?, ?, ?)`,
      [my_account, JSON.stringify(minHeap.toArray()), JSON.stringify(maxHeap.toArray())]
    );


    // 8. SQS 전송
    const features = [
      distance_from_home,
      distance_from_last_transaction,
      ratio_to_median_purchase_price,
      repeat_retailer,
      used_chip,
    ];

    try {
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ traceId, features }),
        MessageGroupId: "trade-group", //  FIFO 큐에 필수
        MessageDeduplicationId: traceId, //  중복 제거용 
      });
      const result = await sqs.send(command);
      console.log(`[${traceId}] ✅ SQS 메시지 전송 완료, MessageId: ${result.MessageId}`);
    } catch (err) {
      console.error(`[${traceId}] ❌ SQS 메시지 전송 실패:`, err);
      await conn.rollback();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "SqsSendError", message: "SQS 메시지 전송 실패로 거래가 취소되었습니다." })
      };
    }

    await conn.commit();


    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Transfer completed",
        transactions: {
          debit: {
            transactionId: debitId,
            accountId: myAccRow.account_id,
            amount: -money,
          },
          credit: {
            transactionId: creditId,
            accountId: counterAccRow.account_id,
            amount: money,
          }
        }
      })
    };

  } catch (err) {
    console.error(err);
    await conn.rollback();
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'InternalError', message: '송금 처리 중 에러 발생' })
    };
  } finally {
    if (conn) {
      await conn.end();
    }

  }
};
