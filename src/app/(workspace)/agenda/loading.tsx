import { Skeleton } from "@/components/ui/skeleton";

export default function AgendaLoading() {
  return <div className="space-y-5"><div><Skeleton className="h-7 w-44" /><Skeleton className="mt-2 h-4 w-72" /></div><div className="grid gap-4 xl:grid-cols-[310px_minmax(0,1fr)]"><Skeleton className="h-[500px] rounded-[10px]" /><Skeleton className="h-[500px] rounded-[10px]" /></div></div>;
}
