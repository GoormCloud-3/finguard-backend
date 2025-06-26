'use strict';

module.exports = async (event, dbOps) => {
  // userSub 추출
  const userSub = event.pathParameters?.userSub;

  const conn = await dbOps();

  try {
    // 계좌 목록 조회
    const [rows] = await conn.execute(
      `SELECT account_id, account_name, account_number, balance, bankName
       FROM accounts 
       WHERE user_sub = ?`,
      [userSub]
    );

    // 반환 형식 정의
    return {
      statusCode: 200,
      body: JSON.stringify({
        userSub,
        accounts: rows.map(row => ({
          accountId: row.account_id,
          accountName: row.account_name,
          accountNumber: row.account_number,
          bankName: row.bankName,
          balance: row.balance,
        })),
      }),
    };
  } catch (err) {
    console.error('Error fetching user accounts:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  } finally {
    await conn.end();
  }
};
