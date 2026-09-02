import { FolderClosed } from "lucide-react";
import { motion } from "framer-motion";

export function CollectionsEmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 px-4 py-6 text-center"
    >
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
        <FolderClosed className="h-4 w-4" />
      </div>
      <div className="text-xs font-medium text-foreground">No collections yet</div>
      <p className="text-2xs leading-4 text-muted-foreground">
        Group related requests together to keep your workspace tidy.
      </p>
    </motion.div>
  );
}
