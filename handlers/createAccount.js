'use strict';

const { v4: uuidv4 } = require('uuid');

function generateAccountNumber() {
  const part1 = String(Math.floor(Math.random() * 900) + 100);
  const part2 = String(Math.floor(Math.random() * 900) + 100);
  const part3 = String(Math.floor(Math.random() * 90000) + 10000);
  return `${part1}-${part2}-${part3}`;
} 

async function generateUniqueAccountNumber(conn) {
  while (true) {
    const accountNumber = generateAccountNumber();
    const [rows] = await conn.execute(
      `SELECT 1 FROM accounts WHERE accountNumber = ?`,
      [accountNumber]
    );
    if (rows.length === 0) return accountNumber;
  }
}

const dbOps = require('../handler');

module.exports.handler = async (event,context) => {
  const conn = await dbOps();

  try {
    const { userSub, accountName, bankName } = JSON.parse(event.body);
    console.log(userSub, accountName, bankName);
    // 계좌번호 중복 검사 및 생성
    const accountNumber = await generateUniqueAccountNumber(conn); 
    const accountId = uuidv4(); // 컴퓨터 시스템에서 중복되지 않는 고유한 값을 생성
    console.log(accountNumber, accountId);

    // 데이터베이스에 계좌 정보 저장
    await conn.execute(
      `INSERT INTO accounts (
        account_id, userSub, accountName, accountNumber, bankName, balance
      ) VALUES (?, ?, ?, ?, ?, 0)`,
      [accountId, userSub, accountName, accountNumber, bankName]
    );

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Account created successfully",
        account: {
          accountId,
          accountName,
          accountNumber,
          balance: 0,
        },
      }),
    };
  } catch (err) {
    console.error('Account creation error:', err);
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "계좌 생성 중 오류가 발생했습니다.",
        error: err.message,
      }),
    };
  } finally {
    if (conn) {
      await conn.end();
    }
    
  }
};
