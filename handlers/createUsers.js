module.exports = async (event, dbOps) => {
  const body = JSON.parse(event.body || '{}');
  const { userName, password, finalServicePassword, name, email, birthdate, address, gps_location } = body;

  if (!userName || !password || !email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'BadRequest', message: 'fill the data' })
    };
  }

  const conn = await dbOps();
  await conn.execute(
    "INSERT INTO users (user_name, password, finalServicePassword, name, email, birthdate, address, gps_location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [userName, password, finalServicePassword, name, email, birthdate, address, gps_location]
  );
  await conn.end();

  return {
    statusCode: 201,
    body: JSON.stringify({ message: 'user created successfully' })
  };
};
