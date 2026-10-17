import { getBaseUsdcSupplyApy } from "@/lib/aave/base-usdc-supply-apy";
import { getMorphoVaultV2Apy } from "@/lib/morpho/vault-v2-apy";

const columns = ["자산", "DeFi 프로토콜", "체인", "운용방식", "연 수익률"];
const cellStyle = { border: "1px solid #888", padding: "0.5rem", textAlign: "left" as const };
// Steakhouse Prime USDC. Morpho 볼트 2.0이고 Base(8453)에 있다.
const STEAKHOUSE_PRIME_USDC = "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9";
const BASE_CHAIN_ID = 8453;

export default async function DefiListPage() {
  // 연 수익률만 조회 결과다. 나머지 칸은 각 상품에 맞게 고정한다.
  let aaveApy = "조회 실패";
  let morphoApy = "조회 실패";
  try {
    aaveApy = await getBaseUsdcSupplyApy();
  } catch (cause) {
    console.error(cause);
  }
  try {
    morphoApy = await getMorphoVaultV2Apy(STEAKHOUSE_PRIME_USDC, BASE_CHAIN_ID);
  } catch (cause) {
    console.error(cause);
  }

  const rows = [
    ["USDC", "Aave", "Base", "풀", aaveApy],
    ["USDC", "Morpho", "Base", "볼트", morphoApy],
  ];

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>예치 상품 목록</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} style={cellStyle}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[1]}>
              {row.map((value, index) => (
                <td key={columns[index]} style={cellStyle}>
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
