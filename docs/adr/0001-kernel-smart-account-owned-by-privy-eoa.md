# 0001. Privy 임베디드 EOA를 소유자로 하는 Kernel 스마트 계정

- 상태: 승인됨
- 날짜: 2026-11-21

## 배경

EasyDeFi는 암호화폐 지갑을 처음 쓰는 사용자도 Google·이메일로 가입해 USDC를 입금하고 Aave등 defi 서비스에 예치할 수 있어야 한다. 일반 EOA로는 세 가지가 어렵다.

- 사용자가 ETH 같은 네이티브 토큰을 따로 갖고 있어야 가스를 낼 수 있다.
- Aave 예치처럼 `approve`와 `supply` 두 트랜잭션이 필요한 작업에서 서명을 두 번 받아야 한다.
- 시드 문구를 사용자가 직접 보관해야 한다.

동시에 플랫폼은 사용자의 키와 자산을 보관하지 않아야 한다(비수탁).

## 결정

- 로그인과 키 관리는 Privy가 맡는다. 로그인 시 지갑이 없는 사용자에게 Privy 임베디드 EOA를 만든다(`createOnLogin: users-without-wallets`).
- 그 EOA를 유일한 소유자로 하는 Kernel 스마트 계정을 쓴다. permissionless `toKernelSmartAccount`, Kernel 0.3.3, index 0, EntryPoint 0.7.
- 이더리움, Sepolia, Base, Base Sepolia, Arc, Arc Testnet의 입금 주소는 Kernel 주소다(`lib/deposit/kernel-address.ts`). 서버는 `/api/wallet-addresses/register`에서 이 주소를 Supabase에 저장한다.
- Kaia·Kairos는 Kernel을 쓰지 않고 임베디드 EOA 주소를, Solana는 Privy Solana 지갑 주소를 그대로 쓴다.

## 검토한 대안

- **임베디드 EOA만 사용**: 구현은 가장 단순하지만 네이티브 가스와 다중 서명 문제가 남는다.
- **Safe 스마트 계정**: 검증된 구현이지만 다중 소유자용이라 단일 소유자 소비자 지갑에는 무겁고 가스가 더 소모된다.
- **서버가 키를 보관하는 수탁형 지갑**: 사용성은 좋지만 비수탁 원칙과 맞지 않고 규제 부담이 커진다.

## 결과

- 장점: 배치 실행으로 한 번의 서명에 여러 호출을 묶을 수 있고, Paymaster로 USDC 가스 지불이 가능하다([0002](0002-pimlico-bundler-and-erc20-paymaster.md)). 서버에는 키가 없다.
- 단점: Privy가 멈추면 로그인과 서명이 모두 막힌다. Kernel은 체인마다 배포가 필요하고, 첫 UserOperation에 배포 가스가 추가된다.
- 단점: 입금 주소가 체인 종류에 따라 Kernel, EOA, Solana 주소로 나뉘어 있어 사용자 안내와 잔액 합산 로직이 복잡하다.
- 제약: 임베디드 지갑이 없는 외부 지갑 로그인 사용자에게는 이 구조가 적용되지 않는다([0004](0004-defer-eip7702-for-external-wallets.md)).
