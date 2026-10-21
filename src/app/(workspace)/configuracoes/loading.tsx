import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return <div className="space-y-5"><Skeleton className="h-9 w-48" /><Skeleton className="h-[430px] max-w-[820px] rounded-[10px]" /><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-[270px] rounded-[10px]" /><Skeleton className="h-[270px] rounded-[10px]" /></div></div>;
}
