#!/bin/bash
source ./env.sh

echo "배포할 거면 y를 입력하세요"
read -r answer

if [[ "$answer" == "y" ]]; then
	sls deploy --stage "$ENV"
else
	echo "🚫 배포를 취소합니다."
fi
