export type HelpItem = {
  slug: string;
  question: string;
  answer?: string;
  warning?: readonly string[];
};

export const HELP_ITEMS: readonly HelpItem[] = [
  {
    slug: "lost-phone",
    question: "폰을 잃어버리면 어떻게 되나요?",
    answer:
      "새 기기에서 같은 이메일·구글 계정으로 로그인하면 같은 지갑이 열려요. 로그인 계정까지 잃었다면 복구 비밀번호로 되찾을 수 있어요.",
    warning: [
      "로그인 계정과 복구 비밀번호를 둘 다 잃으면 아무도 되찾을 수 없어요.",
      "EasyDeFi도 대신 열어드릴 수 없어요.",
    ],
  },
  { slug: "who-can-open", question: "EasyDeFi도 내 지갑을 열 수 있나요?" },
  { slug: "service-ends", question: "서비스가 없어지면 내 돈은요?" },
  { slug: "who-pays-yield", question: "수익은 누가 주나요?" },
  { slug: "withdraw-delay", question: "왜 바로 못 꺼낼 때가 있나요?" },
  { slug: "stablecoin-peg", question: "달러코인은 1달러가 보장되나요?" },
  { slug: "where-fees-go", question: "수수료는 어디로 가나요?" },
  { slug: "wrong-send", question: "잘못 보냈어요. 취소할 수 있나요?" },
  { slug: "first-fee", question: "첫 거래 수수료는 왜 더 큰가요?" },
];

export function findHelpItem(slug: string) {
  return HELP_ITEMS.find((item) => item.slug === slug);
}
