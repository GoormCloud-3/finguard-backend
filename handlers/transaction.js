'use strict';
const { v4: uuidv4 } = require('uuid');

module.exports = async (event, dbOps) => {
  const body = JSON.parse(event.body || '{}');
  const { account_no, amount, type } = body;

  if (!account_no || !amount || !type) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'BadRequest' })
    };
  }

  const conn = await dbOps();
  const [accountRows] = await conn.execute(
    "SELECT balance FROM accounts WHERE account_number = ?",
    [account_no]
  );
  if (accountRows.length === 0) {
    await conn.end();
    return {
      statusCode: 404,
      body: JSON.stringify({ error: 'Account not found' })
    };
  }

  const currentBalance = accountRows[0].balance;
  let newBalance = currentBalance;

  if (type === 'credit') {
    newBalance += amount;
  } else if (type === 'debit') {
    if (currentBalance < amount) {
      await conn.end();
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'InsufficientFunds' })
      };
    }
    newBalance -= amount;
  }

  const transactionId = uuidv4();
  await conn.execute(
    "INSERT INTO transactions (transaction_id, account_no, amount, type) VALUES (?, ?, ?, ?)",
    [transactionId, account_no, amount, type]
  );
  await conn.execute(
    "UPDATE accounts SET balance = ? WHERE account_number = ?",
    [newBalance, account_no]
  );
  await conn.end();

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: 'Transaction processed successfully',
      transaction: {
        id: transactionId,
        account_no,
        amount,
        type,
        new_balance: newBalance,
      },
    })
  };
};
