import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="space-y-5" aria-label="Carregando visão geral">
      <div className="flex justify-between">
        <div className="space-y-2"><Skeleton className="h-7 w-44" /><Skeleton className="h-3 w-56" /></div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Card key={index} className="h-[128px] p-4"><Skeleton className="h-3 w-28" /><Skeleton className="mt-5 h-7 w-36" /><Skeleton className="mt-3 h-3 w-32" /></Card>)}
      </div>
      <Skeleton className="h-[78px] rounded-[10px]" />
      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]"><Card className="h-[338px] p-5"><Skeleton className="h-4 w-40" /><Skeleton className="mt-8 h-[220px] w-full" /></Card><Card className="h-[338px] p-5"><Skeleton className="h-4 w-40" />{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="mt-6 h-10 w-full" />)}</Card></div>
      <Card className="h-[300px] p-5"><Skeleton className="h-4 w-40" />{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="mt-5 h-9 w-full" />)}</Card>
    </div>
  );
}
