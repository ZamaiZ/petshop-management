import { Skeleton } from "@/components/ui/skeleton";

export default function ServicesLoading() {
  return <div className="space-y-5"><div className="flex items-center justify-between"><Skeleton className="h-12 w-56" /><Skeleton className="h-10 w-36" /></div><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-[420px] rounded-xl" /></div>;
}
