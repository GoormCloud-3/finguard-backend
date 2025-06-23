'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = async (event, dbOps) => {
  const body = JSON.parse(event.body || '{}');
  const { uId, accountName, bankName } = body;

  const accountId = uuidv4();
  const conn = await dbOps();
  await conn.execute(
    "INSERT INTO accounts (account_id, account_name, account_number, balance) VALUES (?, ?, ?, 0)",
    [accountId, userSub, accountName, accountNumber]
  );
  await conn.end();

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
};
