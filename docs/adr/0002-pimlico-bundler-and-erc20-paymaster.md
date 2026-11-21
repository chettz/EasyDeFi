# 0002. Pimlico Bundler와 ERC-20 Paymaster 사용

- 상태: 승인됨
- 날짜: 2026-11-21

## 배경

Kernel 스마트 계정([0001](0001-kernel-smart-account-owned-by-privy-eoa.md))의 UserOperation을 체인에 올릴 bundler와, 가스를 대신 처리할 Paymaster가 필요하다. 사용자는 USDC만 갖고 있다고 가정한다. 앱이 가스비를 계속 대신 내면 사용자가 늘수록 운영비가 쌓인다.

후보는 Pimlico와 ZeroDev. Kernel 자체는 ZeroDev가 만든 구현체지만, permissionless 라이브러리로 다른 인프라에서도 쓸 수 있다.

## 결정

- 번들러는 Pimlico를 쓴다(`https://api.pimlico.io/v2/{chainId}/rpc`).
- 이더리움, Sepolia, Base, Base Sepolia에서는 Pimlico ERC-20 Paymaster로 **사용자가 USDC로 가스를 낸다**. `prepareUserOperationForErc20Paymaster`와 `paymasterContext: { token: USDC }`를 쓰고, 화면에는 `estimateErc20PaymasterCost`로 계산한 USDC 수수료를 미리 보여준다(`lib/paymaster/fee-client.ts`).
- Arc·Arc Testnet은 USDC가 네이티브 가스 토큰이므로 Paymaster 없이 Pimlico 번들러만 쓴다(`lib/withdraw/arc-fee-client.ts`).
- ZeroDev SDK(`@zerodev/sdk`)는 계정 생성이 필요한 경우에만 쓰고, 전송 인프라는 Pimlico로 통일한다.

## 검토한 대안

- **ZeroDev 번들러·Paymaster**: Kernel과 같은 회사라 연동 문서가 잘 맞는다. 다만 기본 가스 정책이 앱이 가스를 대신 내는 스폰서 방식이라 운영비 구조가 맞지 않았다.
- **앱이 가스를 전액 스폰서**: 사용자 경험은 가장 좋지만 비용이 사용량에 비례해 늘고 악용 방지 정책이 따로 필요하다.
- **자체 번들러 운영**: 의존성은 줄지만 체인별 운영 부담이 크다.

## 결과

- 장점: 사용자는 USDC만으로 출금과 Aave 넣기·빼기 등의 defi 서비스를 이용할 수 있고, 앱은 가스비를 떠안지 않는다.
- 장점: Paymaster 허용량이 부족하면 `approve(Paymaster)` 호출이 배치 맨 앞에 자동으로 붙어, 별도 승인 절차가 없다.
- 단점: Pimlico가 멈추면 이더리움·Base·Arc 출금과 Aave 넣기·빼기, 수수료 견적이 모두 막힌다.
- 단점: Pimlico가 지원 토큰이나 수수료 정책을 바꾸면 이더리움·Base의 출금과 예치가 영향을 받는다.
- 후속: 프로덕션 전에 API 키를 서버 프록시 뒤로 옮기는 방안을 검토한다. 지금은 `NEXT_PUBLIC_PIMLICO_API_KEY`로 브라우저에 노출된다.
