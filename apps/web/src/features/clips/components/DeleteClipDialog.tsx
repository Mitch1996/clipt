"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

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

import { softDeleteClip } from "../server/actions";

export function DeleteClipDialog({ clipId }: { clipId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const onConfirm = async () => {
    setBusy(true);
    const result = await softDeleteClip(clipId);
    setBusy(false);
    if (!result.ok) {
      toast({
        title: "Couldn't delete",
        description: result.error,
        variant: "destructive",
      });
      return;
    }
    setOpen(false);
    toast({ title: "Clip deleted" });
    router.replace("/dashboard");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete this clip?</DialogTitle>
          <DialogDescription>
            The clip disappears from your dashboard and the public page. The
            video file stays in storage for now — we keep them around in case
            you need to restore.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {busy ? "Deleting…" : "Delete clip"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
