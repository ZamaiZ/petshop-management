import type { ComponentProps } from "react";
import Link from "next/link";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";

type ButtonLinkProps = Omit<ComponentProps<typeof Link>, "className"> &
  VariantProps<typeof buttonVariants> & { className?: string };

export function ButtonLink({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonLinkProps) {
  return <Link {...props} data-slot="button" className={buttonVariants({ variant, size, className })} />;
}
