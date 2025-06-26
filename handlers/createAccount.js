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
      `SELECT 1 FROM accounts WHERE account_number = ?`,
      [accountNumber]
    );
    if (rows.length === 0) return accountNumber;
  }
}

module.exports = async (event, dbOps) => {
  const conn = await dbOps();

  try {
    const { userSub, accountName, bankName } = JSON.parse(event.body);

    // 계좌번호 중복 검사 및 생성
    const accountNumber = await generateUniqueAccountNumber(conn);
    const accountId = uuidv4();

    // 데이터베이스에 계좌 정보 저장
    await conn.execute(
      `INSERT INTO accounts (
        account_id, user_sub, account_name, account_number, bank_name, balance
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
    await conn.end();
  }
};
