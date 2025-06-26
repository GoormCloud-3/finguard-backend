'use strict';

const {
  CognitoIdentityProviderClient,
  SignUpCommand,
} = require("@aws-sdk/client-cognito-idp");
const bcrypt = require("bcryptjs");

const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;

module.exports = async (event, dbOps) => {
  const conn = await dbOps();

  try {
    const data = JSON.parse(event.body);
    const {
      username,
      password,
      finalServicePassword,
      name,
      email,
      birthdate,
      address,
      gps_location,
    } = data;

    // 1 Cognito로 회원가입 진행
    const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });
    const signUpCommand = new SignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [
        { Name: "name", Value: name },
        { Name: "email", Value: email },
        { Name: "birthdate", Value: birthdate },
        { Name: "address", Value: address },
      ],
    });

    let userSub;
    try {
      const signUpResponse = await cognitoClient.send(signUpCommand);
      userSub = signUpResponse.UserSub;
    } catch (error) {
      if (error.name === "UsernameExistsException") {
        return {
          statusCode: 409,
          body: JSON.stringify({
            error: "UsernameExistsException",
            message: "해당 아이디는 이미 존재합니다.",
          }),
        };
      }
      // 다른 Cognito 에러도 핸들 가능
      console.error(error);
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "BadRequest",
          message: "회원가입 처리 중 에러가 발생했습니다.",
        }),
      };
    }

    // 2 RDS 저장
    const hashedFinalPassword = await bcrypt.hash(finalServicePassword, 10);
    await conn.execute(
      `INSERT INTO users (user_sub, final_service_password, gps_location) VALUES (?, ?, ST_PointFromText(?))`,
      [
        userSub,
        hashedFinalPassword,
        `POINT(${gps_location[1]} ${gps_location[0]})`
      ]
    );

    // 3 성공 반환
    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Sign up successful. Please verify your email or phone if required.",
        userSub: userSub,
      }),
    };
  } catch (err) {
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
