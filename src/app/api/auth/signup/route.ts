import { privateJson } from "@/lib/platform-access/api";

export async function POST() {
  return privateJson({ message: "A criação de conta acontece somente por convite." }, 410);
}
