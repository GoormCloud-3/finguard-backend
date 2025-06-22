echo "개발 환경을 입력해주세요.(ex. dev, prod, stage)"
read -r ENV

export SG_DAO=$(
	aws ec2 describe-security-groups \
		--filters Name=group-name,Values=finguard-dao Name=tag:Env,Values="$ENV" \
		--query 'SecurityGroups[*].GroupId' \
		--output text
)

read -a PRIVATE_SUBNETS <<< "$(
	aws ec2 describe-subnets \
		--filters "Name=tag:Name,Values=finguard-private-*" \
		--query "Subnets[*].SubnetId" \
		--output text
)"
export PRIVATE_SUBNET_1="${PRIVATE_SUBNETS[0]}"
export PRIVATE_SUBNET_2="${PRIVATE_SUBNETS[1]}"

export LAMBDA_RDS_ROLE_ID="$(
	aws iam get-role \
		--role-name finguard-lambda-rds-role \
		--query Role.RoleId \
		--output text
)"

echo "Security Group ID: $SG_DAO"
echo "Private Subnet IDs: " "${PRIVATE_SUBNETS[@]}"
echo "PRIVATE_SUBNET_1: " "$PRIVATE_SUBNET_1"
echo "PRIVATE_SUBNET_2: " "$PRIVATE_SUBNET_2"
echo "LAMBDA_RDS_ROLE_ID: " "$LAMBDA_RDS_ROLE_ID"

echo "삭제할 거면 y를 입력하세요"
read -r answer

if [[ "$answer" == "y" ]]; then
	sls remove --stage "$ENV"
else
	echo "배포를 취소합니다."
fi