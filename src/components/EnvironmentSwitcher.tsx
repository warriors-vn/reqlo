import { useEffect, useMemo, useRef, useState } from "react";
import { Overlay } from "./Overlay";
import {
  buildResolvedRequestArtifacts,
  mergeGlobalsIntoEnvironment,
} from "@/features/code-snippets/utils/request-resolver";
import type { KV } from "@/services/db";
import { useStore } from "@/stores/useStore";
import { useRequestAncestors } from "@/hooks/useRequestAncestors";
import { EnvironmentList } from "./environment-switcher/EnvironmentList";
import { VariablesPanel } from "./environment-switcher/VariablesPanel";
import { RequestPreviewPanel } from "./environment-switcher/RequestPreviewPanel";
import {
  extractTemplateTokens,
  formatResolvedAuth,
  redactSecretValues,
} from "./environment-switcher/utils";

const EMPTY_GLOBALS: KV[] = [];

export function EnvironmentSwitcher() {
  const open = useStore((state) => state.overlays["env-switcher"]);
  const close = () => useStore.getState().closeOverlay("env-switcher");
  const environments = useStore((state) => state.environments);
  const activeEnvId = useStore((state) => state.activeEnvId);
  const setActiveEnv = useStore((state) => state.setActiveEnv);
  const createEnvironment = useStore((state) => state.createEnvironment);
  const updateEnvironment = useStore((state) => state.updateEnvironment);
  const duplicateEnvironment = useStore((state) => state.duplicateEnvironment);
  const deleteEnvironment = useStore((state) => state.deleteEnvironment);
  const rawGlobals = useStore((state) => state.workspace?.globals);
  const globals = rawGlobals ?? EMPTY_GLOBALS;
  const updateWorkspaceGlobals = useStore((state) => state.updateWorkspaceGlobals);
  const activeRequest = useStore((state) => state.getActiveRequest());

  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [viewingGlobals, setViewingGlobals] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [newName, setNewName] = useState("");
  const [deleteArmId, setDeleteArmId] = useState<string | null>(null);

  const selectedEnvironment = useMemo(
    () => environments.find((environment) => environment.id === selectedEnvId) ?? null,
    [environments, selectedEnvId],
  );

  // What preview/resolution should show: the selected environment (or none,
  // while viewing Globals) with globals layered in — same precedence a real
  // Send would use, so this panel never lies about how templates resolve.
  const effectiveEnvironment = useMemo(
    () => mergeGlobalsIntoEnvironment(viewingGlobals ? null : selectedEnvironment, globals),
    [viewingGlobals, selectedEnvironment, globals],
  );

  const ancestors = useRequestAncestors(activeRequest);
  const preview = useMemo(
    () =>
      activeRequest && effectiveEnvironment
        ? buildResolvedRequestArtifacts(activeRequest, effectiveEnvironment, ancestors)
        : null,
    [activeRequest, effectiveEnvironment, ancestors],
  );
  const templateTokens = useMemo(() => extractTemplateTokens(activeRequest), [activeRequest]);

  // The active environment as of the last time this panel looked. Something
  // outside the panel can change it while the panel is closed — the "Create
  // Environment" command creates an environment, makes it active and opens
  // this panel in one step — and reopening on the stale selection then puts
  // the user in front of a *different* environment than the one now in
  // effect. Variables typed into it land on the wrong environment, and the
  // send that follows resolves {{VAR}} to nothing with no visible reason.
  const seenActiveEnvId = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDeleteArmId(null);
      return;
    }

    // Computed outside the updater: an updater must stay pure, or React's
    // double-invocation in development would consume the change here and
    // report "unchanged" on the run that matters.
    const activeChanged = seenActiveEnvId.current !== activeEnvId;
    seenActiveEnvId.current = activeEnvId;

    setViewingGlobals(false);
    setSelectedEnvId((current) => {
      // Whoever changed the active environment did so deliberately; follow it.
      if (activeChanged && activeEnvId) return activeEnvId;
      // Otherwise keep whatever the user was last looking at — selecting a
      // non-active environment to edit it is a normal thing to do here.
      if (current && environments.some((environment) => environment.id === current)) return current;
      return activeEnvId ?? environments[0]?.id ?? null;
    });
  }, [activeEnvId, environments, open]);

  useEffect(() => {
    setNameDraft(selectedEnvironment?.name ?? "");
    setDeleteArmId(null);
  }, [selectedEnvId, selectedEnvironment?.name]);

  // Escape blurs the input to cancel editing, which fires onBlur => commitName
  // synchronously — before the setNameDraft(revert) it just queued has applied.
  // Without this guard, commitName would read the stale (in-progress) draft
  // and commit it instead of reverting. Set right before blurring on Escape,
  // consumed (and cleared) the next time commitName runs.
  const cancelingRef = useRef(false);

  const commitName = () => {
    if (cancelingRef.current) {
      cancelingRef.current = false;
      return;
    }
    if (!selectedEnvironment) return;
    const nextName = nameDraft.trim();
    if (!nextName) {
      setNameDraft(selectedEnvironment.name);
      return;
    }
    if (nextName !== selectedEnvironment.name) {
      // A write failure already toasts inside updateEnvironment — catch here
      // only to stop it from also surfacing as an unhandled promise rejection
      // in the console, since this control has no loading state of its own.
      void updateEnvironment(selectedEnvironment.id, { name: nextName }).catch(() => {});
    }
  };

  const handleCreate = async () => {
    const environment = await createEnvironment(newName);
    setActiveEnv(environment.id);
    setSelectedEnvId(environment.id);
    setNewName("");
    setDeleteArmId(null);
  };

  const handleDuplicate = async () => {
    if (!selectedEnvironment) return;
    const copy = await duplicateEnvironment(selectedEnvironment.id);
    if (!copy) return;
    setActiveEnv(copy.id);
    setSelectedEnvId(copy.id);
  };

  const handleDelete = async () => {
    if (!selectedEnvironment) return;
    await deleteEnvironment(selectedEnvironment.id);
    setDeleteArmId(null);
  };

  const activeAuthPreview =
    activeRequest && preview
      ? formatResolvedAuth(activeRequest, preview.resolvedHeaders, preview.resolvedQueryParams)
      : null;
  const redactedResolvedUrl = preview
    ? redactSecretValues(preview.url, effectiveEnvironment?.variables ?? [])
    : "";

  return (
    <Overlay
      open={open}
      onClose={close}
      title="Manage Environments"
      subtitle="Switch contexts, edit variables, and preview how templates resolve"
      maxW="max-w-6xl"
    >
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <EnvironmentList
          environments={environments}
          activeEnvId={activeEnvId}
          selectedEnvId={selectedEnvId}
          viewingGlobals={viewingGlobals}
          globals={globals}
          newName={newName}
          onNewNameChange={setNewName}
          onCreate={() => void handleCreate()}
          onSelectGlobals={() => {
            setViewingGlobals(true);
            setSelectedEnvId(null);
          }}
          onSelectEnvironment={(id) => {
            setViewingGlobals(false);
            setSelectedEnvId(id);
          }}
          onSetActive={setActiveEnv}
        />

        <section className="space-y-4">
          <VariablesPanel
            viewingGlobals={viewingGlobals}
            selectedEnvironment={selectedEnvironment}
            activeEnvId={activeEnvId}
            globals={globals}
            onGlobalsChange={(next) => void updateWorkspaceGlobals(next).catch(() => {})}
            nameDraft={nameDraft}
            onNameDraftChange={setNameDraft}
            onCommitName={commitName}
            onNameEnter={(event) => {
              event.preventDefault();
              commitName();
              (event.currentTarget as HTMLInputElement).blur();
            }}
            onNameEscape={(event) => {
              event.stopPropagation();
              cancelingRef.current = true;
              if (selectedEnvironment) setNameDraft(selectedEnvironment.name);
              (event.currentTarget as HTMLInputElement).blur();
            }}
            onSetActive={setActiveEnv}
            onDuplicate={() => void handleDuplicate()}
            deleteArmId={deleteArmId}
            onArmDelete={setDeleteArmId}
            onCancelDeleteArm={() => setDeleteArmId(null)}
            onConfirmDelete={() => void handleDelete()}
            onEnvironmentVariablesChange={(variables) =>
              selectedEnvironment &&
              void updateEnvironment(selectedEnvironment.id, { variables }).catch(() => {})
            }
          />

          {(viewingGlobals || selectedEnvironment) && (
            <RequestPreviewPanel
              viewingGlobals={viewingGlobals}
              activeRequest={activeRequest}
              preview={preview}
              activeAuthPreview={activeAuthPreview}
              redactedResolvedUrl={redactedResolvedUrl}
              templateTokens={templateTokens}
            />
          )}
        </section>
      </div>
    </Overlay>
  );
}
