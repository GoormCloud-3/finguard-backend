'use strict';

const dbOps = require('../handler');

module.exports.handler = async (event,context) => {
  const conn = await dbOps();

  try {
    const data = JSON.parse(event.body);
    const {
      userSub,
      gps_location,
    } = data;


    // 1. RDS 저장
    await conn.execute(
      `INSERT INTO users (userSub, gps_location) VALUES (?, ST_PointFromText(?))`,
      [
        userSub,
        `POINT(${gps_location[1]} ${gps_location[0]})`
      ]
    );

    // 2. 성공 반환
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Sign up successful. Please verify your email or phone if required.",
        userSub: userSub,
      }),
    };
  } catch (err) {
    // 3. 실패 반환
    console.error("User registration error:", err);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "BadRequest",
        message: "회원가입 처리 중 에러가 발생했습니다.",
      }),
    };
  } finally {
    await conn.end();
  }
};
