'use strict';

const dbOps = require('../handler');


module.exports.handler = async (event,context) => {
  const conn = await dbOps();
  const userSub = event.pathParameters.userSub;

  try {
    const [rows] = await conn.execute(
      `SELECT account_id, accountName, accountNumber, balance, bankName
       FROM accounts 
       WHERE userSub = ?`,
      [userSub]
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        userSub,
        accounts: rows.map(row => ({
          accountId: row.account_id,
          accountName: row.accountName,
          accountNumber: row.accountNumber,
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
