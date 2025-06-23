'use strict';

module.exports = async (event, dbOps) => {
  const body = JSON.parse(event.body || '{}');
  const { email, password } = body;

  const conn = await dbOps();
  const [rows] = await conn.execute(
    "SELECT * FROM users WHERE email = ? AND password = ?",
    [email, password]
  );
  await conn.end();

  if (rows.length > 0) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Login 성공' })
    };
  } else {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'NotAuthorizedException', message: '비밀번호가 틀렸습니다.' })
    };
  }
};
