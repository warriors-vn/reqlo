import { AnimatePresence, motion } from "framer-motion";
import { Info, Sparkles } from "lucide-react";
import { useStore } from "@/stores/useStore";
import { BodyTypeTabs } from "@/features/request-body/components/BodyTypeTabs";
import { KeyValueGrid } from "@/features/request-body/components/KeyValueGrid";
import { BinaryBodyEditor } from "@/features/request-body/editors/BinaryBodyEditor";
import { FormDataEditor } from "@/features/request-body/editors/FormDataEditor";
import { GraphQLEditor } from "@/features/request-body/editors/GraphQLEditor";
import { TextCodeEditor } from "@/features/request-body/editors/TextCodeEditor";
import type { ApiRequest, RequestBodyDrafts, RequestBodyType } from "@/services/db";
import {
  applyBodyTypeDefaults,
  ensureNonEmptyFormRows,
  ensureNonEmptyUrlRows,
  formatJson,
  getAutoContentType,
  inferHeaderPatch,
  updateDraftValue,
  validateBody,
} from "@/features/request-body/utils/body";
import { cn } from "@/lib/utils";

interface Props {
  request: ApiRequest;
}

export function AdvancedBodyEditor({ request }: Props) {
  const updateRequest = useStore((state) => state.updateRequest);
  const validation = validateBody(request.bodyType, request.bodyDrafts);
  const autoContentType = getAutoContentType(request.bodyType);

  const commitDrafts = (drafts: RequestBodyDrafts, bodyType = request.bodyType) => {
    void updateRequest(request.id, {
      bodyType,
      bodyDrafts: drafts,
      body:
        bodyType === "json"
          ? drafts.json
          : bodyType === "raw"
            ? drafts.raw
            : bodyType === "xml"
              ? drafts.xml
              : request.body,
    });
  };

  const setBodyType = (bodyType: RequestBodyType) => {
    const bodyDrafts = applyBodyTypeDefaults(bodyType, request.bodyDrafts);
    void updateRequest(request.id, {
      bodyType,
      bodyDrafts,
      body:
        bodyType === "json"
          ? bodyDrafts.json
          : bodyType === "raw"
            ? bodyDrafts.raw
            : bodyType === "xml"
              ? bodyDrafts.xml
              : request.body,
      headers: inferHeaderPatch({ ...request, bodyType, bodyDrafts }),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <BodyTypeTabs value={request.bodyType} onChange={setBodyType} />
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {autoContentType ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Auto header <span className="font-mono text-foreground">{autoContentType}</span>
            </div>
          ) : request.bodyType === "form-data" ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/80 px-3 py-1.5">
              <Info className="h-3.5 w-3.5" />
              Boundary is handled automatically for multipart payloads
            </div>
          ) : null}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={request.bodyType}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        >
          {request.bodyType === "none" && (
            <div className="rounded-[24px] border border-dashed border-border bg-muted/25 px-4 py-10 text-center text-sm text-muted-foreground">
              No body will be sent for this request. Switch to any body mode and your draft will
              remain preserved.
            </div>
          )}

          {request.bodyType === "json" && (
            <TextCodeEditor
              language="json"
              value={request.bodyDrafts.json}
              onChange={(value) =>
                commitDrafts(updateDraftValue(request.bodyDrafts, "json", value), "json")
              }
              onFormat={() =>
                commitDrafts(
                  updateDraftValue(request.bodyDrafts, "json", formatJson(request.bodyDrafts.json)),
                  "json",
                )
              }
              validation={validation}
              placeholder={'{\n  "name": "Reqlo",\n  "platform": "local-first"\n}'}
            />
          )}

          {request.bodyType === "raw" && (
            <TextCodeEditor
              language="plaintext"
              value={request.bodyDrafts.raw}
              onChange={(value) =>
                commitDrafts(updateDraftValue(request.bodyDrafts, "raw", value), "raw")
              }
              validation={validation}
              placeholder="Plain text payload"
            />
          )}

          {request.bodyType === "xml" && (
            <TextCodeEditor
              language="xml"
              value={request.bodyDrafts.xml}
              onChange={(value) =>
                commitDrafts(updateDraftValue(request.bodyDrafts, "xml", value), "xml")
              }
              validation={validation}
              placeholder={"<request>\n  <name>Reqlo</name>\n</request>"}
            />
          )}

          {request.bodyType === "form-data" && (
            <FormDataEditor
              rows={request.bodyDrafts.formData}
              onChange={(rows) =>
                commitDrafts(
                  { ...request.bodyDrafts, formData: ensureNonEmptyFormRows(rows) },
                  "form-data",
                )
              }
            />
          )}

          {request.bodyType === "x-www-form-urlencoded" && (
            <KeyValueGrid
              rows={request.bodyDrafts.urlEncoded}
              onChange={(rows) =>
                commitDrafts(
                  { ...request.bodyDrafts, urlEncoded: ensureNonEmptyUrlRows(rows) },
                  "x-www-form-urlencoded",
                )
              }
              keyLabel="Key"
              valueLabel="Value"
            />
          )}

          {request.bodyType === "binary" && (
            <BinaryBodyEditor
              value={request.bodyDrafts.binary}
              onChange={(binary) => commitDrafts({ ...request.bodyDrafts, binary }, "binary")}
            />
          )}

          {request.bodyType === "graphql" && (
            <GraphQLEditor
              value={request.bodyDrafts.graphql}
              onChange={(graphql) => commitDrafts({ ...request.bodyDrafts, graphql }, "graphql")}
              validationDetail={validation?.detail}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <div
        className={cn(
          "rounded-2xl border px-3 py-2 text-[11px]",
          validation?.tone === "error"
            ? "border-destructive/25 bg-destructive/5 text-destructive"
            : "border-border/80 bg-background/60 text-muted-foreground",
        )}
      >
        {validation
          ? validation.label
          : "Drafts for every body mode are preserved independently and synced locally."}
        {validation?.detail ? (
          <span className="ml-2 text-muted-foreground/80">{validation.detail}</span>
        ) : null}
      </div>
    </div>
  );
}
