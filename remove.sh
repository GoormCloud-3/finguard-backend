#!/bin/bash
source ./env.sh

echo "삭제할 거면 y를 입력하세요"
read -r answer

if [[ "$answer" == "y" ]]; then
	sls remove --stage "$ENV"
else
	echo "🚫 삭제를 취소합니다."
fi
