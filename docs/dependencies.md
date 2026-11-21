# 외부 의존성과 장애 시 영향

EasyDeFi가 의존하는 외부 서비스와, 각 서비스가 멈추거나 정책을 바꿀 때 막히는 화면을 정리한다. 구조는 [architecture.md](architecture.md)를 본다. 새 외부 서비스를 붙이거나 빼면 같은 PR에서 이 표를 고친다.

자산은 블록체인 위 사용자 계정에 남아 있으므로, 아래 장애는 자산 손실이 아니라 **앱 화면에서의 접근과 실행이 막히는 문제**다.

| 의존성 | 맡은 역할 | 장애·정책 변경 시 막히는 화면 | 계속 동작하는 부분 |
|---|---|---|---|
| Privy | 로그인, 임베디드 지갑, 모든 서명, API 인증 토큰 | 로그인, 넣기·빼기·출금 서명, 거래내역·결제 비밀번호 API(토큰 검증 실패) | 온체인 자산 자체 |
| Pimlico Bundler | UserOperation 제출 | 이더리움·Base·Arc 출금, Aave 넣기·빼기, 수수료 견적 | 입금, 잔액 조회, Kaia 출금 |
| Pimlico Paymaster (USDC 정책·수수료 변경) | USDC로 가스 정산 | 이더리움·Base 출금, Aave 넣기·빼기 | Arc 출금(Paymaster 미사용), Kaia 출금 |
| 체인별 RPC | 잔액 조회, 견적, 트랜잭션 전송, 입금 영수증 확인 | 해당 체인의 잔액 표시와 출금, 입금 기록. Base RPC 장애 시 Aave 예치 잔액과 입금 보완 cron도 중단 | 다른 체인 |
| Aave V3 Pool (일시정지, 리저브 동결, 공급 한도) | USDC 예치·인출 | 일시정지 시 넣기·빼기 모두, 동결·공급 한도 도달 시 넣기 | 입금, 출금 |
| Aave GraphQL API | APY, 리저브 정보, 포지션 히스토리 | Earn·Aave 상세의 APY, 포트폴리오 차트 | 넣기·빼기 실행 |
| Supabase | 지갑 주소, 거래 기록, 결제 비밀번호 | 지갑 주소 등록, 거래내역, 입금 기록 저장. 결제 비밀번호를 켠 사용자는 넣기·빼기·출금 | 잔액 조회(RPC 직접 호출) |
| Alchemy 웹훅 | 입금 실시간 감지 | 이더리움·Sepolia 입금은 거래내역에 기록되지 않음. Base·Base Sepolia USDC는 cron이 보완 | 잔액 표시 |
| Alchemy 주소 등록 API | 새 주소를 웹훅 감시 대상에 추가 | 지갑 주소 등록 요청이 실패해 다음 로그인 때 다시 시도. 그동안 새 사용자의 입금은 웹훅으로 기록되지 않음 | 입금 주소 표시, 잔액 표시 |
| cron 스케줄러 | `/api/cron/deposits/base` 호출 | 웹훅이 빠진 Base USDC 입금이 보완되지 않음 | 웹훅 기반 입금 기록 |
| Kaia 가스 스왑 라우터 | USDT를 KAIA 가스로 교환 | Kaia·Kairos 출금 | 다른 체인 |
| Solana RPC | Solana 잔액 조회 | Solana 잔액 표시 | EVM 체인 |
| 블록 탐색기 | 거래 해시 링크 | 거래 상세의 외부 링크 | 거래내역 목록 |

## 단일 장애점

- **Privy**: 로그인, 서명, 서버 인증이 모두 Privy에 묶여 있어 영향 범위가 가장 넓다.
- **Pimlico**: 스마트 계정 실행 경로 전체가 Pimlico 하나를 거친다. 대체 번들러는 아직 없다.
- **Supabase**: 결제 비밀번호를 켠 사용자에게는 자산 이동까지 막는 의존성이 된다.

관련 결정: [ADR 0001](adr/0001-kernel-smart-account-owned-by-privy-eoa.md), [ADR 0002](adr/0002-pimlico-bundler-and-erc20-paymaster.md), [ADR 0003](adr/0003-server-checked-payment-pin.md), [ADR 0005](adr/0005-deposit-detection-webhook-and-cron.md)
