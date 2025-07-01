### 개발 환경

- 언어: Javascript
- 런타임: NodeJs20.x
- 프레임워크: [Serverless Framework](https://www.serverless.com/)
- 배포 도구: Shell Script, aws cli

---

### 가이드 문서

- 가이드 문서에선 애플리케이션의 배포 및 삭제 방법과 프로젝트의 설정 파일에 대해 설명합니다.

---

1. 배포

- [/FinGuard-Backend/scripts/deploy.sh](/FinGuard-Backend/scripts/deploy.sh) 파일은 Serverless 어플리케이션 배포를 위한 자동화 스크립트입니다.
- 실행하면 aws cli를 사용하여 보안그룹, 서브넷, IAM 역할 ARN 등 Lambda가 사용할 값들을 조회한 후 애플리케이션을 배포합니다.
- 실행은 프로젝트의 루트 디렉터리에서 진행합니다.

```Shell
$ ./scripts/deploy.sh
```

---

2. 배포 중단

- [/FinGuard-Backend/scripts/remove.sh](/FinGuard-Backend/scripts/remove.sh) 파일은 Serverless 어플리케이션 제거를 위한 자동화 스크립트입니다.
- 실행하면 aws cli를 사용하여 보안그룹, 서브넷, IAM 역할 ARN 등 Lambda가 사용할 값들을 조회한 후 현재 배포된 기존 애플리케이션을 제거합니다.
- 실행은 프로젝트의 루트 디렉터리에서 진행합니다.

```Shell
$ ./scripts/remove.sh
```

---

3. Serverless 프레임워크 설정 파일

```
FinGuard-Backend/serverless.yaml
```

- 서버리스 프레임워크의 설정 파일입니다.
- Lambda가 사용할 AWS 리소스들(IAM Role, 보안그룹, 서브넷 등)을 설정합니다.
- 자세한 사용 방법은 [serverless 공식 문서](https://www.serverless.com/framework/docs/providers/aws/guide/serverless.yml)에서 확인 가능합니다.

---
