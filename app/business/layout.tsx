import { Suspense } from "react";
import { DashTabs, DashTabsView } from "@/components/dash-tabs";

export default function BusinessLayout({ children }: LayoutProps<"/business">) {
  return (
    <>
      {/* usePathname() is request data, so the highlighted version streams in. */}
      <Suspense fallback={<DashTabsView path={null} />}>
        <DashTabs />
      </Suspense>
      {children}
    </>
  );
}
