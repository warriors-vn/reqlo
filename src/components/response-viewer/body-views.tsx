import { Eye, FileJson2, FileText, Radio } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ExecutionResult } from "@/services/execution";
import type { BodyView } from "./types";

/** The Pretty/Raw/Preview switcher above the body, or nothing at all when the
 * response kind offers only one view — a single-tab tab bar is noise. Kept a
 * render function rather than a component so the split stays behaviour-for-
 * behaviour identical to the pre-split ResponseViewer. */
export function renderBodyViewTabs(
  result: ExecutionResult,
  bodyView: BodyView,
  setBodyView: (value: BodyView) => void,
) {
  const views = getBodyViews(result);
  if (views.length <= 1) return null;

  return (
    <div className="border-b border-border/70 px-4 py-3">
      <Tabs value={bodyView} onValueChange={(value) => setBodyView(value as BodyView)}>
        <TabsList className="h-10 rounded-xl bg-background/80">
          {views.map((view) => (
            <TabsTrigger key={view.id} value={view.id} className="gap-1 rounded-lg px-3 text-xs">
              {view.icon}
              {view.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

/** Which body views this response kind supports, in tab order. JSON and SSE
 * get a parsed view plus raw; HTML/image/PDF/binary get a preview; anything
 * else is raw only. */
export function getBodyViews(result: ExecutionResult) {
  const views: Array<{ id: BodyView; label: string; icon: React.ReactNode }> = [];

  if (result.responseKind === "json") {
    views.push({ id: "pretty", label: "Pretty", icon: <FileJson2 className="h-3.5 w-3.5" /> });
    views.push({ id: "raw", label: "Raw", icon: <FileText className="h-3.5 w-3.5" /> });
    return views;
  }

  if (result.responseKind === "stream") {
    views.push({ id: "pretty", label: "Events", icon: <Radio className="h-3.5 w-3.5" /> });
    views.push({ id: "raw", label: "Raw", icon: <FileText className="h-3.5 w-3.5" /> });
    return views;
  }

  if (result.responseKind === "html") {
    views.push({ id: "preview", label: "Preview", icon: <Eye className="h-3.5 w-3.5" /> });
    views.push({ id: "raw", label: "Raw", icon: <FileText className="h-3.5 w-3.5" /> });
    return views;
  }

  if (result.responseKind === "image" || result.responseKind === "pdf") {
    views.push({ id: "preview", label: "Preview", icon: <Eye className="h-3.5 w-3.5" /> });
    return views;
  }

  if (result.responseKind === "binary") {
    views.push({ id: "preview", label: "Summary", icon: <Eye className="h-3.5 w-3.5" /> });
    return views;
  }

  views.push({ id: "raw", label: "Raw", icon: <FileText className="h-3.5 w-3.5" /> });
  return views;
}

/** Which view to open a fresh response on — the most useful one for its kind. */
export function getDefaultBodyView(result: ExecutionResult | null): BodyView {
  if (!result) return "pretty";
  if (result.responseKind === "json" || result.responseKind === "stream") return "pretty";
  if (result.responseKind === "text") return "raw";
  return "preview";
}
