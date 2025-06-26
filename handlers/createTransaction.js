// transaction.js
'use strict';

const { v4: uuidv4 } = require('uuid');
const AWS = require('aws-sdk');
const sqs = new AWS.SQS();
const SQS_URL = process.env.SQS_URL;

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

function insertToHeaps(minHeap, maxHeap, value) {
  maxHeap.push(value);
  maxHeap.sort((a, b) => b - a);
  minHeap.sort((a, b) => a - b);

  if (maxHeap.length > minHeap.length + 1) {
    minHeap.push(maxHeap.shift());
  } else if (minHeap.length > maxHeap.length) {
    maxHeap.unshift(minHeap.pop());
  }
}

function calculateMedian(minHeap, maxHeap) {
  if (minHeap.length === 0 && maxHeap.length === 0) return 0;
  if (minHeap.length === maxHeap.length) {
    return (minHeap[minHeap.length - 1] + maxHeap[0]) / 2;
  }
  return maxHeap[0];
}

module.exports = async (event, dbOps) => {
  const conn = await dbOps();

  try {
    const {
      userSub,
      my_account,
      counter_account,
      money,
      used_card,
      description = '출금',
      location
    } = JSON.parse(event.body);

    // 1. 사기 계좌 확인
    const [fraudCheck] = await conn.execute(
      `SELECT 1 FROM fraud WHERE fraud_account_number = ?`,
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
      `SELECT account_id, balance, gps_location FROM accounts WHERE account_number = ?`,
      [my_account]
    );
    if (!myAccRow || myAccRow.balance < money) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "InsufficientBalanceOrNotFound" })
      };
    }

    // 3. 상대방 계좌 찾기
    const [[counterAccRow]] = await conn.execute(
      `SELECT account_id FROM accounts WHERE account_number = ?`,
      [counter_account]
    );
    if (!counterAccRow) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "CounterAccountNotFound" })
      };
    }

    // 4. 마지막 출금 트랜잭션 찾기
    const [[lastTxn]] = await conn.execute(
      `SELECT transaction_gps FROM transactions WHERE account_id = ? AND type = 'debit' ORDER BY date DESC, time DESC LIMIT 1`,
      [myAccRow.account_id]
    );
    const gps_home = JSON.parse(myAccRow.gps_location);
    const distance_from_home = haversineDistance(gps_home, location);
    const distance_from_last_transaction = lastTxn
      ? haversineDistance(JSON.parse(lastTxn.transaction_gps), location)
      : 0;

      //거래한 적 있으면 계산 아니면 0

    // 5. 중앙값 계산
    const [[medianRow]] = await conn.execute(
      `SELECT min_heap, max_heap FROM median_prices WHERE account_number = ?`,
      [my_account]
    );
    let minHeap = medianRow ? JSON.parse(medianRow.min_heap) : [];
    let maxHeap = medianRow ? JSON.parse(medianRow.max_heap) : [];
    insertToHeaps(minHeap, maxHeap, money);
    const median = calculateMedian(minHeap, maxHeap);
    const ratio_to_median_purchase_price = median === 0 ? 1.0 : money / median;

    await conn.execute(
      `REPLACE INTO median_prices (account_number, min_heap, max_heap) VALUES (?, ?, ?)`,
      [my_account, JSON.stringify(minHeap), JSON.stringify(maxHeap)]
    );

    // 6. repeat_retailer 여부 확인
    const [retailerRows] = await conn.execute(
      `SELECT 1 FROM transactions WHERE account_id = ? AND counter_account = ? LIMIT 1`,
      [myAccRow.account_id, counter_account]
    );
    const repeat_retailer = retailerRows.length > 0 ? 1.0 : 0.0;
    

    const used_chip = used_card;

    // 7. 트랜잭션 실행
    await conn.beginTransaction();

    await conn.execute(`UPDATE accounts SET balance = balance - ? WHERE account_id = ?`, [money, myAccRow.account_id]);
    await conn.execute(`UPDATE accounts SET balance = balance + ? WHERE account_id = ?`, [money, counterAccRow.account_id]);

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toTimeString().split(' ')[0];
    const debitId = uuidv4();
    const creditId = uuidv4();

    await conn.execute(
      `INSERT INTO transactions (transaction_id, account_id, date, description, time, amount, type, transaction_gps, counter_account) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [debitId, myAccRow.account_id, date, description, time, -money, 'debit', JSON.stringify(location), counter_account]
    );
    await conn.execute(
      `INSERT INTO transactions (transaction_id, account_id, date, description, time, amount, type, transaction_gps, counter_account) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [creditId, counterAccRow.account_id, date, '입금', time, money, 'credit', JSON.stringify(location), my_account]
    );

    await conn.commit();

    // 8. SQS 전송
    const features = [
      distance_from_home,
      distance_from_last_transaction,
      ratio_to_median_purchase_price,
      repeat_retailer,
      used_chip
    ];

    await sqs.sendMessage({
      QueueUrl: SQS_URL,
      MessageBody: JSON.stringify({ features })
    }).promise();

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Transfer completed",
        transactionIds: { debit: debitId, credit: creditId }
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
    await conn.end();
  }
};
