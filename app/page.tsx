import Link from "next/link";

export default function EntryPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-5">
      <div className="text-center">
        <h1 className="text-3xl font-bold">EasyDeFi</h1>
        <p className="mt-2 text-sm text-[#73737a]">이동할 화면을 선택해 주세요.</p>
      </div>
      <div className="flex w-full max-w-sm gap-3">
        <Link
          href="/lab"
          className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-[#dbdbe0] font-semibold"
        >
          기능 테스트 Lab
        </Link>
        <Link
          href="/product"
          className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#1f1f24] font-semibold text-white"
        >
          Product UI
        </Link>
      </div>
    </main>
  );
}