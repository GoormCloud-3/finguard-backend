'use strict';

const AWS = require('aws-sdk');
const cognito = new AWS.CognitoIdentityServiceProvider();

// 환경 변수
const CLIENT_ID = process.env.CLIENT_ID;

module.exports = async (event) => {
  try {
    const { email, password } = JSON.parse(event.body);

    const params = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    };
    const response = await cognito.initiateAuth(params).promise();

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Login successful',
        accessToken: response.AuthenticationResult.AccessToken,
        idToken: response.AuthenticationResult.IdToken,
        refreshToken: response.AuthenticationResult.RefreshToken,
      }),
    };
  } catch (err) {
    console.error('Login error:', err);

    if (err.code === 'NotAuthorizedException') {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'NotAuthorizedException',
          message: '비밀번호가 틀렸습니다.',
        }),
      };
    } else if (err.code === 'UserNotFoundException') {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: 'UserNotFoundException',
          message: '존재하지 않는 사용자입니다.',
        }),
      };
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'BadRequest',
          message: '로그인 처리 중 에러가 발생했습니다.',
        }),
      };
    }
  }
};
