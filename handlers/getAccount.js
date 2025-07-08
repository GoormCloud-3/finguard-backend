'use strict';

const dbOps = require('../handler');

module.exports.handler = async (event,context) => {
  const conn = await dbOps();
  const accountId = event.pathParameters.accountId;

  try {
    // 1) 계좌 정보 조회
    const [accountRows] = await conn.execute(
      `SELECT account_id, accountName, accountNumber, balance, bankName
       FROM accounts
       WHERE account_id = ?`,
      [accountId]
    );

    if (accountRows.length === 0) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Account not found' }),
      };
    }

    // 2) 거래 내역 조회
    const [transactionRows] = await conn.execute(
      `SELECT transaction_id, date, time, description, amount, type
       FROM transactions
       WHERE account_id = ?
       ORDER BY date DESC, time DESC`,
      [accountId]
    );

    // 3) 응답 포맷 맞추기
    const account = {
      accountId: accountRows[0].account_id,
      accountName: accountRows[0].accountName,
      accountNumber: accountRows[0].accountNumber,
      balance: accountRows[0].balance,
      bankName: accountRows[0].bankName,
      transactions: transactionRows.map(txn => ({
        id: txn.transaction_id,
        date: txn.date?.toISOString().slice(0, 10),  // DATE 타입일 경우
        description: txn.description,
        time: txn.time?.toString().slice(0,5),      // HH:MM 까지만 잘라내기
        amount: txn.amount,
        type: txn.type === '입금' ? 'credit' : 'debit',
      })),
    };

    return {
      statusCode: 200,
      body: JSON.stringify(account),
    };
  } catch (err) {
    console.error('DB Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  } finally {
    await conn.end();
  }
};

