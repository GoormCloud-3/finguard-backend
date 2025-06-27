'use strict';

const getAccountList = async (event, dbOps) => {
  const userSub = event.pathParameters?.userSub;
  const conn = await dbOps();

  try {
    const [rows] = await conn.execute(
      `SELECT account_id, account_name, account_number, balance, bankName
       FROM accounts 
       WHERE user_sub = ?`,
      [userSub]
    );

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

module.exports.getAccountList = getAccountList;
