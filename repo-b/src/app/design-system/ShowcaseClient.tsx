"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";

export default function ShowcaseClient() {
  const { push } = useToast();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        variant="secondary"
        onClick={() =>
          push({
            title: "Toast: default",
            description: "This is a lightweight toast component.",
            variant: "default",
          })
        }
      >
        Show toast
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          push({
            title: "Success",
            description: "Saved successfully.",
            variant: "success",
          })
        }
      >
        Toast success
      </Button>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Example Dialog"
        description="Simple dialog primitive with glass styling."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                push({ title: "Confirmed", variant: "success" });
                setOpen(false);
              }}
            >
              Confirm
            </Button>
          </>
        }
      >
        <div className="text-sm text-bm-muted">
          Use this for confirmations and short forms. For complex flows, consider a dedicated page.
        </div>
      </Dialog>
    </div>
  );
}

