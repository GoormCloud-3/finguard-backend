
# finguard-backend

금융 거래 위법 탐지 시스템의 백엔드 API입니다.  
이 레포지토리는 AWS Lambda 기반으로 구성되어 있으며, Serverless Framework를 통해 인프라 및 코드를 함께 배포합니다.

---

## 🛠 프로젝트 구성

- **언어**: Node.js or Python (선택한 런타임 명시)
- **배포 도구**: Serverless Framework
- **실행 환경**: AWS Lambda + API Gateway
- **인프라 연동**: VPC, SQS, IAM Role, Security Group 등

---

## 📂 디렉토리 구조 (예시)
.
├── src/ # Lambda 코드
├── serverless.yml # Serverless Framework 배포 설정
├── deploy.sh # 배포 스크립트
├── .env # 공통 환경변수 정의 파일
├── .pre-commit-config.yaml # 코드 린팅 설정
└── README.md

---
## ⚙️ 환경 설정

`.env` 파일에 다음 항목들을 정의해야 합니다:

``` env
AWS_PROFILE=your-aws-cli-profile
AWS_REGION=ap-northeast-2
```

---
## 🚀  배포 방법
### 1. 배포 스크립트 실행
```
$ ./deploy.sh
```

스크립트를 실행하면 다음과 같은 순서로 동작합니다:
- 환경 선택 (dev, prod 등)
- 관련 리소스 자동 조회:
	- 보안 그룹 (SG)
	- 프라이빗 서브넷
	- Lambda용 IAM Role
	- SQS URL 및 ARN

### ✅ 배포 스크립트 유효성 검사 항목
```
SG_DAO
SG_ALERT
PRIVATE_SUBNET_1, 2
API_LAMBDA_ROLE_ARN
SQS_LAMBDA_ROLE_ARN
SQS_ARN
```

누락 시 자동으로 실패 처리됩니다.


## 💡 참고 사항
Serverless Framework는 serverless.yml 파일을 기준으로 AWS 리소스 + Lambda 코드를 함께 관리합니다.
  배포 전 필요한 리소스(보안 그룹, 서브넷 등)는 Terraform으로 사전에 생성되어 있어야 합니다.
  이 스크립트는 로컬 개발자 환경에서 AWS CLI 권한을 사용하는 것을 전제로 합니다.
