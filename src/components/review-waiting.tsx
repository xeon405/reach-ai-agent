import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";

/** A held email must never look like a silent, stuck campaign. When drafts are
 *  waiting, say so on the dashboard and link straight to them. Renders nothing
 *  when the queue is empty, so a healthy account sees no extra card. */
export function ReviewWaitingCard() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;
      const { count: waiting } = await supabase
        .from("send_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("status", "awaiting_review");
      if (alive) setCount(waiting ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!count) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-2">
        <ClipboardCheck className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <p className="text-sm font-medium">
            {count} email{count === 1 ? "" : "s"} waiting for your review
          </p>
          <p className="text-xs text-muted-foreground">
            They are written and held. Nothing is sent until you approve each one.
          </p>
        </div>
      </div>
      <Link to="/review">
        <Button size="sm">Review emails</Button>
      </Link>
    </div>
  );
}
