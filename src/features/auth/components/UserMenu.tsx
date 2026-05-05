"use client";

import * as React from "react";
import { LogOut, User } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { signOut } from "../server/actions";

export interface UserMenuProps {
  handle: string;
  email: string | null;
  avatarUrl?: string | null;
}

export function UserMenu({ handle, email, avatarUrl }: UserMenuProps) {
  const initials = handle.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="User menu"
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border border-border bg-secondary pl-1 pr-3 text-sm font-medium text-foreground",
          "transition-colors hover:border-accent/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-bold uppercase text-accent-foreground">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            initials
          )}
        </span>
        <span className="font-mono text-xs">@{handle}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-[14rem]">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-mono text-xs text-muted-foreground">
              @{handle}
            </span>
            {email && (
              <span className="mt-0.5 text-xs font-normal text-muted-foreground">
                {email}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <a href="/dashboard">
            <User className="h-4 w-4" />
            <span>Dashboard</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer text-destructive focus:text-destructive">
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Log out</span>
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
