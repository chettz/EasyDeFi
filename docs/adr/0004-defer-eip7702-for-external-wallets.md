# 0004. 외부 지갑의 EIP-7702 적용 보류

- 상태: 제안됨
- 날짜: 2026-11-21

## 배경

MetaMask·Phantom으로 로그인한 사용자도 배치 실행과 USDC 가스 같은 Kernel 기능을 쓰게 하려고, 외부 지갑 EOA를 EIP-7702로 ZeroDev Kernel에 위임하는 방안을 검토했다. 번들러와 Paymaster는 Pimlico를 그대로 쓸 계획이었다([0002](0002-pimlico-bundler-and-erc20-paymaster.md)).

1단계로 외부 지갑 SIWE 로그인을 구현했다(`features/auth/LoginFlow.tsx`). 2단계에서 7702 위임을 붙이려 했으나 다음 제약을 확인했다.

- MetaMask, Phantom, Coinbase Wallet 확장 프로그램은 dApp이 임의의 위임 대상에 대한 7702 authorization 서명을 요청하는 기능을 열어 두지 않았다.
- viem `signAuthorization`은 JSON-RPC 계정(브라우저 확장 지갑)을 지원하지 않는다.
- MetaMask는 자체 스마트 계정(설정의 계정 상세 화면 토글, 또는 `wallet_sendCalls`)으로만 업그레이드하고, Phantom은 자기 앱 안의 가스리스 스왑에만 자체 지정 구현으로 위임한다.

## 결정

- 외부 지갑에는 EIP-7702를 적용하지 않는다.
- 외부 지갑은 SIWE 로그인까지만 지원한다. Kernel 기반 기능(넣기·빼기, USDC 가스 출금)은 Privy 임베디드 지갑 사용자에게 제공한다.
- `@zerodev/sdk` 의존성은 설치되어 있지만 사용하지 않는다. 재검토 시점까지 유지하거나, 정리할 때 함께 제거한다.

## 검토한 대안

- **외부 지갑을 소유자로 하는 별도 EIP-4337 Kernel**: 기술적으로 가능하지만 주소가 새로 생기므로 사용자가 자금을 그 주소로 옮겨야 한다.
- **Privy 임베디드 지갑에 7702 적용**(`useSign7702Authorization`): Privy는 지원하지만 외부 지갑 사용자 문제는 해결하지 못한다.
- **MetaMask 자체 스마트 계정 안내**: 앱에서 토글 방법을 안내하고 `wallet_sendCalls`로 배치를 요청한다. MetaMask에만 해당하고 위임 대상이 Kernel이 아니어서 USDC Paymaster 흐름을 그대로 쓸 수 없다.

## 결과

- 장점: 지갑 제약에 막힌 구현을 하지 않아 범위가 줄고, 기존 Kernel 구조가 그대로 유지된다.
- 단점: 외부 지갑 사용자는 지금 넣기·빼기와 USDC 가스 출금을 쓸 수 없다. 또 임베디드 EOA가 없어서 `/api/wallet-addresses/register`가 `409`를 돌려준다. 외부 지갑 사용자에게 맞는 안내나 처리 방식이 필요하다.
- 후속: 주요 지갑이 7702 서명 API를 열거나 EIP-5792 `wallet_sendCalls`가 Paymaster 확장과 함께 널리 지원되면 재검토한다.
