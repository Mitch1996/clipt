"use client";

import * as React from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

import { disconnectChannel } from "../server/actions";

export interface DisconnectButtonProps {
  channelId: string;
  channelLabel: string;
}

export function DisconnectButton({ channelId, channelLabel }: DisconnectButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const onConfirm = async () => {
    setPending(true);
    const result = await disconnectChannel(channelId);
    setPending(false);
    if (!result.ok) {
      toast({
        title: "Couldn't disconnect",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    setOpen(false);
    toast({
      title: "Channel disconnected",
      description: `${channelLabel} no longer has API access. The row is preserved — reconnect anytime.`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive">
          <LogOut className="h-3.5 w-3.5" />
          Disconnect
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disconnect {channelLabel}?</DialogTitle>
          <DialogDescription>
            We&rsquo;ll clear the stored tokens and stop pulling data from this
            channel. Your historical clips stay. You can reconnect any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
