# Architecture Decision Records

중요 아키텍처 결정 별로 문서를 생성한다. 확정된 ADR은 고치지 않고, 수정사항이 생기면 새 ADR을 쓴 뒤 예전 ADR의 상태만 `대체됨`으로 바꾼다.

| 번호 | 제목 | 상태 |
|---|---|---|
| [0001](0001-kernel-smart-account-owned-by-privy-eoa.md) | Privy 임베디드 EOA를 소유자로 하는 Kernel 스마트 계정 | 제안됨 |
| [0002](0002-pimlico-bundler-and-erc20-paymaster.md) | Pimlico Bundler와 ERC-20 Paymaster 사용 | 제안됨 |
| [0003](0003-server-checked-payment-pin.md) | 서버에서 확인하는 결제 비밀번호와 5회 실패 잠금 | 제안됨 |
| [0004](0004-defer-eip7702-for-external-wallets.md) | 외부 지갑의 EIP-7702 적용 보류 | 제안됨 |
| [0005](0005-deposit-detection-webhook-and-cron.md) | Alchemy 웹훅과 cron 보완으로 입금 감지 | 제안됨 |

상태는 `제안됨`, `승인됨`, `폐기됨`, `NNNN으로 대체됨` 중 하나

## 템플릿

```markdown
# NNNN. 제목

- 상태: 제안됨
- 날짜: YYYY-MM-DD

## 배경
## 결정
## 검토한 대안
## 결과
```
