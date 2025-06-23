'use strict';

module.exports = async (event, dbOps) => {
  const accountId = event.rawPath.split("/").pop();
  const conn = await dbOps();
  const [rows] = await conn.execute(
    "SELECT account_id, user_sub, account_name, account_number, balance FROM accounts WHERE account_id = ?",
    [accountId]
  );
  await conn.end();

  if (rows.length > 0) {
    return {
      statusCode: 200,
      body: JSON.stringify(rows[0]),
    };
  } else {
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Account not found' }),
    };
  }
};

